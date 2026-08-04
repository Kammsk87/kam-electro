#!/usr/bin/env node
// ah051_sweep_depth_double_sort.mjs
//
// TASK-AH-051 — Sweep × Depth-Response Double Sort. Research only.
//
// STAGE 0 FEASIBILITY HARNESS. If the gate fails, no Stage 1 evaluation is written.
//
// AH-048 measured a continuation of +7.56 bps at 60s (t = 15.3) after large sweeps and closed
// because it does not pay the round trip — a gap the 2026-08-04 cost audit widened from 11 to
// 16 bps. What makes conditioning worth attempting rather than abandoning is that the paying
// tail already exists unconditionally: 32 percent of AH-048's events at 900s cleared 11 bps.
// The question is whether that tail is identifiable BEFORE the event.
//
// The instrument is the double sort, taken from Liu, Tsyvinski & Wu: sort on size first and
// on the conditioner within each size bucket, and require the conditioner to ORDER the
// buckets. A single sort reports an average and hides the structure.
//
// Causality note that shapes the whole design: the conditioner is the depth change over the
// book interval ENDING AT OR BEFORE sweep completion — the state entering the sweep, not the
// book's response to it. A post-completion snapshot would sit up to 10 seconds inside the
// 60-second outcome window and leak it. The weaker but causal quantity is chosen deliberately.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-051',
  stage: 0,
  burst_gap_ms: 100,
  event_percentile: 0.90,
  percentile_fitted_on: 'train_only_per_symbol',
  declared_direction: 'CONTINUATION',
  entry_reference: 'SWEEP_COMPLETION_MID_REFERENCE',
  notional_buckets: 5,
  conditioner_buckets: 5,
  conditioner: 'CONSUMED_SIDE_DEPTH_RESPONSE_PRE_SWEEP',
  horizons_ms: [60_000, 300_000, 900_000],
  primary_horizon_ms: 60_000,
  cost_bps_roundtrip: 16,
  double_cost_bps_roundtrip: 32,
  superseded_cost_bps_roundtrip: 11,
  train_fraction: 0.55,
  min_events_per_cell: 30,
  power_target_t: 3,
});

export const REQUIRED_FIELDS = Object.freeze([
  'symbol', 'ts', 'side', 'notional', 'mid_completion', 'mid_60s', 'mid_300s', 'mid_900s',
  'bid_depth_prev', 'bid_depth_next', 'ask_depth_prev', 'ask_depth_next',
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

/**
 * Rank-based bucket assignment. Ties break by incoming order rather than by value, so the
 * split never depends on float noise. Fewer values than buckets yields null instead of
 * squeezing a grid out of a handful of observations.
 */
export function bucketByRank(values, buckets) {
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
// The event and its two sort keys
// ---------------------------------------------------------------------------

/**
 * Fractional depth change on the side the aggressor is about to consume. A BUY sweep consumes
 * asks, a SELL sweep consumes bids. Negative means that side was thinning going in.
 *
 * A zero or missing prior depth returns null rather than Infinity: an undefined ratio must
 * drop the event, never be sorted as if it were an extreme value.
 */
export function consumedDepthResponse(e) {
  const buy = String(e.side).toUpperCase() === 'BUY';
  const prev = buy ? e.ask_depth_prev : e.bid_depth_prev;
  const next = buy ? e.ask_depth_next : e.bid_depth_next;
  if (!Number.isFinite(prev) || !Number.isFinite(next) || !(prev > 0)) return null;
  return (next - prev) / prev;
}

/** Move in the declared CONTINUATION direction, in bps. A BUY sweep is followed long. */
export function continuationBps(e, horizonMs) {
  const key = horizonMs === 60_000 ? 'mid_60s' : horizonMs === 300_000 ? 'mid_300s' : 'mid_900s';
  const m0 = e.mid_completion;
  const m1 = e[key];
  if (!(m0 > 0) || !(m1 > 0)) return null;
  const raw = 1e4 * ((m1 - m0) / m0);
  return String(e.side).toUpperCase() === 'BUY' ? raw : -raw;
}

/** Chronological train boundary across all symbols. */
export function trainBoundary(events, fraction = FROZEN.train_fraction) {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const cut = Math.floor(sorted.length * fraction);
  return sorted[Math.min(cut, sorted.length - 1)].ts;
}

/**
 * Per-symbol notional threshold at the declared percentile, fitted on the train segment alone.
 * A symbol with no train events gets Infinity, which excludes it rather than admitting it on a
 * threshold borrowed from a different symbol.
 */
export function trainThresholds(events, boundaryTs, percentile = FROZEN.event_percentile) {
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
 * Percentile rank of a value WITHIN its own symbol, in [0, 1).
 *
 * Both sort keys must be ranked per symbol before they are bucketed. Notional is measured in
 * dollars and its distribution differs by an order of magnitude across symbols, so a pooled
 * sort on the raw value ranks symbols rather than events: the "largest" bucket fills with
 * whichever names happen to trade in size, not with the largest sweeps relative to their own
 * book. A first cut of this file pooled it and produced a grid whose notional axis ran
 * backwards against a direct per-symbol measurement of the same data.
 *
 * The depth response is already a ratio and is less exposed, but it is ranked the same way for
 * the same reason: a symbol with a thin book has a wider ratio distribution than one with a
 * deep book, and pooling would sort on book depth.
 */
export function withinSymbolRank(rows, valueOf) {
  const bySymbol = new Map();
  rows.forEach((r, i) => {
    const v = valueOf(r);
    if (!Number.isFinite(v)) return;
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push({ v, i });
  });
  const out = new Array(rows.length).fill(null);
  for (const list of bySymbol.values()) {
    list.sort((a, b) => (a.v - b.v) || (a.i - b.i));
    for (let k = 0; k < list.length; k += 1) out[list[k].i] = k / list.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The double sort
// ---------------------------------------------------------------------------

/**
 * The grid. The first sort is notional; the second is the conditioner, and it is applied
 * WITHIN each notional bucket rather than globally. That is the whole point of a double sort:
 * a global second sort would mix the conditioner across sizes and reproduce the single-sort
 * average this task exists to look underneath.
 */
export function doubleSort(events, horizonMs, costBps = FROZEN.cost_bps_roundtrip) {
  const usable = [];
  for (const e of events) {
    const cond = consumedDepthResponse(e);
    const move = continuationBps(e, horizonMs);
    if (cond === null || move === null) continue;
    usable.push({ ...e, cond, move });
  }
  const nb = FROZEN.notional_buckets;
  const cb = FROZEN.conditioner_buckets;
  // Both sorts run on within-symbol percentile rank, never on the raw value. See
  // withinSymbolRank for why pooling the notional silently sorts symbols instead of events.
  const notionalRank = withinSymbolRank(usable, (r) => r.notional);
  const notionalBucket = bucketByRank(notionalRank.map((v) => (v === null ? -1 : v)), nb);
  if (notionalBucket === null) return null;

  const grid = Array.from({ length: nb }, () => Array.from({ length: cb }, () => []));
  const byNotional = Array.from({ length: nb }, () => []);
  for (let i = 0; i < usable.length; i += 1) byNotional[notionalBucket[i]].push(usable[i]);

  for (let n = 0; n < nb; n += 1) {
    const group = byNotional[n];
    const condRank = withinSymbolRank(group, (r) => r.cond);
    const cbucket = bucketByRank(condRank.map((v) => (v === null ? -1 : v)), cb);
    if (cbucket === null) continue;
    for (let i = 0; i < group.length; i += 1) grid[n][cbucket[i]].push(group[i]);
  }

  const cell = (rows) => {
    if (!rows.length) return { n: 0, gross_bps: null, net_bps: null, t_stat: null, reportable: false };
    const moves = rows.map((r) => r.move);
    const m = mean(moves);
    const sd = stdev(moves);
    const se = sd !== null && moves.length ? sd / Math.sqrt(moves.length) : null;
    return {
      n: moves.length,
      gross_bps: m,
      gross_median_bps: median(moves),
      sd_bps: sd,
      t_stat: se && se > 0 ? m / se : null,
      net_bps: m - costBps,
      // A cell below the declared minimum is computed but never reported as a result. Small
      // cells are exactly where a grid manufactures apparent structure.
      reportable: moves.length >= FROZEN.min_events_per_cell,
      detectable_bps: se !== null ? FROZEN.power_target_t * se : null,
      mean_conditioner: mean(rows.map((r) => r.cond)),
      mean_notional: mean(rows.map((r) => r.notional)),
      symbols: new Set(rows.map((r) => r.symbol)).size,
    };
  };

  return {
    horizon_ms: horizonMs,
    n_usable: usable.length,
    grid: grid.map((row) => row.map(cell)),
    notional_row_totals: byNotional.map((g) => cell(g)),
  };
}

/**
 * Monotone in the conditioner means the continuation weakens as the consumed side goes from
 * withdrawing to replenishing — that is, non-increasing across conditioner buckets. Cells
 * below the reporting minimum are skipped rather than counted, because an unreportable cell
 * cannot break or confirm an ordering.
 */
export function conditionerMonotone(row) {
  const usable = row.filter((c) => c.reportable && c.gross_bps !== null);
  if (usable.length < 3) return { monotone: false, checked: usable.length, reason: 'too few reportable cells' };
  for (let i = 1; i < usable.length; i += 1) {
    if (usable[i].gross_bps > usable[i - 1].gross_bps) {
      return { monotone: false, checked: usable.length, reason: `bucket ${i} exceeds bucket ${i - 1}` };
    }
  }
  return { monotone: true, checked: usable.length, reason: null };
}

// ---------------------------------------------------------------------------
// Stage 0
// ---------------------------------------------------------------------------

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
  const train = rows.filter((e) => e.ts < boundary && isEvent(e, thresholds));
  const sealed = rows.filter((e) => e.ts >= boundary && isEvent(e, thresholds));

  const horizons = FROZEN.horizons_ms.map((h) => doubleSort(train, h));
  const primary = horizons.find((h) => h && h.horizon_ms === FROZEN.primary_horizon_ms);

  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    sealed_segments_untouched: true,
    total_events: rows.length,
    train_boundary_ts: boundary,
    train_events: train.length,
    train_symbols: new Set(train.map((e) => e.symbol)).size,
    train_days: new Set(train.map((e) => dayKey(e.ts))).size,
    sealed_events_available: sealed.length,
    horizons,
    cost_floor_bps: FROZEN.cost_bps_roundtrip,
  };

  if (!primary) {
    out.verdict = 'DATA_INADEQUATE';
    out.closure_reason = 'not enough usable events to form the grid';
    return out;
  }

  const nb = FROZEN.notional_buckets;
  const topRow = primary.grid[nb - 1];
  const extreme = topRow[0]; // largest notional, strongest withdrawal
  const mono = conditionerMonotone(topRow);

  out.top_notional_row = topRow;
  out.extreme_cell = extreme;
  out.conditioner_monotone_in_top_row = mono;
  out.at_double_cost = extreme.gross_bps === null ? null : extreme.gross_bps - FROZEN.double_cost_bps_roundtrip;
  out.at_superseded_floor = extreme.gross_bps === null ? null : extreme.gross_bps - FROZEN.superseded_cost_bps_roundtrip;

  const resolvable = extreme.reportable && extreme.detectable_bps !== null
    && Math.abs(extreme.gross_bps) >= extreme.detectable_bps;
  const clears = extreme.reportable && extreme.net_bps !== null && extreme.net_bps > 0;

  if (!extreme.reportable) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `the extreme cell holds ${extreme.n} events, below the reporting minimum of ${FROZEN.min_events_per_cell}`;
  } else if (!resolvable) {
    out.verdict = 'UNDERPOWERED';
    out.closure_reason = `the extreme cell mean of ${extreme.gross_bps.toFixed(2)} bps is not distinguishable from zero at t=${FROZEN.power_target_t}, which needs ${extreme.detectable_bps.toFixed(2)} bps here; a point estimate at this precision is not a finding whichever side of the floor it falls`;
  } else if (!clears) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `the extreme cell reaches ${extreme.gross_bps.toFixed(2)} bps against a ${FROZEN.cost_bps_roundtrip} bps floor, a shortfall of ${(FROZEN.cost_bps_roundtrip - extreme.gross_bps).toFixed(2)} bps`;
  } else if (!mono.monotone) {
    out.verdict = 'STAGE_0_INFEASIBLE';
    out.closure_reason = `the extreme cell clears the floor but the conditioner does not order the top notional row (${mono.reason}); a spread carried by one cell is not a relation`;
  } else {
    out.verdict = 'STAGE_0_PASS';
    out.closure_reason = null;
  }
  return out;
}

export function toCsv(r) {
  const header = 'horizon_s,notional_bucket,conditioner_bucket,n,gross_bps,gross_median_bps,t_stat,net_bps,mean_conditioner,symbols,reportable';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const lines = [];
  for (const h of r.horizons ?? []) {
    if (!h) continue;
    for (let n = 0; n < h.grid.length; n += 1) {
      for (let k = 0; k < h.grid[n].length; k += 1) {
        const cell = h.grid[n][k];
        lines.push([h.horizon_ms / 1000, n, k, cell.n, c(cell.gross_bps), c(cell.gross_median_bps),
          c(cell.t_stat), c(cell.net_bps), c(cell.mean_conditioner), cell.symbols ?? 0, cell.reportable].join(','));
      }
    }
  }
  if (!lines.length) lines.push('NO_GRID,,,0,,,,,,,false');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah051_sweep_depth_double_sort.mjs — TASK-AH-051 Stage 0 harness, research only

Usage:
  node scripts/analysis/ah051_sweep_depth_double_sort.mjs --events <file> [--out <base>]

  --events <file>  Rows: symbol, ts, side, notional, mid_completion, mid_60s/300s/900s,
                   bid_depth_prev/next, ask_depth_prev/next
  --out <base>     Write <base>.json and <base>.csv (nothing is written without it)

Stage 0 only. Direction CONTINUATION, frozen. Events are the train-only per-symbol top decile
of parent notional. First sort notional, second sort the pre-sweep depth response on the
consumed side, applied within each notional bucket. Holdout and forward stay sealed.`;

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
  process.stdout.write(`${JSON.stringify({
    task: r.task, verdict: r.verdict, closure_reason: r.closure_reason,
    train_events: r.train_events, train_symbols: r.train_symbols, train_days: r.train_days,
    sealed_events_available: r.sealed_events_available,
    extreme_cell: r.extreme_cell, monotone: r.conditioner_monotone_in_top_row,
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
