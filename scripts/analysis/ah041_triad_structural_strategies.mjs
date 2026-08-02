#!/usr/bin/env node
// ah041_triad_structural_strategies.mjs
//
// TASK-AH-041 — Triad Structural Strategies v0. Research only.
//
// Three structurally independent members, evaluated separately and reported separately.
// PnL is NEVER pooled across members: there is no combined equity curve, no combined
// verdict, and no field in the output that sums one member's returns into another's.
//
// Member 1  CS_RELATIVE_STRENGTH_24H   cross-sectional, market-neutral, daily rebalance
// Member 2  FUNDING_PERSISTENCE_CARRY  requires causal spot/perp/funding/borrow/basis/execution
// Member 3  NEWS_FORCED_FLOW_REACTION  requires causal first_seen news + labels + execution
//
// Data discipline, enforced in code and by the shipped tests:
//   - A member whose required fields are absent returns DATA_INADEQUATE naming every
//     missing field. It is never approximated, and candles are NEVER substituted for
//     funding, borrow, basis, execution, or news data.
//   - Only explicitly supplied local dataset paths are read. There is no network call,
//     no process, no service, no credential, and no exchange/account/order path.
//   - Output is deterministic: seeded PRNG, no clock, no environment read.
//
// Nothing here promotes anything. A positive pocket is not a candidate.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Frozen constants. Declared before any data is inspected.
// ---------------------------------------------------------------------------

export const FROZEN = Object.freeze({
  task: 'TASK-AH-041',
  protocol_date: '2026-08-03',
  cost_bps_gross_roundtrip: 11,
  double_cost_bps_gross_roundtrip: 22,
  lookback_days: 7,
  neighbour_lookback_days: [6, 8],
  quintile: 0.2,
  hold_hours: 24,
  min_history_days: 30,
  max_single_day_move: 0.25,
  splits: { train: 0.55, validation: 0.2, holdout: 0.15, forward: 0.1 },
  purge_days: 2,
  embargo_days: 7,
  null_samples: 1000,
  null_seed: 8_041,
  alpha: 0.05,
  max_symbol_share: 0.25,
  min_oos_observations: 100,
  min_oos_days: 10,
  min_combined_days: 30,
  min_symbols_per_side: 3,
});

// Families already rejected or quarantined. A member adjacent to one of these cannot
// reach a passport draft until an EXACT trade-timestamp ledger overlap has been measured.
export const BLOCKED_FAMILIES = Object.freeze([
  'FAILED_BREAKOUT',
  'RAW_MOMENTUM',
  'TREND_CONTINUATION',
  'WALLET_FOLLOW',
  'PAIRS_RELATIVE_VALUE',
  'HMM_REGIME',
]);

// Declared a priori, before any measurement: which blocked families each member is
// mechanically adjacent to, and therefore must be shown distinct from by ledger overlap.
export const DECLARED_ADJACENCY = Object.freeze({
  CS_RELATIVE_STRENGTH_24H: ['RAW_MOMENTUM', 'PAIRS_RELATIVE_VALUE'],
  FUNDING_PERSISTENCE_CARRY: [],
  NEWS_FORCED_FLOW_REACTION: [],
});

export const MEMBERS = Object.freeze(['CS_RELATIVE_STRENGTH_24H', 'FUNDING_PERSISTENCE_CARRY', 'NEWS_FORCED_FLOW_REACTION']);

// Required fields per member. Missing any one is DATA_INADEQUATE for that member only.
export const REQUIRED_INPUTS = Object.freeze({
  CS_RELATIVE_STRENGTH_24H: {
    universe: ['universe_id', 'frozen_at', 'symbols'],
    daily_bars: ['ts', 'o', 'c'],
  },
  FUNDING_PERSISTENCE_CARRY: {
    carry: [
      'ts',
      'spot_price',
      'perp_price',
      'funding_rate',
      'funding_publish_ts',
      'borrow_rate',
      'basis',
      'spot_bid',
      'spot_ask',
      'perp_bid',
      'perp_ask',
    ],
  },
  NEWS_FORCED_FLOW_REACTION: {
    news: ['first_seen_ts', 'event_label', 'symbol'],
    news_prices: ['ts', 'symbol', 'price', 'bid', 'ask'],
  },
});

// Member 3's mechanical rule, pre-declared here before any news data is inspected.
export const NEWS_PREDECLARED_RULE = Object.freeze({
  direction: 'FADE_THE_IMPULSE',
  rationale:
    'Forced flow from a labelled event is price-insensitive; the declared mechanical direction is to take the other side of the initial impulse.',
  entry: 'first execution-quality quote strictly after first_seen_ts + 60s',
  exit: 'fixed 4h horizon from entry, no discretionary override',
  declared_before_inspection: true,
});

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Small deterministic numeric helpers
// ---------------------------------------------------------------------------

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const percentile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
};

/** Deterministic PRNG (mulberry32). Same seed always yields the same sequence. */
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
// Dataset gating — the heart of the data discipline
// ---------------------------------------------------------------------------

/**
 * Checks that every required field is present and non-null on every row.
 * Returns the list of missing/blank field names (empty means the dataset is complete).
 */
export function missingFields(rows, required) {
  if (!Array.isArray(rows) || rows.length === 0) return [...required];
  const missing = new Set();
  for (const field of required) {
    for (const row of rows) {
      const v = row?.[field];
      if (v === undefined || v === null || v === '') {
        missing.add(field);
        break;
      }
    }
  }
  return [...missing];
}

/**
 * Resolves a member's declared datasets against the supplied paths.
 * Never invents a substitute: an absent dataset yields a missing-input record.
 */
export function gateDatasets(member, suppliedPaths, readJson) {
  const spec = REQUIRED_INPUTS[member];
  const datasets = {};
  const missing = [];

  for (const [name, required] of Object.entries(spec)) {
    const path = suppliedPaths[name];
    if (!path) {
      missing.push({ dataset: name, reason: 'DATASET_NOT_SUPPLIED', required_fields: required, missing_fields: required });
      continue;
    }
    let parsed;
    try {
      parsed = readJson(path);
    } catch (err) {
      missing.push({
        dataset: name,
        reason: 'DATASET_UNREADABLE',
        path,
        detail: err.message,
        required_fields: required,
        missing_fields: required,
      });
      continue;
    }
    // The universe manifest is an object; every other dataset is row-shaped.
    const rows = name === 'universe' ? [parsed] : flattenRows(parsed);
    const gaps = missingFields(rows, required);
    if (gaps.length > 0) {
      missing.push({ dataset: name, reason: 'REQUIRED_FIELDS_MISSING', path, required_fields: required, missing_fields: gaps });
      continue;
    }
    datasets[name] = parsed;
  }
  return { datasets, missing, complete: missing.length === 0 };
}

/** Accepts either {SYMBOL:[rows]} or [rows]; returns a flat row array. */
export function flattenRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return Object.values(parsed).flat();
  return [];
}

export function dataInadequate(member, missing, note) {
  return {
    member,
    verdict: 'DATA_INADEQUATE',
    executable: false,
    missing_inputs: missing,
    required_inputs: REQUIRED_INPUTS[member],
    substitution_refused: true,
    note,
  };
}

// ---------------------------------------------------------------------------
// Member 1 — cross-sectional relative strength
// ---------------------------------------------------------------------------

/** Chronological 55/20/15/10 over a sorted list of date keys. */
export function chronology(dates) {
  const n = dates.length;
  const trainEnd = Math.floor(n * FROZEN.splits.train);
  const validationEnd = trainEnd + Math.floor(n * FROZEN.splits.validation);
  const holdoutEnd = validationEnd + Math.floor(n * FROZEN.splits.holdout);
  const splitOf = (idx) =>
    idx < trainEnd ? 'train' : idx < validationEnd ? 'validation' : idx < holdoutEnd ? 'holdout' : 'forward';
  return { n, trainEnd, validationEnd, holdoutEnd, splitOf };
}

/**
 * Builds a date-indexed panel from the frozen universe and daily bars.
 * A symbol contributes to a date only if it has a bar for that date.
 */
export function buildPanel(universeSymbols, dailyBars) {
  const dateSet = new Set();
  const bySymbol = {};
  for (const symbol of universeSymbols) {
    const rows = dailyBars[symbol];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const sorted = [...rows].sort((a, b) => a.ts - b.ts);
    const byDate = new Map();
    for (const r of sorted) byDate.set(dayKey(r.ts), r);
    bySymbol[symbol] = { sorted, byDate };
    for (const d of byDate.keys()) dateSet.add(d);
  }
  const dates = [...dateSet].sort();
  return { dates, bySymbol, symbols: Object.keys(bySymbol) };
}

/**
 * Eligibility at a decision date, using only information available at that date.
 * Excludes a symbol with under min_history_days of history, or any single-day move
 * beyond max_single_day_move inside the lookback window.
 */
export function isEligible(entry, dateIdx, dates, lookback) {
  const { byDate } = entry;
  const decisionDate = dates[dateIdx];
  if (!byDate.has(decisionDate)) return false;

  let history = 0;
  for (let k = dateIdx; k >= 0 && history < FROZEN.min_history_days; k -= 1) {
    if (byDate.has(dates[k])) history += 1;
  }
  if (history < FROZEN.min_history_days) return false;

  for (let k = Math.max(1, dateIdx - lookback + 1); k <= dateIdx; k += 1) {
    const cur = byDate.get(dates[k]);
    const prev = byDate.get(dates[k - 1]);
    if (!cur || !prev || !prev.c) continue;
    if (Math.abs(cur.c / prev.c - 1) > FROZEN.max_single_day_move) return false;
  }
  return true;
}

/**
 * One rebalance observation per date: cross-sectional score, quintile legs, and the
 * realised next-open-to-next-open return of each leg. Entry is the open AFTER the
 * decision date, exit one day later — no decision-date price is used for entry.
 */
export function buildObservations(panel, lookback = FROZEN.lookback_days) {
  const { dates, bySymbol } = panel;
  const observations = [];

  for (let i = lookback; i + 2 < dates.length; i += 1) {
    const decisionDate = dates[i];
    const entryDate = dates[i + 1];
    const exitDate = dates[i + 2];
    const eligible = [];

    for (const [symbol, entry] of Object.entries(bySymbol)) {
      if (!isEligible(entry, i, dates, lookback)) continue;
      const now = entry.byDate.get(decisionDate);
      const past = entry.byDate.get(dates[i - lookback]);
      const entryBar = entry.byDate.get(entryDate);
      const exitBar = entry.byDate.get(exitDate);
      if (!now || !past || !entryBar || !exitBar) continue;
      if (!past.c || !entryBar.o || !exitBar.o) continue;
      eligible.push({
        symbol,
        raw: now.c / past.c - 1,
        fwd: exitBar.o / entryBar.o - 1, // realised 24h return, entry open -> exit open
      });
    }

    if (eligible.length < FROZEN.min_symbols_per_side * 2) continue;
    const med = median(eligible.map((e) => e.raw));
    for (const e of eligible) e.score = e.raw - med;

    const ranked = [...eligible].sort((a, b) => b.score - a.score);
    const side = Math.max(FROZEN.min_symbols_per_side, Math.floor(ranked.length * FROZEN.quintile));
    if (side * 2 > ranked.length) continue;

    observations.push({
      decisionIndex: i,
      decisionDate,
      entryDate,
      exitDate,
      eligible: ranked,
      nPerSide: side,
      longs: ranked.slice(0, side).map((e) => e.symbol),
      shorts: ranked.slice(-side).map((e) => e.symbol),
    });
  }
  return observations;
}

/**
 * Market-neutral portfolio return for one observation, in bps, net of both-leg costs.
 * Gross notional is 1.0 (0.5 long, 0.5 short); net exposure is 0 by construction.
 * Per-symbol contributions are retained so remove-best-symbol can be exact.
 */
export function scoreObservation(obs, costBps, longSet = null, shortSet = null) {
  const longs = longSet ?? new Set(obs.longs);
  const shorts = shortSet ?? new Set(obs.shorts);
  const longRet = [];
  const shortRet = [];
  const contributions = {};

  for (const e of obs.eligible) {
    if (longs.has(e.symbol)) longRet.push(e.fwd);
    else if (shorts.has(e.symbol)) shortRet.push(e.fwd);
  }
  if (!longRet.length || !shortRet.length) return null;

  const longLeg = mean(longRet);
  const shortLeg = mean(shortRet);
  for (const e of obs.eligible) {
    if (longs.has(e.symbol)) contributions[e.symbol] = (0.5 * e.fwd) / longRet.length;
    else if (shorts.has(e.symbol)) contributions[e.symbol] = (-0.5 * e.fwd) / shortRet.length;
  }

  const grossReturn = 0.5 * longLeg - 0.5 * shortLeg;
  return {
    decisionDate: obs.decisionDate,
    entryDate: obs.entryDate,
    exitDate: obs.exitDate,
    gross_bps: 1e4 * grossReturn,
    bps: 1e4 * grossReturn - costBps,
    n_long: longRet.length,
    n_short: shortRet.length,
    contributions,
  };
}

/**
 * Purge and embargo. Purge drops a decision whose outcome window crosses into a later
 * split. Embargo drops the first embargo_days decisions of each evaluated split, sized
 * to the feature warm-up (the lookback return). Both are required by the project
 * chronology rules; without them train outcomes overlap validation feature windows.
 */
export function applyPurgeEmbargo(observations, dates, chrono) {
  const kept = [];
  const dropped = { purged: 0, embargoed: 0 };
  const splitStartIndex = {};
  for (const obs of observations) {
    const s = chrono.splitOf(obs.decisionIndex);
    if (splitStartIndex[s] === undefined) splitStartIndex[s] = obs.decisionIndex;
  }
  for (const obs of observations) {
    const decisionSplit = chrono.splitOf(obs.decisionIndex);
    const exitSplit = chrono.splitOf(obs.decisionIndex + FROZEN.purge_days);
    if (decisionSplit !== exitSplit) {
      dropped.purged += 1;
      continue;
    }
    if (obs.decisionIndex - splitStartIndex[decisionSplit] < FROZEN.embargo_days && decisionSplit !== 'train') {
      dropped.embargoed += 1;
      continue;
    }
    kept.push({ ...obs, split: decisionSplit });
  }
  return { kept, dropped };
}

/** Chronologically ordered statistics. Drawdown is computed in date order, never in input order. */
export function stats(scored) {
  const rows = [...scored].sort((a, b) => (a.decisionDate < b.decisionDate ? -1 : 1));
  const n = rows.map((r) => r.bps);
  let cumulative = 0;
  let peak = 0;
  let drawdown = 0;
  for (const x of n) {
    cumulative += x;
    peak = Math.max(peak, cumulative);
    drawdown = Math.min(drawdown, cumulative - peak);
  }
  return {
    n: rows.length,
    days: new Set(rows.map((r) => r.decisionDate)).size,
    symbols: new Set(rows.flatMap((r) => Object.keys(r.contributions))).size,
    net_mean_bps: mean(n),
    net_median_bps: median(n),
    win_rate_pct: n.length ? (100 * n.filter((x) => x > 0).length) / n.length : null,
    p5_bps: percentile(n, 0.05),
    p95_bps: percentile(n, 0.95),
    net_total_bps: n.reduce((a, b) => a + b, 0),
    max_drawdown_bps: drawdown,
  };
}

/**
 * Shuffled-rank matched null. Preserves the dates, the eligible set, both leg sizes,
 * the holding window and the cost model; randomises only which symbols are ranked into
 * each leg. p is the fraction of null medians at or above the observed median.
 */
export function shuffledRankNull(observations, costBps, samples = FROZEN.null_samples, seed = FROZEN.null_seed) {
  const observed = median(observations.map((o) => o.bps));
  if (observed === null) return { samples: 0, observed_net_median_bps: null, null_median_bps: null, p_value: null };
  const medians = [];

  for (let k = 0; k < samples; k += 1) {
    const rnd = seeded(seed + k);
    const drawn = [];
    for (const obs of observations) {
      const pool = obs.source.eligible.map((e) => e.symbol);
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const side = obs.source.nPerSide;
      const scored = scoreObservation(
        obs.source,
        costBps,
        new Set(pool.slice(0, side)),
        new Set(pool.slice(side, side * 2)),
      );
      if (scored) drawn.push(scored.bps);
    }
    const m = median(drawn);
    if (m !== null) medians.push(m);
  }

  return {
    samples: medians.length,
    observed_net_median_bps: observed,
    null_median_bps: median(medians),
    p_value: medians.length ? medians.filter((x) => x >= observed).length / medians.length : null,
  };
}

/** Recomputes the whole strategy with one symbol removed from the universe. Exact, not attributed. */
export function removeBestSymbol(panel, observationsBySplit, splits, costBps, lookback) {
  const totals = {};
  for (const o of observationsBySplit) {
    for (const [symbol, contribution] of Object.entries(o.contributions)) {
      totals[symbol] = (totals[symbol] || 0) + 1e4 * contribution;
    }
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { removed: null, stats: stats(observationsBySplit) };
  const worstCase = entries[0][0];

  const reduced = { ...panel.bySymbol };
  delete reduced[worstCase];
  const rebuilt = rebuild({ ...panel, bySymbol: reduced }, splits, costBps, lookback);
  return { removed: worstCase, removed_gross_bps: entries[0][1], stats: stats(rebuilt) };
}

export function removeBestDay(scored) {
  const totals = {};
  for (const r of scored) totals[r.decisionDate] = (totals[r.decisionDate] || 0) + r.bps;
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { removed: null, stats: stats(scored) };
  const day = entries[0][0];
  return { removed: day, removed_net_bps: entries[0][1], stats: stats(scored.filter((r) => r.decisionDate !== day)) };
}

export function concentration(scored) {
  const abs = {};
  for (const r of scored) {
    for (const [symbol, contribution] of Object.entries(r.contributions)) {
      abs[symbol] = (abs[symbol] || 0) + Math.abs(1e4 * contribution);
    }
  }
  const values = Object.values(abs);
  const total = values.reduce((a, b) => a + b, 0);
  return {
    max_symbol_abs_share: total > 0 ? Math.max(...values) / total : 0,
    symbols: values.length,
  };
}

/** Builds, purges and scores an out-of-sample subset. Shared by the main run and the neighbours. */
function rebuild(panel, splitNames, costBps, lookback) {
  const observations = buildObservations(panel, lookback);
  const chrono = chronology(panel.dates);
  const { kept } = applyPurgeEmbargo(observations, panel.dates, chrono);
  const out = [];
  for (const obs of kept) {
    if (!splitNames.includes(obs.split)) continue;
    const scored = scoreObservation(obs, costBps);
    if (scored) out.push({ ...scored, split: obs.split, source: obs });
  }
  return out;
}

export function evaluateCrossSectional(paths, readJson) {
  const member = 'CS_RELATIVE_STRENGTH_24H';
  const gate = gateDatasets(member, paths, readJson);
  if (!gate.complete) {
    return dataInadequate(
      member,
      gate.missing,
      'The frozen AH-005A liquid universe and its daily bars are required. No candle series was substituted for the missing inputs.',
    );
  }

  const universe = gate.datasets.universe;
  const panel = buildPanel(universe.symbols, gate.datasets.daily_bars);
  const chrono = chronology(panel.dates);
  const cost = FROZEN.cost_bps_gross_roundtrip;

  const all = rebuild(panel, ['train', 'validation', 'holdout', 'forward'], cost, FROZEN.lookback_days);
  const bySplit = (name) => all.filter((r) => r.split === name);
  const holdout = bySplit('holdout');
  const forward = bySplit('forward');
  const oos = [...holdout, ...forward];

  // Neighbours are evaluated on VALIDATION only. Running a parameter surface on the
  // sealed holdout would convert one pre-registered look into three.
  const neighbours = FROZEN.neighbour_lookback_days.map((lb) => ({
    lookback_days: lb,
    segment: 'validation',
    stats: stats(rebuild(panel, ['validation'], cost, lb)),
  }));

  const result = {
    member,
    verdict: null,
    executable: true,
    label: 'DISCOVERY_NOT_PROOF',
    universe: { universe_id: universe.universe_id, frozen_at: universe.frozen_at, symbols: universe.symbols.length },
    panel: { dates: panel.dates.length, symbols: panel.symbols.length, start: panel.dates[0], end: panel.dates.at(-1) },
    rule:
      'Daily 7-day return minus universe median; long top quintile, short bottom quintile; equal notional, ' +
      'gross 1.0, net 0; entry next open, exit one day later (24h hold); exclude <30d history or any single-day move >25%.',
    costs: { gross_roundtrip_bps: cost, double_bps: FROZEN.double_cost_bps_gross_roundtrip, both_legs: true },
    chronology: { splits: FROZEN.splits, purge_days: FROZEN.purge_days, embargo_days: FROZEN.embargo_days },
    train: stats(bySplit('train')),
    validation: stats(bySplit('validation')),
    holdout: stats(holdout),
    forward: stats(forward),
    combined_oos: stats(oos),
    double_cost_oos: stats(oos.map((r) => ({ ...r, bps: r.gross_bps - FROZEN.double_cost_bps_gross_roundtrip }))),
    null: shuffledRankNull(oos, cost),
    remove_best_symbol: removeBestSymbol(panel, oos, ['holdout', 'forward'], cost, FROZEN.lookback_days),
    remove_best_day: removeBestDay(oos),
    concentration: concentration(oos),
    neighbours,
    overlap: exactLedgerOverlap(member),
  };
  result.verdict = verdictFor(result);
  return result;
}

// ---------------------------------------------------------------------------
// Members 2 and 3 — gate-only until their causal datasets exist
// ---------------------------------------------------------------------------

export function evaluateFundingCarry(paths, readJson) {
  const member = 'FUNDING_PERSISTENCE_CARRY';
  const gate = gateDatasets(member, paths, readJson);
  if (!gate.complete) {
    return dataInadequate(
      member,
      gate.missing,
      'Causal synchronized spot, perpetual, funding publication time, borrow, basis and two-leg execution data are all required. ' +
        'Funding and borrow cannot be derived from candles, and no proxy was used.',
    );
  }
  return {
    member,
    verdict: 'DATA_INADEQUATE',
    executable: false,
    missing_inputs: [
      {
        dataset: 'carry',
        reason: 'FIXED_THRESHOLD_NOT_DERIVABLE',
        required_fields: REQUIRED_INPUTS[member].carry,
        missing_fields: [],
        detail:
          'All fields are present, but the fixed carry threshold must be shown to cover funding, borrow, basis drift and ' +
          'both execution legs before any evaluation is permitted. That cost decomposition is not yet frozen for this venue set.',
      },
    ],
    substitution_refused: true,
    note: 'Gate reached but not cleared. No PnL was computed and none was pooled with any other member.',
  };
}

export function evaluateNewsForcedFlow(paths, readJson) {
  const member = 'NEWS_FORCED_FLOW_REACTION';
  const gate = gateDatasets(member, paths, readJson);
  if (!gate.complete) {
    return dataInadequate(
      member,
      gate.missing,
      'Causal first_seen news time, event label, aligned price and execution data are all required. ' +
        'A price move is not a news event: no candle-derived pseudo-label was substituted.',
    );
  }
  return {
    member,
    verdict: 'DATA_INADEQUATE',
    executable: false,
    predeclared_rule: NEWS_PREDECLARED_RULE,
    missing_inputs: [
      {
        dataset: 'news',
        reason: 'CAUSAL_TIMESTAMP_UNVERIFIED',
        required_fields: REQUIRED_INPUTS[member].news,
        missing_fields: [],
        detail:
          'All fields are present, but first_seen_ts must be proven to be our own ingest time rather than a publisher timestamp ' +
          'before the event study is causal. Future-dated published_at values were previously observed on this lane.',
      },
    ],
    substitution_refused: true,
    note: 'Gate reached but not cleared. No PnL was computed and none was pooled with any other member.',
  };
}

// ---------------------------------------------------------------------------
// Overlap and verdict
// ---------------------------------------------------------------------------

/**
 * Exact trade-timestamp ledger overlap against the blocked families.
 * The per-trade ledgers were not retained, so this cannot be measured. It therefore
 * returns UNAVAILABLE, and the verdict logic below treats that as blocking.
 */
export function exactLedgerOverlap(member) {
  const adjacency = DECLARED_ADJACENCY[member] ?? [];
  return {
    status: 'UNAVAILABLE',
    method: 'exact trade-timestamp and daily-return correlation against each blocked family',
    blocked_families: BLOCKED_FAMILIES,
    declared_adjacency: adjacency,
    measurable: false,
    reason:
      'Per-trade timestamp ledgers for the rejected families were not retained alongside the AH-005A archive, so exact ' +
      'overlap cannot be computed. Declared adjacency cannot be cleared by assertion.',
    blocking: adjacency.length > 0,
  };
}

/**
 * Ordered gates. Data first, then out-of-sample, then robustness, then overlap.
 * A passport draft is unreachable while the overlap gate is unmeasured and the member
 * has declared adjacency to a blocked family.
 */
export function verdictFor(r) {
  const h = r.holdout;
  const f = r.forward;
  const c = r.combined_oos;

  if (
    h.n < FROZEN.min_oos_observations ||
    f.n < FROZEN.min_oos_observations ||
    h.days < FROZEN.min_oos_days ||
    f.days < FROZEN.min_oos_days ||
    c.days < FROZEN.min_combined_days
  ) {
    return 'DATA_INADEQUATE';
  }
  if ([h, f].some((s) => s.net_mean_bps <= 0 || s.net_median_bps <= 0) || r.null.p_value === null || r.null.p_value >= FROZEN.alpha) {
    return 'OOS_FAIL_REJECT_FAMILY';
  }
  if (
    r.double_cost_oos.net_median_bps < 0 ||
    r.remove_best_symbol.stats.net_total_bps <= 0 ||
    r.remove_best_day.stats.net_total_bps <= 0 ||
    r.concentration.max_symbol_abs_share > FROZEN.max_symbol_share ||
    r.neighbours.some((x) => x.stats.net_median_bps === null || x.stats.net_median_bps < 0)
  ) {
    return 'ROBUSTNESS_FAIL_DEPRIORITIZE';
  }
  if (r.overlap.blocking || r.overlap.status !== 'MEASURED') {
    return 'DUPLICATE_OR_OVERLAP_BLOCKED';
  }
  return 'CANDIDATE_PASSPORT_DRAFT';
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export function runTriad(paths, readJson) {
  const members = [
    evaluateCrossSectional(paths, readJson),
    evaluateFundingCarry(paths, readJson),
    evaluateNewsForcedFlow(paths, readJson),
  ];
  return {
    task: FROZEN.task,
    label: 'DISCOVERY_NOT_PROOF',
    protocol: `reference/AH041_TRIAD_STRUCTURAL_STRATEGIES_PROTOCOL_${FROZEN.protocol_date}.md`,
    pnl_pooling: 'NEVER — each member carries its own independent verdict and its own statistics.',
    promising_count: 0,
    frozen: FROZEN,
    blocked_families: BLOCKED_FAMILIES,
    members,
    verdicts: Object.fromEntries(members.map((m) => [m.member, m.verdict])),
  };
}

export function toCsv(report) {
  const header = 'member,verdict,executable,holdout_n,forward_n,oos_net_median_bps,null_p_value,overlap_status,missing_datasets';
  const rows = report.members.map((m) => {
    const missing = (m.missing_inputs ?? []).map((x) => `${x.dataset}:${x.reason}`).join('|');
    const cell = (v) => (v === null || v === undefined ? '' : v);
    return [
      m.member,
      m.verdict,
      m.executable,
      cell(m.holdout?.n),
      cell(m.forward?.n),
      cell(m.combined_oos?.net_median_bps),
      cell(m.null?.p_value),
      cell(m.overlap?.status),
      missing ? `"${missing}"` : '',
    ].join(',');
  });
  return [header, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `ah041_triad_structural_strategies.mjs — TASK-AH-041 triad, research only

Usage:
  node scripts/analysis/ah041_triad_structural_strategies.mjs [options]

Member 1 (CS_RELATIVE_STRENGTH_24H):
  --universe <file>     Frozen AH-005A universe manifest {universe_id, frozen_at, symbols[]}
  --daily-bars <file>   {SYMBOL: [{ts,o,h,l,c,v}, ...]} daily bars

Member 2 (FUNDING_PERSISTENCE_CARRY):
  --carry <file>        Rows with spot/perp price, funding_rate + funding_publish_ts,
                        borrow_rate, basis, and both-leg bid/ask

Member 3 (NEWS_FORCED_FLOW_REACTION):
  --news <file>         Rows with first_seen_ts, event_label, symbol
  --news-prices <file>  Rows with ts, symbol, price, bid, ask

Output:
  --out <base>          Write <base>.json and <base>.csv (nothing is written without it)

Any member whose required inputs are absent returns DATA_INADEQUATE naming every missing
field. Candles are never substituted for funding, borrow, basis, execution or news data.
No network, process, service, credential, exchange, account, order or position path exists
in this program.`;

export function parseArgs(argv) {
  const opts = { paths: {}, out: null, help: false };
  const map = {
    '--universe': 'universe',
    '--daily-bars': 'daily_bars',
    '--carry': 'carry',
    '--news': 'news',
    '--news-prices': 'news_prices',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      continue;
    }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (map[arg]) opts.paths[map[arg]] = next();
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
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const report = runTriad(opts.paths, readJsonFile);
  process.stdout.write(`${JSON.stringify({ task: report.task, verdicts: report.verdicts }, null, 2)}\n`);

  if (opts.out) {
    const base = resolve(opts.out);
    mkdirSync(dirname(base), { recursive: true });
    writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    writeFileSync(`${base}.csv`, toCsv(report), 'utf8');
    process.stdout.write(`wrote ${base}.json\nwrote ${base}.csv\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
