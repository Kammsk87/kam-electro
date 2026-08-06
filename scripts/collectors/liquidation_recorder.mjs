// liquidation_recorder.mjs
//
// Forward-only collector for Bybit forced liquidations.
//
// WHY THIS EXISTS
//
// GAP.OI_LIQ.FINE_GRAIN: no liquidation flag has ever been recorded in this programme.
// Bybit publishes liquidations on WebSocket only -- there is no REST history and no free
// archive -- so, exactly like the L2 book, this data exists only going forward. Nothing
// collected today can be backfilled tomorrow, which is the whole argument for starting.
//
// VERIFIED AGAINST THE LIVE FEED BEFORE THIS FILE WAS WRITTEN:
//   topic  allLiquidation.{SYMBOL}   subscribe ACK success
//   shape  {"topic":"allLiquidation.ADAUSDT","type":"snapshot","ts":1786014947330,
//           "data":[{"T":1786014946933,"s":"ADAUSDT","S":"Sell","v":"13248","p":"0.1915"}]}
//
// TWO DESIGN RULES, BOTH LEARNED THE HARD WAY
//
// 1. RECORD RAW, INTERPRET NEVER. The `S` field's meaning -- whether "Sell" denotes a
//    liquidated long or the side of the liquidating order -- changed between Bybit's old
//    `liquidation` topic and this one. A recorder that resolves that ambiguity bakes a
//    possible sign inversion into the archive permanently. Every exchange field is stored
//    verbatim under its original name; direction is resolved at analysis time, against
//    price, where it can be checked.
//
// 2. A GAP MUST BE VISIBLE. Liquidations are sporadic, so a dropped connection and a quiet
//    market produce the same thing: no records. If gaps are not marked, an outage reads as
//    "no liquidations occurred" and silently biases every study built on the archive. Every
//    disconnect writes a _gap record carrying the exact interval that is missing.
//
// Public market data only. No keys are read, no orders are placed, nothing is traded.
// Requires: node --experimental-websocket (Node 20 has no global WebSocket).

import { appendFileSync, mkdirSync } from 'node:fs';

export const FROZEN = Object.freeze({
  module: 'LIQUIDATION_RECORDER',
  endpoint: 'wss://stream.bybit.com/v5/public/linear',
  topic_prefix: 'allLiquidation.',
  // Bybit caps args per subscribe frame; batching keeps a 37-symbol universe to one frame
  // but the chunker is kept honest for larger universes.
  max_args_per_frame: 10,
  backoff_base_ms: 1_000,
  backoff_max_ms: 60_000,
  // A silent socket is a dead socket. Bybit sends nothing on a quiet market, so liveness
  // is asserted with our own ping rather than inferred from traffic.
  ping_interval_ms: 20_000,
  stale_after_ms: 90_000,
  // Found by running the recorder for 75 seconds: it connected, subscribed, and wrote
  // NOTHING, because no liquidation happened. The day file did not even exist. An archive
  // like that cannot distinguish "up and the market was quiet" from "the service was
  // down", which is the same failure the gap record exists to prevent, in its other
  // direction. A heartbeat proves liveness during silence.
  heartbeat_ms: 300_000,
});

// ---------------------------------------------------------------------------
// Pure logic (all of it tested)
// ---------------------------------------------------------------------------

export function topicsFor(symbols) {
  return symbols.map((s) => `${FROZEN.topic_prefix}${s}`);
}

export function chunk(args, size = FROZEN.max_args_per_frame) {
  const out = [];
  for (let i = 0; i < args.length; i += size) out.push(args.slice(i, i + size));
  return out;
}

// Full jitter exponential backoff. The jitter matters: without it every symbol shard
// reconnects on the same tick after a venue-wide outage and gets throttled together.
export function backoffMs(attempt, rand = Math.random) {
  const capped = Math.min(FROZEN.backoff_max_ms, FROZEN.backoff_base_ms * 2 ** Math.max(0, attempt));
  return Math.floor(rand() * capped);
}

// One exchange message -> zero or more records. Returns [] rather than throwing on
// anything unexpected: a recorder that dies on one malformed frame loses the whole day.
export function toRecords(msg, ingestTs) {
  if (!msg || typeof msg !== 'object') return [];
  if (!msg.topic || !String(msg.topic).startsWith(FROZEN.topic_prefix)) return [];
  const data = Array.isArray(msg.data) ? msg.data : [];
  const out = [];
  for (const d of data) {
    const price = Number(d.p);
    const qty = Number(d.v);
    if (!(price > 0) || !(qty > 0)) continue;
    out.push({
      ingest_ts: ingestTs,
      exchange_ts: Number(d.T) || null,
      frame_ts: Number(msg.ts) || null,
      symbol: d.s ?? null,
      // Stored under the exchange's own name. Do not rename this to side_liquidated or
      // anything interpretive -- see design rule 1.
      S: d.S ?? null,
      price,
      qty,
      size_usd: Number((price * qty).toFixed(6)),
      topic_type: msg.type ?? null,
    });
  }
  return out;
}

export function gapRecord(fromTs, toTs, reason, symbolCount) {
  return {
    _gap: true,
    from_ts: fromTs,
    to_ts: toTs,
    missing_ms: Math.max(0, toTs - fromTs),
    reason,
    symbols: symbolCount,
    note: 'no liquidation data exists for this interval; absence here is NOT evidence of no liquidations',
  };
}

export function heartbeatRecord(ts, symbolCount, connectedSince, records) {
  return {
    _alive: true,
    ts,
    symbols: symbolCount,
    connected_since: connectedSince,
    records_so_far: records,
    note: 'recorder was up at this instant; a quiet interval between heartbeats means no liquidations, not no data',
  };
}

export function dayOf(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createRecorder({ symbols, root, now = () => Date.now(), rand = Math.random, log = () => {} }) {
  const dir = `${root}/liquidations`;
  mkdirSync(dir, { recursive: true });

  let attempt = 0;
  let lastMessageTs = now();
  let connectedSince = null;
  let disconnectedAt = null;
  let socket = null;
  let pingTimer = null;
  const counts = { records: 0, gaps: 0, reconnects: 0, heartbeats: 0 };

  const write = (obj) => {
    try {
      appendFileSync(`${dir}/${dayOf(now())}.jsonl`, `${JSON.stringify(obj)}\n`);
    } catch (e) {
      log(`WARN write failed (${e.code || e.message}) -- continuing`);
    }
  };

  const onFrame = (raw) => {
    lastMessageTs = now();
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.op === 'subscribe') {
      log(`subscribe ${msg.success === true ? 'ok' : `FAILED: ${msg.ret_msg}`}`);
      return;
    }
    for (const r of toRecords(msg, lastMessageTs)) { write(r); counts.records += 1; }
  };

  const beat = () => {
    if (connectedSince == null) return;
    write(heartbeatRecord(now(), symbols.length, connectedSince, counts.records));
    counts.heartbeats += 1;
  };

  const connect = () => {
    if (typeof WebSocket === 'undefined') {
      throw new Error('no global WebSocket: run with `node --experimental-websocket`');
    }
    socket = new WebSocket(FROZEN.endpoint);

    socket.onopen = () => {
      connectedSince = now();
      if (disconnectedAt != null) {
        write(gapRecord(disconnectedAt, connectedSince, 'RECONNECT', symbols.length));
        counts.gaps += 1;
        disconnectedAt = null;
      }
      attempt = 0;
      lastMessageTs = now();
      for (const args of chunk(topicsFor(symbols))) {
        socket.send(JSON.stringify({ op: 'subscribe', args }));
      }
      log(`connected, ${symbols.length} symbols`);
      beat(); // stamp liveness immediately, so the day file exists from the first second
    };

    socket.onmessage = (e) => onFrame(typeof e.data === 'string' ? e.data : String(e.data));

    socket.onerror = () => { /* close follows; handled there */ };

    socket.onclose = () => {
      if (disconnectedAt == null) disconnectedAt = now();
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      counts.reconnects += 1;
      const wait = backoffMs(attempt, rand);
      attempt += 1;
      log(`disconnected, retry in ${wait}ms (attempt ${attempt})`);
      setTimeout(connect, wait);
    };

    pingTimer = setInterval(() => {
      // A socket that has heard nothing for stale_after_ms is treated as dead even if the
      // OS has not noticed. Closing it routes through onclose, so the gap gets recorded.
      if (now() - lastMessageTs > FROZEN.stale_after_ms) { try { socket.close(); } catch { /* */ } return; }
      try { socket.send(JSON.stringify({ op: 'ping' })); } catch { /* close follows */ }
    }, FROZEN.ping_interval_ms);
  };

  const heartbeatTimer = setInterval(beat, FROZEN.heartbeat_ms);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

  return { connect, beat, counts, get connectedSince() { return connectedSince; } };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const root = process.env.BOTALIN_DATA_ROOT || '/opt/botalin-edge/logs';
  const uni = process.env.BOTALIN_UNIVERSE || '/opt/botalin-edge/data/universe.json';
  const { readFileSync } = await import('node:fs');
  const symbols = JSON.parse(readFileSync(uni, 'utf8')).symbols.map((s) => s.symbol);
  const rec = createRecorder({ symbols, root, log: (m) => process.stdout.write(`[liq] ${m}\n`) });
  process.stdout.write(`[liq] forward recorder start: ${symbols.length} symbols -> ${root}/liquidations\n`);
  rec.connect();
  setInterval(() => {
    process.stdout.write(`[liq] records=${rec.counts.records} gaps=${rec.counts.gaps} reconnects=${rec.counts.reconnects}\n`);
  }, 3_600_000);
}
