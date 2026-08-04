#!/usr/bin/env node
// ah052_rule_selection_persistence.mjs
//
// TASK-AH-052 — Rule Selection Persistence. Research only. Produces no candidate.
//
// This measures the PROGRAMME'S SELECTION STEP, not a strategy. The question is the one
// Bajgrowicz & Scaillet asked of 7,846 technical rules over a century of the DJIA: could the
// winner have been chosen in advance? Out-of-sample testing asks whether a chosen rule
// survives; persistence asks whether choosing has any skill at all.
//
// Enumerating a rule family is legitimate here and would be a parameter search in a strategy
// task. The object of study is selection AMONG rules, so a single frozen rule would make the
// question unaskable. No rule is privileged: the three-week quintile momentum rule that
// TASK-AH-050 measured is one of the fifty-four and gets no special treatment.
//
// promising_count is 0 by construction and this file emits no rule recommendation.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-052',
  formation_weeks: [1, 2, 3, 4, 6, 8, 12, 16, 24],
  directions: ['MOMENTUM', 'REVERSAL'],
  bucket_counts: [3, 5, 10],
  holding_weeks: 1,
  weighting: 'EQUAL',
  overlap: 'NONE',
  cost_bps_per_side: 16,
  window_weeks: 40,
  rolling_step_weeks: 4,
  power_confidence_z: 1.96,
  measures_selection_not_strategy: true,
});

/** The 54 rules, enumerated mechanically in a fixed order. */
export function ruleUniverse() {
  const out = [];
  for (const k of FROZEN.formation_weeks) {
    for (const dir of FROZEN.directions) {
      for (const b of FROZEN.bucket_counts) {
        out.push({ id: `k${k}_${dir === 'MOMENTUM' ? 'MOM' : 'REV'}_b${b}`, formation_weeks: k, direction: dir, buckets: b });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Ranks 1..n, ties averaged. Averaging ties matters: a block of identical scores must not be
 * silently ordered by array position, which would invent a ranking the data does not support.
 */
export function rankAverage(values) {
  const n = values.length;
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1].v === idx[i].v) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[idx[k].i] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation. Null when either side is constant, never 0 — those differ. */
export function spearman(a, b) {
  if (a.length !== b.length || a.length < 3) return null;
  const ra = rankAverage(a);
  const rb = rankAverage(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i += 1) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

// ---------------------------------------------------------------------------
// The panel and one rule's weekly series
// ---------------------------------------------------------------------------

export function buildPanel(rows) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.week_index) || !Number.isFinite(r.close) || !(r.close > 0)) continue;
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, new Map());
    bySymbol.get(r.symbol).set(r.week_index, r.close);
  }
  const all = [...new Set(rows.map((r) => r.week_index))].filter(Number.isFinite).sort((a, b) => a - b);
  if (!all.length) return { weeks: [], symbols: [], close: new Map() };
  const weeks = [];
  for (let w = all[0]; w <= all[all.length - 1]; w += 1) weeks.push(w);
  const symbols = [];
  for (const [s, series] of [...bySymbol.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (weeks.every((w) => series.has(w))) symbols.push(s);
  }
  const close = new Map();
  for (const s of symbols) close.set(s, weeks.map((w) => bySymbol.get(s).get(w)));
  return { weeks, symbols, close };
}

const weekReturn = (series, t) => (t < 1 || t >= series.length || !(series[t - 1] > 0) || !(series[t] > 0)
  ? null : series[t] / series[t - 1] - 1);

const formationReturn = (series, t, k) => (t < k || t >= series.length || !(series[t - k] > 0) || !(series[t] > 0)
  ? null : series[t] / series[t - k] - 1);

function bucketByRank(values, buckets) {
  const n = values.length;
  if (n < buckets) return null;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => (a.v - b.v) || (a.i - b.i));
  const out = new Array(n);
  for (let rank = 0; rank < n; rank += 1) out[order[rank].i] = Math.min(buckets - 1, Math.floor((rank * buckets) / n));
  return out;
}

/**
 * One rule's net long-short return for every rebalance in the panel, keyed by the formation
 * end position. Turnover is measured against the previous book rather than assumed, exactly as
 * in TASK-AH-050 — a naive full-replacement charge roughly doubles the cost.
 */
export function ruleSeries(panel, rule, perSide = FROZEN.cost_bps_per_side) {
  const { symbols, close, weeks } = panel;
  const out = new Map();
  let prevLong = null;
  let prevShort = null;
  for (let t = rule.formation_weeks; t + 1 < weeks.length; t += 1) {
    const eligible = [];
    const formation = [];
    for (const s of symbols) {
      const series = close.get(s);
      const f = formationReturn(series, t, rule.formation_weeks);
      const fwd = weekReturn(series, t + 1);
      if (f === null || fwd === null) continue;
      eligible.push({ symbol: s, fwd });
      formation.push(f);
    }
    const b = bucketByRank(formation, rule.buckets);
    if (b === null) continue;
    const top = [];
    const bottom = [];
    for (let i = 0; i < eligible.length; i += 1) {
      if (b[i] === rule.buckets - 1) top.push(eligible[i]);
      else if (b[i] === 0) bottom.push(eligible[i]);
    }
    if (!top.length || !bottom.length) continue;
    const longSide = rule.direction === 'MOMENTUM' ? top : bottom;
    const shortSide = rule.direction === 'MOMENTUM' ? bottom : top;
    const gross = 1e4 * (mean(longSide.map((x) => x.fwd)) - mean(shortSide.map((x) => x.fwd)));

    const longSet = new Set(longSide.map((x) => x.symbol));
    const shortSet = new Set(shortSide.map((x) => x.symbol));
    const turn = (next, prev) => {
      if (!next.size) return 0;
      if (prev === null) return 1;
      let fresh = 0;
      for (const s of next) if (!prev.has(s)) fresh += 1;
      return fresh / next.size;
    };
    const cost = perSide * (turn(longSet, prevLong) + turn(shortSet, prevShort));
    prevLong = longSet;
    prevShort = shortSet;
    out.set(t, gross - cost);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The persistence measurement
// ---------------------------------------------------------------------------

const windowMean = (series, from, to) => {
  const vals = [];
  for (let t = from; t < to; t += 1) if (series.has(t)) vals.push(series.get(t));
  return vals.length ? { mean: mean(vals), n: vals.length } : null;
};

/**
 * One transition: rank every rule on [t, t+P), then score every rule on [t+P, t+2P).
 *
 * The winner's period-2 outcome is reported against the period-2 MEDIAN and MEAN of all rules,
 * not against zero. Beating zero would only say the rule class was profitable that period; the
 * question is whether choosing beat not choosing.
 */
export function transition(seriesByRule, rules, start, P) {
  const p1 = [];
  const p2 = [];
  const kept = [];
  for (const r of rules) {
    const a = windowMean(seriesByRule.get(r.id), start, start + P);
    const b = windowMean(seriesByRule.get(r.id), start + P, start + 2 * P);
    if (!a || !b) continue;
    kept.push(r);
    p1.push(a.mean);
    p2.push(b.mean);
  }
  if (kept.length < 3) return null;
  const rho = spearman(p1, p2);
  let best = 0;
  for (let i = 1; i < p1.length; i += 1) if (p1[i] > p1[best]) best = i;
  const sorted = [...p2].sort((a, b) => a - b);
  const med = sorted.length % 2
    ? sorted[sorted.length >> 1]
    : (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2;
  // Where the winner landed among all rules in period 2, as a percentile. 0.5 is exactly
  // what picking at random would give.
  const belowWinner = p2.filter((x) => x < p2[best]).length;
  return {
    start,
    n_rules: kept.length,
    spearman: rho,
    winner_id: kept[best].id,
    winner_p1_bps: p1[best],
    winner_p2_bps: p2[best],
    all_p2_mean_bps: mean(p2),
    all_p2_median_bps: med,
    winner_minus_median_bps: p2[best] - med,
    winner_percentile_in_p2: belowWinner / (p2.length - 1),
  };
}

export function persistence(panel, rules, P = FROZEN.window_weeks, step = null) {
  const seriesByRule = new Map();
  for (const r of rules) seriesByRule.set(r.id, ruleSeries(panel, r));

  const first = Math.max(...rules.map((r) => r.formation_weeks));
  const last = panel.weeks.length - 2;
  const make = (stride) => {
    const out = [];
    for (let s = first; s + 2 * P <= last; s += stride) {
      const t = transition(seriesByRule, rules, s, P);
      if (t) out.push(t);
    }
    return out;
  };

  const nonOverlapping = make(P);
  const rolling = make(step ?? FROZEN.rolling_step_weeks);

  const summarise = (list, label) => {
    const rhos = list.map((x) => x.spearman).filter((x) => x !== null);
    const diffs = list.map((x) => x.winner_minus_median_bps);
    const pct = list.map((x) => x.winner_percentile_in_p2);
    const rhoSd = stdev(rhos);
    const diffSd = stdev(diffs);
    return {
      label,
      transitions: list.length,
      mean_spearman: mean(rhos),
      sd_spearman: rhoSd,
      se_spearman: rhoSd !== null && rhos.length ? rhoSd / Math.sqrt(rhos.length) : null,
      share_spearman_positive_pct: rhos.length ? (100 * rhos.filter((x) => x > 0).length) / rhos.length : null,
      mean_winner_minus_median_bps: mean(diffs),
      se_winner_minus_median_bps: diffSd !== null && diffs.length ? diffSd / Math.sqrt(diffs.length) : null,
      mean_winner_percentile: mean(pct),
      share_winner_above_median_pct: pct.length ? (100 * pct.filter((x) => x > 0.5).length) / pct.length : null,
      // Detectable at the declared confidence, quoted BEFORE the verdict so a null that the
      // sample cannot resolve is labelled rather than presented as evidence of absence.
      detectable_spearman: rhoSd !== null && rhos.length ? (FROZEN.power_confidence_z * rhoSd) / Math.sqrt(rhos.length) : null,
    };
  };

  return {
    non_overlapping: summarise(nonOverlapping, 'non_overlapping'),
    rolling: summarise(rolling, `rolling_step_${step ?? FROZEN.rolling_step_weeks}w`),
    transitions_non_overlapping: nonOverlapping,
    transitions_rolling: rolling,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function run(rows) {
  const panel = buildPanel(rows);
  const rules = ruleUniverse();
  const needed = Math.max(...rules.map((r) => r.formation_weeks)) + 2 * FROZEN.window_weeks + 2;
  if (panel.weeks.length < needed || panel.symbols.length < Math.max(...FROZEN.bucket_counts)) {
    return {
      task: FROZEN.task, label: 'SELECTION_DIAGNOSTIC_NOT_A_CANDIDATE', promising_count: 0,
      frozen: FROZEN, verdict: 'DATA_INADEQUATE',
      weeks: panel.weeks.length, symbols: panel.symbols.length,
      closure_reason: `need at least ${needed} contiguous weeks and ${Math.max(...FROZEN.bucket_counts)} complete symbols`,
    };
  }

  const p = persistence(panel, rules);
  // The PRIMARY is the non-overlapping series, as the task contract declares. Rolling windows
  // of length P stepped by 4 share ninety percent of their data, so their transition count is
  // not an independent sample size and their standard error is understated. Treating them as
  // the estimate would repeat the overlap inflation this programme has already recorded as a
  // defect. Rolling is reported as descriptive only.
  const primary = p.non_overlapping;

  const out = {
    task: FROZEN.task,
    label: 'SELECTION_DIAGNOSTIC_NOT_A_CANDIDATE',
    promising_count: 0,
    frozen: FROZEN,
    universe_symbols: panel.symbols.length,
    total_weeks: panel.weeks.length,
    n_rules: rules.length,
    primary_series: 'non_overlapping',
    rolling_is_overlap_dependent: true,
    ...p,
  };

  const rankResolvable = primary.detectable_spearman !== null && primary.mean_spearman !== null
    && Math.abs(primary.mean_spearman) >= primary.detectable_spearman;

  // The operational question is not whether the whole ranking correlates. It is whether
  // PICKING THE TOP works, because that is where selection actually operates. A ranking can
  // carry information across its middle while its top is pure noise, and only the second
  // matters for a programme that acts on its best candidate.
  const winnerBeatsMedian = primary.mean_winner_minus_median_bps !== null
    && primary.mean_winner_minus_median_bps > 0
    && primary.share_winner_above_median_pct > 50;
  const winnerFailsClearly = primary.mean_winner_percentile !== null
    && primary.mean_winner_percentile < 0.5
    && primary.share_winner_above_median_pct < 50;

  if (rankResolvable && primary.mean_spearman < 0) {
    out.verdict = 'SELECTION_ANTI_PERSISTENT';
    out.closure_reason = `mean Spearman ${primary.mean_spearman.toFixed(3)} is resolvably negative on the non-overlapping series: ranking is worse than uninformative`;
  } else if (rankResolvable && winnerBeatsMedian) {
    out.verdict = 'SELECTION_CARRIES_INFORMATION';
    out.closure_reason = null;
  } else if (winnerFailsClearly) {
    out.verdict = 'SELECTION_TOP_DOES_NOT_PERSIST';
    out.closure_reason = `the period-1 winner lands at the ${(100 * primary.mean_winner_percentile).toFixed(0)}th percentile of period 2 and beats the median in ${primary.share_winner_above_median_pct.toFixed(0)} percent of transitions; mean Spearman ${primary.mean_spearman?.toFixed(3)} against ${primary.detectable_spearman?.toFixed(3)} detectable`;
  } else {
    out.verdict = 'UNDERPOWERED';
    out.closure_reason = `mean Spearman ${primary.mean_spearman?.toFixed(3)} is not distinguishable from zero on ${primary.transitions} independent transitions, which resolve ${primary.detectable_spearman?.toFixed(3)}, and the winner statistic is not decisive either`;
  }
  return out;
}

export function toCsv(r) {
  const header = 'series,start_week,n_rules,spearman,winner_id,winner_p1_bps,winner_p2_bps,all_p2_median_bps,winner_minus_median_bps,winner_percentile_in_p2';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const lines = [];
  for (const [name, list] of [['non_overlapping', r.transitions_non_overlapping], ['rolling', r.transitions_rolling]]) {
    for (const t of list ?? []) {
      lines.push([name, t.start, t.n_rules, c(t.spearman), t.winner_id, c(t.winner_p1_bps),
        c(t.winner_p2_bps), c(t.all_p2_median_bps), c(t.winner_minus_median_bps),
        c(t.winner_percentile_in_p2)].join(','));
    }
  }
  if (!lines.length) lines.push('NO_TRANSITIONS,,0,,,,,,,');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah052_rule_selection_persistence.mjs — TASK-AH-052, research only

Usage:
  node scripts/analysis/ah052_rule_selection_persistence.mjs --panel <file> [--out <base>]

  --panel <file>  JSON array of { symbol, week_index, close } over non-overlapping weeks
  --out <base>    Write <base>.json and <base>.csv (nothing is written without it)

Measures whether ranking rules in one window predicts the next. Emits no rule recommendation
and no candidate; promising_count is 0 by construction.`;

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

  const r = run(readJsonFile(opts.panel));
  process.stdout.write(`${JSON.stringify({
    task: r.task, verdict: r.verdict, closure_reason: r.closure_reason,
    n_rules: r.n_rules, universe_symbols: r.universe_symbols, total_weeks: r.total_weeks,
    non_overlapping: r.non_overlapping, rolling: r.rolling,
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
