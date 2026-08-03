#!/usr/bin/env node
// Fixed factor map for completed AMEL orderbook snapshots. Research only.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/botalin-edge', RUN = 'amel-1785215500081', MIN = 60_000, COST = .11;
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const med = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const r4 = x => x == null ? null : +x.toFixed(4);
const load = p => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

export function bookImbalance(ob) {
  const bid = ob.bids10.reduce((s, [p, q]) => s + p * q, 0), ask = ob.asks10.reduce((s, [p, q]) => s + p * q, 0);
  return (bid - ask) / (bid + ask);
}
export function sma(xs) { return avg(xs); }
export function rsi14(closes, i) {
  let gain = 0, loss = 0; for (let k = i - 13; k <= i; k++) { const d = closes[k] - closes[k - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); }
  if (!loss) return 100; const rs = gain / loss; return 100 - 100 / (1 + rs);
}
export function pearson(xs, ys) {
  const mx = avg(xs), my = avg(ys); let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; xy += dx * dy; xx += dx * dx; yy += dy * dy; }
  return xx && yy ? xy / Math.sqrt(xx * yy) : null;
}
export function split(rows) { const n = rows.length, s = [...rows].sort((a, b) => a.ts - b.ts); return { train: s.slice(0, ~~(n * .55)), validation: s.slice(~~(n * .55), ~~(n * .75)), holdout: s.slice(~~(n * .75), ~~(n * .90)), forward: s.slice(~~(n * .90)) }; }

if (process.argv.includes('--smoke')) {
  if (!(bookImbalance({ bids10: [[100, 2]], asks10: [[101, 1]] }) > 0) || rsi14([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14) !== 100 || pearson([1, 2, 3], [1, 2, 3]) !== 1) process.exit(1);
  console.log('SMOKE: 3 passed, 0 failed'); process.exit(0);
}

function impact(ob, side) {
  const book = side > 0 ? ob.asks10 : ob.bids10, ref = side > 0 ? ob.ask1 : ob.bid1; let rem = 200, qty = 0, spent = 0;
  for (const [p, q] of book) { const dollars = Math.min(rem, p * q); qty += dollars / p; spent += dollars; rem -= dollars; if (rem <= 1e-9) break; }
  if (rem > 1e-9 || !qty) return null; const vwap = spent / qty; return side > 0 ? Math.max(0, (vwap - ref) / ref * 1e4) : Math.max(0, (ref - vwap) / ref * 1e4);
}
function stats(rows) { const net = rows.map(r => r.net15); return { n: rows.length, net_mean_pct: r4(avg(net)), net_median_pct: r4(med(net)), winrate_pct: r4(rows.length ? 100 * net.filter(x => x > 0).length / rows.length : null) }; }

function main() {
  const log = path.join(ROOT, 'logs/active_market_event_logger'); const backfill = path.join(ROOT, 'data/amel_orderbook_backfill', RUN);
  const books = load(path.join(log, `orderbook_${RUN}.jsonl`)).filter(x => x.fetch_ok && x.exec_200 === 1);
  const bySymbol = {};
  for (const symbol of [...new Set(books.map(x => x.symbol))]) { const bars = JSON.parse(fs.readFileSync(path.join(backfill, `${symbol}_1m.json`), 'utf8')); bySymbol[symbol] = { bars, at: new Map(bars.map((b, i) => [b[0], i])) }; }
  const rows = [];
  for (const ob of books) {
    const source = bySymbol[ob.symbol], entryTs = Math.floor(ob.snapshot_ts / MIN) * MIN + MIN, i = source.at.get(entryTs); if (i == null || i < 50 || i + 15 >= source.bars.length) continue;
    const bars = source.bars, closes = bars.map(b => b[4]), volumes = bars.map(b => b[5]), previous = i - 1;
    const ema = period => { let v = closes[0], a = 2 / (period + 1); for (let k = 1; k <= previous; k++) v = closes[k] * a + v * (1 - a); return v; };
    const e20 = ema(20), e50 = ema(50), trend = Math.sign(e20 - e50), im = bookImbalance(ob), side = Math.sign(im); if (!side) continue;
    const atr = avg(bars.slice(previous - 13, previous + 1).map((b, k) => Math.max(b[2] - b[3], Math.abs(b[2] - bars[previous - 14 + k][4]), Math.abs(b[3] - bars[previous - 14 + k][4]))));
    const entry = bars[i][1], exit5 = bars[i + 5][1], exit15 = bars[i + 15][1], imp = impact(ob, side); if (imp == null) continue;
    const gross5 = side * (exit5 - entry) / entry * 100, gross15 = side * (exit15 - entry) / entry * 100;
    rows.push({ ts: entryTs, symbol: ob.symbol, im, trend, rsi: rsi14(closes, previous), ema_gap_pct: (e20 - e50) / closes[previous] * 100, atr_pct: atr / closes[previous] * 100, volume_ratio: volumes[previous] / sma(volumes.slice(previous - 20, previous)), past5_pct: (closes[previous] - closes[previous - 5]) / closes[previous - 5] * 100, spread_bps: ob.spread_bps, depth: ob.depth_usd_10bps, gross5, gross15, net15: gross15 - COST - 2 * imp / 100 });
  }
  const parts = split(rows), factors = ['im', 'ema_gap_pct', 'rsi', 'atr_pct', 'volume_ratio', 'past5_pct', 'spread_bps', 'depth'];
  const factorMap = Object.fromEntries(factors.map(f => [
    f,
    Object.fromEntries(Object.entries(parts).map(([name, xs]) => [name, r4(pearson(xs.map(x => x[f]), xs.map(x => x.gross15)))])),
  ]));
  const candidates = {
    'OBI-IND-001-trend-aligned': r => Math.abs(r.im) >= .22 && r.trend === Math.sign(r.im) && ((r.im > 0 && r.rsi >= 50) || (r.im < 0 && r.rsi <= 50)),
    'OBI-IND-002-pullback-aligned': r => Math.abs(r.im) >= .22 && r.trend === Math.sign(r.im) && Math.sign(r.past5_pct) === -Math.sign(r.im) && r.rsi >= 40 && r.rsi <= 60,
    'OBI-IND-003-volume-confirmed': r => Math.abs(r.im) >= .22 && r.volume_ratio >= 1.5 && Math.sign(r.past5_pct) === Math.sign(r.im) && r.spread_bps <= 3.59,
  };
  const candidateStats = {};
  for (const [name, predicate] of Object.entries(candidates)) candidateStats[name] = Object.fromEntries(Object.entries(parts).map(([part, xs]) => [part, stats(xs.filter(predicate))]));
  const report = { run_id: RUN, generated_at_utc: new Date().toISOString(), data_contract: 'indicators use only bars closed before snapshot_ts; entry/exit use next 1m opens; net15 includes 11 bps round trip plus top-10 book impact', usable_rows: rows.length, factor_correlations_to_gross_15m: factorMap, fixed_candidate_screen: candidateStats, verdict: 'DESCRIPTIVE_ONLY_NOT_A_PAPER_DECISION' };
  fs.writeFileSync(path.join(ROOT, 'data', `ah043_orderbook_indicator_map_${RUN}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main();
