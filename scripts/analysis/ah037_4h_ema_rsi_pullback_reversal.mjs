#!/usr/bin/env node
// AH-037: fixed 4h EMA/RSI pullback research harness. No network or execution.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const COST_BPS = 11;
export const DOUBLE_COST_BPS = 22;
export const SPLITS = [0.55, 0.2, 0.15, 0.1];

export const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const percentile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * p)))];
};
export const day = (ts) => new Date(ts).toISOString().slice(0, 10);

export function ema(values, period) {
  const out = Array(values.length).fill(null), alpha = 2 / (period + 1);
  let value = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i === period - 1) value = mean(values.slice(0, period));
    else if (i >= period) value = alpha * values[i] + (1 - alpha) * value;
    if (i >= period - 1) out[i] = value;
  }
  return out;
}

export function rsi(values, period = 14) {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i += 1) { const d = values[i] - values[i - 1]; gains += Math.max(d, 0); losses += Math.max(-d, 0); }
  let avgGain = gains / period, avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// Input rows are [openTimeMs, open, high, low, close, volume]. Only complete UTC blocks survive.
export function aggregate4h(rows) {
  const byTs = new Map(rows.map((r) => [Number(r[0]), r]));
  const times = [...byTs.keys()].sort((a, b) => a - b), out = [];
  for (const ts of times) {
    if (ts % (4 * 3_600_000) !== 0) continue;
    const block = [0, 1, 2, 3].map((n) => byTs.get(ts + n * 3_600_000));
    if (block.some((row) => !row)) continue;
    out.push({ ts, o: +block[0][1], h: Math.max(...block.map((r) => +r[2])), l: Math.min(...block.map((r) => +r[3])), c: +block[3][4], v: block.reduce((s, r) => s + +r[5], 0) });
  }
  return out;
}

export function splitOf(index, count) {
  const train = Math.floor(count * SPLITS[0]), validation = train + Math.floor(count * SPLITS[1]);
  const holdout = validation + Math.floor(count * SPLITS[2]);
  if (index < train) return 'train';
  if (index < validation) return 'validation';
  if (index < holdout) return 'holdout';
  return 'forward';
}

export function reversalLong(b, i) {
  const cur = b[i], prev = b[i - 1], body = Math.abs(cur.c - cur.o), range = cur.h - cur.l;
  if (!prev) return false;
  const lower = Math.min(cur.o, cur.c) - cur.l;
  return (cur.c > cur.o && cur.c >= prev.o && cur.o <= prev.c) || (range > 0 && lower >= 2 * body && lower >= 0.45 * range && cur.c >= cur.o);
}
export function reversalShort(b, i) {
  const cur = b[i], prev = b[i - 1], body = Math.abs(cur.c - cur.o), range = cur.h - cur.l;
  if (!prev) return false;
  const upper = cur.h - Math.max(cur.o, cur.c);
  return (cur.c < cur.o && cur.c <= prev.o && cur.o >= prev.c) || (range > 0 && upper >= 2 * body && upper >= 0.45 * range && cur.c <= cur.o);
}

export function simulateTrade(bars, signalIndex, side, targetR = 2, timeout = 6) {
  const signal = bars[signalIndex], entryIndex = signalIndex + 1, entry = bars[entryIndex]?.o;
  if (!entry) return null;
  const stop = side === 'LONG' ? signal.l * 0.995 : signal.h * 1.005;
  const risk = side === 'LONG' ? entry - stop : stop - entry;
  if (!(risk > 0)) return null;
  const target = side === 'LONG' ? entry + targetR * risk : entry - targetR * risk;
  const last = Math.min(bars.length - 1, entryIndex + timeout);
  for (let j = entryIndex; j <= last; j += 1) {
    const b = bars[j], stopHit = side === 'LONG' ? b.l <= stop : b.h >= stop;
    const targetHit = side === 'LONG' ? b.h >= target : b.l <= target;
    // OHLC cannot order intrabar touches; adverse resolution protects against look-ahead optimism.
    if (stopHit && targetHit) return finish(stop, j, 'AMBIGUOUS_ADVERSE');
    if (stopHit) return finish(stop, j, 'STOP');
    if (targetHit) return finish(target, j, 'TARGET');
  }
  return finish(bars[last].c, last, 'TIMEOUT');
  function finish(exit, exitIndex, reason) {
    return { entry, exit, entryIndex, exitIndex, reason, bps: 10_000 * (side === 'LONG' ? (exit - entry) / entry : (entry - exit) / entry) };
  }
}

export function generateTrades(symbol, bars, options = {}) {
  const closes = bars.map((b) => b.c), e20 = ema(closes, 20), e50 = ema(closes, 50), r = rsi(closes, 14);
  const targetR = options.targetR ?? 2, timeout = options.timeout ?? 6, trades = [];
  for (let i = 50; i + 1 + timeout < bars.length; i += 1) {
    const b = bars[i], long = e20[i] > e50[i] && e20[i] > e20[i - 2] && e50[i] > e50[i - 2] && b.l <= e20[i] && b.c >= e50[i] && r[i] >= 40 && r[i] <= 50 && reversalLong(bars, i);
    const short = e20[i] < e50[i] && e20[i] < e20[i - 2] && e50[i] < e50[i - 2] && b.h >= e20[i] && b.c <= e50[i] && r[i] >= 50 && r[i] <= 60 && reversalShort(bars, i);
    if (!long && !short) continue;
    const side = long ? 'LONG' : 'SHORT', sim = simulateTrade(bars, i, side, targetR, timeout);
    if (!sim) continue;
    const split = options.splitFor ? options.splitFor(bars[sim.entryIndex].ts) : splitOf(sim.entryIndex, bars.length);
    trades.push({ ...sim, symbol, side, decisionIndex: i, decisionTs: b.ts, entryTs: bars[sim.entryIndex].ts, exitTs: bars[sim.exitIndex].ts, day: day(bars[sim.entryIndex].ts), split });
    i = sim.exitIndex; // one executable position per symbol at a time
  }
  return trades;
}

export function stats(trades, cost = COST_BPS) {
  const net = trades.map((t) => t.bps - cost), total = net.reduce((a, b) => a + b, 0);
  let cumulative = 0, peak = 0, dd = 0;
  for (const value of net) { cumulative += value; peak = Math.max(peak, cumulative); dd = Math.min(dd, cumulative - peak); }
  return {
    n: trades.length, symbols: new Set(trades.map((t) => t.symbol)).size, days: new Set(trades.map((t) => t.day)).size,
    ideal_mean_bps: mean(trades.map((t) => t.bps)), ideal_median_bps: median(trades.map((t) => t.bps)),
    net_mean_bps: mean(net), net_median_bps: median(net), win_rate_pct: trades.length ? 100 * net.filter((x) => x > 0).length / trades.length : null,
    p5_bps: percentile(net, 0.05), p95_bps: percentile(net, 0.95), net_total_bps: total, max_drawdown_bps: dd,
    exits: Object.fromEntries(['STOP', 'TARGET', 'TIMEOUT', 'AMBIGUOUS_ADVERSE'].map((k) => [k, trades.filter((t) => t.reason === k).length])),
  };
}

function seeded(seed) { let x = seed >>> 0; return () => ((x = (1664525 * x + 1013904223) >>> 0) / 2 ** 32); }
export function matchedNull(trades, barsBySymbol, samples = 1000) {
  const observed = median(trades.map((t) => t.bps - COST_BPS));
  const values = [];
  for (let k = 0; k < samples; k += 1) {
    const rnd = seeded(7_291 + k), bps = [];
    for (const t of trades) {
      const b = barsBySymbol[t.symbol], max = b.length - 7, idx = 50 + Math.floor(rnd() * Math.max(1, max - 50));
      const entry = b[idx].o, exit = b[Math.min(b.length - 1, idx + (t.exitIndex - t.entryIndex))].c;
      bps.push(10_000 * (t.side === 'LONG' ? (exit - entry) / entry : (entry - exit) / entry) - COST_BPS);
    }
    values.push(median(bps));
  }
  return { samples, observed_net_median_bps: observed, null_median_bps: median(values), p_value: values.filter((x) => x >= observed).length / samples };
}

export function removeBest(trades, key) {
  const groups = new Map();
  for (const t of trades) groups.set(t[key], [...(groups.get(t[key]) || []), t]);
  let best = null, bestPnl = -Infinity;
  for (const [name, rows] of groups) { const pnl = rows.reduce((s, t) => s + t.bps - COST_BPS, 0); if (pnl > bestPnl) { best = name; bestPnl = pnl; } }
  return { removed: best, stats: stats(trades.filter((t) => t[key] !== best)), removed_net_pnl_bps: bestPnl };
}

export function loadArchive(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8')), out = {};
  for (const [symbol, rows] of Object.entries(raw)) out[symbol] = aggregate4h(rows);
  return out;
}

export function chronology(archive) {
  let start = Infinity, end = -Infinity;
  for (const bars of Object.values(archive)) for (const b of bars) { start = Math.min(start, b.ts); end = Math.max(end, b.ts); }
  const step = 4 * 3_600_000;
  const count = Math.floor((end - start) / step) + 1;
  const trainEnd = start + Math.floor(count * SPLITS[0]) * step;
  const validationEnd = trainEnd + Math.floor(count * SPLITS[1]) * step;
  const holdoutEnd = validationEnd + Math.floor(count * SPLITS[2]) * step;
  const splitFor = (ts) => ts < trainEnd ? 'train' : ts < validationEnd ? 'validation' : ts < holdoutEnd ? 'holdout' : 'forward';
  const expected = ['train', 'validation', 'holdout', 'forward'].map((name) => Array.from({ length: count }, (_, i) => start + i * step).filter((ts) => splitFor(ts) === name).length);
  return { start, end, count, expected, splitFor };
}

export function eligibleArchive(archive, time = chronology(archive)) {
  const eligible = {};
  for (const [symbol, bars] of Object.entries(archive)) {
    const splitCounts = ['train', 'validation', 'holdout', 'forward'].map((name) => bars.filter((b) => time.splitFor(b.ts) === name).length);
    if (splitCounts.every((n, i) => n >= time.expected[i] * 0.95)) eligible[symbol] = bars;
  }
  return { eligible, chronology: time };
}

export function verdict(parts) {
  const h = parts.holdout, f = parts.forward, both = parts.combined, n = parts.null;
  if (parts.eligibleSymbols < 5 || h.n < 100 || f.n < 100 || h.days < 10 || f.days < 10 || both.days < 30) return 'DATA_INADEQUATE';
  if ([h, f].some((s) => s.net_mean_bps <= 0 || s.net_median_bps <= 0) || n.p_value >= 0.05) return 'OOS_FAIL_REJECT_FAMILY';
  if (stats(parts.combinedTrades, DOUBLE_COST_BPS).net_median_bps < 0 || parts.removeSymbol.stats.net_total_bps <= 0 || parts.removeDay.stats.net_total_bps <= 0 || parts.maxSymbolShare > 0.25 || parts.neighbours.some((x) => x.net_median_bps < 0)) return 'ROBUSTNESS_FAIL_DEPRIORITIZE';
  return 'CANDIDATE_PASSPORT_DRAFT';
}

function main() {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
  const archivePath = arg('archive', '/opt/botalin-edge/data/bars_xs/bars.json');
  const outBase = arg('out', '/opt/botalin-edge/data/ah037_4h_ema_rsi_pullback_reversal_2026-08-03');
  const loaded = loadArchive(archivePath), time = chronology(loaded), { eligible } = eligibleArchive(loaded, time);
  const trades = Object.entries(eligible).flatMap(([symbol, bars]) => generateTrades(symbol, bars, { splitFor: time.splitFor }));
  const part = (name) => trades.filter((t) => t.split === name);
  const holdoutTrades = part('holdout'), forwardTrades = part('forward'), combinedTrades = [...holdoutTrades, ...forwardTrades];
  const bySymbol = Object.fromEntries([...new Set(combinedTrades.map((t) => t.symbol))].map((s) => [s, combinedTrades.filter((t) => t.symbol === s).reduce((v, t) => v + t.bps - COST_BPS, 0)]));
  const totalAbs = Math.max(1, Object.values(bySymbol).reduce((a, b) => a + Math.abs(b), 0));
  const neighbours = [[1.5, 6], [2, 4]].map(([targetR, timeout]) => stats(Object.entries(eligible).flatMap(([s, b]) => generateTrades(s, b, { targetR, timeout, splitFor: time.splitFor })).filter((t) => t.split === 'holdout' || t.split === 'forward')));
  const report = {
    label: 'DISCOVERY_NOT_PROOF', task: 'TASK-AH-037', generated_at: new Date().toISOString(), archive_path: archivePath,
    data: { source_symbols: Object.keys(loaded).length, eligible_symbols: Object.keys(eligible).length, max_4h_bars: time.count, chronology: { start: new Date(time.start).toISOString(), end: new Date(time.end).toISOString(), expected_4h_bars_by_split: time.expected }, aggregation: 'UTC complete 4h blocks from closed 1h bars' },
    rule: 'fixed EMA20/EMA50 slopes + EMA-zone touch + RSI + mechanical reversal; next-4h-open entry; 0.5% stop; 2R target; 6-bar timeout; one position/symbol',
    costs: { conservative_roundtrip_bps: COST_BPS, double_roundtrip_bps: DOUBLE_COST_BPS },
    train: stats(part('train')), validation: stats(part('validation')), holdout: stats(holdoutTrades), forward: stats(forwardTrades), combined_oos: stats(combinedTrades),
    null: matchedNull(combinedTrades, eligible), remove_best_symbol: removeBest(combinedTrades, 'symbol'), remove_best_day: removeBest(combinedTrades, 'day'),
    symbol_net_pnl_bps: bySymbol, max_symbol_pnl_share: Math.max(0, ...Object.values(bySymbol).map((x) => Math.abs(x) / totalAbs)),
    robustness_neighbours: neighbours, event_overlap: { status: 'UNAVAILABLE', note: 'Prior rejected-family event ledgers were not retained in the AH-005A archive; no duplicate claim is made.' },
  };
  report.verdict = verdict({ ...report, eligibleSymbols: Object.keys(eligible).length, combinedTrades, maxSymbolShare: report.max_symbol_pnl_share });
  writeFileSync(`${outBase}.json`, `${JSON.stringify(report, null, 2)}\n`);
  const rows = ['split,n,symbols,days,net_mean_bps,net_median_bps,win_rate_pct,max_drawdown_bps'];
  for (const name of ['train', 'validation', 'holdout', 'forward', 'combined_oos']) { const s = report[name]; rows.push([name, s.n, s.symbols, s.days, s.net_mean_bps, s.net_median_bps, s.win_rate_pct, s.max_drawdown_bps].join(',')); }
  writeFileSync(`${outBase}.csv`, `${rows.join('\n')}\n`);
  console.log(JSON.stringify({ eligible_symbols: Object.keys(eligible).length, trades: trades.length, holdout: report.holdout, forward: report.forward, null: report.null, verdict: report.verdict }, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
