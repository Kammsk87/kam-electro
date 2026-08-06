// oi_high_freq_recorder.mjs
//
// Open interest at 10 seconds, on the same grid as ob_recorder.mjs.
//
// WHY THIS EXISTS
//
// oi_forward_recorder.mjs writes 258 rows per day -- one every 5.6 minutes. A cascade
// detector needs delta-OI over a 5 to 15 second window, which is 20 to 70 times finer.
//
// MEASURED BEFORE THIS FILE WAS WRITTEN, and the reason it is worth doing:
//   Polling /v5/market/tickers four times at 12-second spacing returned four DISTINCT
//   open-interest values for every major symbol, and 436 of 801 symbols moved within 36
//   seconds. The exchange updates continuously; the 5.6-minute cadence was discarding real
//   resolution, not respecting an exchange limit.
//
// The endpoint returns EVERY linear symbol in one request, so a 10-second cycle across the
// whole universe costs exactly one HTTP call per cycle -- the same load the 5.6-minute
// recorder already places, thirty-four times more often.
//
// WHY IT DOES NOT STORE ALL 801 SYMBOLS
//   801 symbols x 8,640 cycles x ~40 bytes is roughly 277 MB per day. The universe subset
//   is ~13 MB. The full list is available at zero extra request cost if that trade is ever
//   worth revisiting, and this comment is here so the choice is found rather than guessed.
//
// Public market data only. No keys, no orders, nothing traded.

import { appendFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  module: 'OI_HIGH_FREQ_RECORDER',
  endpoint: 'https://api.bybit.com/v5/market/tickers?category=linear',
  interval_ms: 10_000,
  request_timeout_ms: 8_000,
  // Matches ob_recorder.mjs so delta-OI and the book land on one grid and can be joined
  // without interpolation. Changing this decouples them; do not change it casually.
  aligned_with: 'ob_recorder.mjs @ 10_000ms',
});

// ---------------------------------------------------------------------------
// Pure logic (all of it tested)
// ---------------------------------------------------------------------------

// Compact row per symbol: [symbol, openInterest, lastPrice, fundingRate]. Same shape as
// the existing oi_forward archive so old readers keep working.
export function toRow(ticker) {
  const oi = Number(ticker?.openInterest);
  const px = Number(ticker?.lastPrice);
  if (!(oi >= 0) || !(px > 0) || !ticker.symbol) return null;
  const fr = Number(ticker.fundingRate);
  return [ticker.symbol, oi, px, Number.isFinite(fr) ? fr : null];
}

export function buildCycle(list, wanted, ingestTs, cycleMs) {
  const want = wanted instanceof Set ? wanted : new Set(wanted);
  const rows = [];
  for (const tk of list ?? []) {
    if (!want.has(tk?.symbol)) continue;
    const r = toRow(tk);
    if (r) rows.push(r);
  }
  return {
    t: ingestTs,
    n: rows.length,
    // Missing symbols are counted, not silently dropped: a symbol that stops being quoted
    // must show as absent rather than as unchanged open interest.
    missing: want.size - rows.length,
    cycle_ms: cycleMs,
    a: rows,
  };
}

export function failureRecord(ingestTs, reason, symbolCount) {
  return {
    t: ingestTs,
    _fail: true,
    reason,
    symbols: symbolCount,
    note: 'no open-interest observation for this cycle; treat as missing, never as unchanged',
  };
}

export function dayOf(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createRecorder({ symbols, root, fetchImpl = fetch, now = () => Date.now(), log = () => {} }) {
  const dir = `${root}/oi_10s`;
  mkdirSync(dir, { recursive: true });
  const want = new Set(symbols);
  const counts = { cycles: 0, failures: 0, rows: 0 };

  const write = (obj) => {
    try {
      appendFileSync(`${dir}/${dayOf(obj.t)}.jsonl`, `${JSON.stringify(obj)}\n`);
    } catch (e) {
      log(`WARN write failed (${e.code || e.message}) -- continuing`);
    }
  };

  const cycle = async () => {
    const t0 = now();
    try {
      const res = await fetchImpl(FROZEN.endpoint, { signal: AbortSignal.timeout(FROZEN.request_timeout_ms) });
      const j = await res.json();
      const rec = buildCycle(j?.result?.list, want, t0, now() - t0);
      write(rec);
      counts.cycles += 1;
      counts.rows += rec.n;
    } catch (e) {
      // A failed cycle is written as a failure, never skipped. A hole in the file is
      // indistinguishable from a market that did not move.
      write(failureRecord(t0, e.name === 'TimeoutError' ? 'TIMEOUT' : (e.code || e.message || 'ERROR'), want.size));
      counts.failures += 1;
    }
  };

  return { cycle, counts };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.BOTALIN_DATA_ROOT || '/opt/botalin-edge/logs';
  const uni = process.env.BOTALIN_UNIVERSE || '/opt/botalin-edge/data/universe.json';
  const { readFileSync } = await import('node:fs');
  const symbols = JSON.parse(readFileSync(uni, 'utf8')).symbols.map((s) => s.symbol);
  const rec = createRecorder({ symbols, root, log: (m) => process.stdout.write(`[oi10] ${m}\n`) });
  process.stdout.write(`[oi10] start: ${symbols.length} symbols @ ${FROZEN.interval_ms}ms -> ${root}/oi_10s\n`);
  setInterval(() => { rec.cycle().catch(() => {}); }, FROZEN.interval_ms);
  setInterval(() => {
    process.stdout.write(`[oi10] cycles=${rec.counts.cycles} failures=${rec.counts.failures} rows=${rec.counts.rows}\n`);
  }, 3_600_000);
}
