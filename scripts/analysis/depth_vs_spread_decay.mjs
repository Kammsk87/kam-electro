// depth_vs_spread_decay.mjs — HYP.EXEC.DEPTH_VS_SPREAD_DECAY
//
// THE CONTRADICTION THIS RESOLVES
//
// LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE says agreement between aggressive flow and
// depth change predicts a +0.715 bps adverse move over 60 seconds. But the taker-quote
// measurement found that on ENTRY PRICE a two-line relative-spread rule captures 97.3
// percent of the same guard, with the difference at t=0.49.
//
// Both cannot be the whole story. Either the depth feed is redundant, or its value lives at
// a horizon the entry-price measurement never looked at.
//
// ============================ PRE-REGISTERED, BEFORE ANY RUN ==================
//
// PREDICATES
//   A = guardState, the frozen AH-047 predicate: aggressive flow against the intent AND
//       the depth the intent relies on falling.
//   B = relative spread alone: VETO iff spread_t > spread_{t-1}. Never reads flow or depth.
//
// THE MEASURED QUANTITY IS FORWARD SEPARATION, NOT ENTRY PRICE
//   separation_P(tau) = mean(move over tau | P says ALLOW) - mean(move over tau | P says VETO),
//   with the move signed so positive is favourable to the intended direction. This is the
//   law's own quantity. The operator's grid included tau = 0, which is degenerate here --
//   a forward move over zero seconds is identically zero -- so tau = 0 is reported instead
//   as the ENTRY-PRICE improvement, which is a different quantity and is labelled as one.
//
// PRE-REGISTERED PREDICTION, with a crossover:
//   at tau = 5-10s   B is indistinguishable from A, difference resolving at t < 1.0
//   at tau = 30-60s  A beats B, difference resolving at t > 3.0
//   Mechanism claimed: the spread reverts within 5-10 seconds while the depth imbalance
//   keeps pushing. That claim is itself measured here as the spread's reversion time, so
//   the mechanism is not merely asserted alongside the result.
//
// WHAT WOULD FALSIFY IT: A never separating from B at any horizon would mean the depth feed
//   is redundant for this law's stated purpose, not only for entry timing, and the law's
//   exploitability_class would need revisiting.
// =============================================================================
//
// Read-only. Writes only to --out.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { guardState } from './ah047_execution_policy_guard.mjs';
import { makePriceSource, parseGuardFile, parseTickFile } from './g3_guard_execution_harness.mjs';

export const FROZEN = Object.freeze({
  module: 'DEPTH_VS_SPREAD_DECAY',
  hypothesis_id: 'HYP.EXEC.DEPTH_VS_SPREAD_DECAY',
  horizons_s: Object.freeze([5, 10, 30, 60]),
  max_price_age_ms: 5_000,
  resolve_at_t: 3,
  indistinguishable_below_t: 1.0,
  predicted_short_horizon: 'B_MATCHES_A',
  predicted_long_horizon: 'A_BEATS_B',
});

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

export function spreadBps(s) {
  if (!s || !(s.bid > 0) || !(s.ask > 0)) return null;
  const mid = (s.bid + s.ask) / 2;
  return mid > 0 ? (1e4 * (s.ask - s.bid)) / mid : null;
}

// B never reads flow or depth. A test asserts that against the source.
export function spreadPredicate(snapshots, i) {
  if (i < 1) return null;
  const now = spreadBps(snapshots[i]);
  const prev = spreadBps(snapshots[i - 1]);
  if (now == null || prev == null) return null;
  return now > prev ? 'VETO' : 'ALLOW';
}

// Positive is favourable to the intended direction.
export function signedMoveBps(direction, pxStart, pxEnd) {
  if (!(pxStart > 0) || !(pxEnd > 0)) return null;
  const raw = 1e4 * ((pxEnd - pxStart) / pxStart);
  return direction === 'LONG' ? raw : -raw;
}

// ---------------------------------------------------------------------------
// Accumulation
// ---------------------------------------------------------------------------

const emptyAcc = () => ({ allow: { n: 0, s: 0, ss: 0 }, veto: { n: 0, s: 0, ss: 0 } });
const push = (b, x) => { b.n += 1; b.s += x; b.ss += x * x; };

export function moments(b) {
  if (b.n < 2) return { n: b.n, mean: null, se: null };
  const mean = b.s / b.n;
  const varr = Math.max(0, (b.ss - b.n * mean * mean) / (b.n - 1));
  return { n: b.n, mean, se: Math.sqrt(varr / b.n) };
}

export function separation(acc) {
  const a = moments(acc.allow);
  const v = moments(acc.veto);
  if (a.mean == null || v.mean == null) return { separation_bps: null, se_bps: null, t: null, allow: a, veto: v };
  const d = a.mean - v.mean;
  const se = Math.hypot(a.se, v.se);
  return { separation_bps: d, se_bps: se, t: se > 0 ? d / se : null, allow: a, veto: v };
}

// The two predicates are evaluated on the SAME states, so their separations are correlated
// and a naive difference-of-independent-SEs overstates the error. The difference is
// therefore accumulated per observation rather than reconstructed from the two aggregates.
export function compareAccumulated(diffAcc) {
  const m = moments(diffAcc);
  return { difference_bps: m.mean, se_bps: m.se, t: m.se > 0 ? m.mean / m.se : null, n: m.n };
}

export function runSymbol(snapshots, prices) {
  const accA = {}; const accB = {}; const diff = {};
  for (const h of FROZEN.horizons_s) { accA[h] = emptyAcc(); accB[h] = emptyAcc(); diff[h] = { n: 0, s: 0, ss: 0 }; }

  // Mechanism check: how long does a widened spread stay widened?
  let widenEvents = 0; let widenDurationSum = 0; const widenDurations = [];

  for (let i = 1; i < snapshots.length; i += 1) {
    const s0 = snapshots[i];
    const sp0 = spreadBps(s0);
    const spPrev = spreadBps(snapshots[i - 1]);
    if (sp0 != null && spPrev != null && sp0 > spPrev) {
      // Count snapshots until the spread returns to or below where it was before widening.
      let k = i + 1;
      while (k < snapshots.length && k - i <= 12) {
        const spk = spreadBps(snapshots[k]);
        if (spk != null && spk <= spPrev) break;
        k += 1;
      }
      if (k < snapshots.length) {
        widenEvents += 1;
        const d = snapshots[k].ts - s0.ts;
        widenDurationSum += d;
        if (widenDurations.length < 200_000) widenDurations.push(d);
      }
    }

    const bState = spreadPredicate(snapshots, i);
    if (!bState) continue;
    const base = prices.at(s0.ts);
    if (!base || Math.abs(base.ts - s0.ts) > FROZEN.max_price_age_ms) continue;

    for (const direction of ['LONG', 'SHORT']) {
      const aState = guardState(s0, direction);
      for (const h of FROZEN.horizons_s) {
        const want = s0.ts + h * 1000;
        const fwd = prices.at(want);
        if (!fwd || fwd.ts - want > FROZEN.max_price_age_ms) continue;
        const mv = signedMoveBps(direction, base.px, fwd.px);
        if (mv == null) continue;
        push(aState === 'ALLOW' ? accA[h].allow : accA[h].veto, mv);
        push(bState === 'ALLOW' ? accB[h].allow : accB[h].veto, mv);
        // Per-observation contribution to (A separation - B separation): an observation
        // adds +mv to A's separation if A allows and -mv if A vetoes, and the mirror for B.
        const contribA = aState === 'ALLOW' ? mv : -mv;
        const contribB = bState === 'ALLOW' ? mv : -mv;
        push(diff[h], contribA - contribB);
      }
    }
  }

  widenDurations.sort((a, b) => a - b);
  return {
    by_horizon: Object.fromEntries(FROZEN.horizons_s.map((h) => [h, {
      A: separation(accA[h]),
      B: separation(accB[h]),
      difference: compareAccumulated(diff[h]),
    }])),
    spread_reversion: {
      events: widenEvents,
      mean_ms: widenEvents ? widenDurationSum / widenEvents : null,
      median_ms: widenDurations.length ? widenDurations[Math.floor(widenDurations.length / 2)] : null,
      p90_ms: widenDurations.length ? widenDurations[Math.floor(0.9 * (widenDurations.length - 1))] : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Pooling and verdict
// ---------------------------------------------------------------------------

export function poolDiff(perSymbol, horizon) {
  let n = 0; let s = 0; let ss = 0;
  for (const p of perSymbol) {
    const d = p.by_horizon?.[horizon]?.difference;
    if (!d || d.n < 2 || d.difference_bps == null) continue;
    const varr = d.se_bps * d.se_bps * d.n;
    n += d.n; s += d.difference_bps * d.n;
    ss += varr * (d.n - 1) + d.n * d.difference_bps * d.difference_bps;
  }
  if (n < 2) return { n, difference_bps: null, se_bps: null, t: null };
  const mean = s / n;
  const varr = Math.max(0, (ss - n * mean * mean) / (n - 1));
  const se = Math.sqrt(varr / n);
  return { n, difference_bps: mean, se_bps: se, t: se > 0 ? mean / se : null };
}

export function verdict(byHorizon) {
  const short = [5, 10].map((h) => byHorizon[h]?.t).filter((x) => x != null);
  const long = [30, 60].map((h) => byHorizon[h]?.t).filter((x) => x != null);
  if (!short.length || !long.length) return 'UNRESOLVED';
  const shortMatches = short.every((t) => Math.abs(t) < FROZEN.indistinguishable_below_t);
  const longSeparates = long.some((t) => t > FROZEN.resolve_at_t);
  const longFavoursB = long.some((t) => t < -FROZEN.resolve_at_t);
  if (shortMatches && longSeparates) return 'AS_PREDICTED_DEPTH_EARNS_ITS_KEEP_AT_LONG_HORIZON';
  if (longSeparates) return 'DEPTH_BEATS_SPREAD_BUT_NOT_ONLY_AT_LONG_HORIZON';
  if (longFavoursB) return 'SPREAD_BEATS_DEPTH';
  return 'DEPTH_FEED_REDUNDANT_AT_EVERY_HORIZON';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

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
    process.stdout.write('usage: --data <dir> [--out <base>]\n');
    return opts.help ? 0 : 1;
  }
  const data = {};
  for (const f of readdirSync(opts.data)) {
    const g = /^(.+)\.guard\.txt$/.exec(f);
    if (g) { data[g[1]] ??= {}; data[g[1]].snapshots = parseGuardFile(readFileSync(join(opts.data, f), 'utf8')); }
    const t = /^(.+)\.ticks\.txt$/.exec(f);
    if (t) { data[t[1]] ??= {}; data[t[1]].ticks = parseTickFile(readFileSync(join(opts.data, f), 'utf8')); }
  }
  const symbols = Object.keys(data).filter((s) => data[s].snapshots?.length && data[s].ticks?.length).sort();
  const per = symbols.map((s) => ({ symbol: s, ...runSymbol(data[s].snapshots, makePriceSource(data[s].ticks)) }));

  const pooled = {};
  for (const h of FROZEN.horizons_s) pooled[h] = poolDiff(per, h);

  let revEvents = 0; let revSum = 0;
  for (const p of per) {
    if (p.spread_reversion?.mean_ms != null) { revEvents += p.spread_reversion.events; revSum += p.spread_reversion.mean_ms * p.spread_reversion.events; }
  }

  const report = {
    module: FROZEN.module,
    frozen: FROZEN,
    symbols: symbols.length,
    pooled_difference_A_minus_B: pooled,
    spread_reversion_pooled: { events: revEvents, mean_ms: revEvents ? revSum / revEvents : null },
    verdict: verdict(pooled),
    per_symbol: per,
  };

  if (opts.out) {
    writeFileSync(`${opts.out}.json`, `${JSON.stringify(report, null, 1)}\n`);
    const rows = ['horizon_s,n,A_minus_B_bps,se_bps,t'];
    for (const h of FROZEN.horizons_s) {
      const p = pooled[h];
      rows.push([h, p.n, p.difference_bps, p.se_bps, p.t].join(','));
    }
    writeFileSync(`${opts.out}.csv`, `${rows.join('\n')}\n`);
    process.stdout.write(`wrote ${opts.out}.json and ${opts.out}.csv\n`);
  }
  process.stdout.write(`${JSON.stringify({ ...report, per_symbol: undefined, frozen: undefined }, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
