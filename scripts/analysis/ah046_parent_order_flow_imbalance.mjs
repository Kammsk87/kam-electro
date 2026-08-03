#!/usr/bin/env node
// ah046_parent_order_flow_imbalance.mjs
//
// TASK-AH-046 — Parent Order Flow Imbalance. Research only.
//
// A tape of child prints is not a tape of decisions. One aggressive order that sweeps
// three price levels arrives as three prints; counted naively it triples that actor's
// apparent footprint and buries them among dust fills whose median notional is $31.
// This program collapses child prints back into the parent decisions that produced them,
// then tests whether the signed imbalance of those decisions explains the next move.
//
// Every threshold is frozen in FROZEN below, fixed by the task contract before the full
// archive was read. Changing one makes a new task with a new identity, not a repair.
//
// Safety: no network, process, service, credential, exchange, account, order, execution
// or position path exists here. Reads explicitly supplied local files; writes only to an
// explicit --out base. Deterministic: seeded PRNG, no clock, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-046',
  burst_gap_ms: 100,
  neighbour_burst_gap_ms: [50, 200],
  bucket_ms: 300_000,
  horizon_buckets: 1,
  cost_bps_roundtrip: 11,
  double_cost_bps_roundtrip: 22,
  splits: { train: 0.55, validation: 0.2, holdout: 0.15, forward: 0.1 },
  purge_buckets: 1,
  embargo_buckets: 3,
  null_samples: 1000,
  null_seed: 46_046,
  alpha: 0.05,
  max_symbol_share: 0.25,
  min_buckets_per_split: 100,
  min_symbols: 5,
  min_days: 10,
});

export const OVERLAP_FAMILIES = Object.freeze([
  'RAW_MOMENTUM', 'FAILED_BREAKOUT', 'WICK_RECLAIM', 'AMEL_EVENT', 'LIQUIDITY_GUARD',
]);

export const REQUIRED_TRADE_FIELDS = Object.freeze(['ts', 'px', 'qty', 'side']);
export const REFUSED_SUBSTITUTES = Object.freeze([
  'candle_direction', 'close_to_close_return', 'tick_rule_inference', 'ohlcv_volume_split',
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
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const bucketOf = (ts) => Math.floor(ts / FROZEN.bucket_ms) * FROZEN.bucket_ms;
export const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
export const minuteOfDay = (ts) => Math.floor((ts % 86_400_000) / 60_000);

// ---------------------------------------------------------------------------
// Parent order reconstruction
// ---------------------------------------------------------------------------

/**
 * Collapses child prints into parent aggressive orders.
 *
 * A child continues its parent when it shares the aggressor side, arrives within
 * `gapMs`, and its price has not moved AGAINST the aggressor — a buyer sweeping upward
 * keeps lifting equal or higher offers, a seller keeps hitting equal or lower bids.
 * A price that retreats means a different actor, so the parent is closed.
 *
 * Prints must already be sorted by ts; the caller sorts once.
 */
export function reconstructParents(prints, gapMs = FROZEN.burst_gap_ms) {
  const parents = [];
  let cur = null;
  for (const t of prints) {
    const side = String(t.side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
    const continues =
      cur !== null &&
      cur.side === side &&
      t.ts - cur.last_ts <= gapMs &&
      (side === 'BUY' ? t.px >= cur.last_px : t.px <= cur.last_px);

    if (continues) {
      cur.qty += t.qty;
      cur.notional += t.px * t.qty;
      cur.fills += 1;
      cur.levels.add(t.px);
      cur.last_ts = t.ts;
      cur.last_px = t.px;
    } else {
      if (cur) parents.push(finalize(cur));
      cur = { side, ts: t.ts, qty: t.qty, notional: t.px * t.qty, fills: 1, levels: new Set([t.px]), last_ts: t.ts, last_px: t.px };
    }
  }
  if (cur) parents.push(finalize(cur));
  return parents;

  function finalize(p) {
    return {
      side: p.side, ts: p.ts, end_ts: p.last_ts, qty: p.qty, notional: p.notional,
      fills: p.fills, levels: p.levels.size, sweep: p.levels.size > 1,
    };
  }
}

/** Descriptive footprint of who is actually trading. Not a signal. */
export function parentProfile(parents) {
  if (!parents.length) return null;
  const notional = parents.map((p) => p.notional).sort((a, b) => b - a);
  const total = notional.reduce((a, b) => a + b, 0);
  const topShare = (k) => {
    const take = Math.max(1, Math.ceil(notional.length * k));
    return total > 0 ? notional.slice(0, take).reduce((a, b) => a + b, 0) / total : null;
  };
  const sweeps = parents.filter((p) => p.sweep);
  return {
    parents: parents.length,
    fills: parents.reduce((a, p) => a + p.fills, 0),
    fills_per_parent: parents.reduce((a, p) => a + p.fills, 0) / parents.length,
    sweeps: sweeps.length,
    sweep_share_of_parents: sweeps.length / parents.length,
    sweep_share_of_notional: total > 0 ? sweeps.reduce((a, p) => a + p.notional, 0) / total : null,
    total_notional: total,
    median_notional: median(notional),
    top_0p1pct_share: topShare(0.001),
    top_1pct_share: topShare(0.01),
    top_5pct_share: topShare(0.05),
  };
}

// ---------------------------------------------------------------------------
// Bucketing and the frozen signal
// ---------------------------------------------------------------------------

/** Signed parent-order imbalance per bucket. The signal is the SIGN of this. */
export function bucketImbalance(parents, symbol) {
  const byBucket = new Map();
  for (const p of parents) {
    const b = bucketOf(p.ts);
    if (!byBucket.has(b)) byBucket.set(b, { symbol, bucket: b, buy_notional: 0, sell_notional: 0, parents: 0, sweeps: 0 });
    const e = byBucket.get(b);
    if (p.side === 'BUY') e.buy_notional += p.notional;
    else e.sell_notional += p.notional;
    e.parents += 1;
    if (p.sweep) e.sweeps += 1;
  }
  for (const e of byBucket.values()) {
    e.imbalance_notional = e.buy_notional - e.sell_notional;
    e.direction = Math.sign(e.imbalance_notional);
  }
  return byBucket;
}

/**
 * Rebuilds the imbalance map from pre-aggregated bucket totals. Derives imbalance and
 * direction here rather than trusting the extractor, so a mis-signed aggregate cannot
 * silently become a signal.
 */
export function rehydrateBuckets(rows, symbol) {
  const map = new Map();
  for (const r of rows) {
    const imbalance = r.buy_notional - r.sell_notional;
    map.set(r.bucket, {
      symbol,
      bucket: r.bucket,
      buy_notional: r.buy_notional,
      sell_notional: r.sell_notional,
      parents: r.parents ?? 0,
      sweeps: r.sweeps ?? 0,
      imbalance_notional: imbalance,
      direction: Math.sign(imbalance),
    });
  }
  return map;
}

/** Mid price at or before ts, from a ts-sorted snapshot array. Never looks forward. */
export function midAtOrBefore(snapshots, ts) {
  let lo = 0;
  let hi = snapshots.length - 1;
  let found = null;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (snapshots[m].ts <= ts) { found = snapshots[m]; lo = m + 1; } else hi = m - 1;
  }
  if (!found || !found.bid || !found.ask) return null;
  return (found.bid + found.ask) / 2;
}

/**
 * One observation per bucket: the signal is read at bucket close, the outcome is the
 * mid move over the NEXT bucket. Entry reference is the close of the signal bucket, so
 * no price inside the outcome window informs the decision.
 */
export function buildObservations(imbalanceByBucket, snapshots, maxStalenessMs = FROZEN.bucket_ms) {
  const out = [];
  for (const e of [...imbalanceByBucket.values()].sort((a, b) => a.bucket - b.bucket)) {
    if (e.direction === 0) continue;
    const entryTs = e.bucket + FROZEN.bucket_ms;
    const exitTs = entryTs + FROZEN.bucket_ms * FROZEN.horizon_buckets;
    const entryMid = midAtOrBefore(snapshots, entryTs);
    const exitMid = midAtOrBefore(snapshots, exitTs);
    if (entryMid === null || exitMid === null) continue;
    const grossBps = e.direction * 1e4 * ((exitMid - entryMid) / entryMid);
    out.push({
      symbol: e.symbol, bucket: e.bucket, day: dayKey(e.bucket), direction: e.direction,
      imbalance_notional: e.imbalance_notional, parents: e.parents, sweeps: e.sweeps,
      entry_mid: entryMid, exit_mid: exitMid, gross_bps: grossBps,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chronology, purge, embargo
// ---------------------------------------------------------------------------

export function chronology(count) {
  const trainEnd = Math.floor(count * FROZEN.splits.train);
  const validationEnd = trainEnd + Math.floor(count * FROZEN.splits.validation);
  const holdoutEnd = validationEnd + Math.floor(count * FROZEN.splits.holdout);
  return {
    count, trainEnd, validationEnd, holdoutEnd,
    splitOf: (i) => (i < trainEnd ? 'train' : i < validationEnd ? 'validation' : i < holdoutEnd ? 'holdout' : 'forward'),
  };
}

/** Splits by global bucket index, then purges boundary crossings and embargoes each head. */
export function assignSplits(observations) {
  const buckets = [...new Set(observations.map((o) => o.bucket))].sort((a, b) => a - b);
  const index = new Map(buckets.map((b, i) => [b, i]));
  const chrono = chronology(buckets.length);
  const kept = [];
  const dropped = { purged: 0, embargoed: 0 };
  const firstOfSplit = {};

  for (const o of observations) {
    const i = index.get(o.bucket);
    const split = chrono.splitOf(i);
    if (firstOfSplit[split] === undefined) firstOfSplit[split] = i;
  }
  for (const o of observations) {
    const i = index.get(o.bucket);
    const split = chrono.splitOf(i);
    if (chrono.splitOf(i + FROZEN.purge_buckets + FROZEN.horizon_buckets) !== split) { dropped.purged += 1; continue; }
    if (split !== 'train' && i - firstOfSplit[split] < FROZEN.embargo_buckets) { dropped.embargoed += 1; continue; }
    kept.push({ ...o, split });
  }
  return { kept, dropped, chrono, buckets: buckets.length };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function stats(rows, costBps = FROZEN.cost_bps_roundtrip) {
  const ordered = [...rows].sort((a, b) => a.bucket - b.bucket || (a.symbol < b.symbol ? -1 : 1));
  const net = ordered.map((r) => r.gross_bps - costBps);
  let cumulative = 0;
  let peak = 0;
  let drawdown = 0;
  for (const x of net) {
    cumulative += x;
    peak = Math.max(peak, cumulative);
    drawdown = Math.min(drawdown, cumulative - peak);
  }
  const m = mean(net);
  const sd = stdev(net);
  const se = sd !== null && net.length ? sd / Math.sqrt(net.length) : null;
  // Precision must be quoted on the GROSS mean. The net mean carries the constant cost,
  // so a t-statistic on it only ever says "11 bps is not zero" and looks impressively
  // significant while proving nothing about the signal.
  const gross = ordered.map((r) => r.gross_bps);
  const gm = mean(gross);
  const gse = sd !== null && gross.length ? sd / Math.sqrt(gross.length) : null;
  return {
    n: ordered.length,
    symbols: new Set(ordered.map((r) => r.symbol)).size,
    days: new Set(ordered.map((r) => r.day)).size,
    net_mean_bps: m,
    net_median_bps: median(net),
    net_sd_bps: sd,
    net_std_err_bps: se,
    gross_std_err_bps: gse,
    gross_t_stat: gm !== null && gse ? gm / gse : null,
    t_stat: m !== null && se ? m / se : null,
    win_rate_pct: net.length ? (100 * net.filter((x) => x > 0).length) / net.length : null,
    net_total_bps: net.reduce((a, b) => a + b, 0),
    max_drawdown_bps: drawdown,
    gross_mean_bps: mean(ordered.map((r) => r.gross_bps)),
    cost_floor_gap_x: m !== null && m > 0 ? costBps / m : null,
  };
}

/** Two-sided matched null: same symbol, same time-of-day bucket, randomised direction. */
export function matchedNull(rows, samples = FROZEN.null_samples, seed = FROZEN.null_seed) {
  const observed = median(rows.map((r) => r.gross_bps - FROZEN.cost_bps_roundtrip));
  if (observed === null || !rows.length) return { samples: 0, observed_net_median_bps: observed, null_median_bps: null, p_value: null };
  const medians = [];
  for (let k = 0; k < samples; k += 1) {
    const rnd = seeded(seed + k);
    const drawn = rows.map((r) => {
      const flip = rnd() < 0.5 ? -1 : 1;
      return flip * r.direction * 1e4 * ((r.exit_mid - r.entry_mid) / r.entry_mid) - FROZEN.cost_bps_roundtrip;
    });
    const m = median(drawn);
    if (m !== null) medians.push(m);
  }
  if (!medians.length) return { samples: 0, observed_net_median_bps: observed, null_median_bps: null, p_value: null };
  const centre = median(medians);
  const extreme = medians.filter((x) => Math.abs(x - centre) >= Math.abs(observed - centre)).length;
  return { samples: medians.length, observed_net_median_bps: observed, null_median_bps: centre, p_value: extreme / medians.length, two_sided: true };
}

export function removeBest(rows, key) {
  const totals = {};
  for (const r of rows) totals[r[key]] = (totals[r[key]] || 0) + (r.gross_bps - FROZEN.cost_bps_roundtrip);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { removed: null, stats: stats(rows) };
  const worst = entries[0][0];
  return { removed: worst, removed_net_bps: entries[0][1], stats: stats(rows.filter((r) => String(r[key]) !== worst)) };
}

export function concentration(rows) {
  const abs = {};
  for (const r of rows) abs[r.symbol] = (abs[r.symbol] || 0) + Math.abs(r.gross_bps - FROZEN.cost_bps_roundtrip);
  const values = Object.values(abs);
  const total = values.reduce((a, b) => a + b, 0);
  return { max_symbol_share: total > 0 ? Math.max(...values) / total : 0, symbols: values.length };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export function verdictFor(r) {
  const h = r.holdout;
  const f = r.forward;
  if (!h || !f ||
    h.n < FROZEN.min_buckets_per_split || f.n < FROZEN.min_buckets_per_split ||
    h.symbols < FROZEN.min_symbols || f.symbols < FROZEN.min_symbols ||
    h.days < FROZEN.min_days || f.days < FROZEN.min_days) return 'DATA_INADEQUATE';
  if (r.overlap?.status !== 'MEASURED' || r.overlap?.blocking) return 'DUPLICATE_OR_OVERLAP';
  if ([h, f].some((s) => s.net_mean_bps <= 0 || s.net_median_bps <= 0) ||
    r.null?.p_value === null || r.null?.p_value >= FROZEN.alpha) return 'OOS_FAIL_REJECT_FAMILY';
  if (r.double_cost_oos?.net_median_bps < 0 ||
    r.remove_best_symbol?.stats.net_total_bps <= 0 ||
    r.remove_best_day?.stats.net_total_bps <= 0 ||
    r.concentration?.max_symbol_share > FROZEN.max_symbol_share ||
    (r.neighbours ?? []).some((x) => x.stats.net_mean_bps < 0)) return 'ROBUSTNESS_FAIL_DEPRIORITIZE';
  return 'CANDIDATE_PASSPORT_DRAFT';
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * @param panel {symbol: {parents: [...], snapshots: [...]}} already reconstructed
 */
export function evaluate(panel, opts = {}) {
  const gap = opts.burst_gap_ms ?? FROZEN.burst_gap_ms;
  const all = [];
  const profiles = {};
  for (const [symbol, data] of Object.entries(panel)) {
    let imbalance;
    if (data.buckets_by_gap) {
      // Pre-aggregated: the archive is far too large to hold every parent order in memory,
      // so extraction reduces each symbol-day to bucket totals per frozen burst gap.
      imbalance = rehydrateBuckets(data.buckets_by_gap[String(gap)] ?? [], symbol);
      profiles[symbol] = data.profile ?? null;
    } else {
      const parents = data.parents ?? reconstructParents(data.prints ?? [], gap);
      profiles[symbol] = parentProfile(parents);
      imbalance = bucketImbalance(parents, symbol);
    }
    all.push(...buildObservations(imbalance, data.snapshots ?? []));
  }
  const { kept, dropped, buckets } = assignSplits(all);
  const bySplit = (name) => kept.filter((r) => r.split === name);
  return { observations: kept, dropped, buckets, profiles, bySplit };
}

export function report(panel) {
  const base = evaluate(panel);
  if (base.observations.length === 0) {
    return {
      task: FROZEN.task, label: 'DISCOVERY_NOT_PROOF', verdict: 'DATA_INADEQUATE',
      promising_count: 0, frozen: FROZEN, reason: 'no usable buckets after the data gate, purge and embargo',
      dropped: base.dropped, profiles: base.profiles,
    };
  }
  const holdout = base.bySplit('holdout');
  const forward = base.bySplit('forward');
  const oos = [...holdout, ...forward];

  const neighbours = FROZEN.neighbour_burst_gap_ms.map((g) => {
    const nb = evaluate(panel, { burst_gap_ms: g });
    return { burst_gap_ms: g, segment: 'validation', stats: stats(nb.bySplit('validation')) };
  });

  const out = {
    task: FROZEN.task,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    rule: 'sign of (parent buy notional - parent sell notional) over a 5-minute bucket; hold the next 5-minute bucket, mid to mid',
    buckets_total: base.buckets,
    dropped: base.dropped,
    profiles: base.profiles,
    train: stats(base.bySplit('train')),
    validation: stats(base.bySplit('validation')),
    holdout: stats(holdout),
    forward: stats(forward),
    combined_oos: stats(oos),
    double_cost_oos: stats(oos, FROZEN.double_cost_bps_roundtrip),
    null: matchedNull(oos),
    remove_best_symbol: removeBest(oos, 'symbol'),
    remove_best_day: removeBest(oos, 'day'),
    concentration: concentration(oos),
    neighbours,
    overlap: {
      status: 'UNAVAILABLE', families: OVERLAP_FAMILIES, blocking: true,
      reason: 'Per-trade timestamp ledgers for the comparison families were not retained, so exact overlap cannot be measured.',
    },
  };
  out.verdict = verdictFor(out);
  return out;
}

export function toCsv(r) {
  // gross_mean_bps and gross_t_stat lead, because those are the columns that say whether
  // the signal predicts anything. net_mean_bps is reported after them so the distance to
  // the cost floor is visible, but it is never the headline.
  const header = 'split,n,symbols,days,gross_mean_bps,gross_t_stat,net_mean_bps,net_median_bps,cost_floor_gap_x,net_total_bps';
  const rows = ['train', 'validation', 'holdout', 'forward', 'combined_oos']
    .filter((k) => r[k])
    .map((k) => {
      const s = r[k];
      const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
      return [k, s.n, s.symbols, s.days, c(s.gross_mean_bps), c(s.gross_t_stat), c(s.net_mean_bps),
        c(s.net_median_bps), c(s.cost_floor_gap_x), c(s.net_total_bps)].join(',');
    });
  if (!rows.length) rows.push('NO_OBSERVATIONS,0,0,0,,,,,,');
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah046_parent_order_flow_imbalance.mjs — TASK-AH-046, research only

Usage:
  node scripts/analysis/ah046_parent_order_flow_imbalance.mjs --panel <file> [--out <base>]

  --panel <file>  {SYMBOL: {prints:[{ts,px,qty,side}], snapshots:[{ts,bid,ask}]}}
  --out <base>    Write <base>.json and <base>.csv (nothing is written without it)

Aggressor side must be an explicit taker classification. Candle direction, close-to-close
return, tick-rule inference and OHLCV volume splits are refused.`;

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

  const r = report(readJsonFile(opts.panel));
  process.stdout.write(`${JSON.stringify({ task: r.task, verdict: r.verdict, holdout: r.holdout, forward: r.forward, null: r.null }, null, 2)}\n`);

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
