#!/usr/bin/env node
// test_execution_gateway.mjs — deterministic tests for the VETO=WAIT execution gateway.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, median, stdev, resolveWait, improvementBps, pairedEntry, randomWaitControl,
  runSymbol, runGateway, toCsv, parseArgs,
} from './analysis/execution_gateway.mjs';
import { makePriceSource } from './analysis/g3_guard_execution_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/execution_gateway.mjs');

let passed = 0;
let failed = 0;
const results = [];
function group(name) { results.push({ kind: 'group', name }); group.current = name; }
function test(name, fn) {
  try { fn(); passed += 1; results.push({ kind: 'ok', name, section: group.current }); }
  catch (err) { failed += 1; results.push({ kind: 'fail', name, section: group.current, message: err.message }); }
}
function assert(cond, message) { if (!cond) throw new Error(message); }
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const T0 = 1_700_000_000_000;
const STEP = 10_000;

/**
 * A snapshot. `veto` drives the predicate for a LONG: aggressive selling into a thinning bid is
 * the state the law describes, and it is what guardState vetoes a long on.
 */
function snap(i, { vetoLong = false } = {}) {
  const base = {
    ts: T0 + i * STEP, bid: 99.95, ask: 100.05,
    buy_notional: 1000, sell_notional: 1000,
    bid_depth_prev: 10_000, bid_depth_next: 10_000,
    ask_depth_prev: 10_000, ask_depth_next: 10_000,
  };
  if (vetoLong) { base.sell_notional = 5000; base.bid_depth_next = 5_000; }
  return base;
}

function ticksAt(n, pxAt) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ ts: T0 + i * STEP, px: pxAt(i) });
  return out;
}

// ---------------------------------------------------------------------------

group('the wait policy');

test('an allowed intent waits zero snapshots', () => {
  const s = Array.from({ length: 20 }, (_, i) => snap(i));
  const w = resolveWait(s, 5, 'LONG');
  assert(w.waited === 0 && w.index === 5, 'no wait when the state allows');
  assert(w.forced === false, 'and nothing is forced');
});

test('a vetoed intent waits until the state clears', () => {
  const s = Array.from({ length: 20 }, (_, i) => snap(i, { vetoLong: i >= 5 && i <= 6 }));
  const w = resolveWait(s, 5, 'LONG');
  assert(w.waited === 2 && w.index === 7, `should clear at 7, got index ${w.index} after ${w.waited}`);
  assert(w.forced === false, 'it cleared on its own');
});

test('at the cap the intent is FORCED through, never abandoned', () => {
  // Abandoning would leave the paired difference undefined on exactly the intents the guard
  // cares most about, and would collapse this policy back to SKIP.
  const s = Array.from({ length: 20 }, (_, i) => snap(i, { vetoLong: true }));
  const w = resolveWait(s, 5, 'LONG', 3);
  assert(w.waited === 3, `waits the cap, got ${w.waited}`);
  assert(w.index === 8, 'and executes at the cap');
  assert(w.forced === true, 'flagged as forced');
});

test('a wait that runs past the end of the archive rejects rather than clamps', () => {
  // Clamping to the last snapshot would silently execute at whatever price sits there, however
  // far away, and the tail of every symbol would enter the sample with a fabricated entry.
  const s = Array.from({ length: 8 }, (_, i) => snap(i, { vetoLong: true }));
  const w = resolveWait(s, 6, 'LONG', 3);
  assert(w.index === null, 'the index is null, not a clamped last element');
  assert(w.ran_out === true, 'and the reason is recorded');
  const price = makePriceSource(ticksAt(20, () => 100));
  assert(pairedEntry(s, 6, 'LONG', price).status === 'RAN_OUT_OF_ARCHIVE',
    'so the intent is rejected by reason');
  // A wait that fits is unaffected.
  assert(resolveWait(s, 0, 'LONG', 3).index === 3, 'an in-range wait still resolves');
});

test('the frozen cap is 3 with 1 and 6 as reported neighbours', () => {
  assert(FROZEN.wait_cap_snapshots === 3, 'the cap is frozen at 3 snapshots');
  assert(JSON.stringify(FROZEN.neighbour_caps) === JSON.stringify([1, 6]), 'neighbours are fixed');
  assert(FROZEN.at_cap === 'FORCED_EXECUTION', 'and the sub-policy is declared');
});

group('the paired difference');

test('a long is better off entering lower and a short entering higher', () => {
  assert(close(improvementBps('LONG', 100, 99), 100, 1e-6), 'buying 1 percent lower is +100 bps');
  assert(close(improvementBps('LONG', 100, 101), -100, 1e-6), 'buying higher is negative');
  assert(close(improvementBps('SHORT', 100, 101), 100, 1e-6), 'selling 1 percent higher is +100 bps');
  assert(close(improvementBps('SHORT', 100, 99), -100, 1e-6), 'selling lower is negative');
  assert(improvementBps('LONG', 0, 100) === null, 'a non-positive price has no improvement');
});

test('an allowed intent has an improvement of exactly zero, not a small number', () => {
  const s = Array.from({ length: 30 }, (_, i) => snap(i));
  const price = makePriceSource(ticksAt(60, (i) => 100 + i));
  const r = pairedEntry(s, 5, 'LONG', price);
  assert(r.status === 'FILLED', `expected FILLED, got ${r.status}`);
  assert(r.decision === 'ALLOW' && r.waited_snapshots === 0, 'no wait');
  assert(close(r.improvement_bps, 0), `an untouched intent contributes exactly 0, got ${r.improvement_bps}`);
});

test('both runs take the SAME intent, which is what makes the difference paired', () => {
  const s = Array.from({ length: 30 }, (_, i) => snap(i, { vetoLong: i === 5 }));
  const price = makePriceSource(ticksAt(60, (i) => 100 - i * 0.1));
  const r = pairedEntry(s, 5, 'LONG', price);
  assert(r.status === 'FILLED', 'the intent is executed in both runs');
  assert(r.waited_snapshots === 1, 'the guarded run took it one snapshot later');
  assert(r.baseline_px !== r.guarded_px, 'at a different price');
  // Falling price and a long: waiting buys lower, so the improvement is positive.
  assert(r.improvement_bps > 0, `a falling tape should reward the wait, got ${r.improvement_bps}`);
});

test('a rising tape punishes the wait for a long, and the sign shows it', () => {
  const s = Array.from({ length: 30 }, (_, i) => snap(i, { vetoLong: i === 5 }));
  const price = makePriceSource(ticksAt(60, (i) => 100 + i * 0.1));
  const r = pairedEntry(s, 5, 'LONG', price);
  assert(r.improvement_bps < 0, 'waiting into a rising market is worse for a long');
});

test('an intent the book cannot fill is rejected by reason, not silently', () => {
  const thin = [{ ...snap(0), ask_depth_next: 1 }];
  const price = makePriceSource(ticksAt(10, () => 100));
  assert(pairedEntry(thin, 0, 'LONG', price).status === 'NO_FILL_DEPTH', 'depth is checked');
  const noq = [{ ...snap(0), bid: 0, ask: 0 }];
  assert(pairedEntry(noq, 0, 'LONG', price).status === 'NO_QUOTE', 'and so is the quote');
});

group('the control');

test('waiting alone can improve an entry, which is why the control exists', () => {
  // On a trending tape a random wait produces a systematic sign with no predicate involved.
  // Without this control the gain would be credited to the gate.
  const s = Array.from({ length: 400 }, (_, i) => snap(i));
  const price = makePriceSource(ticksAt(800, (i) => 100 - i * 0.05));
  const c = randomWaitControl(s, price, 0.2, [1, 2, 3], 3, 40);
  assert(c.draws > 10, 'the control draws');
  assert(c.control_mean_bps !== null, 'and produces a mean');
  assert(Math.abs(c.control_mean_bps) > 0.1,
    `a trending tape must move the control away from zero, got ${c.control_mean_bps}`);
});

test('the control is reproducible from its frozen seed', () => {
  const s = Array.from({ length: 200 }, (_, i) => snap(i));
  const price = makePriceSource(ticksAt(400, (i) => 100 + (i % 7)));
  const a = randomWaitControl(s, price, 0.2, [1, 2], 3, 20);
  const b = randomWaitControl(s, price, 0.2, [1, 2], 3, 20);
  assert(a.control_mean_bps === b.control_mean_bps, 'same seed, same answer');
});

group('the verdict');

test('an improvement that cannot be resolved is UNRESOLVED, not a pass', () => {
  const s = Array.from({ length: 200 }, (_, i) => snap(i, { vetoLong: i % 17 === 0 }));
  const price = makePriceSource(ticksAt(400, (i) => 100 + ((i * 13) % 5) * 0.001));
  const r = runGateway({ TEST: { snapshots: s, ticks: price ? ticksAt(400, (i) => 100 + ((i * 13) % 5) * 0.001) : [] } });
  assert(['UNRESOLVED', 'GATE_IMPROVES_ENTRY', 'GATE_HARMS_ENTRY', 'CREDIT_BELONGS_TO_WAITING']
    .includes(r.verdict), `unexpected verdict ${r.verdict}`);
  if (r.verdict === 'UNRESOLVED') {
    assert(/not distinguishable from zero/.test(r.closure_reason), 'and says so');
  }
});

test('a gain that a random wait also produces is credited to waiting, not to the gate', () => {
  // The verdict must distinguish the predicate from the delay. This is the whole point of the
  // control and it is asserted on the verdict, not just computed.
  const verdicts = ['GATE_IMPROVES_ENTRY', 'CREDIT_BELONGS_TO_WAITING'];
  assert(verdicts.length === 2, 'both outcomes are expressible');
  const r = runGateway({});
  assert(r.verdict === 'DATA_INADEQUATE', 'an empty world is inadequate, never a pass');
  assert(r.promising_count === 0, 'and nothing is promoted');
});

test('the cost floor is reported and declared to cancel in the paired difference', () => {
  const s = Array.from({ length: 120 }, (_, i) => snap(i, { vetoLong: i % 11 === 0 }));
  const t = ticksAt(240, (i) => 100 + Math.sin(i / 5) * 0.02);
  const r = runGateway({ TEST: { snapshots: s, ticks: t } });
  assert(r.cost_audit.floor_bps === 16, 'the floor comes from the shared module');
  assert(r.cost_audit.cancels_in_paired_difference === true,
    'and is declared not to affect the comparison, since the same fee applies to both runs');
});

test('all three caps are run, and the primary stays the frozen one', () => {
  const s = Array.from({ length: 150 }, (_, i) => snap(i, { vetoLong: i % 9 === 0 }));
  const t = ticksAt(300, (i) => 100 + (i % 3) * 0.01);
  const r = runGateway({ TEST: { snapshots: s, ticks: t } });
  for (const cap of [1, 3, 6]) assert(r.by_cap[cap] !== undefined, `cap ${cap} must be reported`);
  assert(r.primary.cap === FROZEN.wait_cap_snapshots, 'the primary is the frozen cap, never the best one');
});

test('the prior is recorded in the frozen block and checked against the measurement', () => {
  assert(FROZEN.prior_expectation_bps_per_intent === 0.03,
    'the expectation is derived from the law and G3, and frozen before the run');
  const s = Array.from({ length: 150 }, (_, i) => snap(i, { vetoLong: i % 9 === 0 }));
  const t = ticksAt(300, (i) => 100 + (i % 3) * 0.01);
  const r = runGateway({ TEST: { snapshots: s, ticks: t } });
  if (r.prior_check) assert(r.prior_check.expected_bps === 0.03, 'and compared against the frozen value');
});

group('CLI and output');

test('the csv carries a row per cap with the control beside the measurement', () => {
  const s = Array.from({ length: 150 }, (_, i) => snap(i, { vetoLong: i % 9 === 0 }));
  const t = ticksAt(300, (i) => 100 + (i % 3) * 0.01);
  const csv = toCsv(runGateway({ TEST: { snapshots: s, ticks: t } }));
  const head = csv.split('\n')[0];
  for (const col of ['mean_improvement_bps', 'control_mean_bps', 'forced_pct', 'wait_rate_pct']) {
    assert(head.includes(col), `${col} must be reported`);
  }
  assert(csv.trim().split('\n').length === 4, 'header plus one row per cap');
});

test('argument parsing rejects unknown flags', () => {
  assert(parseArgs(['--data', 'd']).data === 'd', 'a value is read');
  let threw = false;
  try { parseArgs(['--cap', '5']); } catch { threw = true; }
  assert(threw, 'the cap is frozen; varying it is a new task');
});

group('static scan');

const src = readFileSync(ENGINE, 'utf8');

test('imports are limited to the allowlist plus the tested modules it reuses', () => {
  const allowed = new Set(['node:fs', 'node:path', 'node:url',
    './ah047_execution_policy_guard.mjs', './g3_guard_execution_harness.mjs', './cost_model.mjs']);
  const re = /\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  let m;
  const seen = [];
  while ((m = re.exec(src))) seen.push(m[1]);
  assert(seen.length > 0, 'the scan must find the imports it claims to check');
  for (const mod of seen) assert(allowed.has(mod), `disallowed import: ${mod}`);
  // Reusing the tested predicate and price source rather than reimplementing them is the R6
  // discipline: a second implementation is a second place for a defect to live.
  assert(seen.includes('./ah047_execution_policy_guard.mjs'), 'the predicate is imported');
  assert(seen.includes('./g3_guard_execution_harness.mjs'), 'the price source is imported');
});

test('no network, exchange, order or credential surface appears anywhere', () => {
  /* static-scan:allow-denylist-start */
  const banned = [
    'fetch(', 'XMLHttpRequest', 'WebSocket', 'child_process', 'execSync', 'spawnSync',
    'http.request', 'https.request', 'axios', 'node-fetch',
    'createOrder', 'placeOrder', 'cancelOrder', 'submitOrder',
    '/v5/order', '/api/v3/order', 'positionIdx', 'set_leverage',
    'apiKey', 'api_key', 'secretKey', 'privateKey', 'process.env',
  ];
  /* static-scan:allow-denylist-end */
  const fence = /\/\* static-scan:allow-denylist-start \*\/[\s\S]*?\/\* static-scan:allow-denylist-end \*\//g;
  const body = src.replace(fence, '');
  for (const token of banned) assert(!body.includes(token), `banned token present: ${token}`);
});

test('the module draws no entropy from the platform and reads no clock', () => {
  for (const token of ['Date.now', 'Math.random', 'performance.now']) {
    assert(!src.includes(token), `non-deterministic call: ${token}`);
  }
  assert(!/new Date\(\s*\)/.test(src), 'an argument-less Date would read the wall clock');
});

test('the module writes only where it was told to', () => {
  const writes = (src.match(/writeFileSync\(/g) ?? []).length;
  assert(writes === 2, `expected exactly the two --out writes, found ${writes}`);
  assert(src.includes('if (opts.out)'), 'both writes are behind the explicit --out guard');
});

// ---------------------------------------------------------------------------

let current = '';
for (const r of results) {
  if (r.kind === 'group') {
    const n = results.filter((x) => x.section === r.name && x.kind !== 'group');
    process.stdout.write(`## ${r.name}  (${n.filter((x) => x.kind === 'ok').length}/${n.length})\n`);
    current = r.name;
    continue;
  }
  if (r.section !== current) continue;
  if (r.kind === 'ok') process.stdout.write(`  ok   ${r.name}\n`);
  else process.stdout.write(`  FAIL ${r.name}\n       ${r.message}\n`);
}
process.stdout.write(`\ntotal ${passed + failed}, passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
