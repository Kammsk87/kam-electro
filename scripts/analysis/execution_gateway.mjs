#!/usr/bin/env node
// execution_gateway.mjs
//
// The two-layer execution gateway: a signal layer proposes an intent, a gate decides WHEN it is
// sent. This is not the G3 harness re-run under another name — it implements a different policy
// and therefore measures a different quantity.
//
//   G3 harness      VETO means SKIP.  The trade does not happen, so there is no second entry
//                   price to compare against and the metric is a difference of MEANS over two
//                   differently-sized sets.
//   this gateway    VETO means WAIT.  Both runs take the SAME intent, the guarded one later, so
//                   the two entry prices are PAIRED on one intent and the difference is defined
//                   per trade rather than per set.
//
// The paired form is also the realistic one: a strategy told to enter rarely cancels the signal,
// it postpones it.
//
// Frozen before the run:
//   wait cap        3 snapshots (~30 s), with 1 and 6 as reported neighbours, never substituted
//   at the cap      FORCED EXECUTION. Abandoning would make the difference undefined on exactly
//                   the intents the guard cares most about and would collapse this back to SKIP.
//   intent stream   exhaustive, both directions at every snapshot. A uniformly random stream is
//                   a noisier subsample of this and models no real arrival process.
//
// The cost floor CANCELS in the paired difference: the same intent, the same notional, the same
// fee in both runs. requireFloor is wired in for the absolute audit line only, and no choice
// between 16.00 and 19.19 can move the comparison. Stated here so nobody later reads the fee
// schedule as having influenced the guard result.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no entropy drawn from the platform.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { guardState } from './ah047_execution_policy_guard.mjs';
import { makePriceSource, parseGuardFile, parseTickFile } from './g3_guard_execution_harness.mjs';
import { requireFloor } from './cost_model.mjs';

export const FROZEN = Object.freeze({
  module: 'EXECUTION_GATEWAY',
  policy: 'VETO_MEANS_WAIT',
  law: 'LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE',
  intents: ['LONG', 'SHORT'],
  wait_cap_snapshots: 3,
  neighbour_caps: [1, 6],
  at_cap: 'FORCED_EXECUTION',
  max_price_age_ms: 30_000,
  intent_notional_usd: 200,
  control_draws: 200,
  control_seed: 77_077,
  floor_as_of: '2026-08-05',
  // Derived from the law and the G3 run rather than hoped for. VETO states are followed by a
  // move against the intent worth 0.28 to 0.52 bps over 60 s; waiting ~30 s should recover part
  // of it, and only the 16.2 percent of intents that are vetoed wait at all.
  prior_expectation_bps_per_intent: 0.03,
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
 * Deterministic linear congruential generator seeded from a frozen constant so the control
 * reproduces exactly. The module draws no entropy from the platform and reads no clock; the
 * static scan asserts that, and this comment avoids naming the banned symbols so it does not
 * trip its own check.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

// ---------------------------------------------------------------------------
// The wait policy
// ---------------------------------------------------------------------------

/**
 * How many snapshots the gate holds this intent back.
 *
 * Advances while the state vetoes, up to the cap. At the cap the intent is sent anyway and the
 * result is flagged `forced` — the strategy does not cancel, it postpones, and abandoning here
 * would leave the paired difference undefined on precisely the intents the guard cares about.
 */
export function resolveWait(snapshots, i, direction, cap = FROZEN.wait_cap_snapshots) {
  for (let k = 0; k <= cap; k += 1) {
    const j = i + k;
    // The wait would run past the end of the archive. The index is returned as null so the
    // caller REJECTS the intent: clamping to the last snapshot would silently execute at
    // whatever price sits there, however far away, and the tail of every symbol would land in
    // the sample with a fabricated entry.
    if (j >= snapshots.length) return { index: null, waited: k, forced: true, ran_out: true };
    if (guardState(snapshots[j], direction) === 'ALLOW') {
      return { index: j, waited: k, forced: false, ran_out: false };
    }
  }
  const j = i + cap;
  if (j >= snapshots.length) return { index: null, waited: cap, forced: true, ran_out: true };
  return { index: j, waited: cap, forced: true, ran_out: false };
}

/**
 * Signed entry improvement in bps.
 *
 * A long is better off entering LOWER, a short better off entering HIGHER. Positive means the
 * gate obtained the better price. Both prices come from the same source at the same offset, so
 * the tick-arrival gap that dominates absolute staleness largely cancels between them.
 */
export function improvementBps(direction, baselinePx, guardedPx) {
  if (!(baselinePx > 0) || !(guardedPx > 0)) return null;
  const raw = 1e4 * ((baselinePx - guardedPx) / baselinePx);
  return direction === 'LONG' ? raw : -raw;
}

function priceAt(price, ts) {
  const t = price.at(ts);
  if (!t || t.ts - ts > FROZEN.max_price_age_ms || !(t.px > 0)) return null;
  return t;
}

/**
 * One intent, executed twice. Baseline sends it at its own snapshot; guarded sends it at
 * whichever snapshot the wait policy resolves to.
 */
export function pairedEntry(snapshots, i, direction, price, cap = FROZEN.wait_cap_snapshots) {
  const s = snapshots[i];
  if (!(s.bid > 0) || !(s.ask > 0) || s.ask <= s.bid) return { status: 'NO_QUOTE' };
  const depth = direction === 'LONG' ? s.ask_depth_next : s.bid_depth_next;
  if (!Number.isFinite(depth) || depth < FROZEN.intent_notional_usd) return { status: 'NO_FILL_DEPTH' };

  const decision = guardState(s, direction);
  if (decision === 'NO_DATA') return { status: 'NO_DATA' };

  const w = resolveWait(snapshots, i, direction, cap);
  if (w.index === null) return { status: 'RAN_OUT_OF_ARCHIVE' };
  const bTick = priceAt(price, s.ts);
  if (!bTick) return { status: 'NO_PRICE_BASELINE' };
  const gTick = priceAt(price, snapshots[w.index].ts);
  if (!gTick) return { status: 'NO_PRICE_GUARDED' };

  return {
    status: 'FILLED',
    decision,
    waited_snapshots: w.waited,
    forced: w.forced,
    baseline_px: bTick.px,
    guarded_px: gTick.px,
    improvement_bps: improvementBps(direction, bTick.px, gTick.px),
    wait_ms: gTick.ts - bTick.ts,
  };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * The control that decides whether the guard is doing anything.
 *
 * Waiting may improve an entry for reasons that have nothing to do with the predicate — short
 * horizon mean reversion would do it on its own. So the control waits the SAME number of
 * snapshots on RANDOMLY chosen intents at the same rate. If the guard's improvement does not
 * beat this, the credit belongs to waiting, not to the gate.
 */
export function randomWaitControl(snapshots, price, waitRate, waitDist, cap, draws = FROZEN.control_draws, seed = FROZEN.control_seed) {
  const rnd = lcg(seed);
  const means = [];
  for (let d = 0; d < draws; d += 1) {
    const vals = [];
    for (let i = 0; i < snapshots.length; i += 1) {
      if (rnd() >= waitRate) continue;
      const direction = rnd() < 0.5 ? 'LONG' : 'SHORT';
      const wait = waitDist.length ? waitDist[Math.floor(rnd() * waitDist.length)] : cap;
      const j = Math.min(i + wait, snapshots.length - 1);
      const b = priceAt(price, snapshots[i].ts);
      const g = priceAt(price, snapshots[j].ts);
      if (!b || !g) continue;
      const v = improvementBps(direction, b.px, g.px);
      if (v !== null) vals.push(v);
    }
    if (vals.length > 20) means.push(mean(vals));
  }
  means.sort((a, b) => a - b);
  if (!means.length) return { draws: 0 };
  return {
    draws: means.length,
    control_mean_bps: mean(means),
    control_p05: means[Math.floor(means.length * 0.05)],
    control_p95: means[Math.floor(means.length * 0.95)],
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export function runSymbol(snapshots, ticks, cap = FROZEN.wait_cap_snapshots) {
  const price = makePriceSource(ticks);
  const filled = [];
  const rejects = {};
  for (let i = 0; i < snapshots.length; i += 1) {
    for (const direction of FROZEN.intents) {
      const r = pairedEntry(snapshots, i, direction, price, cap);
      if (r.status !== 'FILLED') { rejects[r.status] = (rejects[r.status] || 0) + 1; continue; }
      filled.push({ ...r, direction });
    }
  }
  if (!filled.length) return { n: 0, rejects };

  const waited = filled.filter((x) => x.waited_snapshots > 0);
  const all = filled.map((x) => x.improvement_bps).filter((x) => x !== null);
  const onWaited = waited.map((x) => x.improvement_bps).filter((x) => x !== null);
  const sdAll = stdev(all);
  const sdW = stdev(onWaited);

  const control = randomWaitControl(
    snapshots, price,
    waited.length / Math.max(filled.length, 1),
    waited.map((x) => x.waited_snapshots),
    cap,
  );

  return {
    cap,
    n: filled.length,
    rejects,
    // Averaged over EVERY intent, which is what a strategy actually experiences: most are
    // allowed through untouched and contribute exactly zero.
    mean_improvement_bps: mean(all),
    median_improvement_bps: median(all),
    se_bps: sdAll !== null ? sdAll / Math.sqrt(all.length) : null,
    t_stat: sdAll ? mean(all) / (sdAll / Math.sqrt(all.length)) : null,
    detectable_bps: sdAll !== null ? 3 * (sdAll / Math.sqrt(all.length)) : null,
    // And over the intents that actually waited, which is where the mechanism can show.
    n_waited: waited.length,
    wait_rate_pct: (100 * waited.length) / filled.length,
    mean_improvement_on_waited_bps: onWaited.length ? mean(onWaited) : null,
    t_on_waited: sdW && onWaited.length ? mean(onWaited) / (sdW / Math.sqrt(onWaited.length)) : null,
    mean_wait_ms: mean(waited.map((x) => x.wait_ms)),
    forced_pct: (100 * filled.filter((x) => x.forced).length) / filled.length,
    share_improved_pct: all.length ? (100 * all.filter((x) => x > 0).length) / all.length : null,
    control,
  };
}

export function runGateway(bySymbol) {
  const caps = [FROZEN.wait_cap_snapshots, ...FROZEN.neighbour_caps];
  const byCap = {};
  for (const cap of caps) {
    const rows = [];
    for (const [sym, { snapshots, ticks }] of Object.entries(bySymbol)) {
      if (!snapshots?.length || !ticks?.length) continue;
      const r = runSymbol(snapshots, ticks, cap);
      if (r.n) rows.push({ symbol: sym, ...r });
    }
    if (!rows.length) { byCap[cap] = { cap, n: 0 }; continue; }
    const n = rows.reduce((a, r) => a + r.n, 0);
    const w = (k) => rows.reduce((a, r) => a + (r[k] ?? 0) * r.n, 0) / n;
    // Pooled standard error from each symbol's own dispersion; a weighted mean of t-statistics
    // would be meaningless.
    let v = 0;
    for (const r of rows) if (r.se_bps !== null) v += (r.se_bps ** 2) * (r.n ** 2);
    const se = Math.sqrt(v) / n;
    const m = w('mean_improvement_bps');
    byCap[cap] = {
      cap,
      symbols: rows.length,
      n,
      mean_improvement_bps: m,
      se_bps: se,
      t_stat: se > 0 ? m / se : null,
      detectable_bps: 3 * se,
      wait_rate_pct: w('wait_rate_pct'),
      mean_improvement_on_waited_bps: w('mean_improvement_on_waited_bps'),
      mean_wait_ms: w('mean_wait_ms'),
      forced_pct: w('forced_pct'),
      share_improved_pct: w('share_improved_pct'),
      control_mean_bps: w('control_mean_bps') || mean(rows.map((r) => r.control?.control_mean_bps).filter((x) => x != null)),
      per_symbol: rows,
    };
  }

  const primary = byCap[FROZEN.wait_cap_snapshots];
  const floor = requireFloor({ asOf: FROZEN.floor_as_of });

  const out = {
    module: FROZEN.module,
    label: 'PAIRED_ENTRY_MEASUREMENT_NOT_A_PASSPORT',
    promising_count: 0,
    frozen: FROZEN,
    by_cap: byCap,
    primary,
    // Wired for the absolute audit line only. It is identical in both runs and cancels exactly
    // in the paired difference, so no choice of floor can move this measurement.
    cost_audit: {
      floor_bps: floor.bps,
      citation: `${floor.fee_component_bps} fee + ${floor.execution_component_bps} execution, schedule ${floor.schedule_id}`,
      cancels_in_paired_difference: true,
    },
    prior_expectation_bps: FROZEN.prior_expectation_bps_per_intent,
  };

  if (!primary || !primary.n) {
    out.verdict = 'DATA_INADEQUATE';
    out.closure_reason = 'no paired entries were filled at the frozen cap';
    return out;
  }

  const resolvable = primary.detectable_bps !== null
    && Math.abs(primary.mean_improvement_bps) >= primary.detectable_bps;
  const beatsControl = primary.control_mean_bps === null
    || primary.mean_improvement_bps > primary.control_mean_bps;

  if (!resolvable) {
    out.verdict = 'UNRESOLVED';
    out.closure_reason = `mean improvement ${primary.mean_improvement_bps?.toFixed(4)} bps is not distinguishable from zero at t=3, which needs ${primary.detectable_bps?.toFixed(4)}`;
  } else if (primary.mean_improvement_bps <= 0) {
    out.verdict = 'GATE_HARMS_ENTRY';
    out.closure_reason = `waiting on a veto makes the entry WORSE by ${(-primary.mean_improvement_bps).toFixed(4)} bps; the policy is refuted in the direction declared`;
  } else if (!beatsControl) {
    out.verdict = 'CREDIT_BELONGS_TO_WAITING';
    out.closure_reason = `the improvement of ${primary.mean_improvement_bps?.toFixed(4)} bps does not beat a random wait at the same rate (${primary.control_mean_bps?.toFixed(4)}); the gain is from delay, not from the predicate`;
  } else {
    out.verdict = 'GATE_IMPROVES_ENTRY';
    out.closure_reason = null;
  }

  out.prior_check = {
    expected_bps: FROZEN.prior_expectation_bps_per_intent,
    measured_bps: primary.mean_improvement_bps,
    standard_errors_from_prior: primary.se_bps
      ? (primary.mean_improvement_bps - FROZEN.prior_expectation_bps_per_intent) / primary.se_bps : null,
  };
  return out;
}

export function toCsv(r) {
  const header = 'cap_snapshots,symbols,n,mean_improvement_bps,se_bps,t_stat,detectable_bps,wait_rate_pct,mean_improvement_on_waited_bps,mean_wait_ms,forced_pct,share_improved_pct,control_mean_bps';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(5) : v);
  const lines = [];
  for (const k of Object.keys(r.by_cap ?? {})) {
    const a = r.by_cap[k];
    lines.push([a.cap, a.symbols ?? 0, a.n, c(a.mean_improvement_bps), c(a.se_bps), c(a.t_stat),
      c(a.detectable_bps), c(a.wait_rate_pct), c(a.mean_improvement_on_waited_bps),
      c(a.mean_wait_ms), c(a.forced_pct), c(a.share_improved_pct), c(a.control_mean_bps)].join(','));
  }
  if (!lines.length) lines.push('NO_RUN,0,0,,,,,,,,,,');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `execution_gateway.mjs — paired entry measurement under a VETO=WAIT policy

Usage:
  node scripts/analysis/execution_gateway.mjs --data <dir> [--out <base>]

  --data <dir>  Directory with <SYMBOL>.guard.txt and <SYMBOL>.ticks.txt
  --out <base>  Write <base>.json and <base>.csv (nothing is written without it)

Both runs take the same intent; the guarded one takes it later. The cost floor cancels in the
paired difference and is reported for the audit line only.`;

export function parseArgs(argv) {
  const opts = { data: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--data') opts.data = next();
    else if (arg === '--out') opts.out = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

export function loadData(dir) {
  const root = resolve(dir);
  if (!existsSync(root)) throw new Error(`directory not found: ${root}`);
  const out = {};
  for (const f of readdirSync(root)) {
    const g = /^([A-Z0-9]+)\.guard\.txt$/.exec(f);
    if (g) { out[g[1]] ??= {}; out[g[1]].snapshots = parseGuardFile(readFileSync(join(root, f), 'utf8')); }
    const t = /^([A-Z0-9]+)\.ticks\.(txt|jsonl)$/.exec(f);
    if (t) { out[t[1]] ??= {}; out[t[1]].ticks = parseTickFile(readFileSync(join(root, f), 'utf8')); }
  }
  for (const [k, v] of Object.entries(out)) {
    if (!v.snapshots?.length || !v.ticks?.length) delete out[k];
  }
  return out;
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help || !opts.data) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = runGateway(loadData(opts.data));
  const slim = { ...r, by_cap: Object.fromEntries(Object.entries(r.by_cap).map(([k, v]) => [k, { ...v, per_symbol: undefined }])) };
  delete slim.primary;
  process.stdout.write(`${JSON.stringify(slim, null, 2)}\n`);

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
