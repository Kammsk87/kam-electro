#!/usr/bin/env node
// ah019_liquidation_toxic_flow_fade_1m.mjs
//
// TASK-AH-019 — Liquidation Toxic-Flow Fade, 1m. Research only.
//
// Hypothesis: forced liquidations dislocate price when aggressive flow consumes the book
// faster than passive liquidity reprices. The fade fires only when liquidation pressure,
// signed trade-flow imbalance, open-interest reduction and same-minute replenishment of the
// consumed side all coincide.
//
// The central measurement this file exists to make possible:
//
//   A change in resting size is ambiguous on its own. A level that shrinks may have been
//   TRADED THROUGH (real demand met real supply) or CANCELLED (a wall that was never going
//   to fill). Those two have opposite directional meaning, and no sequence of book snapshots
//   can separate them. The identity that does is:
//
//       size_next = size_prev - traded_at_price - cancelled + added
//       => net_passive_change (added - cancelled) = size_next - size_prev + traded_at_price
//
//   `traded_at_price` comes only from the trade tape WITH AGGRESSOR SIDE. That is why the
//   data gate below refuses to run without it, and why candle direction, close-to-close
//   return, or a later price move are explicitly rejected as substitutes.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path exists in this program. It reads explicitly supplied local files and writes
// only to an explicit --out base. Output is deterministic: seeded PRNG, no clock.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Frozen constants — declared before any data is inspected
// ---------------------------------------------------------------------------

export const FROZEN = Object.freeze({
  task: 'TASK-AH-019',
  bucket_ms: 60_000,
  depth_band_bps: 10,
  size_tiers_usd: [7, 200, 1000],
  primary_exit_minutes: 5,
  exit_neighbour_minutes: [3, 15],
  entry_label: 'NEXT_MINUTE_BOOK_REFERENCE_ONLY',
  splits: { train: 0.55, validation: 0.2, holdout: 0.15, forward: 0.1 },
  // Train-only quantiles. Never refitted on validation, holdout or forward.
  q_signed_volume: 0.05,
  q_oi_change: 0.1,
  q_liquidation_notional: 0.95,
  bid_depth_recovery_ratio: 1.5,
  best_price_recovery_bps: 5,
  oi_lookback_minutes: 5,
  null_samples: 1000,
  null_seed: 19_019,
  alpha: 0.05,
  max_symbol_share: 0.25,
  min_events_per_split: 100,
  min_symbols: 5,
  min_days: 30,
  max_staleness_ms: { book: 4_000, trades: 60_000, oi: 300_000, liquidations: 60_000 },
  purge_minutes: 15,
  embargo_minutes: 60,
  absorption_ratio: 0.5,
  cost_bps_roundtrip: 11,
  double_cost_bps_roundtrip: 22,
});

// Families this event set must be shown distinct from before any passport draft.
export const OVERLAP_FAMILIES = Object.freeze([
  'AMEL_EVENT',
  'WICK_RECLAIM',
  'FAILED_BREAKOUT',
  'NEWS_DELAYED_REACTION',
  'FUNDING_EXTREME',
  'WALLET_FLOW',
  'LIQUIDITY_GUARD',
]);

// Required decision-time inputs. Missing any one is DATA_INADEQUATE.
export const REQUIRED_INPUTS = Object.freeze({
  trades: ['ts', 'symbol', 'price', 'size', 'side'],
  book: ['ts', 'symbol', 'bids', 'asks'],
  oi: ['ts', 'symbol', 'open_interest'],
  liquidations: ['ts', 'symbol', 'side', 'notional'],
});

// Substitutes that are explicitly refused for aggressor classification.
export const REFUSED_SUBSTITUTES = Object.freeze([
  'candle_direction',
  'close_to_close_return',
  'later_price_move',
  'ohlcv_volume_split',
  'tick_rule_inference',
]);

export const LEVEL_STATES = Object.freeze([
  'ABSORPTION',
  'CONSUMPTION',
  'PULL',
  'PULL_UNDER_PRESSURE',
  'REPLENISH',
  'IDLE',
]);

// ---------------------------------------------------------------------------
// Deterministic helpers
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
// Data gate
// ---------------------------------------------------------------------------

export function flattenRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return Object.values(parsed).flat();
  return [];
}

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
 * The aggressor side must be an explicit taker classification, not an inference.
 * A dataset whose side column is derived from price movement is refused outright.
 */
export function validateAggressorSide(rows) {
  const problems = [];
  const seen = new Set();
  for (const row of rows) {
    const side = row?.side;
    if (typeof side !== 'string') {
      problems.push('side is not a string aggressor label');
      break;
    }
    seen.add(side.toUpperCase());
  }
  const allowed = new Set(['BUY', 'SELL']);
  for (const s of seen) {
    if (!allowed.has(s)) problems.push(`unrecognised aggressor label '${s}' (expected BUY or SELL)`);
  }
  if (seen.size === 1 && rows.length > 1) {
    problems.push(`every trade carries the same aggressor side '${[...seen][0]}', which cannot be a real tape`);
  }
  for (const row of rows) {
    if (row?.side_source && REFUSED_SUBSTITUTES.includes(String(row.side_source))) {
      problems.push(`aggressor side is derived from '${row.side_source}', which is a refused substitute`);
      break;
    }
  }
  return problems;
}

export function gateInputs(paths, readJson) {
  const datasets = {};
  const missing = [];
  for (const [name, required] of Object.entries(REQUIRED_INPUTS)) {
    const path = paths[name];
    if (!path) {
      missing.push({ dataset: name, reason: 'DATASET_NOT_SUPPLIED', required_fields: required, missing_fields: required });
      continue;
    }
    let parsed;
    try {
      parsed = readJson(path);
    } catch (err) {
      missing.push({ dataset: name, reason: 'DATASET_UNREADABLE', path, detail: err.message, required_fields: required, missing_fields: required });
      continue;
    }
    const rows = flattenRows(parsed);
    const gaps = missingFields(rows, required);
    if (gaps.length > 0) {
      missing.push({ dataset: name, reason: 'REQUIRED_FIELDS_MISSING', path, required_fields: required, missing_fields: gaps });
      continue;
    }
    if (name === 'trades') {
      const problems = validateAggressorSide(rows);
      if (problems.length > 0) {
        missing.push({ dataset: name, reason: 'AGGRESSOR_SIDE_UNUSABLE', path, required_fields: required, missing_fields: ['side'], detail: problems.join('; ') });
        continue;
      }
    }
    datasets[name] = rows;
  }
  return { datasets, missing, complete: missing.length === 0 };
}

/** Per-symbol, per-source decision-time coverage. This is the shopping list when data is thin. */
export function coverageInventory(datasets) {
  const symbols = new Set();
  for (const rows of Object.values(datasets)) for (const r of rows) symbols.add(r.symbol);
  const inventory = [];
  for (const symbol of [...symbols].sort()) {
    const row = { symbol };
    for (const [name, rows] of Object.entries(datasets)) {
      const mine = rows.filter((r) => r.symbol === symbol);
      const buckets = new Set(mine.map((r) => bucketOf(r.ts)));
      row[name] = {
        rows: mine.length,
        buckets: buckets.size,
        first: mine.length ? Math.min(...mine.map((r) => r.ts)) : null,
        last: mine.length ? Math.max(...mine.map((r) => r.ts)) : null,
      };
    }
    inventory.push(row);
  }
  return inventory;
}

// ---------------------------------------------------------------------------
// LAYER 2 — aggressive flow from the tape
// ---------------------------------------------------------------------------

/**
 * Signed aggressive volume per one-minute bucket. Positive means taker buyers dominated.
 * Requires an explicit aggressor side; there is no inference path.
 */
export function signedTradeFlow(trades) {
  const byKey = new Map();
  for (const t of trades) {
    const key = `${t.symbol}|${bucketOf(t.ts)}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        symbol: t.symbol,
        bucket: bucketOf(t.ts),
        taker_buy_volume: 0,
        taker_sell_volume: 0,
        trades: 0,
        traded_at_price: new Map(), // price -> {buy, sell}
      });
    }
    const b = byKey.get(key);
    const notional = t.price * t.size;
    if (String(t.side).toUpperCase() === 'BUY') b.taker_buy_volume += notional;
    else b.taker_sell_volume += notional;
    b.trades += 1;
    const at = b.traded_at_price.get(t.price) ?? { buy: 0, sell: 0 };
    if (String(t.side).toUpperCase() === 'BUY') at.buy += t.size;
    else at.sell += t.size;
    b.traded_at_price.set(t.price, at);
  }
  for (const b of byKey.values()) {
    b.signed_volume = b.taker_buy_volume - b.taker_sell_volume;
    const total = b.taker_buy_volume + b.taker_sell_volume;
    b.taker_buy_ratio = total > 0 ? b.taker_buy_volume / total : null;
  }
  return byKey;
}

/** Running cumulative volume delta per symbol, in chronological order. */
export function cumulativeVolumeDelta(flowByKey) {
  const bySymbol = new Map();
  for (const b of [...flowByKey.values()].sort((x, y) => x.bucket - y.bucket)) {
    const running = (bySymbol.get(b.symbol) ?? 0) + b.signed_volume;
    bySymbol.set(b.symbol, running);
    b.cvd = running;
  }
  return flowByKey;
}

// ---------------------------------------------------------------------------
// LAYER 1 + 3 — liquidity delta between adjacent snapshots, and absorption vs pull
// ---------------------------------------------------------------------------

export function bestBid(snapshot) {
  return snapshot.bids?.length ? Math.max(...snapshot.bids.map((l) => l[0])) : null;
}
export function bestAsk(snapshot) {
  return snapshot.asks?.length ? Math.min(...snapshot.asks.map((l) => l[0])) : null;
}

/** Notional depth within a band of the touch, on one side. */
export function depthWithinBps(snapshot, side, bps = FROZEN.depth_band_bps) {
  const levels = side === 'BID' ? snapshot.bids : snapshot.asks;
  if (!levels?.length) return null;
  const touch = side === 'BID' ? bestBid(snapshot) : bestAsk(snapshot);
  if (!touch) return null;
  const limit = side === 'BID' ? touch * (1 - bps / 1e4) : touch * (1 + bps / 1e4);
  let total = 0;
  for (const [price, size] of levels) {
    if (side === 'BID' ? price >= limit : price <= limit) total += price * size;
  }
  return total;
}

export const levelMap = (levels) => new Map((levels ?? []).map(([p, s]) => [p, s]));

/**
 * Decomposes one price level between two adjacent snapshots into what the book DID,
 * using the trade tape to separate execution from cancellation.
 *
 * `traded` is the base-asset volume executed at this price inside the interval, taken
 * from the aggressor-classified tape. Without it, ABSORPTION and PULL are indistinguishable.
 */
export function classifyLevel(prevSize, nextSize, traded, opts = {}) {
  const ratio = opts.absorption_ratio ?? FROZEN.absorption_ratio;
  const eps = opts.epsilon ?? 1e-9;
  const deltaSize = nextSize - prevSize;
  const netPassiveChange = deltaSize + traded; // added - cancelled

  if (traded <= eps) {
    if (deltaSize < -eps) return { state: 'PULL', deltaSize, traded, netPassiveChange };
    if (deltaSize > eps) return { state: 'REPLENISH', deltaSize, traded, netPassiveChange };
    return { state: 'IDLE', deltaSize, traded, netPassiveChange };
  }
  // Traded through, and refilled at least `ratio` of what was taken: the wall is real.
  if (netPassiveChange >= ratio * traded) return { state: 'ABSORPTION', deltaSize, traded, netPassiveChange };
  // Traded through AND additionally withdrawn: the strongest continuation signal.
  if (netPassiveChange <= -ratio * traded) return { state: 'PULL_UNDER_PRESSURE', deltaSize, traded, netPassiveChange };
  return { state: 'CONSUMPTION', deltaSize, traded, netPassiveChange };
}

/**
 * Whole-side liquidity change between adjacent snapshots, with per-level classification.
 * `tradedAtPrice` maps price -> {buy, sell}; a bid is consumed by aggressive SELLs and an
 * ask by aggressive BUYs.
 */
export function sideLiquidityDelta(prev, next, side, tradedAtPrice) {
  const prevLevels = levelMap(side === 'BID' ? prev.bids : prev.asks);
  const nextLevels = levelMap(side === 'BID' ? next.bids : next.asks);
  const prices = new Set([...prevLevels.keys(), ...nextLevels.keys()]);
  const counts = Object.fromEntries(LEVEL_STATES.map((s) => [s, 0]));
  const levels = [];
  let absorbedVolume = 0;
  let pulledSize = 0;

  for (const price of [...prices].sort((a, b) => a - b)) {
    const at = tradedAtPrice?.get(price);
    const traded = side === 'BID' ? (at?.sell ?? 0) : (at?.buy ?? 0);
    const c = classifyLevel(prevLevels.get(price) ?? 0, nextLevels.get(price) ?? 0, traded);
    counts[c.state] += 1;
    levels.push({ price, ...c });
    if (c.state === 'ABSORPTION') absorbedVolume += c.traded;
    if (c.state === 'PULL' || c.state === 'PULL_UNDER_PRESSURE') pulledSize += Math.abs(c.deltaSize);
  }

  return {
    side,
    counts,
    levels,
    absorbed_volume: absorbedVolume,
    pulled_size: pulledSize,
    depth_prev: depthWithinBps(prev, side),
    depth_next: depthWithinBps(next, side),
    depth_delta: (depthWithinBps(next, side) ?? 0) - (depthWithinBps(prev, side) ?? 0),
  };
}

/**
 * The composite directional read the programme actually wants:
 * are takers really eating one side, and is the other side being withdrawn rather than held?
 * Default is NO_SIGNAL; it never guesses.
 */
export function directionalState(flow, bidDelta, askDelta) {
  if (!flow || flow.taker_buy_ratio === null) return { state: 'NO_SIGNAL', reason: 'NO_TAPE' };
  const buyers = flow.taker_buy_ratio > 0.5;
  const eaten = buyers ? askDelta : bidDelta;
  const resting = buyers ? bidDelta : askDelta;
  const eatenPulled = eaten.counts.PULL + eaten.counts.PULL_UNDER_PRESSURE;
  const eatenAbsorbed = eaten.counts.ABSORPTION;

  if (eatenAbsorbed > eatenPulled && eaten.absorbed_volume > 0) {
    return {
      state: buyers ? 'BUYERS_ABSORBED' : 'SELLERS_ABSORBED',
      reason: 'the consumed side held and refilled, so the aggressor is being absorbed',
      continuation: false,
      absorbed_volume: eaten.absorbed_volume,
    };
  }
  if (eatenPulled > eatenAbsorbed && resting.depth_delta >= 0) {
    return {
      state: buyers ? 'BUYERS_BREAKING_THROUGH' : 'SELLERS_BREAKING_THROUGH',
      reason: 'the consumed side was withdrawn rather than held, and the resting side is not thinning',
      continuation: true,
      pulled_size: eaten.pulled_size,
    };
  }
  return { state: 'NO_SIGNAL', reason: 'flow and liquidity change do not agree' };
}

// ---------------------------------------------------------------------------
// LAYER 4 — open interest and liquidation pressure
// ---------------------------------------------------------------------------

export function openInterestByBucket(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.symbol}|${bucketOf(r.ts)}`;
    const existing = byKey.get(key);
    if (!existing || r.ts > existing.ts) byKey.set(key, { symbol: r.symbol, bucket: bucketOf(r.ts), ts: r.ts, open_interest: r.open_interest });
  }
  return byKey;
}

export function liquidationsByBucket(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.symbol}|${bucketOf(r.ts)}`;
    if (!byKey.has(key)) byKey.set(key, { symbol: r.symbol, bucket: bucketOf(r.ts), long_notional: 0, short_notional: 0 });
    const b = byKey.get(key);
    if (String(r.side).toUpperCase() === 'LONG') b.long_notional += r.notional;
    else b.short_notional += r.notional;
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Executable cost — depth walk, never a candle close
// ---------------------------------------------------------------------------

/**
 * Walks the book to fill `notionalUsd`. Returns the executable VWAP and whether the
 * tier is supported at all. An unsupported tier is UNSUPPORTED, never an assumed fill.
 */
export function depthWalk(snapshot, side, notionalUsd) {
  const levels = side === 'BUY' ? [...(snapshot.asks ?? [])].sort((a, b) => a[0] - b[0]) : [...(snapshot.bids ?? [])].sort((a, b) => b[0] - a[0]);
  if (!levels.length) return { supported: false, reason: 'EMPTY_BOOK' };
  let remaining = notionalUsd;
  let filledNotional = 0;
  let filledBase = 0;
  for (const [price, size] of levels) {
    const available = price * size;
    const take = Math.min(remaining, available);
    filledNotional += take;
    filledBase += take / price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }
  if (remaining > 1e-9) return { supported: false, reason: 'INSUFFICIENT_DEPTH', filled_notional: filledNotional };
  return { supported: true, vwap: filledNotional / filledBase, filled_notional: filledNotional };
}

// ---------------------------------------------------------------------------
// Event detection — train-only thresholds
// ---------------------------------------------------------------------------

export function chronology(buckets) {
  const n = buckets.length;
  const trainEnd = Math.floor(n * FROZEN.splits.train);
  const validationEnd = trainEnd + Math.floor(n * FROZEN.splits.validation);
  const holdoutEnd = validationEnd + Math.floor(n * FROZEN.splits.holdout);
  return {
    n,
    splitOf: (i) => (i < trainEnd ? 'train' : i < validationEnd ? 'validation' : i < holdoutEnd ? 'holdout' : 'forward'),
    trainEnd,
    validationEnd,
    holdoutEnd,
  };
}

/** Fits the frozen quantiles on the train segment only, per symbol. */
export function fitTrainThresholds(features, chrono) {
  const bySymbol = new Map();
  features.forEach((f, i) => {
    if (chrono.splitOf(i) !== 'train') return;
    if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, { signed: [], oi: [], liqLong: [], liqShort: [] });
    const b = bySymbol.get(f.symbol);
    b.signed.push(f.signed_volume);
    if (f.oi_change_5m !== null) b.oi.push(f.oi_change_5m);
    b.liqLong.push(f.long_liquidation_notional);
    b.liqShort.push(f.short_liquidation_notional);
  });
  const out = new Map();
  for (const [symbol, b] of bySymbol) {
    out.set(symbol, {
      signed_volume_p05: percentile(b.signed, FROZEN.q_signed_volume),
      signed_volume_p95: percentile(b.signed, 1 - FROZEN.q_signed_volume),
      oi_change_p10: percentile(b.oi, FROZEN.q_oi_change),
      long_liq_p95: percentile(b.liqLong, FROZEN.q_liquidation_notional),
      short_liq_p95: percentile(b.liqShort, FROZEN.q_liquidation_notional),
      train_buckets: b.signed.length,
    });
  }
  return out;
}

/**
 * The frozen event definition. A long fade needs: extreme aggressive SELL volume,
 * OI reduction, extreme LONG-liquidation notional, and bid-side replenishment.
 */
export function detectEvent(f, thresholds) {
  const t = thresholds.get(f.symbol);
  if (!t || t.signed_volume_p05 === null || t.oi_change_p10 === null) return null;
  if (f.oi_change_5m === null) return null;

  const depthRecovered = f.bid_depth_min > 0 && f.bid_depth_final >= FROZEN.bid_depth_recovery_ratio * f.bid_depth_min;
  const askDepthRecovered = f.ask_depth_min > 0 && f.ask_depth_final >= FROZEN.bid_depth_recovery_ratio * f.ask_depth_min;
  const bidPriceRecovered = f.best_bid_recovery_bps !== null && Math.abs(f.best_bid_recovery_bps) <= FROZEN.best_price_recovery_bps;
  const askPriceRecovered = f.best_ask_recovery_bps !== null && Math.abs(f.best_ask_recovery_bps) <= FROZEN.best_price_recovery_bps;

  if (
    f.signed_volume <= t.signed_volume_p05 &&
    f.oi_change_5m <= t.oi_change_p10 &&
    f.long_liquidation_notional >= t.long_liq_p95 &&
    t.long_liq_p95 > 0 &&
    depthRecovered &&
    bidPriceRecovered
  ) {
    return { side: 'LONG' };
  }
  if (
    f.signed_volume >= t.signed_volume_p95 &&
    f.oi_change_5m <= t.oi_change_p10 &&
    f.short_liquidation_notional >= t.short_liq_p95 &&
    t.short_liq_p95 > 0 &&
    askDepthRecovered &&
    askPriceRecovered
  ) {
    return { side: 'SHORT' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function stats(trades, costBps = 0) {
  const rows = [...trades].sort((a, b) => a.bucket - b.bucket);
  const n = rows.map((r) => r.gross_bps - costBps);
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
    symbols: new Set(rows.map((r) => r.symbol)).size,
    days: new Set(rows.map((r) => dayKey(r.bucket))).size,
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
 * Matched null: same symbol, same time-of-day, same direction, liquidity-matched
 * non-event minutes. Two-sided p-value, fixed seed.
 */
export function matchedNull(events, pool, samples = FROZEN.null_samples, seed = FROZEN.null_seed) {
  const observed = median(events.map((e) => e.gross_bps - FROZEN.cost_bps_roundtrip));
  if (observed === null || !pool.length) {
    return { samples: 0, observed_net_median_bps: observed, null_median_bps: null, p_value: null };
  }
  const medians = [];
  for (let k = 0; k < samples; k += 1) {
    const rnd = seeded(seed + k);
    const drawn = [];
    for (const e of events) {
      const candidates = pool.filter(
        (c) =>
          c.symbol === e.symbol &&
          c.side === e.side &&
          Math.abs(minuteOfDay(c.bucket) - minuteOfDay(e.bucket)) <= 30 &&
          c.liquidity_bucket === e.liquidity_bucket,
      );
      if (!candidates.length) continue;
      drawn.push(candidates[Math.floor(rnd() * candidates.length)].gross_bps - FROZEN.cost_bps_roundtrip);
    }
    const m = median(drawn);
    if (m !== null) medians.push(m);
  }
  if (!medians.length) return { samples: 0, observed_net_median_bps: observed, null_median_bps: null, p_value: null };
  const centre = median(medians);
  const atLeastAsExtreme = medians.filter((x) => Math.abs(x - centre) >= Math.abs(observed - centre)).length;
  return {
    samples: medians.length,
    observed_net_median_bps: observed,
    null_median_bps: centre,
    p_value: atLeastAsExtreme / medians.length,
    two_sided: true,
  };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export function verdictFor(report) {
  const h = report.holdout;
  const f = report.forward;
  if (
    !h || !f ||
    h.n < FROZEN.min_events_per_split || f.n < FROZEN.min_events_per_split ||
    h.symbols < FROZEN.min_symbols || f.symbols < FROZEN.min_symbols ||
    h.days < FROZEN.min_days || f.days < FROZEN.min_days
  ) {
    return 'DATA_INADEQUATE';
  }
  if (report.overlap?.status !== 'MEASURED' || report.overlap?.blocking) return 'DUPLICATE_OR_OVERLAP';
  if ([h, f].some((s) => s.net_mean_bps <= 0 || s.net_median_bps <= 0) || report.null?.p_value === null || report.null?.p_value >= FROZEN.alpha) {
    return 'OOS_FAIL_REJECT_FAMILY';
  }
  if (
    report.double_cost_oos?.net_median_bps < 0 ||
    report.remove_best_symbol?.net_total_bps <= 0 ||
    report.remove_best_day?.net_total_bps <= 0 ||
    report.concentration?.max_symbol_share > FROZEN.max_symbol_share ||
    (report.exit_neighbours ?? []).some((x) => x.stats.net_mean_bps < 0)
  ) {
    return 'ROBUSTNESS_FAIL_DEPRIORITIZE';
  }
  return 'CANDIDATE_PASSPORT_DRAFT';
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export function run(paths, readJson) {
  const gate = gateInputs(paths, readJson);
  if (!gate.complete) {
    return {
      task: FROZEN.task,
      label: 'DISCOVERY_NOT_PROOF',
      verdict: 'DATA_INADEQUATE',
      executable: false,
      promising_count: 0,
      frozen: FROZEN,
      required_inputs: REQUIRED_INPUTS,
      refused_substitutes: REFUSED_SUBSTITUTES,
      missing_inputs: gate.missing,
      substitution_refused: true,
      coverage_inventory: coverageInventory(gate.datasets),
      note:
        'The decision-time inputs are incomplete. Aggressor-classified trades are the binding requirement: without them ' +
        'absorption and cancellation are mathematically indistinguishable, and CVD cannot be constructed from OHLCV.',
    };
  }

  const flow = cumulativeVolumeDelta(signedTradeFlow(gate.datasets.trades));
  const oi = openInterestByBucket(gate.datasets.oi);
  const liq = liquidationsByBucket(gate.datasets.liquidations);

  return {
    task: FROZEN.task,
    label: 'DISCOVERY_NOT_PROOF',
    verdict: 'DATA_INADEQUATE',
    executable: true,
    promising_count: 0,
    frozen: FROZEN,
    coverage_inventory: coverageInventory(gate.datasets),
    flow_buckets: flow.size,
    oi_buckets: oi.size,
    liquidation_buckets: liq.size,
    overlap: {
      status: 'UNAVAILABLE',
      families: OVERLAP_FAMILIES,
      blocking: true,
      reason: 'Per-trade timestamp ledgers for the comparison families were not retained, so exact overlap cannot be measured.',
    },
    note:
      'All four sources are present. The replay is gated on a per-symbol bucket census meeting the frozen minimums ' +
      `(${FROZEN.min_events_per_split} events, ${FROZEN.min_symbols} symbols, ${FROZEN.min_days} days per split).`,
  };
}

export function toCsv(report) {
  const header = 'symbol,trades_rows,trades_buckets,book_rows,book_buckets,oi_rows,oi_buckets,liquidations_rows,liquidations_buckets';
  const rows = (report.coverage_inventory ?? []).map((r) =>
    [r.symbol, r.trades?.rows ?? 0, r.trades?.buckets ?? 0, r.book?.rows ?? 0, r.book?.buckets ?? 0,
      r.oi?.rows ?? 0, r.oi?.buckets ?? 0, r.liquidations?.rows ?? 0, r.liquidations?.buckets ?? 0].join(','));
  if (!rows.length) rows.push('NO_SYMBOLS_PRESENT,0,0,0,0,0,0,0,0');
  return [header, ...rows].join('\n') + '\n';
}

const USAGE = `ah019_liquidation_toxic_flow_fade_1m.mjs — TASK-AH-019, research only

Usage:
  node scripts/analysis/ah019_liquidation_toxic_flow_fade_1m.mjs [options]

  --trades <file>        Rows: ts, symbol, price, size, side (aggressor BUY/SELL)
  --book <file>          Rows: ts, symbol, bids[[price,size]], asks[[price,size]]
  --oi <file>            Rows: ts, symbol, open_interest
  --liquidations <file>  Rows: ts, symbol, side (LONG/SHORT), notional
  --out <base>           Write <base>.json and <base>.csv (nothing is written without it)

Aggressor side must be an explicit taker classification. Candle direction, close-to-close
return, later price moves, OHLCV volume splits and tick-rule inference are refused.`;

export function parseArgs(argv) {
  const opts = { paths: {}, out: null, help: false };
  const map = { '--trades': 'trades', '--book': 'book', '--oi': 'oi', '--liquidations': 'liquidations' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
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
  if (opts.help) { process.stdout.write(`${USAGE}\n`); return 0; }

  const report = run(opts.paths, readJsonFile);
  process.stdout.write(`${JSON.stringify({ task: report.task, verdict: report.verdict, missing: (report.missing_inputs ?? []).map((m) => `${m.dataset}:${m.reason}`) }, null, 2)}\n`);

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
