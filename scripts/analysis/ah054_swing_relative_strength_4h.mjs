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

// ---------------------------------------------------------------------------
// Stage 1 — evaluation on the TRAIN segment only
// ---------------------------------------------------------------------------

/** EMA series precomputed once per symbol. Seeded with a simple mean over the first `period`. */
export function emaSeries(bars, period = FROZEN.ema_exit_period) {
  const out = new Array(bars.length).fill(null);
  if (bars.length < period) return out;
  const k = 2 / (period + 1);
  let e = 0;
  for (let j = 0; j < period; j += 1) e += bars[j][C];
  e /= period;
  out[period - 1] = e;
  for (let j = period; j < bars.length; j += 1) {
    e = bars[j][C] * k + e * (1 - k);
    out[j] = e;
  }
  return out;
}

/**
 * The frozen exit ladder, checked from the bar AFTER entry.
 *
 * When a bar's range contains the stop, the stop is taken. Assuming the favourable path inside
 * a bar is the standard way a replay flatters itself, and this strategy's stop is 500 bps wide,
 * so the assumption would matter.
 */
export function simulateExit(bars, i, emaArr) {
  const entry = bars[i][C];
  if (!(entry > 0)) return null;
  const stopPx = entry * (1 + FROZEN.hard_stop_pct / 100);
  const last = Math.min(i + FROZEN.timeout_bars, bars.length - 1);
  if (last <= i) return null;
  for (let k = i + 1; k <= last; k += 1) {
    if (bars[k][L] <= stopPx) {
      return { exit_index: k, exit_price: stopPx, gross_bps: FROZEN.hard_stop_pct * 100, reason: 'STOP' };
    }
    const e = emaArr[k];
    if (e !== null && bars[k][C] < e) {
      return { exit_index: k, exit_price: bars[k][C], gross_bps: 1e4 * (bars[k][C] / entry - 1), reason: 'EMA' };
    }
    if (k === i + FROZEN.timeout_bars) {
      return { exit_index: k, exit_price: bars[k][C], gross_bps: 1e4 * (bars[k][C] / entry - 1), reason: 'TIMEOUT' };
    }
  }
  return { exit_index: last, exit_price: bars[last][C], gross_bps: 1e4 * (bars[last][C] / entry - 1), reason: 'TRUNCATED' };
}

/**
 * Funding charged over the actual hold at the rate measured conditionally on the bull filter
 * this strategy trades inside: +0.04 bps per 8-hour settlement.
 *
 * This is a measured CONSTANT applied uniformly, not a per-trade series: funding history is
 * held for 18 symbols and this universe is 30, so a per-trade series does not exist. Stated
 * rather than hidden, and the magnitude makes it immaterial — a full 7-day hold costs 0.84 bps
 * against a 16 bps round trip.
 */
export function fundingBps(holdBars) {
  const settlements = (holdBars * FROZEN.bar_ms) / (8 * 3600_000);
  return settlements * 0.04;
}

const q = (xs, f) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * f))];
};

/** Max drawdown on the equity curve of sequential trades, in bps of cumulative net return. */
export function maxDrawdown(netSeries) {
  let cum = 0;
  let peak = 0;
  let mdd = 0;
  for (const x of netSeries) {
    cum += x;
    if (cum > peak) peak = cum;
    if (cum - peak < mdd) mdd = cum - peak;
  }
  return { final_cumulative_bps: cum, max_drawdown_bps: mdd };
}

export function tradeStats(trades) {
  if (!trades.length) return { n: 0 };
  const net = trades.map((t) => t.net_bps);
  const gross = trades.map((t) => t.gross_bps);
  const wins = net.filter((x) => x > 0);
  const losses = net.filter((x) => x < 0);
  const sd = stdev(net);
  const se = sd !== null ? sd / Math.sqrt(net.length) : null;
  const dd = maxDrawdown(net);
  return {
    n: net.length,
    gross_mean_bps: mean(gross),
    gross_median_bps: median(gross),
    net_mean_bps: mean(net),
    net_median_bps: median(net),
    sd_bps: sd,
    t_stat: se && se > 0 ? mean(net) / se : null,
    detectable_bps: se !== null ? 3 * se : null,
    win_rate_pct: (100 * wins.length) / net.length,
    avg_win_bps: wins.length ? mean(wins) : null,
    avg_loss_bps: losses.length ? mean(losses) : null,
    payoff_ratio: wins.length && losses.length ? mean(wins) / Math.abs(mean(losses)) : null,
    p05_bps: q(net, 0.05),
    p95_bps: q(net, 0.95),
    mean_hold_bars: mean(trades.map((t) => t.hold_bars)),
    exit_reasons: trades.reduce((a, t) => { a[t.reason] = (a[t.reason] || 0) + 1; return a; }, {}),
    ...dd,
  };
}

/**
 * Build trades for a given event list. `benchByTs` maps a 4H timestamp to the benchmark close,
 * so each trade can be compared with holding BTC over the identical window rather than against
 * a single buy-and-hold number for the whole span.
 */
export function buildTrades(bySymbol, events, emaCache, benchByTs) {
  const out = [];
  for (const e of events) {
    const bars = bySymbol[e.symbol];
    if (!bars) continue;
    const emaArr = emaCache[e.symbol] ?? (emaCache[e.symbol] = emaSeries(bars));
    const x = simulateExit(bars, e.bar_index, emaArr);
    if (!x) continue;
    const holdBars = x.exit_index - e.bar_index;
    const fund = fundingBps(holdBars);
    const net = x.gross_bps - FROZEN.cost_bps_roundtrip - fund;
    let benchBps = null;
    if (benchByTs) {
      const b0 = benchByTs.get(bars[e.bar_index][TS]);
      const b1 = benchByTs.get(bars[x.exit_index][TS]);
      if (b0 > 0 && b1 > 0) benchBps = 1e4 * (b1 / b0 - 1);
    }
    out.push({
      symbol: e.symbol,
      day: e.day,
      year: e.day.slice(0, 4),
      ts: e.ts,
      bar_index: e.bar_index,
      hold_bars: holdBars,
      reason: x.reason,
      gross_bps: x.gross_bps,
      funding_bps: fund,
      net_bps: net,
      benchmark_bps: benchBps,
      excess_over_benchmark_bps: benchBps === null ? null : net - benchBps,
      vol_burst: e.vol_burst,
      relative_strength: e.relative_strength,
    });
  }
  return out;
}

/**
 * Deterministic linear congruential generator, seeded from a frozen constant so the matched
 * null reproduces exactly. The engine draws no entropy from the platform and reads no clock;
 * the static scan asserts that, and this comment deliberately avoids naming the banned symbol
 * so it does not trip its own check.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/**
 * A matched null: the same number of entries per symbol, placed at random admissible bars under
 * the identical exit rules. It answers whether the ENTRY CONDITION matters, as distinct from
 * whether holding these symbols in this period paid.
 */
export function matchedNull(bySymbol, events, emaCache, benchByTs, draws = 200, seed = 54_054) {
  const rnd = lcg(seed);
  const perSymbol = {};
  for (const e of events) perSymbol[e.symbol] = (perSymbol[e.symbol] || 0) + 1;
  const lo = Math.min(...events.map((e) => e.bar_index));
  const hi = Math.max(...events.map((e) => e.bar_index));
  const means = [];
  for (let d = 0; d < draws; d += 1) {
    const fake = [];
    for (const [sym, count] of Object.entries(perSymbol)) {
      const bars = bySymbol[sym];
      if (!bars) continue;
      const top = Math.min(hi, bars.length - FROZEN.timeout_bars - 2);
      if (top <= lo) continue;
      for (let c = 0; c < count; c += 1) {
        const i = lo + Math.floor(rnd() * (top - lo));
        fake.push({ symbol: sym, day: dayKey(bars[i][TS]), ts: bars[i][TS], bar_index: i, vol_burst: null, relative_strength: null });
      }
    }
    const t = buildTrades(bySymbol, fake, emaCache, benchByTs);
    if (t.length) means.push(mean(t.map((x) => x.net_bps)));
  }
  means.sort((a, b) => a - b);
  return { draws: means.length, null_mean_bps: mean(means), null_p05: means[Math.floor(means.length * 0.05)], null_p95: means[Math.floor(means.length * 0.95)] };
}

export function stage1(bySymbol, stage0Result) {
  if (stage0Result.verdict !== 'STAGE_0_PASS') {
    return { task: FROZEN.task, stage: 1, verdict: 'NOT_AUTHORISED', promising_count: 0,
      closure_reason: `Stage 0 returned ${stage0Result.verdict}` };
  }
  const uni = selectUniverse(bySymbol);
  const { events } = buildEvents(bySymbol, uni.chosen);
  const cut = Math.floor(events.length * FROZEN.train_fraction);
  const train = events.slice(0, cut);

  const benchBars = bySymbol[FROZEN.benchmark];
  const benchByTs = benchBars ? new Map(benchBars.map((b) => [b[TS], b[C]])) : null;
  const emaCache = {};
  const trades = buildTrades(bySymbol, train, emaCache, benchByTs);

  const all = tradeStats(trades);

  // remove-best-symbol and remove-best-year: does one name or one year carry it?
  const bySym = {};
  const byYear = {};
  for (const t of trades) {
    (bySym[t.symbol] ??= []).push(t.net_bps);
    (byYear[t.year] ??= []).push(t.net_bps);
  }
  const totalNet = trades.reduce((a, t) => a + t.net_bps, 0);
  const symTot = Object.entries(bySym).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]);
  const yearTot = Object.entries(byYear).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]);
  const bestSym = symTot[0];
  const bestYear = yearTot[0];

  const withoutSym = tradeStats(trades.filter((t) => t.symbol !== bestSym[0]));
  const withoutYear = tradeStats(trades.filter((t) => t.year !== bestYear[0]));

  const bench = trades.map((t) => t.benchmark_bps).filter((x) => x !== null);
  const excess = trades.map((t) => t.excess_over_benchmark_bps).filter((x) => x !== null);

  return {
    task: FROZEN.task,
    stage: 1,
    label: 'TRAIN_ONLY_NOT_A_PASSPORT',
    promising_count: 0,
    frozen: FROZEN,
    segment: 'TRAIN',
    sealed_segments_untouched: true,
    sealed_events_reserved: events.length - cut,
    prior_expectation_bps: FROZEN.prior_expectation_bps,
    all,
    // The recorded trap is a positive mean with a near-zero median AND a payoff ratio below 1
    // -- many tiny wins against rare catastrophic losses, as in FAM.AMEL_DIRECTIONAL and the
    // Bybit account at 77.5 percent wins and a payoff of 0.089. A negative median with a payoff
    // ABOVE 1 is the ordinary shape of a stopped trend follower and must not be flagged; an
    // earlier cut of this line fired on exactly that healthy case.
    payoff_trap_signature: all.net_mean_bps > 0 && all.net_median_bps <= 0
      && all.payoff_ratio !== null && all.payoff_ratio < 1,
    payoff_shape: all.payoff_ratio !== null && all.payoff_ratio >= 1
      ? 'STOPPED_TREND_FOLLOWER' : 'MANY_SMALL_WINS',
    benchmark: {
      note: 'BTC held over the identical window of each trade, not a single buy-and-hold figure',
      n: bench.length,
      benchmark_mean_bps: mean(bench),
      benchmark_median_bps: median(bench),
      excess_mean_bps: mean(excess),
      excess_median_bps: median(excess),
      trades_beating_benchmark_pct: (100 * excess.filter((x) => x > 0).length) / Math.max(excess.length, 1),
    },
    remove_best_symbol: { removed: bestSym[0], its_total_net_bps: bestSym[1],
      share_of_total_pct: (100 * bestSym[1]) / (totalNet || 1), remaining: withoutSym },
    remove_best_year: { removed: bestYear[0], its_total_net_bps: bestYear[1],
      share_of_total_pct: (100 * bestYear[1]) / (totalNet || 1), remaining: withoutYear },
    matched_null: matchedNull(bySymbol, train, emaCache, benchByTs),
    per_year: Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, { n: v.length, total_bps: v.reduce((a, b) => a + b, 0), mean_bps: mean(v) }])),
    prior_check: {
      expected_gross_bps: FROZEN.prior_expectation_bps,
      measured_gross_bps: all.gross_mean_bps,
      difference_bps: all.gross_mean_bps - FROZEN.prior_expectation_bps,
      standard_errors_from_prior: all.detectable_bps
        ? (all.gross_mean_bps - FROZEN.prior_expectation_bps) / (all.detectable_bps / 3) : null,
    },
  };
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
  const opts = { bars: null, out: null, stage1: false, help: false };
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
    else if (arg === '--stage1') opts.stage1 = true;
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

  const world = loadBars(opts.bars);
  const s0 = stage0(world);
  const r = opts.stage1 ? { ...s0, stage1: stage1(world, s0) } : s0;
  process.stdout.write(`${JSON.stringify(opts.stage1 ? r.stage1 : {
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
