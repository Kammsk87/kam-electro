#!/usr/bin/env node
// ah048_large_sweep_forced_flow_fade.mjs
//
// TASK-AH-048 — Large Sweep Forced-Flow Fade. Research only.
//
// This is a STAGE 0 FEASIBILITY HARNESS, not a strategy implementation. The task contract
// states that if the Stage 0 gate fails, no Stage 1 evaluation is written. It failed, so
// this file is what actually ran and nothing more was built.
//
// Stage 0 asks one question before any code is worth writing: can the post-event move, in
// the pre-declared direction, pay the round trip at all? It is answered on the TRAIN segment
// only, so that holdout and forward remain sealed for any successor task.
//
// The pre-declared direction is FADE — enter opposite the sweep. That was declared in the
// contract before the data was inspected, so a continuation result counts as a refutation of
// the forced-flow thesis rather than a discovery to be re-labelled.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-048',
  stage: 0,
  burst_gap_ms: 100,
  notional_percentile: 0.99,
  percentile_fitted_on: 'train_only_per_symbol',
  declared_direction: 'FADE',
  entry_reference: 'SWEEP_COMPLETION_MID_REFERENCE',
  horizons_ms: [60_000, 300_000, 900_000],
  primary_horizon_ms: 300_000,
  cost_bps_roundtrip: 11,
  double_cost_bps_roundtrip: 22,
  train_fraction: 0.55,
  min_events_per_oos_segment: 30,
});

export const REQUIRED_FIELDS = Object.freeze([
  'symbol', 'ts', 'side', 'notional', 'mid_completion', 'mid_60s', 'mid_300s', 'mid_900s',
]);

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

export function missingFields(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [...REQUIRED_FIELDS];
  const missing = new Set();
  for (const f of REQUIRED_FIELDS) {
    for (const r of rows) {
      const v = r?.[f];
      if (v === undefined || v === null || v === '') { missing.add(f); break; }
    }
  }
  return [...missing];
}

// ---------------------------------------------------------------------------
// The frozen event
// ---------------------------------------------------------------------------

/** Boundary between train and everything sealed. Events are ordered by time across symbols. */
export function trainBoundary(events, fraction = FROZEN.train_fraction) {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const cut = Math.floor(sorted.length * fraction);
  return sorted[Math.min(cut, sorted.length - 1)].ts;
}

/**
 * Per-symbol notional threshold, fitted on the TRAIN segment only and never refitted.
 * A symbol with no train events gets Infinity, which excludes it rather than admitting it
 * on a threshold borrowed from elsewhere.
 */
export function trainThresholds(events, boundaryTs, percentile = FROZEN.notional_percentile) {
  const bySymbol = new Map();
  for (const e of events) {
    if (e.ts >= boundaryTs) continue;
    if (!bySymbol.has(e.symbol)) bySymbol.set(e.symbol, []);
    bySymbol.get(e.symbol).push(e.notional);
  }
  const out = new Map();
  for (const [symbol, list] of bySymbol) {
    const s = list.sort((a, b) => a - b);
    out.set(symbol, s.length ? s[Math.min(s.length - 1, Math.floor(s.length * percentile))] : Infinity);
  }
  return out;
}

export function isEvent(e, thresholds) {
  const t = thresholds.get(e.symbol);
  return t !== undefined && Number.isFinite(t) && e.notional >= t;
}

/**
 * Move in the FADE direction, in bps. A BUY sweep is faded short, so a rising mid is a loss.
 * Positive means the fade won.
 */
export function fadedMoveBps(event, horizonMs) {
  const key = horizonMs === 60_000 ? 'mid_60s' : horizonMs === 300_000 ? 'mid_300s' : 'mid_900s';
  const m0 = event.mid_completion;
  const m1 = event[key];
  if (!(m0 > 0) || !(m1 > 0)) return null;
  const raw = 1e4 * ((m1 - m0) / m0);
  return String(event.side).toUpperCase() === 'BUY' ? -raw : raw;
}

// ---------------------------------------------------------------------------
// Stage 0
// ---------------------------------------------------------------------------

export function horizonStats(events, horizonMs, costBps = FROZEN.cost_bps_roundtrip) {
  const moves = events.map((e) => fadedMoveBps(e, horizonMs)).filter((x) => x !== null);
  if (!moves.length) return { horizon_ms: horizonMs, n: 0 };
  const m = mean(moves);
  const sd = stdev(moves);
  const se = sd / Math.sqrt(moves.length);
  return {
    horizon_ms: horizonMs,
    n: moves.length,
    faded_mean_bps: m,
    faded_median_bps: median(moves),
    sd_bps: sd,
    std_err_bps: se,
    t_stat: se > 0 ? m / se : null,
    share_beyond_cost_pct: (100 * moves.filter((x) => x > costBps).length) / moves.length,
    gap_to_cost_x: m > 0 ? costBps / m : null,
    clears_cost: m > costBps,
    // The mirror is reported because a negative fade IS a positive continuation. It is an
    // observation on train, never a result: the direction was declared FADE beforehand.
    mirror_continuation_mean_bps: -m,
    mirror_clears_cost: -m > costBps,
  };
}

export function stage0(rows) {
  const gaps = missingFields(rows);
  if (gaps.length > 0) {
    return {
      task: FROZEN.task, stage: 0, label: 'DISCOVERY_NOT_PROOF', verdict: 'DATA_INADEQUATE',
      promising_count: 0, frozen: FROZEN, missing_fields: gaps,
    };
  }
  const boundary = trainBoundary(rows);
  const thresholds = trainThresholds(rows, boundary);
  const trainEvents = rows.filter((e) => e.ts < boundary && isEvent(e, thresholds));
  const sealedEvents = rows.filter((e) => e.ts >= boundary && isEvent(e, thresholds));

  const horizons = FROZEN.horizons_ms.map((h) => horizonStats(trainEvents, h));
  const primary = horizons.find((h) => h.horizon_ms === FROZEN.primary_horizon_ms);

  const enoughEvents = sealedEvents.length >= FROZEN.min_events_per_oos_segment * 2;
  const anyDirectionClears = horizons.some((h) => h.clears_cost || h.mirror_clears_cost);

  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    sealed_segments_untouched: true,
    total_sweeps: rows.length,
    train_boundary_ts: boundary,
    thresholds_by_symbol: Object.fromEntries([...thresholds.entries()].map(([k, v]) => [k, v])),
    train_events: trainEvents.length,
    train_symbols: new Set(trainEvents.map((e) => e.symbol)).size,
    train_days: new Set(trainEvents.map((e) => dayKey(e.ts))).size,
    sealed_events_available: sealedEvents.length,
    horizons,
    primary,
    cost_floor_bps: FROZEN.cost_bps_roundtrip,
  };

  if (!enoughEvents) out.verdict = 'STAGE_0_INFEASIBLE';
  else if (!anyDirectionClears) out.verdict = 'STAGE_0_INFEASIBLE';
  else out.verdict = 'STAGE_0_PASS';

  out.closure_reason = out.verdict === 'STAGE_0_PASS'
    ? null
    : (!enoughEvents
      ? `only ${sealedEvents.length} sealed events, below ${FROZEN.min_events_per_oos_segment * 2}`
      : 'neither the declared fade nor its mirror clears the round-trip cost on train');
  return out;
}

export function toCsv(r) {
  const header = 'horizon_s,n,faded_mean_bps,faded_median_bps,sd_bps,t_stat,share_beyond_cost_pct,mirror_continuation_mean_bps,clears_cost,mirror_clears_cost';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const rows = (r.horizons ?? []).map((h) => [
    h.horizon_ms / 1000, h.n, c(h.faded_mean_bps), c(h.faded_median_bps), c(h.sd_bps),
    c(h.t_stat), c(h.share_beyond_cost_pct), c(h.mirror_continuation_mean_bps),
    h.clears_cost, h.mirror_clears_cost,
  ].join(','));
  if (!rows.length) rows.push('NO_EVENTS,0,,,,,,,,');
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah048_large_sweep_forced_flow_fade.mjs — TASK-AH-048 Stage 0 harness, research only

Usage:
  node scripts/analysis/ah048_large_sweep_forced_flow_fade.mjs --events <file> [--out <base>]

  --events <file>  Rows: symbol, ts, side, notional, mid_completion, mid_60s, mid_300s, mid_900s
  --out <base>     Write <base>.json and <base>.csv (nothing is written without it)

Stage 0 only. The declared direction is FADE, frozen before inspection. The threshold is the
train-only per-symbol 99th percentile of parent notional. Holdout and forward stay sealed.`;

export function parseArgs(argv) {
  const opts = { events: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--events') opts.events = next();
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
  if (opts.help || !opts.events) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = stage0(readJsonFile(opts.events));
  process.stdout.write(`${JSON.stringify({ task: r.task, verdict: r.verdict, closure_reason: r.closure_reason, primary: r.primary }, null, 2)}\n`);

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
