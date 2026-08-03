#!/usr/bin/env node
// simple_pairs_relative_value_v0.mjs
//
// TASK-AH-009 — Simple Pairs Relative-Value. Research only.
//
// STAGE 0 FEASIBILITY HARNESS. The accepted research pipeline protocol requires a Stage 0
// gate before any Stage 1 evaluation is written; AH-009 predates that protocol, so the gate
// is supplied here and runs first. It failed, so no Stage 1 was written.
//
// Stage 0 is deliberately OPTIMISTIC: pairs are selected on the same train segment they are
// then measured on. Every number it produces is an upper bound. A hypothesis that cannot
// clear its cost floor under in-sample pair selection cannot clear it out of sample either.
//
// The cost floor here is 22 bps, not 11: a pairs trade has two legs and each pays a round
// trip. The double-cost stress is 44 bps. Returns are measured on the per-leg notional.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-009',
  stage: 0,
  reference_days: 60,
  hold_days: 10,
  decision_interval_days: 7,
  train_fraction: 0.55,
  max_pairs: 10,
  thresholds: [0.015, 0.025, 0.040],
  cost_bps_both_legs: 22,
  double_cost_bps: 44,
  min_history_days: 360,
  min_events: 5,
  // AH-009 names three exits: convergence, ten trading days, and a fixed adverse-gap stop.
  // Only the ten-day timeout carries a number, so it is the only one Stage 0 can honour.
  exit_rule: 'FIXED_10_TRADING_DAYS',
  unspecified_exits_in_contract: ['convergence', 'fixed_adverse_gap_stop'],
});

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

/** Daily closes keyed by day, per symbol, plus the shared day axis. */
export function buildPanel(archive, minHistory = FROZEN.min_history_days) {
  const symbols = Object.keys(archive).filter((s) => Array.isArray(archive[s]) && archive[s].length >= minHistory).sort();
  const close = {};
  const daySet = new Set();
  for (const s of symbols) {
    close[s] = {};
    for (const r of archive[s]) { close[s][r[0]] = r[4]; daySet.add(r[0]); }
  }
  const days = [...daySet].sort((a, b) => a - b);
  return { symbols, close, days };
}

/** Normalised price: close_t divided by close 60 days earlier. Causal by construction. */
export function normalised(panel, symbol, i, refDays = FROZEN.reference_days) {
  if (i < refDays) return null;
  const now = panel.close[symbol]?.[panel.days[i]];
  const then = panel.close[symbol]?.[panel.days[i - refDays]];
  return now > 0 && then > 0 ? now / then : null;
}

export function trainBoundaryIndex(panel, fraction = FROZEN.train_fraction) {
  return Math.floor(panel.days.length * fraction);
}

/**
 * Pair selection on the TRAIN segment only: the lowest dispersion of the normalised spread,
 * i.e. the most co-moving pairs. Objective, with no discretion and no sector data required.
 */
export function selectPairs(panel, trainEndIdx, maxPairs = FROZEN.max_pairs) {
  const idx = [];
  for (let i = FROZEN.reference_days; i < trainEndIdx; i += 1) idx.push(i);
  const out = [];
  for (let x = 0; x < panel.symbols.length; x += 1) {
    for (let y = x + 1; y < panel.symbols.length; y += 1) {
      const spread = [];
      for (const i of idx) {
        const a = normalised(panel, panel.symbols[x], i);
        const b = normalised(panel, panel.symbols[y], i);
        if (a !== null && b !== null) spread.push(a - b);
      }
      if (spread.length < idx.length * 0.9) continue;
      out.push({ a: panel.symbols[x], b: panel.symbols[y], dispersion: stdev(spread) });
    }
  }
  out.sort((p, q) => p.dispersion - q.dispersion);
  return { selected: out.slice(0, maxPairs), candidates: out.length };
}

/**
 * One observation per weekly decision where the normalised gap exceeds the threshold.
 * Long the laggard, short the leader, equal dollar legs, held a fixed ten trading days.
 * TRAIN ONLY — the sealed segments are never read.
 */
export function trainEvents(panel, pairs, threshold, trainEndIdx) {
  const rows = [];
  for (const p of pairs) {
    for (let i = FROZEN.reference_days; i + FROZEN.hold_days < panel.days.length; i += FROZEN.decision_interval_days) {
      if (i >= trainEndIdx) break;
      const na = normalised(panel, p.a, i);
      const nb = normalised(panel, p.b, i);
      if (na === null || nb === null) continue;
      const gap = na - nb;
      if (Math.abs(gap) < threshold) continue;
      const laggard = gap < 0 ? p.a : p.b;
      const leader = gap < 0 ? p.b : p.a;
      const e1 = panel.close[laggard][panel.days[i]];
      const x1 = panel.close[laggard][panel.days[i + FROZEN.hold_days]];
      const e2 = panel.close[leader][panel.days[i]];
      const x2 = panel.close[leader][panel.days[i + FROZEN.hold_days]];
      if (!(e1 > 0 && x1 > 0 && e2 > 0 && x2 > 0)) continue;
      rows.push({
        pair: `${p.a}/${p.b}`, day: panel.days[i], gap,
        long_leg_bps: 1e4 * ((x1 - e1) / e1),
        short_leg_bps: -1e4 * ((x2 - e2) / e2),
        spread_bps: 1e4 * ((x1 - e1) / e1) - 1e4 * ((x2 - e2) / e2),
      });
    }
  }
  return rows;
}

export function thresholdStats(rows, threshold) {
  if (rows.length < FROZEN.min_events) return { threshold, n: rows.length, insufficient: true };
  const r = rows.map((x) => x.spread_bps);
  const m = mean(r);
  const sd = stdev(r);
  const se = sd / Math.sqrt(r.length);
  // Sample size needed to resolve an effect the size of the cost floor at t = 3.
  const nNeeded = Math.ceil(((3 * sd) / FROZEN.cost_bps_both_legs) ** 2);
  return {
    threshold,
    n: r.length,
    pairs: new Set(rows.map((x) => x.pair)).size,
    mean_bps: m,
    median_bps: median(r),
    sd_bps: sd,
    std_err_bps: se,
    t_stat: se > 0 ? m / se : null,
    ci_low: m - 1.96 * se,
    ci_high: m + 1.96 * se,
    clears_cost: m > FROZEN.cost_bps_both_legs,
    clears_double_cost: m > FROZEN.double_cost_bps,
    // A positive median with a non-positive mean is the fat-left-tail signature.
    median_positive_mean_not: median(r) > 0 && m <= 0,
    n_needed_to_resolve_cost_floor: nNeeded,
    underpowered: r.length < nNeeded,
  };
}

export function stage0(archive) {
  const panel = buildPanel(archive);
  if (panel.symbols.length < 2) {
    return { task: FROZEN.task, stage: 0, verdict: 'DATA_INADEQUATE', promising_count: 0, frozen: FROZEN,
      reason: `only ${panel.symbols.length} symbols with sufficient history` };
  }
  const trainEndIdx = trainBoundaryIndex(panel);
  const { selected, candidates } = selectPairs(panel, trainEndIdx);
  const byThreshold = FROZEN.thresholds.map((t) => thresholdStats(trainEvents(panel, selected, t, trainEndIdx), t));

  const anyClears = byThreshold.some((s) => s.clears_cost === true);
  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    selection_is_in_sample: true,
    selection_note: 'Pairs were selected on the same train segment they are measured on. Every figure is an upper bound.',
    sealed_segments_untouched: true,
    symbols: panel.symbols.length,
    candidate_pairs: candidates,
    train_days: trainEndIdx,
    selected_pairs: selected,
    by_threshold: byThreshold,
    cost_floor_bps: FROZEN.cost_bps_both_legs,
    double_cost_bps: FROZEN.double_cost_bps,
  };
  out.verdict = anyClears ? 'STAGE_0_PASS' : 'STAGE_0_INFEASIBLE';
  out.closure_reason = anyClears ? null
    : 'no frozen threshold clears the 22 bps two-leg cost floor on train, under in-sample pair selection';
  return out;
}

export function toCsv(r) {
  const header = 'threshold_pct,n,pairs,mean_bps,median_bps,sd_bps,t_stat,ci_low,ci_high,clears_cost,n_needed,underpowered';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const rows = (r.by_threshold ?? []).map((s) => (s.insufficient
    ? [(s.threshold * 100).toFixed(1), s.n, '', '', '', '', '', '', '', '', '', ''].join(',')
    : [(s.threshold * 100).toFixed(1), s.n, s.pairs, c(s.mean_bps), c(s.median_bps), c(s.sd_bps),
      c(s.t_stat), c(s.ci_low), c(s.ci_high), s.clears_cost, s.n_needed_to_resolve_cost_floor, s.underpowered].join(',')));
  if (!rows.length) rows.push('NO_THRESHOLDS,0,,,,,,,,,,');
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------

const USAGE = `simple_pairs_relative_value_v0.mjs — TASK-AH-009 Stage 0 harness, research only

Usage:
  node scripts/analysis/simple_pairs_relative_value_v0.mjs --archive <file> [--out <base>]

  --archive <file>  {SYMBOL: [[ts,o,h,l,c,v], ...]} daily bars
  --out <base>      Write <base>.json and <base>.csv (nothing is written without it)

Stage 0 only, train segment only. Cost floor is 22 bps because a pairs trade has two legs.`;

export function parseArgs(argv) {
  const opts = { archive: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--archive') opts.archive = next();
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
  if (opts.help || !opts.archive) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = stage0(readJsonFile(opts.archive));
  process.stdout.write(`${JSON.stringify({ task: r.task, verdict: r.verdict, closure_reason: r.closure_reason, by_threshold: r.by_threshold }, null, 2)}\n`);

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
