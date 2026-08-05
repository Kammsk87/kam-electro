// live_feed_staleness_simulation.mjs
//
// WHAT THIS ANSWERS
//
// execution_gateway.mjs measures +0.0591 bps per intent under an assumption it never
// states: that the intent arrives EXACTLY at a book snapshot. In the archive it always
// does, because the intent stream is generated at the snapshots.
//
// A live system does not get that. ob_recorder.mjs polls the book on a 10,000 ms cycle,
// so an intent arriving at an arbitrary moment sees a book that is stale by u, uniform
// on [0, 10s), mean 5s. The guard decision is made on that stale book, while the
// baseline it is being compared against executes at the CURRENT price.
//
// LAW.EXEC.STALENESS already measured that 54 percent of the guard's separation is gone
// by five seconds. If that decay carries over, the live figure is roughly half the
// archive figure -- and the difference would be an artefact of the feed, not of the law.
//
// This measures it directly, on the same archive, with no live service and no new data.
//
// PRE-REGISTERED EXPECTATION, recorded before the first run:
//   mean over u ~ U(0, 10s) lands near 0.027 bps, i.e. about 46 percent of the aligned
//   0.0591. Derived by carrying the measured staleness retention at the mean offset of
//   5s straight across. That carry-over is itself an assumption being tested: the
//   staleness law was measured on 60s forward separation, not on entry-price
//   improvement, and the two need not decay at the same rate.
//
// WHAT MOVES AND WHAT DOES NOT, as u grows:
//   - the guard decision is read from snapshot i, which is now u milliseconds old
//   - the BASELINE executes at price(T_i + u), i.e. later, and therefore closer to the
//     price the guarded branch will get
//   - the GUARDED branch is unchanged: it still resolves to snapshot i+1, i+2 or i+3
// Both effects push the measured improvement down, and at u = 10s the baseline executes
// at almost exactly the moment the first wait candidate fires, so the cap-1 component
// should collapse. That collapse is the internal check that the simulation is wired
// correctly.
//
// Read-only. Reads the files named on the command line and writes only to --out.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { guardState } from './ah047_execution_policy_guard.mjs';
import { makePriceSource, parseGuardFile, parseTickFile } from './g3_guard_execution_harness.mjs';
import { resolveWait, improvementBps, FROZEN as GATEWAY_FROZEN } from './execution_gateway.mjs';

export const FROZEN = Object.freeze({
  module: 'LIVE_FEED_STALENESS_SIMULATION',
  // The offsets simulated. 0 reproduces the aligned gateway run and is the control:
  // if offset 0 does not return the published 0.0591, the harness is wrong, not the law.
  offsets_ms: Object.freeze([0, 2_500, 5_000, 7_500, 9_900]),
  // The recorder's actual cycle, measured: median inter-snapshot gap 10,000 ms.
  poll_cycle_ms: 10_000,
  // A live intent arrives uniformly in the cycle, so the live figure is the mean over
  // offsets. Reported separately from the per-offset curve so neither hides the other.
  live_estimator: 'MEAN_OVER_UNIFORM_OFFSETS',
  wait_cap_snapshots: GATEWAY_FROZEN.wait_cap_snapshots,
  max_price_age_ms: 30_000,
  prior_expectation_bps: 0.027,
  prior_basis: 'aligned 0.0591 x 46 percent staleness retention at the 5s mean offset',
});

// ---------------------------------------------------------------------------
// One intent, at a stated offset after its snapshot
// ---------------------------------------------------------------------------

export function simulateIntent(snapshots, prices, i, direction, offsetMs, cap) {
  const snap = snapshots[i];
  if (!snap) return { status: 'NO_SNAPSHOT' };

  // The book the live system would hold: snapshot i, already offsetMs old.
  const decision = guardState(snap, direction);

  // Baseline executes NOW, at the moment the intent arrived.
  const wantBaseline = snap.ts + offsetMs;
  const baseTick = prices.at(wantBaseline);
  if (!baseTick) return { status: 'NO_BASELINE_PRICE' };
  if (baseTick.ts - wantBaseline > FROZEN.max_price_age_ms) return { status: 'BASELINE_STALE' };

  if (decision === 'ALLOW') {
    // Both branches execute at the same instant. Paired difference is exactly zero;
    // it is counted, not dropped, because dropping it would inflate the mean over a
    // set that no longer matches the intent stream.
    return { status: 'OK', waited: 0, forced: false, improvement_bps: 0, allowed: true };
  }

  const res = resolveWait(snapshots, i, direction, cap);
  if (res.index == null) return { status: 'RAN_OUT_OF_ARCHIVE' };

  const target = snapshots[res.index];
  // The guarded branch executes when the state clears, which is a snapshot boundary.
  // If that boundary is already behind the baseline's execution moment the wait bought
  // nothing and the intent is simply not improvable; it still counts, at zero.
  if (target.ts <= wantBaseline) {
    return { status: 'OK', waited: res.waited, forced: res.forced, improvement_bps: 0, allowed: false };
  }

  const guardTick = prices.at(target.ts);
  if (!guardTick) return { status: 'NO_GUARDED_PRICE' };
  if (guardTick.ts - target.ts > FROZEN.max_price_age_ms) return { status: 'GUARDED_STALE' };

  const imp = improvementBps(direction, baseTick.px, guardTick.px);
  if (imp == null) return { status: 'BAD_PRICE' };

  return { status: 'OK', waited: res.waited, forced: res.forced, improvement_bps: imp, allowed: false };
}

// ---------------------------------------------------------------------------
// One symbol, one offset
// ---------------------------------------------------------------------------

export function runOffset(snapshots, prices, offsetMs, cap) {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  let waited = 0;
  const rejects = new Map();

  for (let i = 0; i < snapshots.length; i += 1) {
    for (const direction of ['LONG', 'SHORT']) {
      const r = simulateIntent(snapshots, prices, i, direction, offsetMs, cap);
      if (r.status !== 'OK') {
        rejects.set(r.status, (rejects.get(r.status) ?? 0) + 1);
        continue;
      }
      n += 1;
      sum += r.improvement_bps;
      sumSq += r.improvement_bps * r.improvement_bps;
      if (!r.allowed) waited += 1;
    }
  }

  if (n < 2) return { n, mean_bps: null, se_bps: null, t_stat: null, wait_rate_pct: null, rejects };
  const mean = sum / n;
  const varr = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
  const se = Math.sqrt(varr / n);
  return {
    n,
    mean_bps: mean,
    se_bps: se,
    t_stat: se > 0 ? mean / se : null,
    wait_rate_pct: (100 * waited) / n,
    rejects,
  };
}

// ---------------------------------------------------------------------------
// Pooling across symbols: variance-correct, not a mean of means
// ---------------------------------------------------------------------------

export function pool(perSymbol) {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (const s of perSymbol) {
    if (!s || !(s.n > 1) || s.mean_bps == null) continue;
    // Reconstruct the symbol's sums from its reported moments so the pooled variance is
    // the variance of the intents, not the variance of the symbol means.
    const varr = s.se_bps * s.se_bps * s.n;
    n += s.n;
    sum += s.mean_bps * s.n;
    sumSq += varr * (s.n - 1) + s.n * s.mean_bps * s.mean_bps;
  }
  if (n < 2) return { n, mean_bps: null, se_bps: null, t_stat: null };
  const mean = sum / n;
  const varr = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
  const se = Math.sqrt(varr / n);
  return { n, mean_bps: mean, se_bps: se, t_stat: se > 0 ? mean / se : null };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadSymbols(root) {
  const out = {};
  for (const f of readdirSync(root)) {
    const g = /^(.+)\.guard\.txt$/.exec(f);
    if (g) { out[g[1]] ??= {}; out[g[1]].snapshots = parseGuardFile(readFileSync(join(root, f), 'utf8')); }
    const t = /^(.+)\.ticks\.txt$/.exec(f);
    if (t) { out[t[1]] ??= {}; out[t[1]].ticks = parseTickFile(readFileSync(join(root, f), 'utf8')); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (a === '--data') opts.data = next();
    else if (a === '--out') opts.out = next();
    else if (a === '-h' || a === '--help') opts.help = true;
  }
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.data) {
    process.stdout.write('usage: node live_feed_staleness_simulation.mjs --data <dir> [--out <base>]\n');
    return opts.help ? 0 : 1;
  }

  const data = loadSymbols(opts.data);
  const symbols = Object.keys(data).filter((s) => data[s].snapshots?.length && data[s].ticks?.length).sort();

  const byOffset = {};
  for (const offset of FROZEN.offsets_ms) {
    const per = [];
    for (const sym of symbols) {
      const prices = makePriceSource(data[sym].ticks);
      const r = runOffset(data[sym].snapshots, prices, offset, FROZEN.wait_cap_snapshots);
      per.push({ symbol: sym, ...r, rejects: Object.fromEntries(r.rejects) });
    }
    byOffset[offset] = { offset_ms: offset, ...pool(per), per_symbol: per };
  }

  const aligned = byOffset[0];
  const offs = FROZEN.offsets_ms.map((o) => byOffset[o]).filter((x) => x.mean_bps != null);
  const live = offs.reduce((s, x) => s + x.mean_bps, 0) / (offs.length || 1);
  const retention = aligned?.mean_bps ? live / aligned.mean_bps : null;

  const report = {
    module: FROZEN.module,
    frozen: FROZEN,
    symbols: symbols.length,
    by_offset: byOffset,
    live_estimate_bps: live,
    aligned_bps: aligned?.mean_bps ?? null,
    retention_vs_aligned: retention,
    prior_check: {
      expected_bps: FROZEN.prior_expectation_bps,
      measured_bps: live,
      standard_errors_from_prior: aligned?.se_bps ? (live - FROZEN.prior_expectation_bps) / aligned.se_bps : null,
    },
  };

  if (opts.out) {
    writeFileSync(`${opts.out}.json`, `${JSON.stringify(report, null, 1)}\n`);
    const rows = ['offset_ms,n,mean_bps,se_bps,t_stat,wait_rate_pct'];
    for (const o of FROZEN.offsets_ms) {
      const b = byOffset[o];
      rows.push([o, b.n, b.mean_bps, b.se_bps, b.t_stat, byOffset[o].per_symbol[0]?.wait_rate_pct].join(','));
    }
    writeFileSync(`${opts.out}.csv`, `${rows.join('\n')}\n`);
    process.stdout.write(`wrote ${opts.out}.json and ${opts.out}.csv\n`);
  }

  const slim = { ...report, by_offset: Object.fromEntries(Object.entries(byOffset).map(([k, v]) => [k, { ...v, per_symbol: undefined }])) };
  process.stdout.write(`${JSON.stringify(slim, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
