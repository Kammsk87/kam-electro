#!/usr/bin/env node
// ah047_execution_policy_guard.mjs
//
// TASK-AH-047 — Execution Policy: Adverse-Selection Guard. Research only.
//
// This is a GUARD, not a sleeve. It suppresses; it never emits a direction, a size, or an
// entry, and it never receives capital. Its output is a partition of market states into
// ALLOW and VETO, and the only question asked of it is whether the VETO side has a
// systematically worse forward outcome than the ALLOW side.
//
// Its KPI is prevented adverse selection in basis points. That is NOT PnL. With zero
// admitted sleeves there is nothing to guard, so any saving measured here is potential,
// realisable only once an admitted entry exists. The report says so explicitly.
//
// The control that matters: a random guard vetoing at the identical rate. A guard that
// cannot beat its own random control is separating nothing, however good its raw number
// looks — vetoing high-variance states alone will flatter any metric.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: seeded PRNG, no clock, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-047',
  class: 'GUARD',
  horizons_ms: [60_000, 300_000],
  primary_horizon_ms: 60_000,
  splits: { train: 0.55, validation: 0.2, holdout: 0.15, forward: 0.1 },
  purge_intervals: 1,
  embargo_intervals: 30,
  control_samples: 1000,
  control_seed: 47_047,
  alpha: 0.05,
  veto_rate_min: 0.02,
  veto_rate_max: 0.80,
  min_states_per_split: 1000,
  min_symbols: 5,
  min_days: 10,
});

export const GUARD_STATES = Object.freeze(['ALLOW', 'VETO', 'NO_DATA']);
export const INTENTS = Object.freeze(['LONG', 'SHORT']);

export const REQUIRED_FIELDS = Object.freeze({
  states: ['ts', 'symbol', 'bid', 'ask', 'buy_notional', 'sell_notional',
    'bid_depth_prev', 'bid_depth_next', 'ask_depth_prev', 'ask_depth_next'],
});

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
export const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Data gate
// ---------------------------------------------------------------------------

export function missingFields(rows, required) {
  if (!Array.isArray(rows) || rows.length === 0) return [...required];
  const missing = new Set();
  for (const f of required) {
    for (const r of rows) {
      const v = r?.[f];
      if (v === undefined || v === null || v === '') { missing.add(f); break; }
    }
  }
  return [...missing];
}

export function gateStates(rows) {
  const gaps = missingFields(rows, REQUIRED_FIELDS.states);
  if (gaps.length > 0) {
    return { ok: false, missing: [{ dataset: 'states', reason: 'REQUIRED_FIELDS_MISSING', missing_fields: gaps }] };
  }
  for (const r of rows) {
    if (r.side_source && REFUSED_SUBSTITUTES.includes(String(r.side_source))) {
      return {
        ok: false,
        missing: [{ dataset: 'states', reason: 'AGGRESSOR_SIDE_UNUSABLE', missing_fields: ['side_source'],
          detail: `aggressor side derived from '${r.side_source}', a refused substitute` }],
      };
    }
  }
  return { ok: true, missing: [] };
}

// ---------------------------------------------------------------------------
// The guard predicate
// ---------------------------------------------------------------------------

/**
 * Two states plus NO_DATA. For an intended LONG the guard vetoes when aggressive sellers
 * dominated the interval AND bid-side depth fell over it — the book is being consumed on
 * the side the long would rely on. Mirror for SHORT.
 *
 * The predicate is deliberately blunt: it names a condition, not a threshold to tune.
 */
export function guardState(state, intent) {
  // The intent is validated FIRST. A guard must fail closed: an unrecognised intent can
  // never fall through to ALLOW, however benign the rest of the state looks.
  if (!INTENTS.includes(intent)) return 'NO_DATA';
  if (!state || !Number.isFinite(state.buy_notional) || !Number.isFinite(state.sell_notional)) return 'NO_DATA';
  if (!Number.isFinite(state.bid_depth_prev) || !Number.isFinite(state.bid_depth_next) ||
      !Number.isFinite(state.ask_depth_prev) || !Number.isFinite(state.ask_depth_next)) return 'NO_DATA';

  const flow = state.buy_notional - state.sell_notional;
  if (flow === 0) return 'ALLOW';
  const bidDelta = state.bid_depth_next - state.bid_depth_prev;
  const askDelta = state.ask_depth_next - state.ask_depth_prev;

  if (intent === 'LONG') return (flow < 0 && bidDelta < 0) ? 'VETO' : 'ALLOW';
  return (flow > 0 && askDelta < 0) ? 'VETO' : 'ALLOW';
}

/** Forward mid move signed so that positive is good for the stated intent. */
export function signedForward(entryMid, exitMid, intent) {
  if (!(entryMid > 0) || !(exitMid > 0)) return null;
  const raw = 1e4 * ((exitMid - entryMid) / entryMid);
  return intent === 'LONG' ? raw : -raw;
}

/**
 * One evaluated state per (snapshot, intent). Both intents are always evaluated so the guard
 * is judged on how it partitions the whole population, never on a selected subset.
 */
export function buildStates(rows, horizonMs = FROZEN.primary_horizon_ms) {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  const out = [];
  for (const [symbol, list] of bySymbol) {
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const mids = sorted.map((r) => (r.bid + r.ask) / 2);
    for (let i = 0; i < sorted.length; i += 1) {
      const target = sorted[i].ts + horizonMs;
      // forward mid: last snapshot at or before the horizon, never after
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].ts <= target) j += 1;
      if (j === i) continue;
      for (const intent of INTENTS) {
        const fwd = signedForward(mids[i], mids[j], intent);
        if (fwd === null) continue;
        out.push({
          symbol, ts: sorted[i].ts, day: dayKey(sorted[i].ts), index: i, intent,
          state: guardState(sorted[i], intent), forward_bps: fwd,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chronology
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

export function assignSplits(states) {
  const stamps = [...new Set(states.map((s) => s.ts))].sort((a, b) => a - b);
  const index = new Map(stamps.map((t, i) => [t, i]));
  const chrono = chronology(stamps.length);
  const kept = [];
  const dropped = { purged: 0, embargoed: 0 };
  const firstOf = {};
  for (const s of states) {
    const i = index.get(s.ts);
    const sp = chrono.splitOf(i);
    if (firstOf[sp] === undefined) firstOf[sp] = i;
  }
  for (const s of states) {
    const i = index.get(s.ts);
    const sp = chrono.splitOf(i);
    if (chrono.splitOf(i + FROZEN.purge_intervals) !== sp) { dropped.purged += 1; continue; }
    if (sp !== 'train' && i - firstOf[sp] < FROZEN.embargo_intervals) { dropped.embargoed += 1; continue; }
    kept.push({ ...s, split: sp });
  }
  return { kept, dropped, intervals: stamps.length };
}

// ---------------------------------------------------------------------------
// The metric and its control
// ---------------------------------------------------------------------------

/**
 * prevented_adverse_bps = mean forward move in VETO states minus mean in ALLOW states,
 * both signed against the intent. Negative VETO minus positive ALLOW gives a positive
 * separation, meaning the guard is removing worse-than-average states.
 */
export function separation(states) {
  const allow = states.filter((s) => s.state === 'ALLOW').map((s) => s.forward_bps);
  const veto = states.filter((s) => s.state === 'VETO').map((s) => s.forward_bps);
  const noData = states.filter((s) => s.state === 'NO_DATA').length;
  const evaluated = allow.length + veto.length;
  if (!allow.length || !veto.length) {
    return { n: states.length, evaluated, allow_n: allow.length, veto_n: veto.length, no_data: noData,
      veto_rate: evaluated ? veto.length / evaluated : null, allow_mean_bps: mean(allow), veto_mean_bps: mean(veto),
      prevented_adverse_bps: null, t_stat: null, degenerate: true };
  }
  const am = mean(allow);
  const vm = mean(veto);
  const se = Math.sqrt((stdev(allow) ** 2) / allow.length + (stdev(veto) ** 2) / veto.length);
  const diff = am - vm; // positive when ALLOW is better than VETO
  const rate = veto.length / evaluated;
  return {
    n: states.length, evaluated, allow_n: allow.length, veto_n: veto.length, no_data: noData,
    veto_rate: rate,
    allow_mean_bps: am, veto_mean_bps: vm,
    allow_median_bps: median(allow), veto_median_bps: median(veto),
    prevented_adverse_bps: diff,
    t_stat: se > 0 ? diff / se : null,
    symbols: new Set(states.map((s) => s.symbol)).size,
    days: new Set(states.map((s) => s.day)).size,
    degenerate: rate < FROZEN.veto_rate_min || rate > FROZEN.veto_rate_max,
  };
}

/**
 * The control that decides everything: a random guard vetoing at the SAME rate. If the real
 * guard cannot beat it, the separation is an artefact of how many states were removed rather
 * than which ones.
 */
export function randomRateControl(states, samples = FROZEN.control_samples, seed = FROZEN.control_seed) {
  const evaluated = states.filter((s) => s.state !== 'NO_DATA');
  if (evaluated.length < 10) return { samples: 0, p_value: null, control_mean_separation_bps: null };
  const observed = separation(states).prevented_adverse_bps;
  if (observed === null) return { samples: 0, p_value: null, control_mean_separation_bps: null };
  const rate = separation(states).veto_rate;
  const diffs = [];
  for (let k = 0; k < samples; k += 1) {
    const rnd = seeded(seed + k);
    const a = [];
    const v = [];
    for (const s of evaluated) (rnd() < rate ? v : a).push(s.forward_bps);
    if (!a.length || !v.length) continue;
    diffs.push(mean(a) - mean(v));
  }
  if (!diffs.length) return { samples: 0, p_value: null, control_mean_separation_bps: null };
  const centre = mean(diffs);
  const atLeastAsExtreme = diffs.filter((d) => Math.abs(d - centre) >= Math.abs(observed - centre)).length;
  return {
    samples: diffs.length,
    observed_separation_bps: observed,
    control_mean_separation_bps: centre,
    control_sd_bps: stdev(diffs),
    p_value: atLeastAsExtreme / diffs.length,
    two_sided: true,
    beats_random: atLeastAsExtreme / diffs.length < FROZEN.alpha && observed > centre,
  };
}

export function removeBest(states, key) {
  const totals = {};
  for (const s of states) {
    if (s.state === 'NO_DATA') continue;
    totals[s[key]] = (totals[s[key]] || 0) + (s.state === 'VETO' ? -s.forward_bps : s.forward_bps);
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { removed: null, separation: separation(states) };
  const best = entries[0][0];
  return { removed: best, separation: separation(states.filter((s) => String(s[key]) !== best)) };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export function verdictFor(r) {
  const h = r.holdout;
  const f = r.forward;
  if (!h || !f || h.evaluated < FROZEN.min_states_per_split || f.evaluated < FROZEN.min_states_per_split ||
    h.symbols < FROZEN.min_symbols || f.symbols < FROZEN.min_symbols ||
    h.days < FROZEN.min_days || f.days < FROZEN.min_days) return 'DATA_INADEQUATE';
  if (h.degenerate || f.degenerate) return 'DEGENERATE';
  if (h.prevented_adverse_bps === null || f.prevented_adverse_bps === null ||
    h.prevented_adverse_bps <= 0 || f.prevented_adverse_bps <= 0) return 'NO_SEPARATION';
  if (!r.random_control?.beats_random) return 'NOT_BETTER_THAN_RANDOM';
  if ((r.remove_best_symbol?.separation.prevented_adverse_bps ?? -1) <= 0 ||
    (r.remove_best_day?.separation.prevented_adverse_bps ?? -1) <= 0) return 'NO_SEPARATION';
  return 'GUARD_ADMITTED_RESEARCH_ONLY';
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function report(rows) {
  const gate = gateStates(rows);
  if (!gate.ok) {
    return {
      task: FROZEN.task, class: FROZEN.class, label: 'DISCOVERY_NOT_PROOF',
      verdict: 'DATA_INADEQUATE', promising_count: 0, frozen: FROZEN,
      kpi_note: 'prevented adverse selection in bps, NOT PnL',
      missing_inputs: gate.missing, substitution_refused: true,
    };
  }
  const all = buildStates(rows, FROZEN.primary_horizon_ms);
  const { kept, dropped, intervals } = assignSplits(all);
  const bySplit = (n) => kept.filter((s) => s.split === n);
  const oos = [...bySplit('holdout'), ...bySplit('forward')];

  const horizons = FROZEN.horizons_ms.map((h) => {
    const st = assignSplits(buildStates(rows, h)).kept;
    return { horizon_ms: h, separation: separation([...st.filter((s) => s.split === 'holdout'), ...st.filter((s) => s.split === 'forward')]) };
  });

  const out = {
    task: FROZEN.task,
    class: FROZEN.class,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    kpi_note: 'prevented_adverse_bps is avoided adverse move on entries that were going to happen anyway. It is NOT PnL, and with zero admitted sleeves it is potential rather than realised.',
    admitted_sleeves_available_to_guard: 0,
    intervals,
    dropped,
    train: separation(bySplit('train')),
    validation: separation(bySplit('validation')),
    holdout: separation(bySplit('holdout')),
    forward: separation(bySplit('forward')),
    combined_oos: separation(oos),
    random_control: randomRateControl(oos),
    remove_best_symbol: removeBest(oos, 'symbol'),
    remove_best_day: removeBest(oos, 'day'),
    horizons,
  };
  out.verdict = verdictFor(out);
  return out;
}

export function toCsv(r) {
  const header = 'split,evaluated,symbols,days,veto_rate,allow_mean_bps,veto_mean_bps,prevented_adverse_bps,t_stat';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const rows = ['train', 'validation', 'holdout', 'forward', 'combined_oos']
    .filter((k) => r[k])
    .map((k) => {
      const s = r[k];
      return [k, s.evaluated, s.symbols ?? '', s.days ?? '', c(s.veto_rate), c(s.allow_mean_bps),
        c(s.veto_mean_bps), c(s.prevented_adverse_bps), c(s.t_stat)].join(',');
    });
  if (!rows.length) rows.push('NO_STATES,0,,,,,,,');
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah047_execution_policy_guard.mjs — TASK-AH-047, research only

Usage:
  node scripts/analysis/ah047_execution_policy_guard.mjs --states <file> [--out <base>]

  --states <file>  Rows: ts, symbol, bid, ask, buy_notional, sell_notional,
                   bid_depth_prev, bid_depth_next, ask_depth_prev, ask_depth_next
  --out <base>     Write <base>.json and <base>.csv (nothing is written without it)

This is a GUARD. It suppresses; it never emits a direction, size or entry. Its KPI is
prevented adverse selection in bps, which is not PnL.`;

export function parseArgs(argv) {
  const opts = { states: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--states') opts.states = next();
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
  if (opts.help || !opts.states) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = report(readJsonFile(opts.states));
  process.stdout.write(`${JSON.stringify({ task: r.task, verdict: r.verdict, combined_oos: r.combined_oos, random_control: r.random_control }, null, 2)}\n`);

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
