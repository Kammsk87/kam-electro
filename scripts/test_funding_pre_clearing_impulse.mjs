// Tests for funding_pre_clearing_impulse.mjs
import assert from 'node:assert';
import {
  FROZEN, isSettlementHour, hourBoundaries, signedImpulseBps, priceAt, fundingAt,
  measureEvent, moments, clusteredMoments, compare, verdicts, parseArgs,
} from './analysis/funding_pre_clearing_impulse.mjs';

let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

const H = (h) => Date.UTC(2026, 7, 6, h, 0, 0);

t('the registration is frozen before any run', () => {
  assert.deepStrictEqual([...FROZEN.settlement_hours_utc], [0, 8, 16]);
  assert.strictEqual(FROZEN.window_start_s, -60);
  assert.strictEqual(FROZEN.window_end_s, -5);
  assert.deepStrictEqual([...FROZEN.prior_range_bps], [0.5, 2.5]);
  assert.strictEqual(FROZEN.cost_floor_bps, 16);
});

t('settlement hours are recognised in UTC and nothing else is', () => {
  for (const h of [0, 8, 16]) assert.ok(isSettlementHour(H(h)), `hour ${h}`);
  for (const h of [1, 7, 9, 15, 17, 23]) assert.ok(!isSettlementHour(H(h)), `hour ${h}`);
});

t('boundaries cover every hour and tag settlements correctly', () => {
  const b = hourBoundaries(H(0) - 1, H(23));
  assert.strictEqual(b.length, 24);
  assert.strictEqual(b.filter((x) => x.settlement).length, 3, 'three settlements a day');
  assert.strictEqual(b.filter((x) => !x.settlement).length, 21, 'twenty-one controls a day');
});

// --- the sign convention, which is the whole hypothesis -----------------------

t('FR positive and price falling is the thesis holding, so the impulse is positive', () => {
  // Longs pay: they close, pushing price down. That is the predicted behaviour.
  const v = signedImpulseBps(0.0001, 100, 99);
  assert.ok(v > 0, `expected positive, got ${v}`);
  assert.ok(Math.abs(v - 100) < 1e-9);
});

t('FR negative and price rising is also the thesis holding', () => {
  const v = signedImpulseBps(-0.0001, 100, 101);
  assert.ok(v > 0, `expected positive, got ${v}`);
});

t('FR positive with price RISING contradicts the thesis and scores negative', () => {
  assert.ok(signedImpulseBps(0.0001, 100, 101) < 0);
});

t('a zero funding rate has no predicted direction and is rejected', () => {
  assert.strictEqual(signedImpulseBps(0, 100, 101), null);
});

// --- causality ----------------------------------------------------------------

t('the funding rate is taken from at or before the window, never after', () => {
  const rates = [{ ts: 1000, rate: 0.001 }, { ts: 5000, rate: 0.002 }];
  assert.strictEqual(fundingAt(rates, 4999).rate, 0.001, 'must not see the 5000 rate');
  assert.strictEqual(fundingAt(rates, 5000).rate, 0.002, 'at the instant is allowed');
});

t('a funding rate older than the tolerance is refused, not stretched', () => {
  const rates = [{ ts: 0, rate: 0.001 }];
  assert.strictEqual(fundingAt(rates, FROZEN.funding_max_age_ms + 1), null);
  assert.ok(fundingAt(rates, FROZEN.funding_max_age_ms) != null);
});

t('there is no funding before the archive starts', () => {
  assert.strictEqual(fundingAt([{ ts: 1000, rate: 1 }], 999), null);
});

// --- price matching -----------------------------------------------------------

t('the nearest price within tolerance is used, on either side', () => {
  const px = [{ ts: 900, px: 1 }, { ts: 1200, px: 2 }];
  assert.strictEqual(priceAt(px, 1000).px, 1, 'nearest is the earlier one');
  assert.strictEqual(priceAt(px, 1150).px, 2);
});

t('a price outside the tolerance is refused rather than substituted', () => {
  // This is the G3 defect: without the guard a print from hours away gets matched and
  // produces a confident number out of nothing.
  const px = [{ ts: 0, px: 1 }];
  assert.strictEqual(priceAt(px, FROZEN.max_price_age_ms + 1), null);
  assert.ok(priceAt(px, FROZEN.max_price_age_ms) != null);
});

t('an empty tape yields null, not a crash', () => {
  assert.strictEqual(priceAt([], 100), null);
});

// --- event assembly -----------------------------------------------------------

t('a complete event is measured end to end', () => {
  const b = H(8);
  const px = [{ ts: b - 60_000, px: 100 }, { ts: b - 5_000, px: 99 }];
  const fr = [{ ts: b - 120_000, rate: 0.0002 }];
  const r = measureEvent(px, fr, b);
  assert.strictEqual(r.status, 'OK');
  assert.ok(r.impulse_bps > 0);
  assert.strictEqual(r.abs_fr, 0.0002);
  assert.strictEqual(r.boundary_ts, b);
});

t('each missing input is rejected by its own named reason', () => {
  const b = H(8);
  const px = [{ ts: b - 60_000, px: 100 }, { ts: b - 5_000, px: 99 }];
  assert.strictEqual(measureEvent(px, [], b).status, 'NO_FUNDING');
  assert.strictEqual(measureEvent([{ ts: b - 5_000, px: 99 }], [{ ts: b - 120_000, rate: 1e-4 }], b).status, 'NO_START_PRICE');
  assert.strictEqual(measureEvent([{ ts: b - 60_000, px: 100 }], [{ ts: b - 120_000, rate: 1e-4 }], b).status, 'NO_END_PRICE');
});

// --- statistics ---------------------------------------------------------------

t('clustering treats the settlement, not the symbol-settlement, as independent', () => {
  // Ten symbols moving identically at one instant is ONE observation, not ten.
  const events = Array.from({ length: 10 }, (_, i) => ({ boundary_ts: 1000, impulse_bps: 5, symbol: `S${i}` }));
  const c = clusteredMoments(events);
  assert.strictEqual(c.clusters, 1);
  assert.strictEqual(c.symbol_events, 10);
  assert.strictEqual(c.n, 1, 'n must be clusters, not symbol-events');
});

t('clustering keeps distinct instants separate', () => {
  const c = clusteredMoments([
    { boundary_ts: 1, impulse_bps: 2 }, { boundary_ts: 1, impulse_bps: 4 },
    { boundary_ts: 2, impulse_bps: 6 },
  ]);
  assert.strictEqual(c.clusters, 2);
  assert.strictEqual(c.n, 2);
  assert.ok(Math.abs(c.mean - 4.5) < 1e-9, `cluster means 3 and 6 -> 4.5, got ${c.mean}`);
});

t('the comparison combines both standard errors', () => {
  const c = compare({ mean: 5, se: 3 }, { mean: 1, se: 4 });
  assert.strictEqual(c.difference_bps, 4);
  assert.ok(Math.abs(c.se_bps - 5) < 1e-9);
  assert.ok(Math.abs(c.t - 0.8) < 1e-9);
});

// --- the two verdicts, kept apart ---------------------------------------------

t('below t=3 nothing resolves, in either direction', () => {
  assert.strictEqual(verdicts({ difference_bps: 2, t: 2.9 }).physics, 'UNRESOLVED');
  assert.strictEqual(verdicts({ difference_bps: -2, t: -2.9 }).physics, 'UNRESOLVED');
});

t('a real impulse below the floor is a physics result and NOT a strategy', () => {
  const v = verdicts({ difference_bps: 2.0, t: 9 });
  assert.strictEqual(v.physics, 'IMPULSE_EXISTS');
  assert.strictEqual(v.economics, 'BELOW_FLOOR');
});

t('the registered prior range is entirely below the floor, by construction', () => {
  // The operator registered 0.5-2.5 bps AND required 16 bps to succeed. Those cannot both
  // hold. Splitting the verdicts is what makes the registration coherent instead of
  // pre-registered to fail.
  assert.ok(FROZEN.prior_range_bps[1] < FROZEN.cost_floor_bps);
  assert.strictEqual(verdicts({ difference_bps: FROZEN.prior_range_bps[1], t: 9 }).economics, 'BELOW_FLOOR');
});

t('an inverted impulse is named, not reported as a win', () => {
  assert.strictEqual(verdicts({ difference_bps: -5, t: -9 }).physics, 'IMPULSE_INVERTED');
});

t('parseArgs accepts several tick directories', () => {
  const o = parseArgs(['--ticks', '/a', '--ticks', '/b', '--funding', '/f', '--out', '/o']);
  assert.deepStrictEqual(o.ticks, ['/a', '/b']);
  assert.strictEqual(o.funding, '/f');
});

t('moments withholds a mean it cannot put an error on', () => {
  assert.strictEqual(moments([5]).mean, null);
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
