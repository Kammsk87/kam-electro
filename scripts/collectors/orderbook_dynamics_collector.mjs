#!/usr/bin/env node
// Bounded public orderbook dynamics collector. No keys, orders, accounts, or trading state.
import fs from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';

const ROOT = '/opt/botalin-edge';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'ADAUSDT', 'ARBUSDT', 'NEARUSDT', 'SUIUSDT', 'ONDOUSDT', 'WLDUSDT', 'HYPEUSDT', 'ENAUSDT', 'AAVEUSDT', 'BNBUSDT', '1000PEPEUSDT', 'SHIB1000USDT', 'ZECUSDT', 'EULUSDT', 'DEXEUSDT'];
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => Date.now();
const GiB = 1024 ** 3;

export function summarizeBook(symbol, payload, receivedTs) {
  const bids10 = (payload.b || []).slice(0, 10).map(([price, size]) => [Number(price), Number(size)]);
  const asks10 = (payload.a || []).slice(0, 10).map(([price, size]) => [Number(price), Number(size)]);
  const bid1 = bids10[0]?.[0], ask1 = asks10[0]?.[0];
  if (!Number.isFinite(bid1) || !Number.isFinite(ask1)) throw new Error('missing best bid/ask');
  return { ts: receivedTs, exchange_ts: Number(payload.ts) || null, symbol, bid1, ask1, spread_bps: +((ask1 - bid1) / ((ask1 + bid1) / 2) * 1e4).toFixed(4), bids10, asks10 };
}

export function freeBytes() {
  const line = execFileSync('df', ['-Pk', ROOT], { encoding: 'utf8' }).trim().split('\n').at(-1).trim().split(/\s+/);
  return Number(line[3]) * 1024;
}

if (process.argv.includes('--smoke')) {
  const row = summarizeBook('MOCKUSDT', { ts: '1', b: [['99', '2']], a: [['101', '3']] }, 2);
  if (row.bid1 !== 99 || row.ask1 !== 101 || row.spread_bps <= 0) process.exit(1);
  console.log('SMOKE: 1 passed, 0 failed');
  process.exit(0);
}

async function fetchBook(symbol) {
  const url = `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${symbol}&limit=10`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.retCode !== 0 || !body.result) throw new Error(`Bybit ${body.retCode}: ${body.retMsg}`);
  return summarizeBook(symbol, body.result, now());
}

async function main() {
  const runId = arg('run-id', `obdyn-${now()}`);
  const intervalMs = Number(arg('interval-ms', '2000'));
  const durationHours = Number(arg('hours', '168'));
  const hardBytes = Number(arg('hard-bytes', String(Math.floor(1.25 * GiB))));
  const minFreeBytes = Number(arg('min-free-bytes', String(2 * GiB)));
  if (!Number.isFinite(intervalMs) || intervalMs < 1000 || !Number.isFinite(durationHours) || durationHours <= 0) throw new Error('invalid interval or duration');
  const dir = path.join(ROOT, 'logs/orderbook_dynamics'); fs.mkdirSync(dir, { recursive: true });
  const dataFile = path.join(dir, `snapshots_${runId}.jsonl.gz`), manifestFile = path.join(dir, `manifest_${runId}.json`);
  const sink = fs.createWriteStream(dataFile, { flags: 'wx' }); const gzip = createGzip({ level: 6 }); gzip.pipe(sink);
  const started = now(), deadline = started + durationHours * 3_600_000;
  const manifest = { run_id: runId, started_utc: new Date(started).toISOString(), requested_hours: durationHours, interval_ms: intervalMs, symbols: SYMBOLS, source: 'public_bybit_linear_orderbook_top10', output: path.relative(ROOT, dataFile), hard_bytes: hardBytes, min_free_bytes: minFreeBytes, note: 'READ_ONLY_RESEARCH; no keys/orders/accounts/paper/live; promising=0', cycles: 0, snapshots: 0, errors: 0, stop_reason: null };
  let stopping = false;
  const writeManifest = () => fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, compressed_bytes: sink.bytesWritten, free_bytes: freeBytes(), updated_utc: new Date().toISOString() }, null, 2));
  const stop = async reason => {
    if (stopping) return; stopping = true; manifest.stop_reason = reason; manifest.ended_utc = new Date().toISOString();
    gzip.end(); await once(sink, 'close'); writeManifest(); console.log(`DONE run=${runId} reason=${reason} snapshots=${manifest.snapshots} errors=${manifest.errors} bytes=${sink.bytesWritten}`);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
  writeManifest();
  while (!stopping && now() < deadline) {
    const cycleStarted = now();
    if (sink.bytesWritten >= hardBytes) { await stop('HARD_BYTES_CAP'); break; }
    if (freeBytes() < minFreeBytes) { await stop('MIN_FREE_SPACE'); break; }
    const results = await Promise.allSettled(SYMBOLS.map(fetchBook));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const line = JSON.stringify({ run_id: runId, ...result.value }) + '\n';
        if (!gzip.write(line)) await once(gzip, 'drain');
        manifest.snapshots++;
      } else manifest.errors++;
    }
    manifest.cycles++;
    if (manifest.cycles % 30 === 0) writeManifest();
    const wait = intervalMs - (now() - cycleStarted); if (wait > 0) await sleep(wait);
  }
  if (!stopping) await stop('DURATION_COMPLETE');
}

main().catch(error => { console.error(`FATAL: ${error.message}`); process.exit(2); });
