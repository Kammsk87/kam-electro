#!/usr/bin/env node
// test_ah046_parent_order_flow_imbalance.mjs
//
// Deterministic tests for TASK-AH-046, plus the ship-blocking static no-trading scan.
// Run: node scripts/test_ah046_parent_order_flow_imbalance.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN,
  OVERLAP_FAMILIES,
  REQUIRED_TRADE_FIELDS,
  REFUSED_SUBSTITUTES,
  mean,
  median,
  stdev,
  seeded,
  bucketOf,
  dayKey,
  reconstructParents,
  parentProfile,
  bucketImbalance,
  rehydrateBuckets,
  midAtOrBefore,
  buildObservations,
  chronology,
  assignSplits,
  stats,
  matchedNull,
  removeBest,
  concentration,
  verdictFor,
  evaluate,
  report,
  toCsv,
  parseArgs,
} from './analysis/ah046_parent_order_flow_imbalance.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'ah046_parent_order_flow_imbalance.mjs');
const TEST_PATH = join(HERE, 'test_ah046_parent_order_flow_imbalance.mjs');
const SCANNED_FILES = [ENGINE_PATH, TEST_PATH];

/* static-scan:allow-denylist-start */
const FORBIDDEN_TOKENS = {
  network: ['fetch(', 'XMLHttpRequest', 'WebSocket', 'http.request', 'https.request', 'net.connect',
    'tls.connect', 'dns.', 'dgram', 'axios', 'node-fetch', 'undici'],
  process_service: ['child_process', 'spawnSync', 'spawn(', 'execSync', 'execFile', 'exec(',
    'systemctl', 'sudo ', 'docker ', 'process.kill', 'eval(', 'new Function('],
  credential: ['process.env', 'apiKey', 'api_key', 'apikey', 'Authorization', 'Bearer ',
    'createHmac', 'privateKey', 'PRIVATE KEY', 'id_rsa', '.pem', 'accessToken', 'client_secret'],
  exchange_account: ['api.bybit', 'api.binance', 'okx.com', 'bybit.com', 'binance.com', '/v5/order',
    '/v5/position', '/api/v3/order', '/fapi/', 'createOrder', 'cancelOrder', 'placeOrder',
    'reduceOnly', 'walletBalance', '/account'],
  runtime_state: ['/opt/botalin', '/etc/botalin', 'RESET_TS', 'coordinator', 'approval', 'KILL_SWITCH'],
  filesystem_mutation: ['appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync',
    'truncateSync', 'createWriteStream', 'chmodSync', 'copyFileSync', 'symlinkSync'],
};
const NONZERO_PROMISING = /promising_count\s*[:=]\s*[1-9]/;
const WRITE_TOKENS = ['writeFileSync', 'mkdirSync'];
const WRITE_CALL_RE = /writeFileSync\(/g;
const ALLOWED_FS_IMPORTS = new Set(['readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync']);
/* static-scan:allow-denylist-end */

const results = [];
let currentSection = 'general';
const section = (n) => { currentSection = n; };
function test(name, fn) {
  try { fn(); results.push({ section: currentSection, name, ok: true }); }
  catch (err) { results.push({ section: currentSection, name, ok: false, error: err.message }); }
}
function assert(cond, message) { if (!cond) throw new Error(message); }

const T0 = Date.parse('2026-01-01T00:00:00Z');
const B = FROZEN.bucket_ms;

// ---------------------------------------------------------------------------
// 1. Parent reconstruction
// ---------------------------------------------------------------------------

section('parent reconstruction');

test('a sweep across three levels is one parent, not three trades', () => {
  const prints = [
    { ts: T0, px: 100.0, qty: 1, side: 'Buy' },
    { ts: T0 + 10, px: 100.1, qty: 2, side: 'Buy' },
    { ts: T0 + 20, px: 100.2, qty: 3, side: 'Buy' },
  ];
  const p = reconstructParents(prints);
  assert(p.length === 1, `expected one parent, got ${p.length}`);
  assert(p[0].fills === 3 && p[0].levels === 3, 'all three fills belong to it');
  assert(p[0].sweep === true, 'a multi-level parent is a sweep');
  assert(p[0].qty === 6, 'quantity accumulates');
  assert(Math.abs(p[0].notional - (100 * 1 + 100.1 * 2 + 100.2 * 3)) < 1e-9, 'notional accumulates');
});

test('a gap beyond the frozen threshold starts a new parent', () => {
  const inside = reconstructParents([
    { ts: T0, px: 100, qty: 1, side: 'Buy' },
    { ts: T0 + FROZEN.burst_gap_ms, px: 100, qty: 1, side: 'Buy' },
  ]);
  assert(inside.length === 1, 'exactly at the threshold still continues');
  const outside = reconstructParents([
    { ts: T0, px: 100, qty: 1, side: 'Buy' },
    { ts: T0 + FROZEN.burst_gap_ms + 1, px: 100, qty: 1, side: 'Buy' },
  ]);
  assert(outside.length === 2, 'one millisecond past the threshold splits');
});

test('a change of aggressor side always splits the parent', () => {
  const p = reconstructParents([
    { ts: T0, px: 100, qty: 1, side: 'Buy' },
    { ts: T0 + 1, px: 100, qty: 1, side: 'Sell' },
  ]);
  assert(p.length === 2, 'buyers and sellers are different actors');
  assert(p[0].side === 'BUY' && p[1].side === 'SELL', 'sides are normalised');
});

test('a price retreating against the aggressor splits the parent', () => {
  // A buyer lifting 100.0 then 100.1 is sweeping. A print back at 99.9 is someone else.
  const p = reconstructParents([
    { ts: T0, px: 100.0, qty: 1, side: 'Buy' },
    { ts: T0 + 5, px: 100.1, qty: 1, side: 'Buy' },
    { ts: T0 + 10, px: 99.9, qty: 1, side: 'Buy' },
  ]);
  assert(p.length === 2, 'a retreating price is a different actor');
  assert(p[0].fills === 2 && p[1].fills === 1, 'the split lands in the right place');
});

test('the mirror holds for sellers walking down', () => {
  const p = reconstructParents([
    { ts: T0, px: 100.0, qty: 1, side: 'Sell' },
    { ts: T0 + 5, px: 99.9, qty: 1, side: 'Sell' },
    { ts: T0 + 10, px: 100.2, qty: 1, side: 'Sell' },
  ]);
  assert(p.length === 2, 'a seller whose price rises is a different actor');
  assert(p[0].levels === 2, 'the walk down is one parent');
});

test('repeated prints at one price stay a single parent', () => {
  const p = reconstructParents(Array.from({ length: 5 }, (_, i) => ({ ts: T0 + i * 5, px: 100, qty: 1, side: 'Buy' })));
  assert(p.length === 1 && p[0].fills === 5, 'same price, same side, tight timing');
  assert(p[0].sweep === false, 'one level is not a sweep');
});

test('a wider burst gap merges strictly more, a narrower one splits strictly more', () => {
  const prints = Array.from({ length: 10 }, (_, i) => ({ ts: T0 + i * 120, px: 100 + i * 0.01, qty: 1, side: 'Buy' }));
  const tight = reconstructParents(prints, 50).length;
  const frozen = reconstructParents(prints, FROZEN.burst_gap_ms).length;
  const wide = reconstructParents(prints, 200).length;
  assert(tight >= frozen && frozen >= wide, `monotonicity broken: ${tight}/${frozen}/${wide}`);
  assert(FROZEN.neighbour_burst_gap_ms.length === 2, 'exactly two frozen neighbours');
});

test('an empty tape yields no parents and no profile', () => {
  assert(reconstructParents([]).length === 0, 'no prints, no parents');
  assert(parentProfile([]) === null, 'no parents, no profile');
});

test('the profile reports concentration and sweep share', () => {
  const parents = reconstructParents([
    { ts: T0, px: 100, qty: 100, side: 'Buy' },
    { ts: T0 + 5, px: 100.1, qty: 100, side: 'Buy' },
    { ts: T0 + 500, px: 100, qty: 1, side: 'Sell' },
  ]);
  const prof = parentProfile(parents);
  assert(prof.parents === 2, 'two parents');
  assert(prof.sweeps === 1, 'one sweep');
  assert(prof.sweep_share_of_notional > 0.99, 'the sweep carries nearly all notional');
  assert(prof.top_1pct_share <= 1 && prof.top_1pct_share > 0, 'share is a fraction');
});

// ---------------------------------------------------------------------------
// 2. Signal construction
// ---------------------------------------------------------------------------

section('signal');

test('bucket imbalance is signed buy minus sell notional', () => {
  const parents = [
    { ts: T0, side: 'BUY', notional: 300, sweep: true },
    { ts: T0 + 1000, side: 'SELL', notional: 100, sweep: false },
  ];
  const e = [...bucketImbalance(parents, 'X').values()][0];
  assert(e.imbalance_notional === 200, `expected 200, got ${e.imbalance_notional}`);
  assert(e.direction === 1, 'net buying is direction +1');
  assert(e.parents === 2 && e.sweeps === 1, 'counts carried through');
});

test('a balanced bucket has direction zero and is not traded', () => {
  const parents = [
    { ts: T0, side: 'BUY', notional: 100, sweep: false },
    { ts: T0 + 10, side: 'SELL', notional: 100, sweep: false },
  ];
  const snaps = [{ ts: T0 + B, bid: 99, ask: 101 }, { ts: T0 + 2 * B, bid: 109, ask: 111 }];
  assert(buildObservations(bucketImbalance(parents, 'X'), snaps).length === 0, 'a flat bucket produces no observation');
});

test('parents fall into the bucket of their first fill', () => {
  const parents = [{ ts: T0 + B - 1, side: 'BUY', notional: 10, sweep: false }];
  assert([...bucketImbalance(parents, 'X').keys()][0] === bucketOf(T0 + B - 1), 'bucket floor');
});

test('mid lookup never looks forward', () => {
  const snaps = [
    { ts: 100, bid: 9, ask: 11 },
    { ts: 200, bid: 19, ask: 21 },
    { ts: 300, bid: 29, ask: 31 },
  ];
  assert(midAtOrBefore(snaps, 250) === 20, 'must use the snapshot at or before the timestamp');
  assert(midAtOrBefore(snaps, 200) === 20, 'exact match is allowed');
  assert(midAtOrBefore(snaps, 50) === null, 'nothing before the first snapshot');
  assert(midAtOrBefore(snaps, 10_000) === 30, 'the last snapshot persists');
});

test('the signal is read at bucket close and the outcome is the next bucket', () => {
  const parents = [{ ts: T0 + 10, side: 'BUY', notional: 100, sweep: false }];
  const snaps = [
    { ts: T0 + B, bid: 99.5, ask: 100.5 },
    { ts: T0 + 2 * B, bid: 100.5, ask: 101.5 },
  ];
  const obs = buildObservations(bucketImbalance(parents, 'X'), snaps);
  assert(obs.length === 1, 'one observation');
  assert(obs[0].entry_mid === 100 && obs[0].exit_mid === 101, 'entry at signal-bucket close, exit one bucket later');
  assert(Math.abs(obs[0].gross_bps - 100) < 1e-9, `+1% long should be +100 bps, got ${obs[0].gross_bps}`);
});

test('a short signal is scored in the short direction', () => {
  const parents = [{ ts: T0 + 10, side: 'SELL', notional: 100, sweep: false }];
  const snaps = [{ ts: T0 + B, bid: 99.5, ask: 100.5 }, { ts: T0 + 2 * B, bid: 100.5, ask: 101.5 }];
  const obs = buildObservations(bucketImbalance(parents, 'X'), snaps);
  assert(Math.abs(obs[0].gross_bps + 100) < 1e-9, 'price rising against a short is -100 bps');
});

test('no look-ahead: prices after the exit cannot change an observation', () => {
  const parents = [{ ts: T0 + 10, side: 'BUY', notional: 100, sweep: false }];
  const base = [{ ts: T0 + B, bid: 99.5, ask: 100.5 }, { ts: T0 + 2 * B, bid: 100.5, ask: 101.5 }];
  const withFuture = [...base, { ts: T0 + 9 * B, bid: 500, ask: 501 }];
  const a = buildObservations(bucketImbalance(parents, 'X'), base);
  const b = buildObservations(bucketImbalance(parents, 'X'), withFuture);
  assert(JSON.stringify(a) === JSON.stringify(b), 'a later snapshot leaked into the outcome');
});

test('a bucket without a usable mid is dropped, not imputed', () => {
  const parents = [{ ts: T0 + 10, side: 'BUY', notional: 100, sweep: false }];
  assert(buildObservations(bucketImbalance(parents, 'X'), []).length === 0, 'no book, no observation');
});

// ---------------------------------------------------------------------------
// 3. Chronology
// ---------------------------------------------------------------------------

section('chronology');

test('splits are chronological 55/20/15/10', () => {
  const c = chronology(1000);
  assert(c.trainEnd === 550 && c.validationEnd === 750 && c.holdoutEnd === 900, 'boundaries');
  assert(c.splitOf(0) === 'train' && c.splitOf(999) === 'forward', 'ends');
});

const seqObs = (n) => Array.from({ length: n }, (_, i) => ({
  symbol: 'X', bucket: T0 + i * B, day: dayKey(T0 + i * B), direction: 1,
  entry_mid: 100, exit_mid: 100, gross_bps: 0,
}));

test('purge drops decisions whose outcome crosses a split boundary', () => {
  const { kept, dropped } = assignSplits(seqObs(400));
  assert(dropped.purged > 0, 'expected purged boundary buckets');
  const buckets = [...new Set(seqObs(400).map((o) => o.bucket))].sort((a, b) => a - b);
  const index = new Map(buckets.map((b, i) => [b, i]));
  const chrono = chronology(buckets.length);
  for (const o of kept) {
    const i = index.get(o.bucket);
    assert(chrono.splitOf(i) === chrono.splitOf(i + FROZEN.purge_buckets + FROZEN.horizon_buckets),
      'a kept observation still crosses a boundary');
  }
});

test('embargo removes the head of each evaluated split but not of train', () => {
  const { kept, dropped } = assignSplits(seqObs(400));
  assert(dropped.embargoed === FROZEN.embargo_buckets * 3, `expected 3 splits embargoed, got ${dropped.embargoed}`);
  assert(kept.some((o) => o.split === 'train'), 'train survives');
});

test('every kept observation carries a split label', () => {
  for (const o of assignSplits(seqObs(200)).kept) {
    assert(['train', 'validation', 'holdout', 'forward'].includes(o.split), `bad split ${o.split}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Statistics
// ---------------------------------------------------------------------------

section('statistics');

const row = (bucket, bps, symbol = 'X') => ({
  symbol, bucket, day: dayKey(bucket), direction: 1, entry_mid: 100,
  exit_mid: 100 * (1 + bps / 1e4), gross_bps: bps,
});

test('costs are subtracted and the double-cost stress is twice the round trip', () => {
  const s = stats([row(T0, 30)]);
  assert(s.net_mean_bps === 30 - FROZEN.cost_bps_roundtrip, 'single cost');
  assert(stats([row(T0, 30)], FROZEN.double_cost_bps_roundtrip).net_mean_bps === 30 - 22, 'double cost');
  assert(FROZEN.double_cost_bps_roundtrip === 2 * FROZEN.cost_bps_roundtrip, 'double is twice');
});

test('drawdown accumulates in bucket order, not input order', () => {
  const shuffled = [row(T0 + 4 * B, -300), row(T0, 200), row(T0 + 3 * B, -300), row(T0 + B, 200)];
  assert(stats(shuffled, 0).max_drawdown_bps === -600, `got ${stats(shuffled, 0).max_drawdown_bps}`);
});

test('the t statistic and the cost-floor gap are reported', () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(T0 + i * B, 12 + (i % 2 ? 1 : -1)));
  const s = stats(rows);
  assert(s.t_stat !== null && s.net_std_err_bps !== null, 'precision must be reported');
  assert(s.cost_floor_gap_x !== null && s.cost_floor_gap_x > 0, 'the gap to the cost floor must be reported');
  assert(Math.abs(s.cost_floor_gap_x - FROZEN.cost_bps_roundtrip / s.net_mean_bps) < 1e-9, 'gap definition');
});

test('precision is quoted on the gross mean, not on the cost-laden net mean', () => {
  // A constant cost shifts the mean but not the dispersion. A t-statistic on net therefore
  // grows without bound as n grows, no matter how worthless the signal is.
  const rows = Array.from({ length: 400 }, (_, i) => row(T0 + i * B, (i % 2 ? 3 : -3)));
  const s = stats(rows);
  assert(Math.abs(s.gross_t_stat) < 1, `gross t should be near zero for a null signal, got ${s.gross_t_stat}`);
  assert(Math.abs(s.t_stat) > 10, 'the net t is dominated by the cost constant and must not be read as signal');
  assert(s.gross_std_err_bps !== null, 'gross standard error must be reported');
});

test('a negative mean reports no cost-floor gap rather than a misleading one', () => {
  assert(stats([row(T0, 1)]).cost_floor_gap_x === null, 'a losing mean has no meaningful multiple');
});

test('remove-best drops the single best symbol and day', () => {
  const rows = [row(T0, 500, 'A'), row(T0 + B, 10, 'B'), row(T0 + 2 * B, 20, 'B')];
  assert(removeBest(rows, 'symbol').removed === 'A', 'best symbol');
  assert(removeBest(rows, 'symbol').stats.n === 2, 'the rest remains');
  assert(removeBest(rows, 'day').removed === dayKey(T0), 'best day');
});

test('concentration is the largest symbol share of absolute contribution', () => {
  const c = concentration([row(T0, 100, 'A'), row(T0 + B, 11 + 1e-9, 'B')]);
  assert(c.max_symbol_share > 0.98, `A should dominate, got ${c.max_symbol_share}`);
  assert(c.symbols === 2, 'symbol count');
});

// ---------------------------------------------------------------------------
// 5. Matched null
// ---------------------------------------------------------------------------

section('matched null');

test('the null is two sided, seeded and reproducible', () => {
  const rows = Array.from({ length: 200 }, (_, i) => row(T0 + i * B, (i % 7) - 3));
  const a = matchedNull(rows, 100, 11);
  const b = matchedNull(rows, 100, 11);
  assert(a.two_sided === true, 'two sided');
  assert(a.p_value === b.p_value, 'same seed reproduces');
  assert(a.p_value >= 0 && a.p_value <= 1, 'p is a probability');
});

test('the null randomises direction while holding the realised moves fixed', () => {
  const rows = Array.from({ length: 300 }, (_, i) => row(T0 + i * B, i % 2 ? 40 : -40));
  const r = matchedNull(rows, 200, 3);
  assert(r.p_value > FROZEN.alpha, `a symmetric sample must not clear alpha, got ${r.p_value}`);
});

test('an empty sample yields a null p-value rather than a pass', () => {
  assert(matchedNull([]).p_value === null, 'no data, no p-value');
});

test('the protocol requires one thousand samples', () => {
  assert(FROZEN.null_samples === 1000, 'sample count');
});

// ---------------------------------------------------------------------------
// 6. Verdict ordering
// ---------------------------------------------------------------------------

section('verdicts');

const passing = () => ({
  holdout: { n: 200, symbols: 10, days: 20, net_mean_bps: 5, net_median_bps: 4 },
  forward: { n: 150, symbols: 8, days: 15, net_mean_bps: 4, net_median_bps: 3 },
  double_cost_oos: { net_median_bps: 1 },
  null: { p_value: 0.01 },
  remove_best_symbol: { stats: { net_total_bps: 500 } },
  remove_best_day: { stats: { net_total_bps: 400 } },
  concentration: { max_symbol_share: 0.1 },
  neighbours: [{ stats: { net_mean_bps: 2 } }, { stats: { net_mean_bps: 3 } }],
  overlap: { status: 'MEASURED', blocking: false },
});

test('thin data gates before anything else', () => {
  for (const mutate of [(r) => { r.holdout.n = 5; }, (r) => { r.forward.symbols = 1; }, (r) => { r.holdout.days = 2; }]) {
    const r = passing();
    mutate(r);
    assert(verdictFor(r) === 'DATA_INADEQUATE', 'insufficient sample must gate first');
  }
});

test('an unmeasured overlap blocks before any statistic is credited', () => {
  const r = passing();
  r.overlap = { status: 'UNAVAILABLE', blocking: true };
  assert(verdictFor(r) === 'DUPLICATE_OR_OVERLAP', `got ${verdictFor(r)}`);
});

test('a non-positive or insignificant result rejects the family', () => {
  for (const mutate of [
    (r) => { r.holdout.net_median_bps = -1; },
    (r) => { r.forward.net_mean_bps = 0; },
    (r) => { r.null.p_value = 0.5; },
    (r) => { r.null.p_value = null; },
  ]) {
    const r = passing();
    mutate(r);
    assert(verdictFor(r) === 'OOS_FAIL_REJECT_FAMILY', 'expected rejection');
  }
});

test('each robustness breach deprioritizes', () => {
  for (const mutate of [
    (r) => { r.double_cost_oos.net_median_bps = -1; },
    (r) => { r.remove_best_symbol.stats.net_total_bps = -1; },
    (r) => { r.remove_best_day.stats.net_total_bps = 0; },
    (r) => { r.concentration.max_symbol_share = 0.9; },
    (r) => { r.neighbours[0].stats.net_mean_bps = -1; },
  ]) {
    const r = passing();
    mutate(r);
    assert(verdictFor(r) === 'ROBUSTNESS_FAIL_DEPRIORITIZE', 'expected deprioritization');
  }
});

test('a passport draft needs every gate including a measured overlap', () => {
  assert(verdictFor(passing()) === 'CANDIDATE_PASSPORT_DRAFT', 'the fully passing case');
  assert(OVERLAP_FAMILIES.includes('RAW_MOMENTUM'), 'raw momentum must be a comparison family');
});

// ---------------------------------------------------------------------------
// 7. End to end
// ---------------------------------------------------------------------------

section('end to end');

function syntheticPanel(symbols, buckets) {
  const panel = {};
  for (let s = 0; s < symbols; s += 1) {
    const symbol = `SYN${s}`;
    const prints = [];
    const snapshots = [];
    let price = 100;
    for (let b = 0; b < buckets; b += 1) {
      const t = T0 + b * B;
      const buyHeavy = (b + s) % 2 === 0;
      for (let k = 0; k < 4; k += 1) {
        prints.push({ ts: t + k * 1000, px: price, qty: buyHeavy ? 3 : 1, side: 'Buy' });
        prints.push({ ts: t + k * 1000 + 500, px: price, qty: buyHeavy ? 1 : 3, side: 'Sell' });
      }
      snapshots.push({ ts: t, bid: price - 0.05, ask: price + 0.05 });
      price *= 1 + ((b % 5) - 2) * 0.0002;
    }
    snapshots.push({ ts: T0 + buckets * B, bid: price - 0.05, ask: price + 0.05 });
    panel[symbol] = { prints, snapshots };
  }
  return panel;
}

test('the full pipeline produces observations across symbols and splits', () => {
  const r = evaluate(syntheticPanel(6, 400));
  assert(r.observations.length > 0, 'expected observations');
  assert(new Set(r.observations.map((o) => o.symbol)).size === 6, 'all symbols present');
  for (const name of ['train', 'validation', 'holdout', 'forward']) {
    assert(r.bySplit(name).length > 0, `${name} must be populated`);
  }
});

test('the report is deterministic and embeds no timestamp', () => {
  const panel = syntheticPanel(6, 400);
  const a = JSON.stringify(report(panel));
  const b = JSON.stringify(report(panel));
  assert(a === b, 'report is not deterministic');
  for (const banned of ['"generated_at"', '"run_ts"', '"executed_at"']) {
    assert(!a.includes(banned), `must not embed ${banned}`);
  }
});

test('the report keeps promising_count at zero and blocks on overlap', () => {
  const r = report(syntheticPanel(6, 400));
  assert(r.promising_count === 0, 'promising_count must be 0');
  assert(r.overlap.status === 'UNAVAILABLE' && r.overlap.blocking === true, 'overlap must block');
  assert(r.verdict !== 'CANDIDATE_PASSPORT_DRAFT', 'a draft is unreachable while overlap is unmeasured');
});

test('the two neighbours are measured on validation only', () => {
  const r = report(syntheticPanel(6, 400));
  assert(r.neighbours.length === 2, 'two neighbours');
  for (const nb of r.neighbours) {
    assert(nb.segment === 'validation', `neighbour must be validation, got ${nb.segment}`);
    assert(FROZEN.neighbour_burst_gap_ms.includes(nb.burst_gap_ms), 'frozen neighbour gaps only');
  }
});

test('pre-aggregated buckets reproduce the same result as raw prints', () => {
  const panel = syntheticPanel(6, 400);
  const fromPrints = report(panel);

  // Reduce each symbol to bucket totals per frozen gap, exactly as extraction does.
  const aggregated = {};
  for (const [symbol, data] of Object.entries(panel)) {
    const byGap = {};
    for (const gap of [FROZEN.burst_gap_ms, ...FROZEN.neighbour_burst_gap_ms]) {
      byGap[String(gap)] = [...bucketImbalance(reconstructParents(data.prints, gap), symbol).values()]
        .map((e) => ({ bucket: e.bucket, buy_notional: e.buy_notional, sell_notional: e.sell_notional, parents: e.parents, sweeps: e.sweeps }));
    }
    aggregated[symbol] = { buckets_by_gap: byGap, snapshots: data.snapshots };
  }
  const fromBuckets = report(aggregated);

  for (const split of ['train', 'validation', 'holdout', 'forward', 'combined_oos']) {
    assert(JSON.stringify(fromPrints[split]) === JSON.stringify(fromBuckets[split]),
      `${split} differs between the raw and pre-aggregated paths`);
  }
  assert(fromPrints.verdict === fromBuckets.verdict, 'verdict must not depend on the input form');
});

test('direction is derived from the totals, never trusted from the extractor', () => {
  const m = rehydrateBuckets([{ bucket: T0, buy_notional: 10, sell_notional: 40, direction: 1 }], 'X');
  assert(m.get(T0).direction === -1, 'a supplied direction must not override the arithmetic');
  assert(m.get(T0).imbalance_notional === -30, 'imbalance recomputed');
});

test('an empty panel reports DATA_INADEQUATE rather than crashing', () => {
  const r = report({});
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.promising_count === 0, 'promising_count');
});

test('the csv has one row per split and balanced quoting', () => {
  const csv = toCsv(report(syntheticPanel(6, 400)));
  const lines = csv.trim().split('\n');
  assert(lines[0].startsWith('split,n,symbols,days,gross_mean_bps,gross_t_stat'), 'gross columns must lead the header');
  assert(lines.length === 6, `expected header plus five splits, got ${lines.length}`);
  for (const l of lines) assert(((l.match(/"/g) ?? []).length) % 2 === 0, 'unbalanced quoting');
});

test('required trade fields and refused substitutes are declared', () => {
  for (const f of ['ts', 'px', 'qty', 'side']) assert(REQUIRED_TRADE_FIELDS.includes(f), `${f} required`);
  for (const s of ['candle_direction', 'tick_rule_inference']) {
    assert(REFUSED_SUBSTITUTES.includes(s), `${s} must be refused`);
  }
});

test('an unknown argument is rejected', () => {
  let threw = false;
  try { parseArgs(['--wat']); } catch { threw = true; }
  assert(threw, 'unknown args rejected');
  assert(parseArgs(['--panel', 'p.json']).panel === 'p.json', 'known args parse');
});

// ---------------------------------------------------------------------------
// 8. Static scan
// ---------------------------------------------------------------------------

section('static scan');

const ALLOWED_MODULES = new Set(['node:fs', 'node:path', 'node:url', './analysis/ah046_parent_order_flow_imbalance.mjs']);

function scannableSource(file) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(/\/\* static-scan:allow-denylist-start \*\/[\s\S]*?\/\* static-scan:allow-denylist-end \*\//g, '/* excised */');
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.replace(/^\s*\/\/.*$/gm, ' ');
  return src;
}
function scanFor(category) {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    for (const token of FORBIDDEN_TOKENS[category]) {
      assert(!src.includes(token), `${file}: forbidden ${category} token '${token}'`);
    }
  }
}

test('every import is on the allowlist', () => {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    const mods = [
      ...[...src.matchAll(/\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ];
    for (const mod of mods) assert(ALLOWED_MODULES.has(mod), `${file}: forbidden module '${mod}'`);
  }
});

test('no network surface', () => scanFor('network'));
test('no process, service or shell surface', () => scanFor('process_service'));
test('no credential or environment surface', () => scanFor('credential'));
test('no exchange, account, order or position surface', () => scanFor('exchange_account'));
test('no trading runtime state is referenced', () => scanFor('runtime_state'));
test('no destructive filesystem call', () => scanFor('filesystem_mutation'));

test('promising_count is never raised', () => {
  for (const file of SCANNED_FILES) {
    assert(!NONZERO_PROMISING.test(scannableSource(file)), `${file}: raises promising_count`);
  }
});

test('the engine writes only to an explicit --out base', () => {
  const src = scannableSource(ENGINE_PATH);
  assert((src.match(WRITE_CALL_RE) ?? []).length === 2, 'exactly two writes');
  assert(src.includes('if (opts.out)'), 'writes guarded by --out');
});

test('the test file writes nothing', () => {
  const src = scannableSource(TEST_PATH);
  for (const token of WRITE_TOKENS) assert(!src.includes(token), `must not write (${token})`);
});

test('only audited node:fs primitives are imported', () => {
  for (const file of SCANNED_FILES) {
    const m = scannableSource(file).match(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs['"]/);
    if (!m) continue;
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      assert(ALLOWED_FS_IMPORTS.has(name), `${file}: unaudited node:fs import '${name}'`);
    }
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
const bySection = new Map();
for (const r of results) {
  if (!bySection.has(r.section)) bySection.set(r.section, []);
  bySection.get(r.section).push(r);
}
const lines = ['TASK-AH-046 parent order flow imbalance — test suite', ''];
for (const [name, rows] of bySection) {
  lines.push(`## ${name}  (${rows.filter((r) => r.ok).length}/${rows.length})`);
  for (const r of rows) {
    lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);
    if (!r.ok) lines.push(`       ${r.error}`);
  }
}
lines.push('', `total ${results.length}, passed ${results.length - failed.length}, failed ${failed.length}`);
process.stdout.write(`${lines.join('\n')}\n`);
process.exit(failed.length === 0 ? 0 : 1);
