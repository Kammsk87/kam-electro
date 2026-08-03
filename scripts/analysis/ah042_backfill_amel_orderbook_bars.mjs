#!/usr/bin/env node
// One-time public Bybit kline backfill for an immutable completed AMEL run.
// Research only: no keys, orders, services, or collector configuration.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = '/opt/botalin-edge';
const DEFAULT_RUN = 'amel-1785215500081';
const TFS = { '1m': '1', '5m': '5' };
const MINUTE = 60_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = text => createHash('sha256').update(text).digest('hex');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

export function normalizeRows(rows, start, end) {
  const dedup = new Map();
  for (const row of rows) {
    const t = Number(row[0]);
    if (Number.isFinite(t) && t >= start && t <= end) {
      dedup.set(t, [t, Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5])]);
    }
  }
  return [...dedup.values()].sort((a, b) => a[0] - b[0]);
}

if (process.argv.includes('--smoke')) {
  const got = normalizeRows([['20', '2', '3', '1', '2.5', '9'], ['10', '1', '2', '0.5', '1.5', '8'], ['20', '2', '3', '1', '2.5', '9']], 10, 20);
  if (got.length !== 2 || got[0][0] !== 10 || got[1][4] !== 2.5) process.exit(1);
  console.log('SMOKE: 1 passed, 0 failed');
  process.exit(0);
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.retCode !== 0) throw new Error(`Bybit ${body.retCode}: ${body.retMsg}`);
  return body;
}

async function fetchKlines(symbol, interval, start, end) {
  const all = [];
  let cursor = end;
  for (let page = 0; page < 20 && cursor >= start; page++) {
    const params = new URLSearchParams({ category: 'linear', symbol, interval, start: String(start), end: String(cursor), limit: '1000' });
    const body = await getJson(`https://api.bybit.com/v5/market/kline?${params}`);
    const rows = body.result?.list || [];
    if (!rows.length) break;
    all.push(...rows);
    const oldest = Math.min(...rows.map(row => Number(row[0])));
    if (!Number.isFinite(oldest) || oldest > cursor) break;
    cursor = oldest - 1;
    await sleep(140);
  }
  return normalizeRows(all, start, end);
}

function rangeFromSnapshots(run) {
  const p = path.join(ROOT, 'logs/active_market_event_logger', `orderbook_${run}.jsonl`);
  const snapshots = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(row => row.fetch_ok && Number.isFinite(row.snapshot_ts));
  if (!snapshots.length) throw new Error(`no valid orderbook snapshots for ${run}`);
  const start = Math.min(...snapshots.map(row => row.snapshot_ts));
  const end = Math.max(...snapshots.map(row => row.snapshot_ts)) + 15 * MINUTE;
  const symbols = [...new Set(snapshots.map(row => row.symbol))].sort();
  return { start, end, symbols, snapshots: snapshots.length };
}

async function main() {
  const run = arg('run', DEFAULT_RUN);
  const { start, end, symbols, snapshots } = rangeFromSnapshots(run);
  const outDir = path.join(ROOT, 'data/amel_orderbook_backfill', run);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { run_id: run, source: 'public_bybit_linear_kline', generated_at_utc: new Date().toISOString(), start, end, snapshots, tfs: Object.keys(TFS), symbols, files: [], errors: [] };
  for (const symbol of symbols) {
    for (const [tfName, interval] of Object.entries(TFS)) {
      try {
        const bars = await fetchKlines(symbol, interval, start, end);
        const text = JSON.stringify(bars);
        const file = `${symbol}_${tfName}.json`;
        fs.writeFileSync(path.join(outDir, file), text);
        const step = Number(interval) * MINUTE;
        const gaps = bars.slice(1).reduce((n, row, i) => n + (row[0] - bars[i][0] !== step ? 1 : 0), 0);
        manifest.files.push({ file, symbol, tf: tfName, bars: bars.length, first: bars[0]?.[0] ?? null, last: bars.at(-1)?.[0] ?? null, gaps, sha256: sha256(text) });
        console.log(`OK ${symbol} ${tfName}: ${bars.length} bars, gaps=${gaps}`);
      } catch (error) {
        manifest.errors.push({ symbol, tf: tfName, error: error.message });
        console.error(`ERR ${symbol} ${tfName}: ${error.message}`);
      }
    }
  }
  manifest.total_bars = manifest.files.reduce((sum, file) => sum + file.bars, 0);
  manifest.complete = manifest.errors.length === 0 && manifest.files.length === symbols.length * Object.keys(TFS).length && manifest.files.every(file => file.bars > 0 && file.gaps === 0);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`DONE run=${run} files=${manifest.files.length} bars=${manifest.total_bars} complete=${manifest.complete} errors=${manifest.errors.length}`);
  process.exit(manifest.complete ? 0 : 2);
}

main().catch(error => { console.error(`FATAL: ${error.message}`); process.exit(2); });
