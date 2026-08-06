// Tests for depth_vs_spread_decay.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  FROZEN, spreadBps, spreadPredicate, signedMoveBps, moments, separation,
  compareAccumulated, poolDiff, verdict, parseArgs,
} from './analysis/depth_vs_spread_decay.mjs';

const SRC = readFileSync('scripts/analysis/depth_vs_spread_decay.mjs', 'utf8');
let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

const snap = (ts, bid, ask) => ({ ts, bid, ask, buy_notional: 1, sell_notional: 1,
  bid_depth_prev: 1, bid_depth_next: 1, ask_depth_prev: 1, ask_depth_next: 1 });

t('the prediction and its thresholds are frozen before the run', () => {
  assert.deepStrictEqual([...FROZEN.horizons_s], [5, 10, 30, 60]);
  assert.strictEqual(FROZEN.predicted_short_horizon, 'B_MATCHES_A');
  assert.strictEqual(FROZEN.predicted_long_horizon, 'A_BEATS_B');
  assert.strictEqual(FROZEN.resolve_at_t, 3);
  assert.strictEqual(FROZEN.indistinguishable_below_t, 1.0);
});

t('tau=0 is absent from the grid, because a forward move over zero seconds is zero', () => {
  assert.ok(!FROZEN.horizons_s.includes(0));
});

t('predicate B never reads flow or depth', () => {
  const body = SRC.slice(SRC.indexOf('export function spreadPredicate'), SRC.indexOf('// Positive is favourable'));
  assert.ok(!/guardState|buy_notional|sell_notional|depth/.test(body), 'B must be spread-only');
});

t('B vetoes on a widening spread and allows otherwise', () => {
  const s = [snap(0, 99.99, 100.01), snap(1, 99.9, 100.1), snap(2, 99.99, 100.01)];
  assert.strictEqual(spreadPredicate(s, 1), 'VETO', 'widened');
  assert.strictEqual(spreadPredicate(s, 2), 'ALLOW', 'narrowed');
  assert.strictEqual(spreadPredicate(s, 0), null, 'no previous snapshot to compare against');
});

t('spread is measured against the mid', () => {
  assert.ok(Math.abs(spreadBps({ bid: 99.99, ask: 100.01 }) - 2) < 1e-3);
  assert.strictEqual(spreadBps({ bid: 0, ask: 1 }), null);
});

t('the forward move is signed toward the intended direction', () => {
  assert.ok(signedMoveBps('LONG', 100, 101) > 0);
  assert.ok(signedMoveBps('SHORT', 100, 101) < 0);
  assert.ok(signedMoveBps('SHORT', 100, 99) > 0);
  assert.strictEqual(signedMoveBps('LONG', 0, 1), null);
});

t('separation is ALLOW minus VETO, so a working predicate is positive', () => {
  const acc = { allow: { n: 100, s: 100, ss: 200 }, veto: { n: 100, s: -100, ss: 200 } };
  const r = separation(acc);
  assert.ok(Math.abs(r.separation_bps - 2) < 1e-9, `got ${r.separation_bps}`);
  assert.ok(r.t > 0);
});

t('a mean with no dispersion behind it is withheld', () => {
  assert.strictEqual(moments({ n: 1, s: 5, ss: 25 }).mean, null);
  assert.strictEqual(separation({ allow: { n: 1, s: 1, ss: 1 }, veto: { n: 50, s: 0, ss: 5 } }).separation_bps, null);
});

t('the difference is accumulated per observation, not from two aggregates', () => {
  // Both predicates are evaluated on the SAME states, so their separations are correlated.
  // Differencing two independent standard errors would overstate the precision; the source
  // must accumulate the per-observation difference instead.
  assert.ok(/contribA - contribB/.test(SRC), 'per-observation differencing must be present');
  const r = compareAccumulated({ n: 400, s: 0, ss: 400 });
  assert.strictEqual(r.difference_bps, 0);
  assert.ok(r.se_bps > 0);
});

t('two identical predicates give exactly zero difference', () => {
  assert.strictEqual(compareAccumulated({ n: 100, s: 0, ss: 0 }).difference_bps, 0);
});

t('pooling weights by observation count, not by symbol', () => {
  const per = [
    { by_horizon: { 30: { difference: { n: 1_000_000, difference_bps: 0.5, se_bps: 0.001 } } } },
    { by_horizon: { 30: { difference: { n: 10, difference_bps: -50, se_bps: 0.001 } } } },
  ];
  const p = poolDiff(per, 30);
  assert.ok(p.difference_bps > 0.49, `a tiny symbol must not swing the pool, got ${p.difference_bps}`);
});

t('the predicted crossover is recognised only when BOTH halves hold', () => {
  const asPredicted = { 5: { t: 0.4 }, 10: { t: 0.8 }, 30: { t: 5 }, 60: { t: 7 } };
  assert.strictEqual(verdict(asPredicted), 'AS_PREDICTED_DEPTH_EARNS_ITS_KEEP_AT_LONG_HORIZON');
});

t('depth winning at every horizon is NOT the predicted crossover and is named separately', () => {
  const everywhere = { 5: { t: 9 }, 10: { t: 9 }, 30: { t: 9 }, 60: { t: 9 } };
  assert.strictEqual(verdict(everywhere), 'DEPTH_BEATS_SPREAD_BUT_NOT_ONLY_AT_LONG_HORIZON');
});

t('depth never separating is the falsifying outcome and is named', () => {
  const never = { 5: { t: 0.2 }, 10: { t: 0.1 }, 30: { t: 0.5 }, 60: { t: 1.2 } };
  assert.strictEqual(verdict(never), 'DEPTH_FEED_REDUNDANT_AT_EVERY_HORIZON');
});

t('the spread rule winning at long horizon is named too', () => {
  const bWins = { 5: { t: 0.2 }, 10: { t: 0.1 }, 30: { t: -6 }, 60: { t: -8 } };
  assert.strictEqual(verdict(bWins), 'SPREAD_BEATS_DEPTH');
});

t('an incomplete grid does not resolve', () => {
  assert.strictEqual(verdict({ 5: { t: 1 } }), 'UNRESOLVED');
});

t('parseArgs reads data and out', () => {
  const o = parseArgs(['--data', '/d', '--out', '/o']);
  assert.strictEqual(o.data, '/d');
  assert.strictEqual(o.out, '/o');
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
