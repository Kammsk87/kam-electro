#!/usr/bin/env node
// ah053_momentum_vol_expansion_breakout.mjs
//
// TASK-AH-053 — Momentum Volatility-Expansion Breakout. Research only.
//
// STAGE 0 FEASIBILITY HARNESS. If the gate fails, no Stage 1 evaluation is written.
//
// The expectation is recorded in the task BEFORE this ran:
// LAW.FLOW.SWEEP_CONTINUATION_SATURATES measured aggressive-flow continuation rising to
// 8.27 bps at the largest one-in-a-thousand parent order and saturating there. A volume burst
// that breaks a two-hour extreme is a large aggressive flow event, so the effect is expected
// near 8 bps and below the 16 bps floor. A gross effect above 16 bps would falsify that prior
// by showing the saturation law does not carry from tick-level sweeps to bar-level bursts.
//
// This is a structural variant of TASK-AH-039, not a repeat: AH-039 gates on volatility
// COMPRESSION before the break and was rejected at -13.53 bps out of sample; this gates on
// EXPANSION at the break. Overlap against AH-039 cannot be computed because its timestamp
// ledger was not retained, which is why this task retains its own.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-053',
  stage: 0,
  timeframe: '5m',
  bar_ms: 300_000,
  // TAC and VANRY are excluded on LAW.BASIS.LIQUID_PERP_BELOW_COST, which records their basis
  // dispersion at 23.6 and 30.6 bps against 1.4-4.7 for the rest. A pre-existing measurement,
  // never an outcome.
  universe: ['AAVEUSDT', 'ADAUSDT', 'ARBUSDT', 'BTCUSDT', 'DOGEUSDT', 'ENAUSDT', 'ETHUSDT',
    'HYPEUSDT', 'LINKUSDT', 'NEARUSDT', 'SOLUSDT', 'SUIUSDT', 'UNIUSDT', 'WLDUSDT',
    'XLMUSDT', 'XRPUSDT'],
  vol_burst_min: 1.5,
  vol_burst_window: 20,
  vol_expansion_min: 1.2,
  atr_window: 14,
  breakout_lookback_bars: 24,      // two hours
  declared_direction: 'WITH_THE_BREAK',
  entry_reference: 'BREAKING_BAR_CLOSE',
  hard_stop_pct: 1.0,
  time_stop_bars: 9,               // 45 minutes
  horizons_bars: [3, 6, 9],        // 15, 30, 45 minutes
  primary_horizon_bars: 9,
  cost_bps_roundtrip: 16,
  double_cost_bps_roundtrip: 32,
  superseded_cost_bps_roundtrip: 11,
  train_fraction: 0.55,
  min_events_per_oos_segment: 30,
  power_target_t: 3,
  prior_expectation_bps: 8.27,
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

/** Bars are [ts, open, high, low, close, volume]. */
export const TS = 0; export const O = 1; export const H = 2; export const L = 3;
export const C = 4; export const V = 5;

/**
 * Wilder true range at index i, which needs the previous close. Index 0 has no predecessor and
 * returns null rather than falling back to high-low: a silent fallback would make the first
 * ATR window quietly different from every other one.
 */
export function trueRange(bars, i) {
  if (i < 1) return null;
  const pc = bars[i - 1][C];
  return Math.max(bars[i][H] - bars[i][L], Math.abs(bars[i][H] - pc), Math.abs(bars[i][L] - pc));
}

/** Simple ATR over the `window` bars ending at i inclusive. Null until fully warmed. */
export function atr(bars, i, window = FROZEN.atr_window) {
  if (i < window) return null;
  let s = 0;
  for (let k = i - window + 1; k <= i; k += 1) {
    const tr = trueRange(bars, k);
    if (tr === null) return null;
    s += tr;
  }
  return s / window;
}

/** Mean volume over the `window` bars ending at i-1 — the bar itself is excluded. */
export function volumeBaseline(bars, i, window = FROZEN.vol_burst_window) {
  if (i < window) return null;
  let s = 0;
  for (let k = i - window; k < i; k += 1) s += bars[k][V];
  return s / window;
}

/**
 * Extreme of the `lookback` bars ENDING AT i-1. The breaking bar is excluded by construction —
 * including it would make "close beyond the extreme" nearly tautological, since the bar's own
 * high is at least its close.
 */
export function priorExtreme(bars, i, lookback = FROZEN.breakout_lookback_bars) {
  if (i < lookback) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = i - lookback; k < i; k += 1) {
    if (bars[k][H] > hi) hi = bars[k][H];
    if (bars[k][L] < lo) lo = bars[k][L];
  }
  return { hi, lo };
}

// ---------------------------------------------------------------------------
// The frozen event
// ---------------------------------------------------------------------------

/**
 * All three conditions must hold on the same completed bar. Returns null when any input is not
 * yet warmed, so a partially warmed bar can never produce an event.
 */
export function evaluateBar(bars, i) {
  const base = volumeBaseline(bars, i);
  const a = atr(bars, i);
  const ext = priorExtreme(bars, i);
  if (base === null || a === null || ext === null) return null;
  if (!(base > 0) || !(a > 0)) return null;

  const volBurst = bars[i][V] / base;
  const volExpansion = (bars[i][H] - bars[i][L]) / a;
  const close = bars[i][C];

  let direction = null;
  if (close > ext.hi) direction = 'LONG';
  else if (close < ext.lo) direction = 'SHORT';

  const qualifies = direction !== null
    && volBurst >= FROZEN.vol_burst_min
    && volExpansion >= FROZEN.vol_expansion_min;

  return { i, ts: bars[i][TS], close, volBurst, volExpansion, direction, qualifies };
}

/**
 * Gross forward move in the declared direction, in bps, `h` bars after entry. Signed so that a
 * positive value means the break continued.
 */
export function forwardBps(bars, i, h, direction) {
  const j = i + h;
  if (j >= bars.length) return null;
  const p0 = bars[i][C];
  const p1 = bars[j][C];
  if (!(p0 > 0) || !(p1 > 0)) return null;
  const raw = 1e4 * (p1 / p0 - 1);
  return direction === 'LONG' ? raw : -raw;
}

/**
 * Realised outcome under the frozen exits: a 1 % hard stop or a 9-bar time stop, whichever
 * comes first. When a bar's range contains the stop the stop is taken, because assuming the
 * favourable path inside a bar is the standard way a replay flatters itself.
 */
export function realisedBps(bars, i, direction) {
  const entry = bars[i][C];
  if (!(entry > 0)) return null;
  const stopPx = direction === 'LONG'
    ? entry * (1 - FROZEN.hard_stop_pct / 100)
    : entry * (1 + FROZEN.hard_stop_pct / 100);
  for (let k = i + 1; k <= i + FROZEN.time_stop_bars; k += 1) {
    if (k >= bars.length) return null;
    const hit = direction === 'LONG' ? bars[k][L] <= stopPx : bars[k][H] >= stopPx;
    if (hit) return -FROZEN.hard_stop_pct * 100;   // 1 % expressed in bps
    if (k === i + FROZEN.time_stop_bars) {
      const raw = 1e4 * (bars[k][C] / entry - 1);
      return direction === 'LONG' ? raw : -raw;
    }
  }
  return null;
}

/**
 * Events for one symbol, with overlap suppressed: a new entry may not open while a previous one
 * is still held. Overlapping windows inflate apparent n and t, which this programme has already
 * recorded as a defect.
 */
export function symbolEvents(symbol, bars) {
  const out = [];
  let blockedUntil = -1;
  for (let i = 0; i < bars.length; i += 1) {
    const e = evaluateBar(bars, i);
    if (!e || !e.qualifies) continue;
    if (i <= blockedUntil) continue;
    blockedUntil = i + FROZEN.time_stop_bars;
    const fwd = {};
    for (const h of FROZEN.horizons_bars) fwd[h] = forwardBps(bars, i, h, e.direction);
    out.push({
      symbol,
      ts: e.ts,
      bar_index: i,
      direction: e.direction,
      vol_burst: e.volBurst,
      vol_expansion: e.volExpansion,
      forward_bps: fwd,
      realised_bps: realisedBps(bars, i, e.direction),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bucket balance — reported BEFORE any return, as the contract requires
// ---------------------------------------------------------------------------

/**
 * Positional bucketing: ties are split across bucket boundaries so the sizes come out even.
 * Correct for MEASURING a profile, where equal cell counts are what you want. Wrong for
 * detecting degeneracy — see rankAverage below.
 */
function bucketByRank(values, buckets) {
  const n = values.length;
  if (n < buckets) return null;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => (a.v - b.v) || (a.i - b.i));
  const out = new Array(n);
  for (let r = 0; r < n; r += 1) out[order[r].i] = Math.min(buckets - 1, Math.floor((r * buckets) / n));
  return out;
}

/**
 * Ranks 1..n with ties AVERAGED, so an identical block shares one rank.
 *
 * This is what the balance gate must use. Positional bucketing hands a tied block out across
 * boundaries and reports even sizes, which would hide exactly the collapse the gate exists to
 * catch — the funding-velocity failure, where 60 percent of observations shared one value.
 * Bucketing on averaged ranks puts that block in one cell and the imbalance becomes visible.
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

/**
 * The gate that CD.FUNDING_VELOCITY requires: a sort that collapses to a handful of states is
 * not a sort, and that must be established before any return is looked at.
 */
export function bucketBalance(events, key, buckets = 5) {
  const values = events.map((e) => e[key]).filter(Number.isFinite);
  if (values.length < buckets) return { key, n: values.length, degenerate: true, reason: 'too few values' };
  const distinct = new Set(values).size;
  // Tie-averaged ranks, never positional: see rankAverage for why the distinction decides
  // whether this gate can see a collapse at all.
  const rk = rankAverage(values);
  const sizes = new Array(buckets).fill(0);
  for (const r of rk) sizes[Math.min(buckets - 1, Math.floor(((r - 1) * buckets) / values.length))] += 1;
  const ratio = Math.max(...sizes) / Math.max(Math.min(...sizes), 1);
  return {
    key,
    n: values.length,
    distinct,
    distinct_pct: (100 * distinct) / values.length,
    tie_pct: (100 * (values.length - distinct)) / values.length,
    bucket_sizes: sizes,
    max_min_ratio: ratio,
    degenerate: ratio >= 1.5,
    p05: values.slice().sort((x, y) => x - y)[Math.floor(values.length * 0.05)],
    p50: median(values),
    p95: values.slice().sort((x, y) => x - y)[Math.floor(values.length * 0.95)],
  };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function horizonStats(events, h, costBps = FROZEN.cost_bps_roundtrip) {
  const v = events.map((e) => e.forward_bps[h]).filter((x) => x !== null && x !== undefined);
  if (!v.length) return { horizon_bars: h, n: 0 };
  const m = mean(v);
  const sd = stdev(v);
  const se = sd !== null ? sd / Math.sqrt(v.length) : null;
  return {
    horizon_bars: h,
    horizon_minutes: (h * FROZEN.bar_ms) / 60_000,
    n: v.length,
    gross_mean_bps: m,
    gross_median_bps: median(v),
    sd_bps: sd,
    t_stat: se && se > 0 ? m / se : null,
    detectable_bps: se !== null ? FROZEN.power_target_t * se : null,
    share_beyond_cost_pct: (100 * v.filter((x) => x > costBps).length) / v.length,
    net_mean_bps: m - costBps,
    clears_cost: m > costBps,
  };
}

/** Effect by burst-size quintile. The prior predicts a rise that flattens. */
export function burstProfile(events, h) {
  const rows = events.filter((e) => Number.isFinite(e.vol_burst) && e.forward_bps[h] !== null);
  const b = bucketByRank(rows.map((e) => e.vol_burst), 5);
  if (b === null) return null;
  const cells = Array.from({ length: 5 }, () => []);
  rows.forEach((e, k) => cells[b[k]].push(e.forward_bps[h]));
  return cells.map((c, q) => {
    const m = mean(c);
    const sd = stdev(c);
    const se = sd !== null && c.length ? sd / Math.sqrt(c.length) : null;
    return {
      quintile: q, n: c.length, mean_bps: m, t_stat: se && se > 0 ? m / se : null,
      mean_burst: mean(rows.filter((_, k) => b[k] === q).map((e) => e.vol_burst)),
    };
  });
}

// ---------------------------------------------------------------------------
// Stage 0
// ---------------------------------------------------------------------------

export function stage0(bySymbol) {
  const all = [];
  const perSymbol = {};
  for (const sym of FROZEN.universe) {
    const bars = bySymbol[sym];
    if (!Array.isArray(bars) || bars.length < 100) { perSymbol[sym] = 0; continue; }
    const ev = symbolEvents(sym, bars);
    perSymbol[sym] = ev.length;
    all.push(...ev);
  }
  all.sort((a, b) => a.ts - b.ts);

  if (all.length < 50) {
    return {
      task: FROZEN.task, stage: 0, label: 'DISCOVERY_NOT_PROOF', verdict: 'DATA_INADEQUATE',
      promising_count: 0, frozen: FROZEN, total_events: all.length, events_per_symbol: perSymbol,
      closure_reason: `only ${all.length} events across the frozen universe`,
    };
  }

  const cut = Math.floor(all.length * FROZEN.train_fraction);
  const train = all.slice(0, cut);
  const sealed = all.slice(cut);

  // The balance gate runs first and its result is reported whatever the returns say.
  const balance = {
    vol_burst: bucketBalance(train, 'vol_burst'),
    vol_expansion: bucketBalance(train, 'vol_expansion'),
  };

  const horizons = FROZEN.horizons_bars.map((h) => horizonStats(train, h));
  const primary = horizons.find((x) => x.horizon_bars === FROZEN.primary_horizon_bars);
  const realised = train.map((e) => e.realised_bps).filter((x) => x !== null);

  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    sealed_segments_untouched: true,
    total_events: all.length,
    events_per_symbol: perSymbol,
    train_events: train.length,
    train_symbols: new Set(train.map((e) => e.symbol)).size,
    train_days: new Set(train.map((e) => dayKey(e.ts))).size,
    sealed_events_available: sealed.length,
    direction_split: {
      LONG: train.filter((e) => e.direction === 'LONG').length,
      SHORT: train.filter((e) => e.direction === 'SHORT').length,
    },
    bucket_balance: balance,
    horizons,
    primary,
    burst_profile: burstProfile(train, FROZEN.primary_horizon_bars),
    realised_with_stops: {
      n: realised.length,
      mean_bps: mean(realised),
      median_bps: median(realised),
      net_mean_bps: mean(realised) === null ? null : mean(realised) - FROZEN.cost_bps_roundtrip,
      stopped_out_pct: (100 * realised.filter((x) => x <= -FROZEN.hard_stop_pct * 100 + 1e-9).length) / Math.max(realised.length, 1),
    },
    at_double_cost: primary?.gross_mean_bps == null ? null : primary.gross_mean_bps - FROZEN.double_cost_bps_roundtrip,
    at_superseded_floor: primary?.gross_mean_bps == null ? null : primary.gross_mean_bps - FROZEN.superseded_cost_bps_roundtrip,
    prior_expectation_bps: FROZEN.prior_expectation_bps,
    cost_floor_bps: FROZEN.cost_bps_roundtrip,
  };

  const enough = sealed.length >= FROZEN.min_events_per_oos_segment;
  const resolvable = primary && primary.detectable_bps !== null
    && Math.abs(primary.gross_mean_bps) >= primary.detectable_bps;
  const clears = primary && primary.gross_mean_bps > FROZEN.cost_bps_roundtrip;

  if (balance.vol_burst.degenerate || balance.vol_expansion.degenerate) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = 'the event sort is degenerate; a collapsed sort cannot support a conditional result';
  } else if (!enough) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `only ${sealed.length} sealed events, below ${FROZEN.min_events_per_oos_segment}`;
  } else if (clears) {
    out.verdict = 'STAGE_0_PASS';
    out.closure_reason = null;
  } else if (!resolvable) {
    out.verdict = 'UNDERPOWERED';
    out.closure_reason = `gross mean ${primary.gross_mean_bps?.toFixed(2)} bps is not distinguishable from zero; this sample resolves ${primary.detectable_bps?.toFixed(2)} bps at t=${FROZEN.power_target_t}`;
  } else {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `gross mean ${primary.gross_mean_bps.toFixed(2)} bps against a ${FROZEN.cost_bps_roundtrip} bps floor, a shortfall of ${(FROZEN.cost_bps_roundtrip - primary.gross_mean_bps).toFixed(2)} bps`;
  }

  // The pre-recorded expectation is compared explicitly, in both directions.
  if (primary && primary.gross_mean_bps !== null) {
    out.prior_check = {
      expected_bps: FROZEN.prior_expectation_bps,
      measured_bps: primary.gross_mean_bps,
      difference_bps: primary.gross_mean_bps - FROZEN.prior_expectation_bps,
      standard_errors_from_prior: primary.detectable_bps
        ? (primary.gross_mean_bps - FROZEN.prior_expectation_bps) / (primary.detectable_bps / FROZEN.power_target_t)
        : null,
      prior_falsified_upward: primary.gross_mean_bps > FROZEN.cost_bps_roundtrip,
    };
  }
  return out;
}

export function toCsv(r) {
  const header = 'metric,horizon_bars,horizon_min,n,gross_mean_bps,gross_median_bps,t_stat,detectable_bps,share_beyond_cost_pct,net_mean_bps';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const lines = [];
  for (const h of r.horizons ?? []) {
    lines.push(['horizon', h.horizon_bars, h.horizon_minutes, h.n, c(h.gross_mean_bps),
      c(h.gross_median_bps), c(h.t_stat), c(h.detectable_bps), c(h.share_beyond_cost_pct),
      c(h.net_mean_bps)].join(','));
  }
  for (const q of r.burst_profile ?? []) {
    lines.push(['burst_quintile', q.quintile, '', q.n, c(q.mean_bps), '', c(q.t_stat), '', '', ''].join(','));
  }
  if (!lines.length) lines.push('NO_EVENTS,,,0,,,,,,');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah053_momentum_vol_expansion_breakout.mjs — TASK-AH-053 Stage 0, research only

Usage:
  node scripts/analysis/ah053_momentum_vol_expansion_breakout.mjs --bars <dir> [--out <base>]

  --bars <dir>  Directory of <SYMBOL>_5m.json, each an array of [ts,o,h,l,c,v]
  --out <base>  Write <base>.json and <base>.csv (nothing is written without it)

Stage 0 only. Direction is WITH THE BREAK, frozen. The bucket-balance gate runs before any
return is reported. Holdout and forward stay sealed.`;

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
    const m = /^([A-Z0-9]+)_5m\.json$/.exec(f);
    if (!m) continue;
    if (!FROZEN.universe.includes(m[1])) continue;
    out[m[1]] = JSON.parse(readFileSync(join(root, f), 'utf8'));
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
    total_events: r.total_events, train_events: r.train_events, train_symbols: r.train_symbols,
    train_days: r.train_days, sealed_events_available: r.sealed_events_available,
    direction_split: r.direction_split, bucket_balance: r.bucket_balance,
    horizons: r.horizons, realised_with_stops: r.realised_with_stops,
    prior_check: r.prior_check,
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
