// Tests for taker_quote_entry_measurement.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  FROZEN, takerPrice, takerImprovementBps, spreadBps, runSymbol, pool, verdict, parseArgs,
  spreadControlSymbol, guardVsControl,
} from './analysis/taker_quote_entry_measurement.mjs';

const SRC = readFileSync('scripts/analysis/taker_quote_entry_measurement.mjs', 'utf8');

let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

const veto = (ts, bid, ask) => ({
  ts, bid, ask, buy_notional: 10, sell_notional: 1000,
  bid_depth_prev: 1000, bid_depth_next: 100,
  ask_depth_prev: 1000, ask_depth_next: 1000,
});
const allow = (ts, bid, ask) => ({
  ts, bid, ask, buy_notional: 1000, sell_notional: 10,
  bid_depth_prev: 100, bid_depth_next: 1000,
  ask_depth_prev: 100, ask_depth_next: 1000,
});

t('a prior and a range are registered before any run', () => {
  assert.ok(FROZEN.prior_expectation_bps >= 0);
  assert.strictEqual(FROZEN.prior_range_bps.length, 2);
  assert.ok(FROZEN.prior_basis.length > 30);
});

t('a taker buying pays the ask, a taker selling receives the bid', () => {
  const s = allow(0, 100, 100.1);
  assert.strictEqual(takerPrice(s, 'LONG'), 100.1);
  assert.strictEqual(takerPrice(s, 'SHORT'), 100);
});

t('a zero or missing quote is null, never zero-priced', () => {
  assert.strictEqual(takerPrice({ bid: 0, ask: 0 }, 'LONG'), null);
  assert.strictEqual(takerPrice(null, 'LONG'), null);
});

t('a long improves when the ask falls', () => {
  const v = takerImprovementBps('LONG', 100, 99);
  assert.ok(v > 0 && Math.abs(v - 100) < 1e-6, `got ${v}`);
});

t('a short improves when the bid rises', () => {
  const v = takerImprovementBps('SHORT', 100, 101);
  assert.ok(v > 0 && Math.abs(v - 100) < 1e-6, `got ${v}`);
});

t('a long is harmed when the ask rises, and the sign says so', () => {
  assert.ok(takerImprovementBps('LONG', 100, 101) < 0);
});

t('spread is measured against the mid, in bps', () => {
  const s = spreadBps({ bid: 99.99, ask: 100.01 });
  assert.ok(Math.abs(s - 2.0) < 1e-3, `got ${s}`);
});

t('an ALLOW intent counts as exactly zero and is not dropped', () => {
  const snaps = [allow(0, 100, 100.1), allow(10_000, 100, 100.1)];
  const r = runSymbol(snaps, 3);
  // 2 snapshots x 2 directions; all ALLOW, all zero, none rejected.
  assert.strictEqual(r.n, 4);
  assert.strictEqual(r.mean_bps, 0);
});

t('a veto that resolves into a better ask shows a taker gain', () => {
  const snaps = [veto(0, 100, 100.1), allow(10_000, 99, 99.1)];
  const r = runSymbol(snaps, 3);
  assert.ok(r.mean_bps > 0, `expected a gain, got ${r.mean_bps}`);
});

t('a veto that resolves into a WIDER spread can erase the gain', () => {
  // Mid does not move at all, but the ask is pushed out: a print-based measure would
  // see nothing while the taker pays more. This is the failure mode being tested for.
  const snaps = [veto(0, 99.995, 100.005), allow(10_000, 99.95, 100.05)];
  const r = runSymbol(snaps, 3);
  const longOnly = takerImprovementBps('LONG', 100.005, 100.05);
  assert.ok(longOnly < 0, 'a widened ask must show as a loss for the buyer');
  assert.ok(r.mean_bps != null);
});

t('running out of archive rejects rather than clamping to the last snapshot', () => {
  // A single snapshot: the direction it vetoes has nowhere to wait to and must be
  // rejected by reason. The mirror direction is ALLOW on the same snapshot and is
  // counted at zero, so n is 1, not 0 — asserting n===0 would be asserting that a
  // perfectly valid ALLOW got thrown away with it.
  const r = runSymbol([veto(0, 100, 100.1)], 3);
  assert.strictEqual(r.rejects.get('RAN_OUT_OF_ARCHIVE'), 1);
  assert.strictEqual(r.n, 1);
  // n=1 yields no standard error, so the mean is withheld rather than reported as a
  // point estimate with no dispersion behind it.
  assert.strictEqual(r.mean_bps, null);
});

t('a wait longer than the 30s cap is counted, not silently accepted', () => {
  // Three snapshots spaced 20s apart: resolving at the third is a 40s wait even though
  // it is only two snapshots. The snapshot count says 2; the clock says over cap.
  const snaps = [veto(0, 100, 100.1), veto(20_000, 100, 100.1), allow(40_000, 99, 99.1)];
  const r = runSymbol(snaps, 3);
  assert.ok(r.waits_over_30s > 0, 'a 40s wait must be flagged against the 30s cap');
});

t('pool gives intent-level variance, not the variance of symbol means', () => {
  const p = pool([{ n: 1000, mean_bps: 0.05, se_bps: 0.01 }, { n: 1000, mean_bps: 0.05, se_bps: 0.01 }]);
  assert.strictEqual(p.n, 2000);
  assert.ok(Math.abs(p.se_bps - 0.01 / Math.SQRT2) < 1e-3, `got ${p.se_bps}`);
});

t('the verdict refuses to resolve below t=3, in either direction', () => {
  assert.strictEqual(verdict({ mean_bps: 0.05, t_stat: 2.9 }), 'UNRESOLVED');
  assert.strictEqual(verdict({ mean_bps: -0.05, t_stat: -2.9 }), 'UNRESOLVED');
});

t('the verdict names erasure when the resolved sign is negative', () => {
  assert.strictEqual(verdict({ mean_bps: -0.05, t_stat: -9 }), 'TAKER_GAIN_ERASED_BY_SPREAD');
  assert.strictEqual(verdict({ mean_bps: 0.05, t_stat: 9 }), 'TAKER_GAIN_SURVIVES');
});

t('parseArgs reads data and out', () => {
  const o = parseArgs(['--data', '/d', '--out', '/o']);
  assert.strictEqual(o.data, '/d');
  assert.strictEqual(o.out, '/o');
});

// --- the spread-only control -------------------------------------------------

const u = t;

u('the control never reads flow or depth', () => {
  const body = SRC.slice(SRC.indexOf('export function spreadControlSymbol'), SRC.indexOf('export function guardVsControl'));
  assert.ok(body.length > 200, 'control body must be found');
  assert.ok(!/guardState|buy_notional|sell_notional|depth/.test(body), 'control must be spread-only');
});

u('a non-widening snapshot executes immediately at zero', () => {
  const s = [allow(0, 99.99, 100.01), allow(10_000, 99.99, 100.01), allow(20_000, 99.99, 100.01)];
  const r = spreadControlSymbol(s, 3);
  assert.strictEqual(r.mean_bps, 0);
});

u('a widened spread that comes back in is scored as a taker gain for the buyer', () => {
  const s = [
    allow(0, 99.99, 100.01),      // tight
    allow(10_000, 99.90, 100.10), // widened -> control triggers here
    allow(20_000, 99.99, 100.01), // back in -> clears
  ];
  const r = spreadControlSymbol(s, 3);
  assert.ok(r.mean_bps > 0, `expected a gain, got ${r.mean_bps}`);
});

u('the control rejects at the tape end rather than clamping', () => {
  const s = [allow(0, 99.99, 100.01), allow(10_000, 99.90, 100.10)];
  const r = spreadControlSymbol(s, 3);
  assert.ok(r.n <= 2, 'the widened tail must not be scored against a fabricated future');
});

u('guardVsControl refuses to resolve below t=3', () => {
  const v = guardVsControl({ mean_bps: 0.077, se_bps: 0.002 }, { mean_bps: 0.075, se_bps: 0.004 });
  assert.strictEqual(v.verdict, 'PREDICATE_INDISTINGUISHABLE_FROM_SPREAD_RULE');
});

u('guardVsControl reports when the predicate genuinely adds', () => {
  const v = guardVsControl({ mean_bps: 0.20, se_bps: 0.002 }, { mean_bps: 0.05, se_bps: 0.004 });
  assert.strictEqual(v.verdict, 'PREDICATE_ADDS_OVER_SPREAD_RULE');
  assert.ok(v.control_share_of_guard < 0.3);
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
