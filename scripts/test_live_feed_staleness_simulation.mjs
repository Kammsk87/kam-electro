// Tests for live_feed_staleness_simulation.mjs
import assert from 'node:assert';
import {
  FROZEN, simulateIntent, runOffset, pool, parseArgs,
} from './analysis/live_feed_staleness_simulation.mjs';
import { makePriceSource } from './analysis/g3_guard_execution_harness.mjs';

let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

// A VETO snapshot for LONG: aggressive sell exceeds buy, and bid depth falls.
const veto = (ts, bid, ask) => ({
  ts, bid, ask, buy_notional: 10, sell_notional: 1000,
  bid_depth_prev: 1000, bid_depth_next: 100,
  ask_depth_prev: 1000, ask_depth_next: 1000,
});
// An ALLOW snapshot: flow agrees with the intent and depth holds.
const allow = (ts, bid, ask) => ({
  ts, bid, ask, buy_notional: 1000, sell_notional: 10,
  bid_depth_prev: 100, bid_depth_next: 1000,
  ask_depth_prev: 100, ask_depth_next: 1000,
});
const ticksFrom = (pairs) => makePriceSource(pairs.map(([ts, px]) => ({ ts, px })));

t('frozen offsets start at zero so the aligned control exists', () => {
  assert.strictEqual(FROZEN.offsets_ms[0], 0);
  assert.ok(FROZEN.offsets_ms.every((x, i, a) => i === 0 || x > a[i - 1]), 'offsets must increase');
});

t('frozen poll cycle matches the recorder that produced the archive', () => {
  assert.strictEqual(FROZEN.poll_cycle_ms, 10_000);
  assert.ok(FROZEN.offsets_ms.at(-1) < FROZEN.poll_cycle_ms, 'offsets must stay inside one cycle');
});

t('a prior is registered before any run', () => {
  assert.ok(FROZEN.prior_expectation_bps > 0);
  assert.ok(typeof FROZEN.prior_basis === 'string' && FROZEN.prior_basis.length > 20);
});

t('an ALLOW intent contributes exactly zero, and is counted not dropped', () => {
  const snaps = [allow(0, 100, 100.1), allow(10_000, 101, 101.1)];
  const px = ticksFrom([[0, 100], [5_000, 100.5], [10_000, 101]]);
  const r = simulateIntent(snaps, px, 0, 'LONG', 5_000, 3);
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(r.improvement_bps, 0);
  assert.strictEqual(r.allowed, true);
});

t('at offset zero a falling price gives the guarded branch a better long entry', () => {
  const snaps = [veto(0, 100, 100.1), allow(10_000, 99, 99.1)];
  const px = ticksFrom([[0, 100], [10_000, 99]]);
  const r = simulateIntent(snaps, px, 0, 'LONG', 0, 3);
  assert.strictEqual(r.status, 'OK');
  assert.ok(r.improvement_bps > 0, `expected positive, got ${r.improvement_bps}`);
});

t('the same intent measured later improves less: staleness eats the edge', () => {
  const snaps = [veto(0, 100, 100.1), allow(10_000, 99, 99.1)];
  const px = ticksFrom([[0, 100], [2_500, 99.75], [5_000, 99.5], [10_000, 99]]);
  const a = simulateIntent(snaps, px, 0, 'LONG', 0, 3).improvement_bps;
  const b = simulateIntent(snaps, px, 0, 'LONG', 5_000, 3).improvement_bps;
  assert.ok(a > b, `offset 0 (${a}) must beat offset 5000 (${b})`);
  assert.ok(b > 0, 'a partial edge should remain at 5s');
});

t('when the baseline catches up to the guarded moment the edge is exactly zero', () => {
  const snaps = [veto(0, 100, 100.1), allow(10_000, 99, 99.1)];
  const px = ticksFrom([[0, 100], [10_000, 99]]);
  const r = simulateIntent(snaps, px, 0, 'LONG', 10_000, 3);
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(r.improvement_bps, 0);
});

t('a short is scored with the opposite sign', () => {
  // For SHORT the veto mirror needs sell-side pressure reversed.
  const s = (ts, bid, ask) => ({
    ts, bid, ask, buy_notional: 1000, sell_notional: 10,
    bid_depth_prev: 1000, bid_depth_next: 1000,
    ask_depth_prev: 1000, ask_depth_next: 100,
  });
  const snaps = [s(0, 100, 100.1), allow(10_000, 101, 101.1)];
  const px = ticksFrom([[0, 100], [10_000, 101]]);
  const r = simulateIntent(snaps, px, 0, 'SHORT', 0, 3);
  assert.strictEqual(r.status, 'OK');
  assert.ok(r.improvement_bps > 0, 'a rising price is a better short entry');
});

t('a price older than the tolerance is rejected, never substituted', () => {
  const snaps = [veto(0, 100, 100.1), allow(10_000, 99, 99.1)];
  const px = ticksFrom([[900_000, 50]]);
  const r = simulateIntent(snaps, px, 0, 'LONG', 0, 3);
  assert.strictEqual(r.status, 'BASELINE_STALE');
});

t('running out of archive rejects rather than clamping to the last snapshot', () => {
  const snaps = [veto(0, 100, 100.1)];
  const px = ticksFrom([[0, 100]]);
  const r = simulateIntent(snaps, px, 0, 'LONG', 0, 3);
  assert.strictEqual(r.status, 'RAN_OUT_OF_ARCHIVE');
});

t('runOffset counts both directions at every snapshot', () => {
  const snaps = [allow(0, 100, 100.1), allow(10_000, 100, 100.1), allow(20_000, 100, 100.1)];
  const px = ticksFrom([[0, 100], [10_000, 100], [20_000, 100], [30_000, 100]]);
  const r = runOffset(snaps, px, 0, 3);
  assert.strictEqual(r.n, 6, `3 snapshots x 2 directions, got ${r.n}`);
});

t('runOffset reports rejects by reason instead of silently shrinking n', () => {
  const snaps = [veto(0, 100, 100.1), veto(10_000, 100, 100.1)];
  const px = ticksFrom([[0, 100], [10_000, 100]]);
  const r = runOffset(snaps, px, 0, 3);
  assert.ok(r.rejects.size > 0, 'rejects must be reported');
});

t('pool gives the intent-level variance, not the variance of symbol means', () => {
  // Two symbols with identical intent-level spread; pooling must not shrink the se to
  // the spread between the two means.
  const a = { n: 1000, mean_bps: 0.05, se_bps: 0.01 };
  const b = { n: 1000, mean_bps: 0.05, se_bps: 0.01 };
  const p = pool([a, b]);
  assert.strictEqual(p.n, 2000);
  assert.ok(Math.abs(p.mean_bps - 0.05) < 1e-12);
  // se scales as 1/sqrt(n): pooling two equal groups should give ~0.01/sqrt(2).
  assert.ok(Math.abs(p.se_bps - 0.01 / Math.SQRT2) < 1e-3, `got se ${p.se_bps}`);
});

t('pool weights by n, so a large symbol dominates a small one', () => {
  const p = pool([
    { n: 1_000_000, mean_bps: 0.10, se_bps: 0.001 },
    { n: 10, mean_bps: -5.0, se_bps: 0.001 },
  ]);
  assert.ok(p.mean_bps > 0.09, `tiny symbol must not swing the pool, got ${p.mean_bps}`);
});

t('pool skips degenerate symbols rather than emitting NaN', () => {
  const p = pool([{ n: 1, mean_bps: 0.5, se_bps: 0 }, { n: 0, mean_bps: null, se_bps: null }]);
  assert.strictEqual(p.mean_bps, null);
});

t('parseArgs reads data and out', () => {
  const o = parseArgs(['--data', '/d', '--out', '/o']);
  assert.strictEqual(o.data, '/d');
  assert.strictEqual(o.out, '/o');
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
