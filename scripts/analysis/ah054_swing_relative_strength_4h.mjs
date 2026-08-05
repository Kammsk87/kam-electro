#!/usr/bin/env node
// ah054_swing_relative_strength_4h.mjs
//
// TASK-AH-054 — Swing Relative Strength 4H. Research only.
//
// STAGE 0 IS A SAMPLE AUDIT AND COMPUTES NO PnL. That is deliberate: the contract gates on
// sample size and sort health before any return is looked at, so the audit cannot be read in
// the light of a result it has not seen.
//
// The expectation was recorded in the task before this file existed: gross +181 bps per trade,
// taken from LAW.XSECT.WEEKLY_MOMENTUM_BOUNDED whose top quintile returns +181.3 bps on a
// one-week hold, against costs of about 17 bps -- 16 bps round trip plus roughly 1 bps of
// funding measured conditionally on the bull filter this strategy trades inside.
//
// Causality: the daily filter and the relative-strength score are evaluated on the last
// COMPLETED UTC day strictly before the 4H bar under test. A 4H bar at 08:00 uses daily data
// through the previous day's close and never its own day.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-054',
  stage: 0,
  bar_ms: 14_400_000,               // 4 hours
  day_ms: 86_400_000,
  universe_size: 30,
  // Excluded on LAW.BASIS.LIQUID_PERP_BELOW_COST, which records basis dispersion of 23.6 and
  // 30.6 bps against 1.4-4.7 for the rest. A pre-existing measurement, never an outcome.
  excluded_symbols: ['TACUSDT', 'VANRYUSDT'],
  benchmark: 'BTCUSDT',
  market_filter_sma_days: 50,
  relative_strength_days: 7,
  relative_strength_quantile: 0.80,  // top quintile
  breakout_lookback_bars: 18,        // three days of 4H
  vol_burst_min: 1.3,
  vol_burst_window: 20,
  declared_direction: 'LONG',
  entry_reference: 'BREAKING_4H_CLOSE',
  hard_stop_pct: -5.0,
  ema_exit_period: 20,
  timeout_bars: 42,                  // 168 hours
  leverage: 1.0,
  cost_bps_roundtrip: 16,
  double_cost_bps_roundtrip: 32,
  measured_funding_bps_per_hold: 0.8,
  train_fraction: 0.55,
  min_events: 100,
  min_events_per_oos_segment: 30,
  prior_expectation_bps: 181.3,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

/** 4H bars are [ts, open, high, low, close, volume, turnover]. */
export const TS = 0; export const O = 1; export const H = 2; export const L = 3;
export const C = 4; export const V = 5; export const TO = 6;

/**
 * Ranks 1..n with ties averaged. Used by the balance gate, never positional bucketing —
 * positional splits a tied block across boundaries and reports even sizes, which would hide the
 * collapse the gate exists to catch. That defect was found in AH-053.
 */
export function rankAverage(values) {
  const n = values.length;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => (a.v - b.v) || (a.i - b.i));
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].v === order[i].v) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k].i] = r;
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily series derived from the 4H series
// ---------------------------------------------------------------------------

/**
 * Daily closes taken as the last 4H bar of each UTC day, plus that day's total turnover.
 *
 * Deriving the daily series from the same 4H source rather than joining a separate daily feed
 * removes an entire class of mismatch: two feeds can disagree on a close by a tick and the
 * disagreement would land silently inside the filter.
 */
export function dailyFromBars(bars) {
  const byDay = new Map();
  for (const b of bars) {
    const k = dayKey(b[TS]);
    const cur = byDay.get(k);
    if (!cur || b[TS] > cur.ts) {
      byDay.set(k, { ts: b[TS], close: b[C], turnover: (cur?.turnover ?? 0) + (b[TO] || 0) });
    } else {
      cur.turnover += b[TO] || 0;
    }
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, v]) => ({ day, ts: v.ts, close: v.close, turnover: v.turnover }));
}

/** Simple moving average of daily closes ending at index i inclusive. Null until warmed. */
export function smaClose(daily, i, window) {
  if (i < window - 1) return null;
  let s = 0;
  for (let k = i - window + 1; k <= i; k += 1) s += daily[k].close;
  return s / window;
}

/** Return over `days` completed days ending at index i. Null until warmed. */
export function dailyReturn(daily, i, days) {
  if (i < days) return null;
  const a = daily[i - days].close;
  const b = daily[i].close;
  if (!(a > 0) || !(b > 0)) return null;
  return b / a - 1;
}

// ---------------------------------------------------------------------------
// 4H indicators
// ---------------------------------------------------------------------------

/** Mean of the `window` bars ENDING AT i-1 — the bar itself is excluded from its own baseline. */
export function volumeBaseline(bars, i, window = FROZEN.vol_burst_window) {
  if (i < window) return null;
  let s = 0;
  for (let k = i - window; k < i; k += 1) s += bars[k][V];
  return s / window;
}

/**
 * Highest high over the `lookback` bars ENDING AT i-1. The breaking bar is excluded, because a
 * bar's own high is at least its close and including it makes the condition near-tautological.
 */
export function priorHigh(bars, i, lookback = FROZEN.breakout_lookback_bars) {
  if (i < lookback) return null;
  let hi = -Infinity;
  for (let k = i - lookback; k < i; k += 1) if (bars[k][H] > hi) hi = bars[k][H];
  return hi;
}

/** EMA of closes at index i. Seeded with a simple mean over the first `period` bars. */
export function ema(bars, i, period = FROZEN.ema_exit_period) {
  if (i < period - 1) return null;
  const k = 2 / (period + 1);
  let e = 0;
  for (let j = 0; j < period; j += 1) e += bars[j][C];
  e /= period;
  for (let j = period; j <= i; j += 1) e = bars[j][C] * k + e * (1 - k);
  return e;
}

// ---------------------------------------------------------------------------
// Universe
// ---------------------------------------------------------------------------

/**
 * Top-N by median daily turnover, after the recorded exclusions and a completeness rule.
 * Liquidity is a coverage criterion measured from the data; it never looks at returns.
 */
export function selectUniverse(bySymbol, size = FROZEN.universe_size) {
  const rows = [];
  const dropped = [];
  for (const [sym, bars] of Object.entries(bySymbol)) {
    if (FROZEN.excluded_symbols.includes(sym)) { dropped.push({ symbol: sym, why: 'BASIS_DISPERSION' }); continue; }
    if (!Array.isArray(bars) || bars.length < 500) { dropped.push({ symbol: sym, why: 'SHORT_SERIES' }); continue; }
    const daily = dailyFromBars(bars);
    const to = daily.map((d) => d.turnover).filter((x) => x > 0);
    if (to.length < 200) { dropped.push({ symbol: sym, why: 'NO_TURNOVER' }); continue; }
    rows.push({ symbol: sym, median_daily_turnover: median(to), days: daily.length, bars: bars.length });
  }
  rows.sort((a, b) => b.median_daily_turnover - a.median_daily_turnover);
  const chosen = rows.slice(0, size);
  // The benchmark must be present whatever its rank, since every score is measured against it.
  if (!chosen.some((r) => r.symbol === FROZEN.benchmark)) {
    const bench = rows.find((r) => r.symbol === FROZEN.benchmark);
    if (bench) chosen.push(bench);
  }
  return { chosen, dropped, ranked: rows };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * All qualifying entries across the universe.
 *
 * The daily context is indexed by day and looked up at the last COMPLETED day strictly before
 * the 4H bar, so a bar at 08:00 uses the previous day's close. Using the same day's close would
 * be look-ahead of up to 24 hours.
 */
export function buildEvents(bySymbol, universe) {
  const symbols = universe.map((u) => u.symbol);
  const daily = {};
  for (const s of symbols) daily[s] = dailyFromBars(bySymbol[s]);

  const bench = daily[FROZEN.benchmark];
  if (!bench) return { events: [], diagnostics: { reason: 'benchmark missing' } };

  // Day index -> is the market filter satisfied, and what the benchmark's 7d return was.
  const dayIdx = new Map(bench.map((d, i) => [d.day, i]));
  const bullByDay = new Map();
  const benchR7 = new Map();
  for (let i = 0; i < bench.length; i += 1) {
    const s = smaClose(bench, i, FROZEN.market_filter_sma_days);
    bullByDay.set(bench[i].day, s === null ? null : bench[i].close > s);
    benchR7.set(bench[i].day, dailyReturn(bench, i, FROZEN.relative_strength_days));
  }

  // Relative-strength score per symbol per day, then the cross-sectional cut per day.
  const scoreByDay = new Map();
  for (const s of symbols) {
    const d = daily[s];
    const idx = new Map(d.map((x, i) => [x.day, i]));
    for (const day of dayIdx.keys()) {
      const i = idx.get(day);
      if (i === undefined) continue;
      const r = dailyReturn(d, i, FROZEN.relative_strength_days);
      const br = benchR7.get(day);
      if (r === null || br === null || br === undefined) continue;
      if (!scoreByDay.has(day)) scoreByDay.set(day, []);
      scoreByDay.get(day).push({ symbol: s, score: r - br });
    }
  }
  const topByDay = new Map();
  for (const [day, list] of scoreByDay) {
    if (list.length < 5) continue;
    const sorted = [...list].sort((a, b) => a.score - b.score);
    const cut = Math.floor(sorted.length * FROZEN.relative_strength_quantile);
    topByDay.set(day, new Set(sorted.slice(cut).map((x) => x.symbol)));
  }

  const events = [];
  let considered = 0;
  let failedFilter = 0;
  let failedStrength = 0;
  let failedTrigger = 0;
  let blockedOverlap = 0;

  for (const s of symbols) {
    if (s === FROZEN.benchmark && !universe.some((u) => u.symbol === s && u.tradeable !== false)) {
      // The benchmark is still tradeable; it is included only if it made the cut on liquidity.
    }
    const bars = bySymbol[s];
    let blockedUntil = -1;
    for (let i = 0; i < bars.length; i += 1) {
      const base = volumeBaseline(bars, i);
      const ph = priorHigh(bars, i);
      if (base === null || ph === null || !(base > 0)) continue;
      considered += 1;

      // The last completed day strictly before this bar.
      const prevDay = dayKey(bars[i][TS] - FROZEN.day_ms);
      const bull = bullByDay.get(prevDay);
      if (bull !== true) { failedFilter += 1; continue; }
      const top = topByDay.get(prevDay);
      if (!top || !top.has(s)) { failedStrength += 1; continue; }

      const volBurst = bars[i][V] / base;
      const broke = bars[i][C] > ph;
      if (!broke || volBurst < FROZEN.vol_burst_min) { failedTrigger += 1; continue; }

      if (i <= blockedUntil) { blockedOverlap += 1; continue; }
      blockedUntil = i + FROZEN.timeout_bars;

      const scoreRow = (scoreByDay.get(prevDay) ?? []).find((x) => x.symbol === s);
      events.push({
        symbol: s,
        ts: bars[i][TS],
        day: dayKey(bars[i][TS]),
        bar_index: i,
        entry: bars[i][C],
        vol_burst: volBurst,
        relative_strength: scoreRow ? scoreRow.score : null,
      });
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  return {
    events,
    diagnostics: {
      bars_considered: considered,
      rejected_market_filter: failedFilter,
      rejected_relative_strength: failedStrength,
      rejected_trigger: failedTrigger,
      rejected_overlap: blockedOverlap,
      bull_days: [...bullByDay.values()].filter((x) => x === true).length,
      days_with_filter: [...bullByDay.values()].filter((x) => x !== null).length,
    },
  };
}

// ---------------------------------------------------------------------------
// The balance gate
// ---------------------------------------------------------------------------

export function bucketBalance(events, key, buckets = 5) {
  const values = events.map((e) => e[key]).filter(Number.isFinite);
  if (values.length < buckets) return { key, n: values.length, degenerate: true, reason: 'too few values' };
  const distinct = new Set(values).size;
  const rk = rankAverage(values);
  const sizes = new Array(buckets).fill(0);
  for (const r of rk) sizes[Math.min(buckets - 1, Math.floor(((r - 1) * buckets) / values.length))] += 1;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    key,
    n: values.length,
    distinct,
    distinct_pct: (100 * distinct) / values.length,
    tie_pct: (100 * (values.length - distinct)) / values.length,
    bucket_sizes: sizes,
    max_min_ratio: Math.max(...sizes) / Math.max(Math.min(...sizes), 1),
    degenerate: Math.max(...sizes) / Math.max(Math.min(...sizes), 1) >= 1.5,
    p05: sorted[Math.floor(values.length * 0.05)],
    p50: median(values),
    p95: sorted[Math.floor(values.length * 0.95)],
  };
}

// ---------------------------------------------------------------------------
// Stage 0 — sample audit, no PnL
// ---------------------------------------------------------------------------

export function stage0(bySymbol) {
  const uni = selectUniverse(bySymbol);
  if (uni.chosen.length < 10) {
    return {
      task: FROZEN.task, stage: 0, label: 'SAMPLE_AUDIT_NO_PNL', verdict: 'DATA_INADEQUATE',
      promising_count: 0, frozen: FROZEN, universe: uni.chosen.length,
      closure_reason: `only ${uni.chosen.length} symbols survived the coverage rule`,
    };
  }

  const { events, diagnostics } = buildEvents(bySymbol, uni.chosen);
  const balance = {
    relative_strength: bucketBalance(events, 'relative_strength'),
    vol_burst: bucketBalance(events, 'vol_burst'),
  };

  // Spacing between consecutive entries on the same symbol, in bars.
  const gaps = [];
  const bySym = {};
  for (const e of events) (bySym[e.symbol] ??= []).push(e);
  for (const list of Object.values(bySym)) {
    for (let k = 1; k < list.length; k += 1) gaps.push(list[k].bar_index - list[k - 1].bar_index);
  }

  const byYear = {};
  for (const e of events) {
    const y = e.day.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  }
  const perSymbol = Object.fromEntries(Object.entries(bySym).map(([k, v]) => [k, v.length]));
  const sealed = events.length - Math.floor(events.length * FROZEN.train_fraction);

  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'SAMPLE_AUDIT_NO_PNL',
    promising_count: 0,
    frozen: FROZEN,
    sealed_segments_untouched: true,
    universe: uni.chosen.map((u) => ({ symbol: u.symbol, median_daily_turnover: u.median_daily_turnover, bars: u.bars })),
    universe_size: uni.chosen.length,
    dropped_symbols: uni.dropped,
    total_events: events.length,
    events_per_symbol: perSymbol,
    events_per_year: byYear,
    train_events: Math.floor(events.length * FROZEN.train_fraction),
    sealed_events_available: sealed,
    span: events.length ? { first: events[0].day, last: events[events.length - 1].day } : null,
    diagnostics,
    bucket_balance: balance,
    spacing_bars: gaps.length
      ? { n: gaps.length, min: Math.min(...gaps), median: median(gaps), mean: mean(gaps) }
      : null,
    prior_expectation_bps: FROZEN.prior_expectation_bps,
    cost_bps: FROZEN.cost_bps_roundtrip + FROZEN.measured_funding_bps_per_hold,
    pnl_computed: false,
  };

  if (events.length < FROZEN.min_events) {
    out.verdict = 'UNDERPOWERED';
    out.closure_reason = `${events.length} events against a declared minimum of ${FROZEN.min_events}; no PnL was computed`;
  } else if (balance.relative_strength.degenerate || balance.vol_burst.degenerate) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = 'a sort is degenerate; a collapsed sort cannot support a conditional result';
  } else if (sealed < FROZEN.min_events_per_oos_segment) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `only ${sealed} sealed events, below ${FROZEN.min_events_per_oos_segment}`;
  } else {
    out.verdict = 'STAGE_0_PASS';
    out.closure_reason = null;
  }
  return out;
}

export function toCsv(r) {
  const header = 'metric,key,n,distinct_pct,tie_pct,max_min_ratio,p05,p50,p95,degenerate';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(6) : v);
  const lines = [];
  for (const b of Object.values(r.bucket_balance ?? {})) {
    lines.push(['balance', b.key, b.n, c(b.distinct_pct), c(b.tie_pct), c(b.max_min_ratio),
      c(b.p05), c(b.p50), c(b.p95), b.degenerate].join(','));
  }
  for (const [y, n] of Object.entries(r.events_per_year ?? {})) {
    lines.push(['events_per_year', y, n, '', '', '', '', '', '', ''].join(','));
  }
  if (!lines.length) lines.push('NO_EVENTS,,0,,,,,,,');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah054_swing_relative_strength_4h.mjs — TASK-AH-054 Stage 0, research only

Usage:
  node scripts/analysis/ah054_swing_relative_strength_4h.mjs --bars <dir> [--out <base>]

  --bars <dir>  Directory of <SYMBOL>.json, each {symbol, bars:[[ts,o,h,l,c,v,turnover]]}
  --out <base>  Write <base>.json and <base>.csv (nothing is written without it)

Stage 0 is a sample audit and computes NO PnL. Holdout and forward stay sealed.`;

export function parseArgs(argv) {
  const opts = { bars: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--bars') opts.bars = next();
    else if (arg === '--out') opts.out = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

export function loadBars(dir) {
  const root = resolve(dir);
  if (!existsSync(root)) throw new Error(`directory not found: ${root}`);
  const out = {};
  for (const f of readdirSync(root)) {
    if (!f.endsWith('.json')) continue;
    const r = JSON.parse(readFileSync(join(root, f), 'utf8'));
    if (r && r.symbol && Array.isArray(r.bars) && r.bars.length) out[r.symbol] = r.bars;
  }
  return out;
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help || !opts.bars) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = stage0(loadBars(opts.bars));
  process.stdout.write(`${JSON.stringify({
    task: r.task, verdict: r.verdict, closure_reason: r.closure_reason,
    universe_size: r.universe_size, total_events: r.total_events, span: r.span,
    events_per_year: r.events_per_year, sealed_events_available: r.sealed_events_available,
    diagnostics: r.diagnostics, bucket_balance: r.bucket_balance, spacing_bars: r.spacing_bars,
    pnl_computed: r.pnl_computed,
  }, null, 2)}\n`);

  if (opts.out) {
    const base = resolve(opts.out);
    mkdirSync(dirname(base), { recursive: true });
    writeFileSync(`${base}.json`, `${JSON.stringify(r, null, 2)}\n`, 'utf8');
    writeFileSync(`${base}.csv`, toCsv(r), 'utf8');
    process.stdout.write(`wrote ${base}.json\nwrote ${base}.csv\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
