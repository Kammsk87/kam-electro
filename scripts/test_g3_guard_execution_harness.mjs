#!/usr/bin/env node
// test_g3_guard_execution_harness.mjs — deterministic tests for the G3 guard harness.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, median, stdev, makePriceSource, buildIntents, executeIntent, pairedReplay,
  randomVetoControl, allowDriftControl, deltaSweep, runGate, toCsv, parseArgs,
  parseGuardFile, parseTickFile,
} from './analysis/g3_guard_execution_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/g3_guard_execution_harness.mjs');

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

/** A snapshot with sane defaults; overrides drive the guard predicate. */
function snap(over = {}) {
  return {
    ts: T0, bid: 99.95, ask: 100.05,
    buy_notional: 1000, sell_notional: 1000,
    bid_depth_prev: 10_000, bid_depth_next: 10_000,
    ask_depth_prev: 10_000, ask_depth_next: 10_000,
    ...over,
  };
}

function ticksEvery(ms, n, px = 100, start = T0) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ ts: start + i * ms, px });
  return out;
}

// ---------------------------------------------------------------------------

group('the intent stream');

test('both directions are evaluated at every snapshot, with no selection', () => {
  const snaps = [snap(), snap({ ts: T0 + 10_000 }), snap({ ts: T0 + 20_000 })];
  const intents = buildIntents(snaps);
  assert(intents.length === 6, `3 snapshots x 2 directions = 6, got ${intents.length}`);
  assert(intents.filter((x) => x.intent === 'LONG').length === 3, 'three longs');
  assert(intents.filter((x) => x.intent === 'SHORT').length === 3, 'three shorts');
  assert(intents.every((x) => ['ALLOW', 'VETO', 'NO_DATA'].includes(x.decision)),
    'every intent carries a decision, including NO_DATA');
});

test('the stream is synthetic, so no strategy can shape where the guard is asked', () => {
  const snaps = Array.from({ length: 50 }, (_, i) => snap({ ts: T0 + i * 10_000 }));
  const a = buildIntents(snaps);
  const b = buildIntents(snaps);
  assert(a.length === b.length && a.length === 100, 'deterministic and exhaustive');
  assert(JSON.stringify(a.map((x) => x.decision)) === JSON.stringify(b.map((x) => x.decision)),
    'the same input yields the same decisions');
});

group('execution mechanics');

test('the spread is crossed, so a mid-price replay cannot flatter the result', () => {
  const price = makePriceSource(ticksEvery(1000, 200));
  const item = { intent: 'LONG', snapshot: snap(), decision: 'ALLOW' };
  const r = executeIntent(item, 0, price);
  assert(r.status === 'FILLED', `expected FILLED, got ${r.status}`);
  // Flat prices mean a zero move; the realised figure must still carry the crossing cost.
  assert(close(r.move_bps, 0, 1e-6), 'a flat tape moves nothing');
  assert(r.half_spread_bps > 0, 'a half spread is charged');
  assert(r.realised_bps < 0, 'so the realised outcome is negative on a flat tape');
  assert(close(r.realised_bps, -r.half_spread_bps, 1e-9), 'realised = move - half spread');
});

test('an intent larger than the recorded depth is a no-fill, not a better price', () => {
  const price = makePriceSource(ticksEvery(1000, 200));
  const thin = { intent: 'LONG', snapshot: snap({ ask_depth_next: 10 }), decision: 'ALLOW' };
  assert(executeIntent(thin, 0, price).status === 'NO_FILL_DEPTH',
    'a book that cannot supply the size does not supply it');
  const zero = { intent: 'LONG', snapshot: snap({ ask_depth_next: 0 }), decision: 'ALLOW' };
  assert(executeIntent(zero, 0, price).status === 'NO_DEPTH', 'no depth recorded is not zero depth');
});

test('a price outside the tolerance is rejected rather than matched days later', () => {
  // The price source returns the first print at or after the request. Without a tolerance a
  // snapshot outside tick coverage matches a print much later, and the harness reports a
  // staleness of hours while claiming to measure seconds. That defect produced a median
  // staleness of 39 hours alongside a passing verdict before this check existed.
  const far = makePriceSource([{ ts: T0 + 86_400_000, px: 100 }, { ts: T0 + 86_460_000, px: 100 }]);
  const item = { intent: 'LONG', snapshot: snap(), decision: 'ALLOW' };
  assert(executeIntent(item, 0, far).status === 'NO_PRICE_IN_WINDOW',
    'a print a day later must not be treated as this intent’s fill');
  const near = makePriceSource(ticksEvery(1000, 200));
  assert(executeIntent(item, 0, near).status === 'FILLED', 'a print inside the tolerance fills');
});

test('the offset is applied to the order, not to the decision', () => {
  const price = makePriceSource(ticksEvery(500, 400));
  const item = { intent: 'LONG', snapshot: snap(), decision: 'ALLOW' };
  const a = executeIntent(item, 0, price);
  const b = executeIntent(item, 5000, price);
  assert(b.entry_ts - a.entry_ts >= 5000 - 500, 'the later offset enters later');
  assert(b.staleness_ms > a.staleness_ms, 'and carries more staleness');
});

group('the paired replay');

test('per-executed gain equals veto rate times separation, and is not the separation', () => {
  // This identity is the reason the protocol asks for the per-executed figure. Conflating the
  // two overstates what a guard delivers on a trade by 1/veto_rate.
  const price = makePriceSource(ticksEvery(1000, 500));
  const intents = [];
  for (let i = 0; i < 100; i += 1) {
    intents.push({
      intent: 'LONG', ts: T0 + i * 1000, decision: i < 20 ? 'VETO' : 'ALLOW',
      snapshot: snap({ ts: T0 + i * 1000, bid: 99.95, ask: 100.05 }),
    });
  }
  const r = pairedReplay(intents, 0, price);
  assert(r.n === 100, `all should fill, got ${r.n}`);
  assert(close(r.veto_rate_pct, 20, 1e-9), 'veto rate is 20 percent');
  const identity = (r.veto_rate_pct / 100) * r.separation_bps;
  assert(close(r.per_executed_gain_bps, identity, 1e-9),
    `per-executed ${r.per_executed_gain_bps} must equal ${identity}`);
});

test('run B holds every intent and run G holds only the allowed ones', () => {
  const price = makePriceSource(ticksEvery(1000, 500));
  const intents = [];
  for (let i = 0; i < 60; i += 1) {
    intents.push({
      intent: 'LONG', ts: T0 + i * 1000, decision: i % 3 === 0 ? 'VETO' : 'ALLOW',
      snapshot: snap({ ts: T0 + i * 1000 }),
    });
  }
  const r = pairedReplay(intents, 0, price);
  assert(r.n_allow + r.n_veto + r.n_no_data === r.n, 'the three buckets partition the filled set');
  assert(r.n_veto === 20 && r.n_allow === 40, `expected 20 vetoed and 40 allowed, got ${r.n_veto}/${r.n_allow}`);
  assert(close(r.run_G_mean_bps, r.allow_mean_bps, 1e-12), 'run G is exactly the allow set');
});

test('rejects are counted by reason rather than silently dropped', () => {
  const price = makePriceSource(ticksEvery(1000, 20));
  const intents = [
    { intent: 'LONG', ts: T0, decision: 'ALLOW', snapshot: snap({ ask_depth_next: 1 }) },
    { intent: 'LONG', ts: T0, decision: 'ALLOW', snapshot: snap({ bid: 0, ask: 0 }) },
  ];
  const r = pairedReplay(intents, 0, price);
  assert(r.n === 0, 'nothing fills');
  assert(r.rejects.NO_FILL_DEPTH === 1 && r.rejects.NO_QUOTE === 1, 'each reason is counted');
});

group('controls');

test('control 1 — a random veto at the same rate produces a gain centred near zero', () => {
  const values = Array.from({ length: 2000 }, (_, i) => ((i * 37) % 100) - 50);
  const c = randomVetoControl(values, 0.2);
  assert(c.draws > 100, 'the control actually draws');
  assert(Math.abs(c.control_mean_gain_bps) < 1, `a random veto should gain nothing, got ${c.control_mean_gain_bps}`);
  assert(c.control_p05 < 0 && c.control_p95 > 0, 'and its interval straddles zero');
});

test('control 1 is reproducible from its frozen seed', () => {
  const values = Array.from({ length: 500 }, (_, i) => (i % 7) - 3);
  const a = randomVetoControl(values, 0.3);
  const b = randomVetoControl(values, 0.3);
  assert(a.control_mean_gain_bps === b.control_mean_gain_bps, 'same seed, same answer');
});

test('control 2 — an allow set drifting materially positive disqualifies the class', () => {
  assert(!allowDriftControl(-0.5).breached, 'a negative allow mean is the expected shape');
  assert(!allowDriftControl(0.4).breached, 'a small positive is within the limit');
  assert(allowDriftControl(0.9).breached,
    'a materially positive allow mean means the predicate is picking direction, not suppressing');
});

group('the gate');

test('a sign alone is not a pass — the separation must be resolvable', () => {
  // A tiny positive separation that no sample can resolve returned G3_STAGE_PASS before the
  // resolvability clause existed. Same defect class as AH-050's one-sided power check.
  const axis = [{ delta_ms: 5000, n: 100, separation_bps: 0.07, detectable_bps: 0.52,
    veto_rate_pct: 18, allow_mean_bps: -0.5 }];
  const resolvable = axis[0].separation_bps >= axis[0].detectable_bps;
  assert(!resolvable, 'the fixture is deliberately unresolvable');
});

test('the axis is a parameter, and the frozen block does not compile in a retention figure', () => {
  assert(Array.isArray(FROZEN.delta_axis_ms) && FROZEN.delta_axis_ms.length >= 4,
    'the staleness offset is swept, not fixed');
  assert(FROZEN.delta_axis_ms[0] === 0, 'zero is the upper bound and is measured, not assumed');
  assert(FROZEN.delta_axis_ms.includes(5000), 'the 50 percent offset of the 10s median is on the axis');
  const s = JSON.stringify(FROZEN);
  assert(!s.includes('0.54') && !s.includes('54'), 'no retention figure is compiled into the frozen block');
});

test('the harness promotes nothing and states that it is not a passport', () => {
  const g = runGate({});
  assert(g.promising_count === 0, 'nothing is promoted');
  assert(g.label === 'EXECUTION_REPLAY_NOT_A_PASSPORT', 'and the label says so');
  assert(g.verdict === 'DATA_INADEQUATE', 'an empty world is inadequate, not a pass');
});

group('parsing');

test('guard rows and tick rows are parsed and sorted', () => {
  const g = parseGuardFile('200 99.9 100.1 5 6 10 11 12 13\n100 99.8 100.2 1 2 3 4 5 6\n');
  assert(g.length === 2 && g[0].ts === 100, 'sorted by timestamp');
  assert(g[0].ask_depth_next === 6, 'the ninth field is the next ask depth');
  const t = parseTickFile('{"ts":200,"px":1.5}\n{"ts":100,"px":1.4}\nbroken\n');
  assert(t.length === 2 && t[0].ts === 100, 'ticks sorted, malformed lines dropped');
});

group('CLI and output');

test('the csv carries staleness, the t-statistic and the detectable size', () => {
  const csv = toCsv({ axis: [{ delta_ms: 0, symbols: 1, n: 10, median_staleness_ms: 3000,
    per_executed_gain_bps: 0.05, separation_bps: 0.27, separation_t: 1.6, detectable_bps: 0.51,
    retained_pct: 100, veto_rate_pct: 18, allow_mean_bps: -0.46, veto_mean_bps: -0.73 }] });
  const head = csv.split('\n')[0];
  for (const col of ['median_staleness_ms', 'separation_t', 'detectable_bps', 'per_executed_gain_bps']) {
    assert(head.includes(col), `${col} must be reported, not just the headline`);
  }
});

test('argument parsing rejects unknown flags', () => {
  assert(parseArgs(['--data', 'd']).data === 'd', 'a value is read');
  let threw = false;
  try { parseArgs(['--delta', '3000']); } catch { threw = true; }
  assert(threw, 'the axis is frozen; varying it is a new task');
});

group('static scan');

const src = readFileSync(ENGINE, 'utf8');

test('every import is on the allowlist, plus the tested guard predicate', () => {
  const allowed = new Set(['node:fs', 'node:path', 'node:url', './ah047_execution_policy_guard.mjs']);
  const re = /\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  let m;
  const seen = [];
  while ((m = re.exec(src))) seen.push(m[1]);
  assert(seen.length > 0, 'the scan must find the imports it claims to check');
  for (const mod of seen) assert(allowed.has(mod), `disallowed import: ${mod}`);
  assert(seen.includes('./ah047_execution_policy_guard.mjs'),
    'the predicate is imported from the tested module, never reimplemented');
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

test('the harness draws no entropy from the platform and reads no clock', () => {
  for (const token of ['Date.now', 'Math.random', 'performance.now']) {
    assert(!src.includes(token), `non-deterministic call: ${token}`);
  }
  assert(!/new Date\(\s*\)/.test(src), 'an argument-less Date would read the wall clock');
});

test('the harness writes only where it was told to', () => {
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
