#!/usr/bin/env node
// AH-038 fixed 4h compression/volume short-breakout research. Offline only.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aggregate4h, chronology, eligibleArchive, matchedNull, median, percentile, mean } from './ah037_4h_ema_rsi_pullback_reversal.mjs';

const COST = 11, DOUBLE_COST = 22;
const day = (ts) => new Date(ts).toISOString().slice(0, 10);
const tr = (b, i) => i === 0 ? b[0].h - b[0].l : Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
const avg = (xs) => mean(xs) ?? 0;
const max = (xs) => Math.max(...xs), min = (xs) => Math.min(...xs);

export function atr(b, i, n = 14) { return i >= n ? avg(Array.from({ length: n }, (_, k) => tr(b, i - n + 1 + k))) : null; }
export function support(b, i, a) {
  const w = b.slice(i - 24, i - 3), floor = min(w.map((x) => x.l));
  const touches = w.map((x, k) => ({ x, k: i - 24 + k })).filter(({ x }) => x.l <= floor + 0.35 * a);
  const separated = touches.filter((x, k) => k === 0 || x.k - touches[k - 1].k >= 2);
  return separated.length >= 3 ? median(separated.map(({ x }) => x.l)) : null;
}
export function structure(b, i, volumeMult = 1.5) {
  const a = atr(b, i); if (!a || i < 24) return null;
  const s = support(b, i, a); if (!s) return null;
  const highsOld = max(b.slice(i - 16, i - 12).map((x) => x.h)), highsNew = max(b.slice(i - 8, i - 4).map((x) => x.h));
  const oldTr = avg(Array.from({ length: 10 }, (_, k) => tr(b, i - 13 + k))), recentTr = avg(Array.from({ length: 3 }, (_, k) => tr(b, i - 3 + k)));
  const oldVol = avg(b.slice(i - 23, i - 3).map((x) => x.v)), recentVol = avg(b.slice(i - 3, i).map((x) => x.v));
  const sma20 = avg(b.slice(i - 19, i + 1).map((x) => x.v));
  const valid = highsNew < highsOld && recentTr <= 0.75 * oldTr && recentVol <= 0.8 * oldVol && b[i].c <= s * 0.9975 && b[i].v >= volumeMult * sma20;
  return { valid, s, atr: a };
}
export function simulateShort(b, decision, entryIndex, a, targetR = 3, timeout = 6) {
  const entry = b[entryIndex]?.o, stop = Math.max(max(b.slice(decision - 3, decision + 1).map((x) => x.h)), entry + 1.5 * a);
  if (!(entry && stop > entry)) return null;
  const target = entry - targetR * (stop - entry), last = Math.min(b.length - 1, entryIndex + timeout);
  for (let i = entryIndex; i <= last; i += 1) {
    const stopHit = b[i].h >= stop, targetHit = b[i].l <= target;
    if (stopHit || targetHit) { const reason = stopHit && targetHit ? 'AMBIGUOUS_ADVERSE' : stopHit ? 'STOP' : 'TARGET'; const exit = stopHit ? stop : target; return finish(exit, i, reason); }
  }
  return finish(b[last].c, last, 'TIMEOUT');
  function finish(exit, exitIndex, reason) { return { entry, exit, entryIndex, exitIndex, reason, bps: 10_000 * (entry - exit) / entry }; }
}
export function generate(symbol, bars, btcByTs, splitFor, mode, volumeMult = 1.5) {
  const trades = [], missed = [];
  for (let i = 30; i + 8 < bars.length; i += 1) {
    const btc = btcByTs.get(bars[i].ts), btcPast = btcByTs.get(bars[i - 30]?.ts);
    if (btc && btcPast && (btc.c / btcPast.c - 1) <= -0.1) continue;
    const st = structure(bars, i, volumeMult); if (!st?.valid) continue;
    let entryIndex = i + 1;
    if (mode === 'retest') {
      let retest = null;
      for (let j = i + 1; j <= i + 3 && j + 1 < bars.length; j += 1) if (bars[j].h >= st.s - 0.15 * st.atr && bars[j].c < st.s) { retest = j; break; }
      if (retest == null) { missed.push({ symbol, decisionTs: bars[i].ts, split: splitFor(bars[i].ts) }); continue; }
      entryIndex = retest + 1;
    }
    const sim = simulateShort(bars, i, entryIndex, st.atr); if (!sim) continue;
    trades.push({ ...sim, symbol, side: 'SHORT', decisionIndex: i, decisionTs: bars[i].ts, entryTs: bars[entryIndex].ts, exitTs: bars[sim.exitIndex].ts, day: day(bars[entryIndex].ts), split: splitFor(bars[entryIndex].ts), support: st.s });
    i = sim.exitIndex;
  }
  return { trades, missed };
}
export function stats(trades, cost = COST) {
  const net = trades.map((t) => t.bps - cost); let cum = 0, peak = 0, dd = 0;
  for (const x of net) { cum += x; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); }
  return { n: trades.length, symbols: new Set(trades.map((t) => t.symbol)).size, days: new Set(trades.map((t) => t.day)).size, ideal_mean_bps: mean(trades.map((t) => t.bps)), ideal_median_bps: median(trades.map((t) => t.bps)), net_mean_bps: mean(net), net_median_bps: median(net), win_rate_pct: net.length ? 100 * net.filter((x) => x > 0).length / net.length : null, p5_bps: percentile(net, .05), p95_bps: percentile(net, .95), net_total_bps: net.reduce((a, b) => a + b, 0), max_drawdown_bps: dd, exits: Object.fromEntries(['STOP', 'TARGET', 'TIMEOUT', 'AMBIGUOUS_ADVERSE'].map((k) => [k, trades.filter((t) => t.reason === k).length])) };
}
function removeBest(trades, key, times = 1) { let keep = [...trades], removed = []; for (let i = 0; i < times && keep.length; i += 1) { const groups = new Map(); for (const t of keep) groups.set(t[key], (groups.get(t[key]) || 0) + t.bps - COST); const best = [...groups.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; removed.push(best); keep = keep.filter((t) => t[key] !== best); } return { removed, stats: stats(keep) }; }
function assess(name, all, missed, archive, neighbours, eligibleCount) {
  const pick = (split) => all.filter((t) => t.split === split), h = pick('holdout'), f = pick('forward'), oos = [...h, ...f];
  const symbolAbs = new Map(); for (const t of oos) symbolAbs.set(t.symbol, (symbolAbs.get(t.symbol) || 0) + Math.abs(t.bps - COST));
  const totalAbs = Math.max(1, [...symbolAbs.values()].reduce((a, b) => a + b, 0));
  const result = { entry_form: name, train: stats(pick('train')), validation: stats(pick('validation')), holdout: stats(h), forward: stats(f), combined_oos: stats(oos), missed_retests: missed.length, null: matchedNull(oos, archive), remove_best_symbol: removeBest(oos, 'symbol'), remove_best_three_symbols: removeBest(oos, 'symbol', 3), remove_best_day: removeBest(oos, 'day'), max_symbol_abs_pnl_share: Math.max(0, ...[...symbolAbs.values()].map((x) => x / totalAbs)), neighbours };
  const hst = result.holdout, fst = result.forward, cst = result.combined_oos;
  result.verdict = (eligibleCount < 5 || hst.n < 100 || fst.n < 100 || hst.days < 10 || fst.days < 10 || cst.days < 30) ? 'DATA_INADEQUATE' : ([hst, fst].some((x) => x.net_mean_bps <= 0 || x.net_median_bps <= 0) || result.null.p_value >= .05 ? 'OOS_FAIL_REJECT_FAMILY' : (stats(oos, DOUBLE_COST).net_median_bps < 0 || result.remove_best_symbol.stats.net_total_bps <= 0 || result.remove_best_day.stats.net_total_bps <= 0 || result.max_symbol_abs_pnl_share > .25 || neighbours.some((x) => x.net_median_bps < 0) ? 'ROBUSTNESS_FAIL_DEPRIORITIZE' : 'CANDIDATE_PASSPORT_DRAFT'));
  return result;
}
function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; }, archivePath = arg('archive', '/opt/botalin-edge/data/bars_xs/bars.json'), out = arg('out', '/opt/botalin-edge/data/ah038_4h_compression_volume_short_breakout_2026-08-02');
  const raw = JSON.parse(readFileSync(archivePath, 'utf8')), archive = Object.fromEntries(Object.entries(raw).map(([s, r]) => [s, aggregate4h(r)])), time = chronology(archive), { eligible } = eligibleArchive(archive, time), btc = new Map((eligible.BTCUSDT || []).map((b) => [b.ts, b]));
  const build = (mode, multiplier = 1.5) => Object.entries(eligible).map(([s, b]) => generate(s, b, btc, time.splitFor, mode, multiplier));
  const normal = Object.fromEntries(['confirmation', 'retest'].map((mode) => { const x = build(mode), neighbours = [1.25, 1.75].map((m) => stats(build(mode, m).flatMap((v) => v.trades).filter((t) => t.split === 'holdout' || t.split === 'forward'))); return [mode, assess(mode, x.flatMap((v) => v.trades), x.flatMap((v) => v.missed), eligible, neighbours, Object.keys(eligible).length)]; }));
  const report = { label: 'DISCOVERY_NOT_PROOF', task: 'TASK-AH-038', generated_at: new Date().toISOString(), data: { source_symbols: Object.keys(archive).length, eligible_symbols: Object.keys(eligible).length, chronology: { start: new Date(time.start).toISOString(), end: new Date(time.end).toISOString(), expected_4h_bars_by_split: time.expected } }, costs: { conservative_roundtrip_bps: COST, double_roundtrip_bps: DOUBLE_COST }, overlap: { status: 'UNAVAILABLE', note: 'AH-027/028/032/033 and failed-breakout event ledgers are not retained with this archive.' }, forms: normal, overall_verdict: Object.values(normal).every((x) => x.verdict === 'DATA_INADEQUATE') ? 'DATA_INADEQUATE' : 'SEE_ENTRY_FORM_VERDICTS' };
  writeFileSync(`${out}.json`, JSON.stringify(report, null, 2) + '\n');
  const rows = ['form,split,n,symbols,days,net_mean_bps,net_median_bps,win_rate_pct']; for (const [form, r] of Object.entries(normal)) for (const split of ['train', 'validation', 'holdout', 'forward', 'combined_oos']) { const s = r[split]; rows.push([form, split, s.n, s.symbols, s.days, s.net_mean_bps, s.net_median_bps, s.win_rate_pct].join(',')); }
  writeFileSync(`${out}.csv`, rows.join('\n') + '\n');
  const summary = Object.fromEntries(Object.entries(normal).map(([k, v]) => [k, { holdout: v.holdout, forward: v.forward, missed: v.missed_retests, verdict: v.verdict }]));
  console.log(JSON.stringify({ eligible_symbols: Object.keys(eligible).length, forms: summary, overall: report.overall_verdict }, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
