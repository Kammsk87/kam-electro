// Tests for cross_venue_gap_clause_c.mjs
import assert from 'node:assert';
import {
  FROZEN, gapBps, lastAt, excursions, quantiles, runSymbol, verdict, parsePairs, parseArgs,
  basisAdjustedVerdict,
} from './analysis/cross_venue_gap_clause_c.mjs';

let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

const S = (pairs) => pairs.map(([ts, px]) => ({ ts, px }));

t('the criterion numbers are frozen before the run', () => {
  assert.strictEqual(FROZEN.floor_bps, 16);
  assert.strictEqual(FROZEN.two_leg_floor_bps, 32);
  assert.strictEqual(FROZEN.own_dispersion_bps, 3.6);
  assert.strictEqual(FROZEN.min_excursion_ms, 1_000);
});

t('the measured clock offset is recorded even though it is not applied', () => {
  assert.strictEqual(FROZEN.clock_offset_applied_ms, 0);
  assert.strictEqual(FROZEN.clock_offset_measured_ms, -2);
  assert.ok(Math.abs(FROZEN.clock_offset_measured_ms) < FROZEN.grid_ms,
    'an offset larger than one grid step could not be ignored');
});

t('gap is signed from Bybit toward Binance', () => {
  assert.ok(Math.abs(gapBps(101, 100) - 100) < 1e-9, 'Binance above Bybit is positive');
  assert.ok(gapBps(99, 100) < 0);
  assert.strictEqual(gapBps(0, 100), null);
  assert.strictEqual(gapBps(100, 0), null);
});

t('lastAt takes the observation at or before the instant, never after', () => {
  const s = S([[1000, 10], [2000, 20]]);
  assert.strictEqual(lastAt(s, 1999).px, 10, 'must not peek at the 2000 print');
  assert.strictEqual(lastAt(s, 2000).px, 20);
});

t('a print older than the tolerance is refused, never stretched', () => {
  // This is the defect that produced a 39-hour median staleness in the first G3 run:
  // comparing a fresh price against an ancient one manufactures a gap out of nothing.
  const s = S([[0, 10]]);
  assert.strictEqual(lastAt(s, FROZEN.max_print_age_ms + 1), null);
  assert.ok(lastAt(s, FROZEN.max_print_age_ms) != null);
});

t('nothing before the series starts', () => {
  assert.strictEqual(lastAt(S([[1000, 10]]), 999), null);
  assert.strictEqual(lastAt([], 5), null);
});

t('excursions are measured in time, not in samples', () => {
  const e = excursions([false, true, true, true, false, true], 100);
  assert.deepStrictEqual(e, [300, 100]);
});

t('an excursion running to the end of the series is still counted', () => {
  assert.deepStrictEqual(excursions([false, true, true], 100), [200]);
});

t('quantiles do not run off the end', () => {
  const q = quantiles([1, 2, 3], [0, 0.5, 1]);
  assert.deepStrictEqual(q, [1, 2, 3]);
  assert.deepStrictEqual(quantiles([], [0.5]), [null]);
});

t('two venues quoting the same price give a zero gap and no excursions', () => {
  const a = S(Array.from({ length: 50 }, (_, i) => [i * 100, 100]));
  const r = runSymbol(a, a, 1.0);
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(r.abs_p50, 0);
  assert.strictEqual(r.pct_over_16, 0);
  assert.strictEqual(r.excursions_over_16_ge_1s, 0);
});

t('a sustained 20 bps dislocation is detected and its duration measured', () => {
  const byb = S(Array.from({ length: 60 }, (_, i) => [i * 100, 100]));
  // Binance sits 20 bps above for the first 3 seconds, then converges.
  const bin = S(Array.from({ length: 60 }, (_, i) => [i * 100, i < 30 ? 100.2 : 100]));
  const r = runSymbol(bin, byb, 1.0);
  assert.ok(r.pct_over_16 > 0, `expected excursions, got ${r.pct_over_16}`);
  assert.ok(r.excursions_over_16_ge_1s >= 1);
  assert.ok(r.longest_excursion_16_ms >= 2_000, `got ${r.longest_excursion_16_ms}`);
});

t('a one-tick blip shorter than a second does not count as actionable', () => {
  const byb = S(Array.from({ length: 60 }, (_, i) => [i * 100, 100]));
  const bin = S(Array.from({ length: 60 }, (_, i) => [i * 100, i === 10 ? 100.2 : 100]));
  const r = runSymbol(bin, byb, 1.0);
  assert.ok(r.pct_over_16 > 0, 'the sample itself is over the floor');
  assert.strictEqual(r.excursions_over_16_ge_1s, 0, 'but it is too brief to act on');
});

t('a wide-spread symbol is flagged as bounce rather than opportunity', () => {
  // Gaps of ~20 bps on a symbol whose own spread is 14 bps are bid-ask bounce.
  const byb = S(Array.from({ length: 60 }, (_, i) => [i * 100, i % 2 ? 100 : 100.14]));
  const bin = S(Array.from({ length: 60 }, (_, i) => [i * 100, i % 2 ? 100.14 : 100]));
  const r = runSymbol(bin, byb, 14.13);
  assert.strictEqual(r.gap_exceeds_own_spread, false,
    'a gap no larger than twice the spread must not be called a dislocation');
});

t('no overlap between the two venues is reported, not silently zeroed', () => {
  const r = runSymbol(S([[0, 100], [1000, 100]]), S([[900_000, 100], [901_000, 100]]));
  assert.ok(['NO_OVERLAP', 'TOO_FEW'].includes(r.status), `got ${r.status}`);
});

t('the verdict judges liquid symbols, because wide ones show bounce', () => {
  const wideOnly = [{ status: 'OK', own_bybit_spread_bps: 14, pct_over_16: 5, excursions_over_16_ge_1s: 40 },
    { status: 'OK', own_bybit_spread_bps: 1.1, pct_over_16: 0, excursions_over_16_ge_1s: 0 }];
  assert.strictEqual(verdict(wideOnly), 'CLAUSE_C_FAILS_TRACK_CLOSED',
    'a wide-spread symbol bouncing must not carry the verdict');
});

t('a real dislocation on a liquid symbol passes the clause', () => {
  const v = verdict([{ status: 'OK', own_bybit_spread_bps: 1.1, pct_over_16: 0.5, excursions_over_16_ge_1s: 12 }]);
  assert.strictEqual(v, 'CLAUSE_C_PASSES');
});

t('an empty result set does not resolve', () => {
  assert.strictEqual(verdict([]), 'UNRESOLVED');
});

t('pairs parse and sort', () => {
  const p = parsePairs('2000 1.5\n1000 2.5\nbad\n\n3000 0\n');
  assert.strictEqual(p.length, 2, 'zero price and junk dropped');
  assert.strictEqual(p[0].ts, 1000);
});

t('parseArgs reads all four paths', () => {
  const o = parseArgs(['--binance', '/b', '--bybit', '/y', '--spreads', '/s', '--out', '/o']);
  assert.strictEqual(o.binance, '/b');
  assert.strictEqual(o.bybit, '/y');
  assert.strictEqual(o.spreads, '/s');
});

// --- the post-hoc correction --------------------------------------------------

t('a persistent basis brushing the threshold is NOT a dislocation', () => {
  // BNBUSDT as measured: mean +11.19, p99.9 15.88, own spread 1.75. The frozen rule fires
  // on it; the basis-adjusted one must not.
  const bnb = { status: 'OK', symbol: 'BNBUSDT', mean_signed_bps: 11.19, abs_p999: 15.88,
    own_bybit_spread_bps: 1.75, pct_over_16: 0.0568, excursions_over_16_ge_1s: 24 };
  assert.strictEqual(verdict([bnb]), 'CLAUSE_C_PASSES', 'the frozen rule fires, as it did');
  assert.strictEqual(basisAdjustedVerdict([bnb]).verdict, 'CLAUSE_C_FAILS_TRACK_CLOSED');
});

t('a genuine dislocation clears basis, spread and floor together', () => {
  const real = { status: 'OK', symbol: 'X', mean_signed_bps: 0.5, abs_p999: 40,
    own_bybit_spread_bps: 1.0, pct_over_16: 1.0, excursions_over_16_ge_1s: 100 };
  assert.strictEqual(basisAdjustedVerdict([real]).verdict, 'CLAUSE_C_PASSES');
});

t('the correction declares itself post-hoc', () => {
  const r = basisAdjustedVerdict([{ status: 'OK', symbol: 'X', mean_signed_bps: 0,
    abs_p999: 1, own_bybit_spread_bps: 1 }]);
  assert.strictEqual(r.post_hoc, true, 'a rule written after seeing data must say so');
});

t('a wide-spread symbol cannot carry the corrected verdict either', () => {
  const wide = { status: 'OK', symbol: 'AERGOUSDT', mean_signed_bps: -19.21, abs_p999: 115.2,
    own_bybit_spread_bps: 8.93, pct_over_16: 63.7, excursions_over_16_ge_1s: 16534 };
  assert.strictEqual(basisAdjustedVerdict([wide]).verdict, 'CLAUSE_C_FAILS_TRACK_CLOSED');
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
