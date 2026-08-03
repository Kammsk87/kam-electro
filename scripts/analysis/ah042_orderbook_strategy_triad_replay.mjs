#!/usr/bin/env node
// Fixed replay of the three orderbook candidates in reference/BOTALIN_ORDERBOOK_STRATEGY_TRIAD_V0.md.
// Research-only: reads completed AMEL logs + one-time public-bar backfill; creates no orders or services.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/botalin-edge';
const RUN = 'amel-1785215500081';
const TAKER_ROUND_TRIP_PCT = 0.11;
const MIN = 60_000;
const LIQUID = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'ADAUSDT', 'ARBUSDT', 'NEARUSDT', 'SUIUSDT', 'ONDOUSDT', 'WLDUSDT', 'HYPEUSDT', 'ENAUSDT', 'AAVEUSDT', 'BNBUSDT']);
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const round = x => x == null ? null : +x.toFixed(4);
const loadJsonl = file => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const dirSign = direction => direction.startsWith('LONG') ? 1 : -1;
const eventFamily = name => name.replace(/_[0-9]+[MH]$/, '');

export function imbalance10(ob) {
  const bid = ob.bids10.reduce((sum, [price, size]) => sum + price * size, 0);
  const ask = ob.asks10.reduce((sum, [price, size]) => sum + price * size, 0);
  return (bid - ask) / (bid + ask);
}

export function bookImpactBps(ob, side, usd = 200) {
  const book = side === 1 ? ob.asks10 : ob.bids10;
  const reference = side === 1 ? ob.ask1 : ob.bid1;
  let remaining = usd, quantity = 0, spent = 0;
  for (const [price, size] of book) {
    const dollars = Math.min(remaining, price * size);
    quantity += dollars / price; spent += dollars; remaining -= dollars;
    if (remaining <= 1e-9) break;
  }
  if (remaining > 1e-9 || !quantity) return null;
  const vwap = spent / quantity;
  return side === 1 ? Math.max(0, (vwap - reference) / reference * 1e4) : Math.max(0, (reference - vwap) / reference * 1e4);
}

export function firstTouch(bars, side, entry, stopPct, targetPct, minutes) {
  const until = bars[0]?.[0] + minutes * MIN;
  for (const [t, open, high, low, close] of bars) {
    if (t >= until) return { exit: open, reason: 'TIME' };
    const target = side === 1 ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100);
    const stop = side === 1 ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100);
    const hitTarget = side === 1 ? high >= target : low <= target;
    const hitStop = side === 1 ? low <= stop : high >= stop;
    if (hitTarget && hitStop) return { exit: stop, reason: 'AMBIGUOUS_STOP_FIRST' };
    if (hitStop) return { exit: stop, reason: 'STOP' };
    if (hitTarget) return { exit: target, reason: 'TARGET' };
  }
  return null;
}

export function splitChronological(rows) {
  const s = [...rows].sort((a, b) => a.entryTs - b.entryTs); const n = s.length;
  return { train: s.slice(0, Math.floor(n * .55)), validation: s.slice(Math.floor(n * .55), Math.floor(n * .75)), holdout: s.slice(Math.floor(n * .75), Math.floor(n * .90)), forward: s.slice(Math.floor(n * .90)) };
}

function aggregate(rows) {
  const nets = rows.map(r => r.net); const gross = rows.map(r => r.gross); const bySymbol = {};
  for (const row of rows) bySymbol[row.symbol] = (bySymbol[row.symbol] || 0) + row.net;
  const best = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0]?.[0];
  const reduced = rows.filter(r => r.symbol !== best).map(r => r.net);
  const absTotal = Object.values(bySymbol).reduce((sum, x) => sum + Math.abs(x), 0) || 1;
  let seed = 20260803, ge = 0; const observed = avg(nets) ?? 0;
  for (let i = 0; i < 400; i++) { const simulated = avg(nets.map(x => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff < .5 ? -1 : 1) * Math.abs(x); })) ?? 0; if (simulated >= observed) ge++; }
  return { n: rows.length, symbols: Object.keys(bySymbol).length, net_mean_pct: round(avg(nets)), net_median_pct: round(median(nets)), gross_mean_pct: round(avg(gross)), winrate_pct: rows.length ? round(100 * nets.filter(x => x > 0).length / rows.length) : null,
    double_cost_mean_pct: round(avg(rows.map(r => r.gross - 2 * r.totalCostPct))), remove_best_symbol_mean_pct: round(avg(reduced)), max_symbol_share: round(Math.max(0, ...Object.values(bySymbol).map(x => Math.abs(x) / absTotal))), null_p: round(ge / 400), exits: rows.reduce((out, row) => (out[row.reason] = (out[row.reason] || 0) + 1, out), {}) };
}

function verdict(parts) {
  const oos = [...parts.holdout, ...parts.forward], a = aggregate(oos), f = aggregate(parts.forward);
  if (!oos.length) return 'DATA_BAD';
  if (a.n < 30 || f.n < 10) return 'NEEDS_MORE_LOGGING';
  if (a.net_mean_pct <= 0 || a.net_median_pct <= 0 || f.net_mean_pct <= 0 || a.double_cost_mean_pct <= 0 || a.remove_best_symbol_mean_pct <= 0 || a.null_p >= .05 || a.max_symbol_share > .35) return 'REJECT';
  return 'PREREG_BACKTEST_CANDIDATE';
}

function main() {
  const logDir = path.join(ROOT, 'logs/active_market_event_logger');
  const backfillDir = path.join(ROOT, 'data/amel_orderbook_backfill', RUN);
  const events = Object.fromEntries(loadJsonl(path.join(logDir, `events_${RUN}.jsonl`)).map(row => [row.event_id, row]));
  const books = loadJsonl(path.join(logDir, `orderbook_${RUN}.jsonl`)).filter(row => row.fetch_ok && events[row.event_id]);
  const bars = new Map();
  for (const symbol of Object.values(events).map(x => x.symbol).filter((x, i, xs) => xs.indexOf(x) === i)) {
    const p = path.join(backfillDir, `${symbol}_1m.json`);
    if (fs.existsSync(p)) bars.set(symbol, JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  const candidates = { 'OB-001': [], 'OB-002': [], 'OB-003-pass': [], 'OB-003-block': [] };
  const occupiedUntil = { 'OB-001': {}, 'OB-002': {}, 'OB-003-pass': {}, 'OB-003-block': {} };
  for (const ob of books.sort((a, b) => a.snapshot_ts - b.snapshot_ts)) {
    const event = events[ob.event_id], series = bars.get(ob.symbol); if (!series || !LIQUID.has(ob.symbol)) continue;
    if (ob.exec_200 !== 1) continue;
    const i = imbalance10(ob), sign = Math.sign(i), side = dirSign(event.event_direction);
    const start = series.findIndex(bar => bar[0] > Math.floor(ob.snapshot_ts / MIN) * MIN); if (start < 0) continue;
    const family = eventFamily(event.event_family), base = { symbol: ob.symbol, event_id: ob.event_id, entryTs: series[start][0] };
    const emit = (key, tradeSide, stop, target, horizon) => {
      if ((occupiedUntil[key][ob.symbol] || 0) > base.entryTs) return;
      const entry = series[start][1], outcome = firstTouch(series.slice(start), tradeSide, entry, stop, target, horizon); if (!outcome) return;
      const gross = ((tradeSide === 1 ? outcome.exit - entry : entry - outcome.exit) / entry) * 100;
      const impact = bookImpactBps(ob, tradeSide);
      if (!Number.isFinite(impact) || !Number.isFinite(gross)) return;
      const totalCostPct = TAKER_ROUND_TRIP_PCT + 2 * impact / 100;
      candidates[key].push({ ...base, gross, net: gross - totalCostPct, totalCostPct, reason: outcome.reason });
      occupiedUntil[key][ob.symbol] = base.entryTs + horizon * MIN;
    };
    const nonWide = ob.spread_bps <= 3.59;
    if (['MOMENTUM_IMPULSE', 'VOLUME_BURST', 'VOL_EXPANSION'].includes(family) && sign === side && Math.abs(i) >= .22 && nonWide) emit('OB-001', side, .35, .50, 5);
    if (['FAILED_BREAKOUT', 'WICK_REJECTION'].includes(family) && sign === -side && Math.abs(i) >= .22 && ob.depth_usd_10bps >= 333664 && nonWide) emit('OB-002', -side, .40, .45, 10);
    if (['MOMENTUM_IMPULSE', 'VOLUME_BURST', 'VOL_EXPANSION'].includes(family)) {
      if (Math.abs(i) < .066 || ob.spread_bps > 3.59) emit('OB-003-block', side, .35, .50, 5); else emit('OB-003-pass', side, .35, .50, 5);
    }
  }
  const report = { run_id: RUN, generated_at_utc: new Date().toISOString(), data_contract: 'entry is the open of the first complete 1m bar strictly after snapshot_ts; ambiguous bars count as STOP; 11 bps round-trip taker cost plus top-of-book impact; no same-symbol overlap within horizon', discovery_not_proof: true, no_paper: true, strategies: {} };
  for (const [key, rows] of Object.entries(candidates)) { const parts = splitChronological(rows); report.strategies[key] = { verdict: key.startsWith('OB-003') ? 'GUARD_ONLY' : verdict(parts), splits: Object.fromEntries(Object.entries(parts).map(([name, xs]) => [name, aggregate(xs)])) }; }
  fs.writeFileSync(path.join(ROOT, 'data', `ah042_orderbook_strategy_triad_${RUN}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.strategies).map(([key, value]) => [key, { verdict: value.verdict, holdout: value.splits.holdout, forward: value.splits.forward }])), null, 2));
}

if (process.argv.includes('--smoke')) {
  const im = imbalance10({ bids10: [[100, 2]], asks10: [[101, 1]] });
  const out = firstTouch([[60_000, 100, 101, 99, 100]], 1, 100, .5, .5, 5);
  const impact = bookImpactBps({ ask1: 100, bid1: 99, asks10: [[100, 1], [101, 10]], bids10: [[99, 1], [98, 10]] }, 1, 200);
  if (!(im > 0) || out.reason !== 'AMBIGUOUS_STOP_FIRST' || !(impact > 0) || Object.keys(splitChronological(Array.from({ length: 10 }, (_, i) => ({ entryTs: i })))).length !== 4) process.exit(1);
  console.log('SMOKE: 3 passed, 0 failed');
} else main();
