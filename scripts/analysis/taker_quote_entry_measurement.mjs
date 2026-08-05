// taker_quote_entry_measurement.mjs
//
// WHAT THIS TESTS, AND WHY IT COULD DESTROY THE GATEWAY RESULT
//
// execution_gateway.mjs measures entry improvement in TRADE PRINTS: it asks what price
// printed near T0 versus near the resolved snapshot. A taker does not pay the print. A
// taker buying pays the ASK and a taker selling receives the BID, and those move for
// reasons the print does not see -- above all the spread.
//
// The spread in this universe is around 1 bp. The measured gateway effect is 0.059 bps.
// The spread is roughly SEVENTEEN TIMES the effect. If waiting until the guard clears
// systematically lands the order in a wider spread -- entirely plausible, since a
// thinning book and aggressive flow are exactly when market makers widen -- then the
// print-based gain is real and the taker-based gain is negative. The published number
// would be an artefact of measuring the wrong price.
//
// This measures the same policy on the quote a taker actually pays, on the same archive.
//
// PRE-REGISTERED EXPECTATION, recorded before the first run:
//   The taker figure is LOWER than the print figure. The states the guard vetoes are
//   states of liquidity withdrawal, and withdrawal widens the quote, so waiting should
//   pay some of the gain back as spread. Central guess: taker improvement lands between
//   0.00 and 0.04 bps, i.e. between total erasure and two-thirds retention.
//   A taker figure at or above the print figure would falsify this reasoning and would
//   need its own explanation rather than a celebration.
//
// DECISION RULE, fixed in advance:
//   taker mean > 0 resolvable at t=3  -> TAKER_GAIN_SURVIVES
//   taker mean <= 0 resolvable at t=3 -> TAKER_GAIN_ERASED_BY_SPREAD
//   otherwise                         -> UNRESOLVED
//
// Read-only. Writes only to --out.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { guardState } from './ah047_execution_policy_guard.mjs';
import { parseGuardFile } from './g3_guard_execution_harness.mjs';
import { resolveWait, FROZEN as GATEWAY_FROZEN } from './execution_gateway.mjs';

export const FROZEN = Object.freeze({
  module: 'TAKER_QUOTE_ENTRY_MEASUREMENT',
  wait_cap_snapshots: GATEWAY_FROZEN.wait_cap_snapshots,
  // A wait is bounded in TIME as well as in snapshot count. The gateway counts snapshots
  // only, which across a tape gap could stretch a "30 second" wait far past 30 seconds.
  // This is measured and reported rather than assumed away.
  wait_cap_ms: 30_000,
  prior_expectation_bps: 0.02,
  prior_range_bps: Object.freeze([0.0, 0.04]),
  prior_basis: 'vetoed states are liquidity withdrawal, which widens the quote, so waiting pays part of the print gain back as spread',
});

// The price a taker actually gets, on the quote, at a given snapshot.
export function takerPrice(snapshot, direction) {
  if (!snapshot) return null;
  const px = direction === 'LONG' ? snapshot.ask : snapshot.bid;
  return px > 0 ? px : null;
}

// Positive means the guarded branch got the BETTER taker price.
export function takerImprovementBps(direction, baselinePx, guardedPx) {
  if (!(baselinePx > 0) || !(guardedPx > 0)) return null;
  const raw = 1e4 * ((baselinePx - guardedPx) / baselinePx);
  return direction === 'LONG' ? raw : -raw;
}

export function spreadBps(snapshot) {
  if (!snapshot || !(snapshot.bid > 0) || !(snapshot.ask > 0)) return null;
  const mid = (snapshot.bid + snapshot.ask) / 2;
  return mid > 0 ? (1e4 * (snapshot.ask - snapshot.bid)) / mid : null;
}

export function runSymbol(snapshots, cap = FROZEN.wait_cap_snapshots) {
  const acc = {
    n: 0, sum: 0, sumSq: 0,
    waited: 0, forced: 0, overCapMs: 0,
    spreadAtEntry: 0, spreadAtExit: 0, spreadPairs: 0,
    waitMs: 0,
    rejects: new Map(),
  };
  const rej = (r) => acc.rejects.set(r, (acc.rejects.get(r) ?? 0) + 1);

  for (let i = 0; i < snapshots.length; i += 1) {
    for (const direction of ['LONG', 'SHORT']) {
      const s0 = snapshots[i];
      const base = takerPrice(s0, direction);
      if (base == null) { rej('NO_BASELINE_QUOTE'); continue; }

      if (guardState(s0, direction) === 'ALLOW') {
        // Both branches take the same quote at the same instant: exactly zero. Counted,
        // never dropped, or the mean would be over a set that is not the intent stream.
        acc.n += 1;
        continue;
      }

      const res = resolveWait(snapshots, i, direction, cap);
      if (res.index == null) { rej('RAN_OUT_OF_ARCHIVE'); continue; }

      const s1 = snapshots[res.index];
      const guarded = takerPrice(s1, direction);
      if (guarded == null) { rej('NO_GUARDED_QUOTE'); continue; }

      const imp = takerImprovementBps(direction, base, guarded);
      if (imp == null) { rej('BAD_QUOTE'); continue; }

      const dt = s1.ts - s0.ts;
      acc.n += 1;
      acc.sum += imp;
      acc.sumSq += imp * imp;
      acc.waited += 1;
      acc.waitMs += dt;
      if (res.forced) acc.forced += 1;
      if (dt > FROZEN.wait_cap_ms) acc.overCapMs += 1;

      const e0 = spreadBps(s0);
      const e1 = spreadBps(s1);
      if (e0 != null && e1 != null) {
        acc.spreadAtEntry += e0;
        acc.spreadAtExit += e1;
        acc.spreadPairs += 1;
      }
    }
  }

  if (acc.n < 2) return { n: acc.n, mean_bps: null, se_bps: null, t_stat: null, rejects: acc.rejects };
  const mean = acc.sum / acc.n;
  const varr = Math.max(0, (acc.sumSq - acc.n * mean * mean) / (acc.n - 1));
  const se = Math.sqrt(varr / acc.n);
  return {
    n: acc.n,
    mean_bps: mean,
    se_bps: se,
    t_stat: se > 0 ? mean / se : null,
    wait_rate_pct: (100 * acc.waited) / acc.n,
    forced_pct: (100 * acc.forced) / acc.n,
    mean_wait_ms: acc.waited ? acc.waitMs / acc.waited : 0,
    waits_over_30s: acc.overCapMs,
    waits_over_30s_pct: acc.waited ? (100 * acc.overCapMs) / acc.waited : 0,
    mean_spread_at_veto_bps: acc.spreadPairs ? acc.spreadAtEntry / acc.spreadPairs : null,
    mean_spread_at_fill_bps: acc.spreadPairs ? acc.spreadAtExit / acc.spreadPairs : null,
    rejects: acc.rejects,
  };
}

// ---------------------------------------------------------------------------
// The control that decides what the guard's taker gain MEANS
// ---------------------------------------------------------------------------
//
// The guard's random-wait control answered "is waiting itself worth anything?" and the
// answer was no. It did NOT answer "is the flow-and-depth predicate worth anything over
// a cruder state rule?" -- because a random control is unconditional and any market-state
// rule beats it.
//
// This control waits on the SPREAD alone: it triggers when the spread widened against the
// previous snapshot, and clears when the spread comes back to or below where it started.
// Flow and depth are never read. If this captures most of the guard's taker gain, then on
// the entry-price application the predicate is a spread rule in microstructure clothing.

export function spreadControlSymbol(snapshots, cap = FROZEN.wait_cap_snapshots) {
  let n = 0; let sum = 0; let sumSq = 0; let waited = 0;
  for (let i = 0; i < snapshots.length; i += 1) {
    for (const direction of ['LONG', 'SHORT']) {
      const s0 = snapshots[i];
      const sp0 = spreadBps(s0);
      const base = takerPrice(s0, direction);
      if (sp0 == null || base == null) continue;

      const prev = i > 0 ? spreadBps(snapshots[i - 1]) : null;
      if (!(prev != null && sp0 > prev)) { n += 1; continue; } // not widened: execute now, zero

      let j = null;
      for (let k = 1; k <= cap; k += 1) {
        const q = i + k;
        if (q >= snapshots.length) { j = null; break; }
        const spq = spreadBps(snapshots[q]);
        if (spq != null && spq <= sp0) { j = q; break; }
        if (k === cap) j = q;
      }
      if (j == null) continue; // ran out of tape: rejected, never clamped

      const guarded = takerPrice(snapshots[j], direction);
      if (guarded == null) continue;
      const imp = takerImprovementBps(direction, base, guarded);
      if (imp == null) continue;

      n += 1; sum += imp; sumSq += imp * imp; waited += 1;
    }
  }
  if (n < 2) return { n, mean_bps: null, se_bps: null, t_stat: null };
  const mean = sum / n;
  const varr = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
  const se = Math.sqrt(varr / n);
  return { n, mean_bps: mean, se_bps: se, t_stat: se > 0 ? mean / se : null, wait_rate_pct: (100 * waited) / n };
}

// Is the guard distinguishable from the spread control at all?
export function guardVsControl(guard, control) {
  if (guard?.mean_bps == null || control?.mean_bps == null) return { t: null, verdict: 'UNRESOLVED' };
  const diff = guard.mean_bps - control.mean_bps;
  const se = Math.hypot(guard.se_bps, control.se_bps);
  const t = se > 0 ? diff / se : null;
  return {
    difference_bps: diff,
    se_bps: se,
    t,
    control_share_of_guard: control.mean_bps / guard.mean_bps,
    verdict: t == null ? 'UNRESOLVED'
      : Math.abs(t) >= 3 ? 'PREDICATE_ADDS_OVER_SPREAD_RULE'
        : 'PREDICATE_INDISTINGUISHABLE_FROM_SPREAD_RULE',
  };
}

export function pool(perSymbol) {
  let n = 0; let sum = 0; let sumSq = 0;
  for (const s of perSymbol) {
    if (!s || !(s.n > 1) || s.mean_bps == null) continue;
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

export function verdict(pooled) {
  if (pooled.mean_bps == null || pooled.t_stat == null) return 'UNRESOLVED';
  if (Math.abs(pooled.t_stat) < 3) return 'UNRESOLVED';
  return pooled.mean_bps > 0 ? 'TAKER_GAIN_SURVIVES' : 'TAKER_GAIN_ERASED_BY_SPREAD';
}

export function loadSnapshots(root) {
  const out = {};
  for (const f of readdirSync(root)) {
    const g = /^(.+)\.guard\.txt$/.exec(f);
    if (g) out[g[1]] = parseGuardFile(readFileSync(join(root, f), 'utf8'));
  }
  return out;
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (a === '--data') o.data = next();
    else if (a === '--out') o.out = next();
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.data) {
    process.stdout.write('usage: node taker_quote_entry_measurement.mjs --data <dir> [--out <base>]\n');
    return opts.help ? 0 : 1;
  }

  const data = loadSnapshots(opts.data);
  const symbols = Object.keys(data).filter((s) => data[s].length).sort();
  const per = symbols.map((s) => ({ symbol: s, ...runSymbol(data[s]) }));
  const pooled = pool(per);
  const perControl = symbols.map((s) => ({ symbol: s, ...spreadControlSymbol(data[s]) }));
  const pooledControl = pool(perControl);
  const comparison = guardVsControl(pooled, pooledControl);

  const totalOver = per.reduce((a, s) => a + (s.waits_over_30s ?? 0), 0);
  const report = {
    module: FROZEN.module,
    frozen: FROZEN,
    symbols: symbols.length,
    pooled,
    spread_only_control: pooledControl,
    guard_vs_spread_control: comparison,
    verdict: verdict(pooled),
    prior_check: {
      expected_bps: FROZEN.prior_expectation_bps,
      expected_range_bps: FROZEN.prior_range_bps,
      measured_bps: pooled.mean_bps,
      inside_prior_range: pooled.mean_bps != null
        && pooled.mean_bps >= FROZEN.prior_range_bps[0]
        && pooled.mean_bps <= FROZEN.prior_range_bps[1],
    },
    wait_time_bound_check: {
      cap_ms: FROZEN.wait_cap_ms,
      waits_exceeding_cap: totalOver,
      note: 'the gateway counts snapshots, not milliseconds; this reports how often that differs',
    },
    per_symbol: per.map((s) => ({ ...s, rejects: Object.fromEntries(s.rejects ?? []) })),
  };

  if (opts.out) {
    writeFileSync(`${opts.out}.json`, `${JSON.stringify(report, null, 1)}\n`);
    const rows = ['symbol,n,mean_bps,se_bps,t_stat,wait_rate_pct,mean_spread_at_veto_bps,mean_spread_at_fill_bps'];
    for (const s of per) {
      rows.push([s.symbol, s.n, s.mean_bps, s.se_bps, s.t_stat, s.wait_rate_pct,
        s.mean_spread_at_veto_bps, s.mean_spread_at_fill_bps].join(','));
    }
    writeFileSync(`${opts.out}.csv`, `${rows.join('\n')}\n`);
    process.stdout.write(`wrote ${opts.out}.json and ${opts.out}.csv\n`);
  }

  process.stdout.write(`${JSON.stringify({ ...report, per_symbol: undefined }, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
