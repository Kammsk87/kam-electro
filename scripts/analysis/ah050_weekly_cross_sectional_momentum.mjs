#!/usr/bin/env node
// ah050_weekly_cross_sectional_momentum.mjs
//
// TASK-AH-050 — Weekly Cross-Sectional Momentum. Research only.
//
// STAGE 0 FEASIBILITY HARNESS. The task contract states that if the Stage 0 gate fails, no
// Stage 1 evaluation is written.
//
// Why this exists at all: every family this programme closed died at a 60s-to-15m horizon
// where the available move is 7-9 bps against a 16 bps floor. The floor is fixed in bps, so
// its relative size is set by the holding horizon and nothing else. This is the first test at
// a horizon where the arithmetic is not hopeless before it starts.
//
// The specification is taken from Liu, Tsyvinski & Wu (JF 2022 / NBER WP 25882) and is frozen
// in FROZEN below. Three of their choices are deliberately NOT inherited:
//
//   * they charge no costs at all and never use the words turnover or fee. Here turnover is
//     MEASURED per rebalance and charged at the audited floor. Gross is reported beside net,
//     never instead of it.
//   * they select the three-week horizon because it "generates the largest long-short spread
//     in the data". We keep three weeks because THEY declared it, and hold 1/2/4 as fixed
//     neighbours that may not be swapped in.
//   * they weight by market capitalisation, which this archive does not carry. Equal weight
//     is used and the deviation is declared rather than papered over with dollar volume.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-050',
  stage: 0,
  formation_weeks: 3,
  neighbour_formation_weeks: [1, 2, 4],
  holding_weeks: 1,
  quintiles: 5,
  weighting: 'EQUAL',
  overlap: 'NONE',
  cost_bps_per_side: 16,
  double_cost_bps_per_side: 32,
  superseded_cost_bps_per_side: 11,
  train_fraction: 0.55,
  min_weeks_per_oos_segment: 30,
  power_target_t: 3,
  source: 'Liu, Tsyvinski & Wu, Common Risk Factors in Cryptocurrency, JF 77(2) 2022',
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

/**
 * Quintile assignment by rank. Ties are broken by the incoming order, which is the caller's
 * symbol order and is therefore deterministic — never by value, which would silently make the
 * assignment depend on float noise.
 *
 * Returned buckets are as equal in size as the count permits. A cross-section smaller than
 * the bucket count yields null: five quintiles over four symbols is not a cross-section, and
 * returning something anyway would manufacture a spread out of two single names.
 */
export function assignQuantiles(values, buckets = FROZEN.quintiles) {
  const n = values.length;
  if (n < buckets) return null;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => (a.v - b.v) || (a.i - b.i));
  const out = new Array(n);
  for (let rank = 0; rank < n; rank += 1) {
    out[order[rank].i] = Math.min(buckets - 1, Math.floor((rank * buckets) / n));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The weekly panel
// ---------------------------------------------------------------------------

/**
 * Input rows: { symbol, week_index, close }. week_index must be a contiguous integer index of
 * NON-OVERLAPPING weeks — the caller is responsible for that, and buildPanel verifies it
 * rather than trusting it.
 *
 * Returns a dense panel keyed by week, carrying only symbols with an unbroken close series.
 * A symbol with a hole is dropped entirely rather than interpolated: an interpolated close
 * inside a momentum formation window is a fabricated return.
 */
export function buildPanel(rows) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.week_index) || !Number.isFinite(r.close) || !(r.close > 0)) continue;
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, new Map());
    bySymbol.get(r.symbol).set(r.week_index, r.close);
  }
  const allWeeks = [...new Set(rows.map((r) => r.week_index))].filter(Number.isFinite).sort((a, b) => a - b);
  if (!allWeeks.length) return { weeks: [], symbols: [], close: new Map(), dropped: [] };

  const weeks = [];
  for (let w = allWeeks[0]; w <= allWeeks[allWeeks.length - 1]; w += 1) weeks.push(w);

  const symbols = [];
  const dropped = [];
  for (const [symbol, series] of [...bySymbol.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const complete = weeks.every((w) => series.has(w));
    if (complete) symbols.push(symbol);
    else dropped.push({ symbol, have: series.size, need: weeks.length });
  }
  const close = new Map();
  for (const s of symbols) close.set(s, weeks.map((w) => bySymbol.get(s).get(w)));
  return { weeks, symbols, close, dropped };
}

/** Simple return of symbol s over week index position `t` (close[t] relative to close[t-1]). */
export function weekReturn(series, t) {
  if (t < 1 || t >= series.length) return null;
  const prev = series[t - 1];
  const cur = series[t];
  if (!(prev > 0) || !(cur > 0)) return null;
  return cur / prev - 1;
}

/** Cumulative formation return over the `k` completed weeks ending at position `t`. */
export function formationReturn(series, t, k) {
  if (t < k || t >= series.length) return null;
  const a = series[t - k];
  const b = series[t];
  if (!(a > 0) || !(b > 0)) return null;
  return b / a - 1;
}

// ---------------------------------------------------------------------------
// The rebalance
// ---------------------------------------------------------------------------

/**
 * One weekly rebalance. Formation ends at position t; the holding week is t -> t+1. There is
 * no overlap between the two by construction, which is the point.
 *
 * Turnover is measured against the previous week's actual holdings, not assumed to be 100%.
 * A name that stays in the top quintile is not retraded, and charging it as if it were would
 * overstate cost exactly as badly as charging nothing understates it.
 */
export function rebalance(panel, t, k, prevLong = null, prevShort = null) {
  const { symbols, close } = panel;
  const formation = [];
  const eligible = [];
  for (const s of symbols) {
    const series = close.get(s);
    const f = formationReturn(series, t, k);
    const fwd = weekReturn(series, t + 1);
    if (f === null || fwd === null) continue;
    eligible.push(s);
    formation.push(f);
  }
  const q = assignQuantiles(formation, FROZEN.quintiles);
  if (q === null) return null;

  const buckets = Array.from({ length: FROZEN.quintiles }, () => []);
  for (let i = 0; i < eligible.length; i += 1) {
    buckets[q[i]].push({ symbol: eligible[i], fwd: weekReturn(close.get(eligible[i]), t + 1) });
  }

  const quintileMeans = buckets.map((b) => mean(b.map((x) => x.fwd)));
  const longSet = new Set(buckets[FROZEN.quintiles - 1].map((x) => x.symbol));
  const shortSet = new Set(buckets[0].map((x) => x.symbol));

  // Turnover per side: the share of the new book that was not in the old book. On the first
  // rebalance the whole book is new, and it is charged as such.
  const sideTurnover = (next, prev) => {
    if (!next.size) return 0;
    if (prev === null) return 1;
    let fresh = 0;
    for (const s of next) if (!prev.has(s)) fresh += 1;
    return fresh / next.size;
  };
  const turnoverLong = sideTurnover(longSet, prevLong);
  const turnoverShort = sideTurnover(shortSet, prevShort);

  const grossBps = 1e4 * ((quintileMeans[FROZEN.quintiles - 1] ?? 0) - (quintileMeans[0] ?? 0));
  return {
    t,
    n_cross_section: eligible.length,
    quintile_means: quintileMeans,
    quintile_sizes: buckets.map((b) => b.length),
    long_symbols: [...longSet],
    short_symbols: [...shortSet],
    turnover_long: turnoverLong,
    turnover_short: turnoverShort,
    gross_bps: grossBps,
  };
}

/** Cost in bps for one rebalance, given measured per-side turnover. Both sides are traded. */
export function costBps(r, perSide) {
  return perSide * (r.turnover_long + r.turnover_short);
}

/** Run every non-overlapping rebalance available at formation length k. */
export function runSeries(panel, k) {
  const out = [];
  let prevLong = null;
  let prevShort = null;
  for (let t = k; t + 1 < panel.weeks.length; t += 1) {
    const r = rebalance(panel, t, k, prevLong, prevShort);
    if (!r) continue;
    prevLong = new Set(r.long_symbols);
    prevShort = new Set(r.short_symbols);
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Precision is quoted on the GROSS series. The cost term is a near-constant subtracted from
 * every observation, so a t-statistic on the net series mostly reports that the cost is not
 * zero. This is the defect that had to be fixed in AH-046 and it is not repeated here.
 */
export function seriesStats(series, perSide = FROZEN.cost_bps_per_side) {
  if (!series.length) return { n: 0 };
  const gross = series.map((r) => r.gross_bps);
  const cost = series.map((r) => costBps(r, perSide));
  const net = series.map((r, i) => gross[i] - cost[i]);
  const gm = mean(gross);
  const gsd = stdev(gross);
  const gse = gsd !== null ? gsd / Math.sqrt(gross.length) : null;
  return {
    n: gross.length,
    gross_mean_bps: gm,
    gross_median_bps: median(gross),
    gross_sd_bps: gsd,
    gross_t_stat: gse ? gm / gse : null,
    mean_cost_bps: mean(cost),
    mean_turnover_long: mean(series.map((r) => r.turnover_long)),
    mean_turnover_short: mean(series.map((r) => r.turnover_short)),
    net_mean_bps: mean(net),
    net_median_bps: median(net),
    net_positive: mean(net) > 0,
    share_weeks_net_positive_pct: (100 * net.filter((x) => x > 0).length) / net.length,
  };
}

/**
 * Quintile means averaged across rebalances, and whether they are monotone. Monotonicity is
 * a robustness criterion adopted from the source paper: a genuine cross-sectional effect
 * orders the quintiles, whereas a spread carried by the two extreme buckets alone does not.
 */
export function quintileProfile(series) {
  if (!series.length) return { monotone: false, means_bps: [] };
  const q = FROZEN.quintiles;
  const means = [];
  for (let i = 0; i < q; i += 1) {
    const vals = series.map((r) => r.quintile_means[i]).filter((x) => x !== null && x !== undefined);
    means.push(vals.length ? 1e4 * mean(vals) : null);
  }
  let monotone = true;
  for (let i = 1; i < q; i += 1) {
    if (means[i] === null || means[i - 1] === null || means[i] < means[i - 1]) { monotone = false; break; }
  }
  return { means_bps: means, monotone };
}

/**
 * The effect size this sample could detect at the declared t. Computed and reported BEFORE
 * the verdict, so that a null result can be labelled UNDERPOWERED honestly rather than being
 * presented as evidence of absence. This is the recorded lesson from TASK-AH-009.
 */
export function power(series, targetT = FROZEN.power_target_t) {
  const gross = series.map((r) => r.gross_bps);
  const sd = stdev(gross);
  if (sd === null || !gross.length) return { n: gross.length, detectable_bps: null };
  const detectable = targetT * (sd / Math.sqrt(gross.length));
  return { n: gross.length, sd_bps: sd, target_t: targetT, detectable_bps: detectable };
}

// ---------------------------------------------------------------------------
// Stage 0
// ---------------------------------------------------------------------------

export function stage0(rows) {
  const panel = buildPanel(rows);
  if (panel.weeks.length < FROZEN.formation_weeks + 2 || panel.symbols.length < FROZEN.quintiles) {
    return {
      task: FROZEN.task, stage: 0, label: 'DISCOVERY_NOT_PROOF', verdict: 'DATA_INADEQUATE',
      promising_count: 0, frozen: FROZEN,
      weeks: panel.weeks.length, symbols: panel.symbols.length, dropped: panel.dropped,
      closure_reason: `need at least ${FROZEN.formation_weeks + 2} contiguous weeks and ${FROZEN.quintiles} complete symbols`,
    };
  }

  const all = runSeries(panel, FROZEN.formation_weeks);
  const cut = Math.floor(all.length * FROZEN.train_fraction);
  const train = all.slice(0, cut);
  const sealed = all.slice(cut);

  const primary = seriesStats(train);
  const stress = seriesStats(train, FROZEN.double_cost_bps_per_side);
  const superseded = seriesStats(train, FROZEN.superseded_cost_bps_per_side);
  const profile = quintileProfile(train);
  const pw = power(train);

  // Neighbours are measured and reported, never selected between. They exist to show whether
  // the primary horizon is a lone spike in a specification space, which would be evidence
  // against it rather than for it.
  const neighbours = FROZEN.neighbour_formation_weeks.map((k) => {
    const s = runSeries(panel, k).slice(0, Math.floor(runSeries(panel, k).length * FROZEN.train_fraction));
    return { formation_weeks: k, ...seriesStats(s) };
  });

  const enoughWeeks = sealed.length >= FROZEN.min_weeks_per_oos_segment;
  const netPositive = primary.net_mean_bps > 0;
  // The power check applies to BOTH signs, and it is evaluated before the sign is looked at.
  // Gating it on a negative point estimate — as an earlier cut of this file did — lets a
  // positive-but-indistinguishable-from-noise result through unremarked, which is exactly the
  // failure this programme exists to avoid. A quintile long-short over a few dozen noisy
  // symbols has a wide enough weekly dispersion that a lucky positive mean is routine.
  const underpowered = pw.detectable_bps === null || primary.gross_mean_bps === null
    || Math.abs(primary.gross_mean_bps) < pw.detectable_bps;

  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    sealed_segments_untouched: true,
    universe_symbols: panel.symbols.length,
    dropped_symbols: panel.dropped,
    total_weeks: panel.weeks.length,
    total_rebalances: all.length,
    train_rebalances: train.length,
    sealed_rebalances_available: sealed.length,
    train: primary,
    train_double_cost: stress,
    train_at_superseded_floor: superseded,
    quintile_profile: profile,
    power: pw,
    neighbours,
    cost_floor_bps_per_side: FROZEN.cost_bps_per_side,
  };

  if (!enoughWeeks) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `only ${sealed.length} sealed weeks, below ${FROZEN.min_weeks_per_oos_segment}`;
  } else if (underpowered) {
    out.verdict = 'UNDERPOWERED';
    out.closure_reason = `gross mean ${primary.gross_mean_bps?.toFixed(1)} bps is not distinguishable from zero in this sample, which can only detect ${pw.detectable_bps?.toFixed(0)} bps at t=${FROZEN.power_target_t}; absence of evidence, not evidence of absence, and a positive point estimate at this precision is not a finding`;
  } else if (!netPositive) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `train net mean ${primary.net_mean_bps?.toFixed(1)} bps after measured turnover of ${((primary.mean_turnover_long + primary.mean_turnover_short) * 100).toFixed(0)}% per rebalance at ${FROZEN.cost_bps_per_side} bps per side`;
  } else {
    out.verdict = 'STAGE_0_PASS';
    out.closure_reason = null;
  }
  return out;
}

export function toCsv(r) {
  const header = 'metric,formation_weeks,n,gross_mean_bps,gross_t,mean_cost_bps,net_mean_bps,net_median_bps,share_weeks_net_positive_pct';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const line = (label, k, s) => [label, k, s.n, c(s.gross_mean_bps), c(s.gross_t_stat),
    c(s.mean_cost_bps), c(s.net_mean_bps), c(s.net_median_bps), c(s.share_weeks_net_positive_pct)].join(',');
  const rows = [];
  if (r.train) rows.push(line('train', FROZEN.formation_weeks, r.train));
  if (r.train_double_cost) rows.push(line('train_double_cost', FROZEN.formation_weeks, r.train_double_cost));
  if (r.train_at_superseded_floor) rows.push(line('train_at_superseded_floor', FROZEN.formation_weeks, r.train_at_superseded_floor));
  for (const n of r.neighbours ?? []) rows.push(line('neighbour', n.formation_weeks, n));
  if (!rows.length) rows.push('NO_REBALANCES,,0,,,,,,');
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah050_weekly_cross_sectional_momentum.mjs — TASK-AH-050 Stage 0 harness, research only

Usage:
  node scripts/analysis/ah050_weekly_cross_sectional_momentum.mjs --panel <file> [--out <base>]

  --panel <file>  JSON array of { symbol, week_index, close } over non-overlapping weeks
  --out <base>    Write <base>.json and <base>.csv (nothing is written without it)

Stage 0 only. Formation 3 weeks, hold 1 week, quintiles, equal weight, no overlap. Turnover is
measured and charged at 16 bps per side. Holdout and forward stay sealed.`;

export function parseArgs(argv) {
  const opts = { panel: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--panel') opts.panel = next();
    else if (arg === '--out') opts.out = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

export function readJsonFile(path) {
  const p = resolve(path);
  if (!existsSync(p)) throw new Error(`file not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help || !opts.panel) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = stage0(readJsonFile(opts.panel));
  process.stdout.write(`${JSON.stringify({
    task: r.task, verdict: r.verdict, closure_reason: r.closure_reason,
    universe_symbols: r.universe_symbols, total_weeks: r.total_weeks,
    train: r.train, quintile_profile: r.quintile_profile, power: r.power,
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
