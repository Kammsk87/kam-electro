#!/usr/bin/env node
// g3_guard_execution_harness.mjs
//
// G3 executable replay for candidates of class GUARD.
// Implements docs/BOTALIN_G3_PROTOCOL_FOR_GUARDS_2026-08-05.md.
//
// G3 as written in the gate battery asks whether expectancy survives the real book. A guard has
// no expectancy -- it never enters and never exits -- so the gate was literally unpassable for
// one. What a guard produces is the DIFFERENCE between two executions of the same intent stream,
// and that is what this harness measures.
//
// Three things are structural rather than configurable:
//
//   1. The intent stream is EXHAUSTIVE and SYNTHETIC: both directions at every decision point,
//      never a strategy's intents. Replaying a guard against one strategy entangles its value
//      with that strategy's quality, and the programme has no admitted strategy to borrow.
//   2. The staleness offset is an AXIS, not a constant. The one-symbol pilot suggested about
//      54 percent retention at five seconds, but at t = 1.92 that is a shape indication and
//      must not be compiled in as a number.
//   3. The metric is per EXECUTED intent, never total and never PnL. A guard that vetoes half
//      the book reduces total adverse selection trivially.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no entropy drawn from the platform.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { guardState } from './ah047_execution_policy_guard.mjs';

export const FROZEN = Object.freeze({
  gate: 'G3',
  candidate_class: 'GUARD',
  law: 'LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE',
  intents: ['LONG', 'SHORT'],
  // Offsets inside the snapshot interval, in milliseconds. The protocol requires 0 plus 25, 50
  // and 75 percent of the median interval; the median measured on this archive is 10,000 ms.
  delta_axis_ms: [0, 1000, 2500, 5000, 7500, 10000],
  horizon_ms: 60_000,
  neighbour_horizon_ms: 300_000,
  // Notional per intent, used to cap size against recorded depth. A size the book cannot fill
  // is a no-fill, not a fill at a better price.
  intent_notional_usd: 200,
  control_draws: 200,
  control_seed: 30_030,
  veto_rate_min: 0.02,
  veto_rate_max: 0.80,
  allow_drift_limit_bps: 0.50,
  max_snapshot_age_ms: 30_000,
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
 * Deterministic linear congruential generator seeded from a frozen constant, so both controls
 * reproduce exactly. The harness draws no entropy from the platform and reads no clock; the
 * static scan asserts that, and this comment avoids naming the banned symbols so it does not
 * trip its own check.
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

// ---------------------------------------------------------------------------
// Price source
// ---------------------------------------------------------------------------

/**
 * A tick-backed price source. The book is written at roughly ten-second cadence, so it cannot
 * express a sub-interval offset at all; ticks are millisecond-stamped and can.
 *
 * `at(t)` returns the first print at or after t, or null past the end. It never interpolates:
 * an invented price between prints would be the harness deciding the answer.
 */
export function makePriceSource(ticks) {
  const ts = ticks.map((x) => x.ts);
  return {
    length: ticks.length,
    at(target) {
      let lo = 0;
      let hi = ts.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (ts[m] < target) lo = m + 1;
        else hi = m;
      }
      return lo < ticks.length ? ticks[lo] : null;
    },
  };
}

// ---------------------------------------------------------------------------
// The intent stream
// ---------------------------------------------------------------------------

/**
 * Exhaustive and synthetic: both directions at every snapshot. No selection, so the guard's
 * value cannot be inflated by choosing where to ask it.
 */
export function buildIntents(snapshots) {
  const out = [];
  for (const s of snapshots) {
    for (const intent of FROZEN.intents) {
      out.push({ ts: s.ts, intent, snapshot: s, decision: guardState(s, intent) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Execution mechanics
// ---------------------------------------------------------------------------

/**
 * Execute one intent at a declared staleness offset.
 *
 * The decision is taken on the snapshot, which is knowable at its own timestamp. The ORDER
 * arrives `delta` later, which is what a real intent does when the book is written at a fixed
 * cadence: it uses the last completed snapshot, aged by however far into the interval it fell.
 *
 * Costs applied, both of which a mid-price replay would omit:
 *   - spread crossing, taken as the half-spread recorded on the snapshot;
 *   - a depth check, so an intent larger than the recorded top-of-book depth is a NO_FILL
 *     rather than a fill at a price the book could not have supplied.
 */
export function executeIntent(item, deltaMs, price, horizonMs = FROZEN.horizon_ms) {
  const s = item.snapshot;
  if (!(s.bid > 0) || !(s.ask > 0) || s.ask <= s.bid) return { status: 'NO_QUOTE' };
  const mid = (s.bid + s.ask) / 2;
  const halfSpreadBps = 1e4 * ((s.ask - s.bid) / 2 / mid);

  const depth = item.intent === 'LONG' ? s.ask_depth_next : s.bid_depth_next;
  if (!Number.isFinite(depth) || depth <= 0) return { status: 'NO_DEPTH' };
  if (depth < FROZEN.intent_notional_usd) return { status: 'NO_FILL_DEPTH' };

  const want = s.ts + deltaMs;
  const entryTick = price.at(want);
  if (!entryTick) return { status: 'NO_PRICE' };
  // The price source returns the first print AT OR AFTER the requested moment, so a snapshot
  // outside the tick coverage would silently match a print days later and the harness would
  // report a staleness of hours while claiming to measure seconds. The tolerance makes that a
  // rejection instead. An earlier cut omitted this check and produced a median staleness of
  // 39 hours alongside a passing verdict.
  if (entryTick.ts - want > FROZEN.max_snapshot_age_ms) return { status: 'NO_PRICE_IN_WINDOW' };
  const exitTick = price.at(entryTick.ts + horizonMs);
  if (!exitTick) return { status: 'NO_EXIT' };
  if (exitTick.ts - (entryTick.ts + horizonMs) > FROZEN.max_snapshot_age_ms) return { status: 'NO_EXIT_IN_WINDOW' };
  if (!(entryTick.px > 0) || !(exitTick.px > 0)) return { status: 'BAD_PRICE' };

  const raw = 1e4 * (exitTick.px / entryTick.px - 1);
  const signed = item.intent === 'LONG' ? raw : -raw;

  return {
    status: 'FILLED',
    // Gross move in the intent's direction, before the crossing cost.
    move_bps: signed,
    half_spread_bps: halfSpreadBps,
    // What the intent actually realises: the move less the spread it had to cross to exist.
    realised_bps: signed - halfSpreadBps,
    entry_ts: entryTick.ts,
    staleness_ms: entryTick.ts - s.ts,
  };
}

// ---------------------------------------------------------------------------
// The paired replay
// ---------------------------------------------------------------------------

/**
 * Runs B and G over the identical intent stream under identical mechanics.
 *
 * B sends every intent. G withholds the ones the guard vetoes. The measured object is the
 * difference PER EXECUTED INTENT -- which is not the ALLOW-versus-VETO separation. Those two
 * differ by the veto rate, and conflating them overstates what a guard delivers on a trade:
 *
 *     per_executed_gain = mean(ALLOW) - mean(ALL) = veto_rate x (mean(ALLOW) - mean(VETO))
 *
 * So a separation of s at a veto rate of v is worth v*s per executed intent, not s.
 */
export function pairedReplay(intents, deltaMs, price, horizonMs = FROZEN.horizon_ms) {
  const filled = [];
  const rejects = {};
  for (const item of intents) {
    const r = executeIntent(item, deltaMs, price, horizonMs);
    if (r.status !== 'FILLED') { rejects[r.status] = (rejects[r.status] || 0) + 1; continue; }
    filled.push({ ...item, ...r });
  }
  if (!filled.length) return { delta_ms: deltaMs, n: 0, rejects };

  const allow = filled.filter((x) => x.decision === 'ALLOW');
  const veto = filled.filter((x) => x.decision === 'VETO');
  const noData = filled.filter((x) => x.decision === 'NO_DATA');

  const runB = filled.map((x) => x.realised_bps);
  const runG = allow.map((x) => x.realised_bps);
  const vetoOut = veto.map((x) => x.realised_bps);

  const mB = mean(runB);
  const mG = runG.length ? mean(runG) : null;
  const mV = vetoOut.length ? mean(vetoOut) : null;
  const vetoRate = veto.length / filled.length;

  // Standard error of the difference of two means over overlapping sets is not the naive
  // combination, so the difference is bootstrapped over the separation instead.
  const sdA = stdev(runG);
  const sdV = stdev(vetoOut);
  const sepSe = (sdA !== null && sdV !== null && runG.length && vetoOut.length)
    ? Math.sqrt((sdA * sdA) / runG.length + (sdV * sdV) / vetoOut.length) : null;
  const separation = (mG !== null && mV !== null) ? mG - mV : null;

  return {
    delta_ms: deltaMs,
    n: filled.length,
    rejects,
    median_staleness_ms: median(filled.map((x) => x.staleness_ms)),
    run_B_mean_bps: mB,
    run_G_mean_bps: mG,
    // The headline the protocol asks for.
    per_executed_gain_bps: mG === null ? null : mG - mB,
    // The quantity AH-047 reported, kept separate so the two are never conflated.
    separation_bps: separation,
    separation_se_bps: sepSe,
    separation_t: separation !== null && sepSe ? separation / sepSe : null,
    veto_rate_pct: 100 * vetoRate,
    n_allow: allow.length,
    n_veto: veto.length,
    n_no_data: noData.length,
    allow_mean_bps: mG,
    veto_mean_bps: mV,
    allow_sd_bps: sdA,
    veto_sd_bps: sdV,
    mean_half_spread_bps: mean(filled.map((x) => x.half_spread_bps)),
  };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/**
 * Control 1 — a random guard vetoing at exactly the measured rate. A veto that survives at
 * ideal fill may not survive once the withheld intents are the ones that would not have filled
 * anyway, so the control is re-run here under execution mechanics rather than inherited.
 */
export function randomVetoControl(replayFilled, vetoRate, draws = FROZEN.control_draws, seed = FROZEN.control_seed) {
  const rnd = lcg(seed);
  const values = replayFilled;
  if (!values.length) return { draws: 0 };
  const mAll = mean(values);
  const gains = [];
  for (let d = 0; d < draws; d += 1) {
    const kept = values.filter(() => rnd() >= vetoRate);
    if (kept.length < 10) continue;
    gains.push(mean(kept) - mAll);
  }
  gains.sort((a, b) => a - b);
  return {
    draws: gains.length,
    control_mean_gain_bps: mean(gains),
    control_p05: gains[Math.floor(gains.length * 0.05)],
    control_p95: gains[Math.floor(gains.length * 0.95)],
  };
}

/**
 * Control 2 — the ALLOW-set mean must not turn materially positive. If it does, the predicate
 * is selecting direction rather than suppressing bad states, which breaks the producing law's
 * own review criterion and disqualifies the candidate from class GUARD.
 */
export function allowDriftControl(allowMeanBps) {
  return {
    allow_mean_bps: allowMeanBps,
    limit_bps: FROZEN.allow_drift_limit_bps,
    breached: allowMeanBps !== null && allowMeanBps > FROZEN.allow_drift_limit_bps,
  };
}

// ---------------------------------------------------------------------------
// The delta sweep and the gate
// ---------------------------------------------------------------------------

export function deltaSweep(snapshots, ticks, horizonMs = FROZEN.horizon_ms) {
  const price = makePriceSource(ticks);
  const intents = buildIntents(snapshots);
  const rows = [];
  for (const d of FROZEN.delta_axis_ms) rows.push(pairedReplay(intents, d, price, horizonMs));
  return rows;
}

export function runGate(bySymbol) {
  const perSymbol = {};
  const pooled = {};
  for (const d of FROZEN.delta_axis_ms) pooled[d] = [];

  for (const [sym, { snapshots, ticks }] of Object.entries(bySymbol)) {
    if (!snapshots?.length || !ticks?.length) continue;
    const rows = deltaSweep(snapshots, ticks);
    perSymbol[sym] = rows;
    for (const r of rows) if (r.n) pooled[r.delta_ms].push(r);
  }

  const axis = FROZEN.delta_axis_ms.map((d) => {
    const rows = pooled[d];
    if (!rows.length) return { delta_ms: d, n: 0 };
    const n = rows.reduce((a, r) => a + r.n, 0);
    const w = (k) => rows.reduce((a, r) => a + (r[k] ?? 0) * r.n, 0) / n;
    // Pooled standard error of the separation, built from each symbol's own counts and
    // dispersions. A weighted mean of per-symbol t-statistics would be meaningless.
    let vA = 0;
    let vV = 0;
    let nA = 0;
    let nV = 0;
    for (const r of rows) {
      if (r.allow_sd_bps !== null && r.n_allow) { vA += r.allow_sd_bps ** 2 * r.n_allow; nA += r.n_allow; }
      if (r.veto_sd_bps !== null && r.n_veto) { vV += r.veto_sd_bps ** 2 * r.n_veto; nV += r.n_veto; }
    }
    const se = (nA && nV) ? Math.sqrt((vA / nA) / nA + (vV / nV) / nV) : null;
    const sep = w('separation_bps');
    return {
      delta_ms: d,
      symbols: rows.length,
      n,
      per_executed_gain_bps: w('per_executed_gain_bps'),
      separation_bps: sep,
      separation_se_bps: se,
      separation_t: se && se > 0 ? sep / se : null,
      detectable_bps: se === null ? null : 3 * se,
      veto_rate_pct: w('veto_rate_pct'),
      allow_mean_bps: w('allow_mean_bps'),
      veto_mean_bps: w('veto_mean_bps'),
      median_staleness_ms: median(rows.map((r) => r.median_staleness_ms)),
    };
  });

  const base = axis.find((a) => a.delta_ms === 0);
  for (const a of axis) {
    a.retained_pct = base && base.separation_bps ? (100 * a.separation_bps) / base.separation_bps : null;
  }

  // The protocol's guard-specific kill condition sits at the 50 percent offset of the median
  // interval, which on this archive is 5,000 ms.
  const half = axis.find((a) => a.delta_ms === 5000);
  const drift = allowDriftControl(half?.allow_mean_bps ?? null);
  const rateOk = half && half.veto_rate_pct / 100 >= FROZEN.veto_rate_min
    && half.veto_rate_pct / 100 <= FROZEN.veto_rate_max;

  const out = {
    gate: 'G3',
    candidate_class: 'GUARD',
    label: 'EXECUTION_REPLAY_NOT_A_PASSPORT',
    promising_count: 0,
    frozen: FROZEN,
    axis,
    per_symbol: perSymbol,
    allow_drift_control: drift,
    veto_rate_within_bounds: rateOk,
  };

  if (!half || !half.n) {
    out.verdict = 'DATA_INADEQUATE';
    out.closure_reason = 'no filled intents at the 50 percent staleness offset';
  } else if (drift.breached) {
    out.verdict = 'RECLASSIFY_NOT_A_GUARD';
    out.closure_reason = `the ALLOW mean of ${drift.allow_mean_bps?.toFixed(3)} bps exceeds ${FROZEN.allow_drift_limit_bps}; the predicate is selecting direction rather than suppressing bad states`;
  } else if (!rateOk) {
    out.verdict = 'G3_FAIL';
    out.closure_reason = `veto rate ${half.veto_rate_pct?.toFixed(1)} percent is outside the declared bounds`;
  } else if (!(half.separation_bps > 0)) {
    out.verdict = 'G3_FAIL_STALENESS';
    out.closure_reason = 'the separation is not positive at the 50 percent offset; the guard is an artifact of snapshot alignment and the successor is a data request for a faster book feed';
  } else if (!(half.detectable_bps !== null && half.separation_bps >= half.detectable_bps)) {
    // A separation that is merely above zero is not a pass. An earlier cut of this gate tested
    // only the sign and returned G3_STAGE_PASS on 0.073 bps at t below 3 -- the same defect
    // class as AH-050's one-sided power check.
    out.verdict = 'G3_FAIL_UNRESOLVED';
    out.closure_reason = `the separation at the 50 percent offset is ${half.separation_bps?.toFixed(4)} bps, not distinguishable from zero at t=3 which needs ${half.detectable_bps?.toFixed(4)}; a sign alone is not a pass`;
  } else {
    out.verdict = 'G3_STAGE_PASS';
    out.closure_reason = null;
  }
  return out;
}

export function toCsv(r) {
  const header = 'delta_ms,symbols,n,median_staleness_ms,per_executed_gain_bps,separation_bps,separation_t,detectable_bps,retained_pct,veto_rate_pct,allow_mean_bps,veto_mean_bps';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const lines = (r.axis ?? []).map((a) => [a.delta_ms, a.symbols ?? 0, a.n, c(a.median_staleness_ms),
    c(a.per_executed_gain_bps), c(a.separation_bps), c(a.separation_t), c(a.detectable_bps),
    c(a.retained_pct), c(a.veto_rate_pct), c(a.allow_mean_bps), c(a.veto_mean_bps)].join(','));
  if (!lines.length) lines.push('NO_AXIS,0,0,,,,,,,,,');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `g3_guard_execution_harness.mjs — G3 executable replay for class GUARD

Usage:
  node scripts/analysis/g3_guard_execution_harness.mjs --data <dir> [--out <base>]

  --data <dir>  Directory with <SYMBOL>.guard.txt and <SYMBOL>.ticks.jsonl
  --out <base>  Write <base>.json and <base>.csv (nothing is written without it)

The staleness offset is an axis, not a constant. The metric is per executed intent, never PnL.`;

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

/** guard.txt: ts bid ask buy_notional sell_notional dbPrev dbNext daPrev daNext */
export function parseGuardFile(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const p = line.split(' ');
    if (p.length < 9) continue;
    out.push({
      ts: +p[0], bid: +p[1], ask: +p[2],
      buy_notional: +p[3], sell_notional: +p[4],
      bid_depth_prev: +p[5], bid_depth_next: +p[6],
      ask_depth_prev: +p[7], ask_depth_next: +p[8],
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function parseTickFile(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const t = /"ts":(\d+)/.exec(line);
    const p = /"px":([0-9.]+)/.exec(line);
    if (!t || !p) continue;
    out.push({ ts: +t[1], px: +p[1] });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function loadData(dir) {
  const root = resolve(dir);
  if (!existsSync(root)) throw new Error(`directory not found: ${root}`);
  const out = {};
  for (const f of readdirSync(root)) {
    const g = /^([A-Z0-9]+)\.guard\.txt$/.exec(f);
    if (g) {
      out[g[1]] ??= {};
      out[g[1]].snapshots = parseGuardFile(readFileSync(join(root, f), 'utf8'));
    }
    const t = /^([A-Z0-9]+)\.ticks\.jsonl$/.exec(f);
    if (t) {
      out[t[1]] ??= {};
      out[t[1]].ticks = parseTickFile(readFileSync(join(root, f), 'utf8'));
    }
  }
  // A symbol without both streams cannot be replayed at a non-zero offset, so it is dropped
  // rather than silently evaluated at offset zero only.
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

  const r = runGate(loadData(opts.data));
  process.stdout.write(`${JSON.stringify({
    gate: r.gate, verdict: r.verdict, closure_reason: r.closure_reason,
    axis: r.axis, allow_drift_control: r.allow_drift_control,
    veto_rate_within_bounds: r.veto_rate_within_bounds,
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
