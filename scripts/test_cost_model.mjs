#!/usr/bin/env node
// test_cost_model.mjs — deterministic tests for the shared cost model.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_SCHEDULE_PATH, loadSchedule, entryAsOf, requireFloor, floorPercentile, floorCitation,
} from './analysis/cost_model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/cost_model.mjs');

let passed = 0;
let failed = 0;
const results = [];
function group(name) { results.push({ kind: 'group', name }); group.current = name; }
function test(name, fn) {
  try { fn(); passed += 1; results.push({ kind: 'ok', name, section: group.current }); }
  catch (err) { failed += 1; results.push({ kind: 'fail', name, section: group.current, message: err.message }); }
}
function assert(cond, message) { if (!cond) throw new Error(message); }
function throws(fn, match, message) {
  try { fn(); } catch (e) { if (!match || new RegExp(match).test(e.message)) return; throw new Error(`${message}: wrong error ${e.message}`); }
  throw new Error(message);
}

const AS_OF = '2026-08-05';

// ---------------------------------------------------------------------------

group('the schedule');

test('the committed schedule loads and carries a derived floor', () => {
  const s = loadSchedule();
  assert(s.schedule_id === 'BOTALIN.FEE.SCHEDULE', 'identified');
  assert(s.entries.length >= 1, 'at least one entry');
  assert(s.derived_floor, 'and a derived floor');
});

test('rates are measured, not transcribed, and say so', () => {
  const e = loadSchedule().entries[0];
  assert(e.basis === 'REALISED', 'the entry declares it is realised rather than published');
  assert(e.measurement.positions === 1220, 'over the non-liquidated closed positions');
  assert(e.measurement.notional_weighted_roundtrip_bps > 0, 'with a weighted figure');
  // A published rate says what should have been charged; this says what was.
  assert(e.taker_bps_per_leg === null && e.maker_bps_per_leg === null,
    'per-leg rates are null because the export cannot separate them');
  assert(e.undetermined.length >= 3, 'and what cannot be determined is enumerated, not omitted');
});

group('as-of resolution');

test('an explicit date is required, because a default would depend on when the code ran', () => {
  throws(() => requireFloor({ legs: 1 }), 'ASOF_REQUIRED', 'a missing asOf must throw');
  throws(() => requireFloor({ asOf: 'yesterday' }), 'ASOF_REQUIRED', 'a malformed asOf must throw');
  assert(requireFloor({ asOf: AS_OF }).bps > 0, 'a well-formed one resolves');
});

test('a date before the first entry has no floor rather than a default', () => {
  throws(() => requireFloor({ asOf: '2020-01-01' }), 'NO_FEE_SCHEDULE_ENTRY_FOR',
    'there is no silent fallback to a hardcoded number');
});

test('entries are selected by effective_from, newest first', () => {
  const s = loadSchedule();
  const fake = {
    ...s,
    entries: [
      { ...s.entries[0], tier: 'OLD', effective_from: '2024-01-01', effective_to: '2025-11-04' },
      { ...s.entries[0], tier: 'NEW', effective_from: '2025-11-05', effective_to: null },
    ],
  };
  assert(entryAsOf(fake, '2024-06-01').tier === 'OLD', 'an old date resolves the old entry');
  assert(entryAsOf(fake, '2026-01-01').tier === 'NEW', 'a recent date resolves the new one');
  // Appending rather than rewriting is what keeps an old result reproducible.
  assert(entryAsOf(fake, '2025-11-04').tier === 'OLD', 'the boundary belongs to the entry in force');
});

group('the floor');

test('the floor is 16 single-leg and 32 two-leg, with stress doubling it', () => {
  assert(requireFloor({ asOf: AS_OF, legs: 1 }).bps === 16, 'single leg');
  assert(requireFloor({ asOf: AS_OF, legs: 2 }).bps === 32, 'two legs');
  assert(requireFloor({ asOf: AS_OF, legs: 1, stress: true }).bps === 32, 'single leg under stress');
  throws(() => requireFloor({ asOf: AS_OF, legs: 3 }), 'BAD_LEGS', 'three legs is not a thing');
});

test('there is no way to get the number without its provenance', () => {
  const f = requireFloor({ asOf: AS_OF });
  for (const k of ['fee_component_bps', 'fee_basis', 'execution_component_bps', 'execution_basis',
    'execution_source', 'schedule_id', 'entry_tier', 'entry_effective_from']) {
    assert(f[k] !== undefined && f[k] !== null, `${k} must travel with the number`);
  }
  // The whole point: 11 was a bare constant in six engines and wrong for months.
  assert(typeof f !== 'number', 'the module never returns a bare number');
});

test('the components sum to the floor', () => {
  const f = requireFloor({ asOf: AS_OF });
  const sum = f.fee_component_bps + f.execution_component_bps;
  assert(Math.abs(sum - f.bps) < 0.05, `${f.fee_component_bps} + ${f.execution_component_bps} should reach ${f.bps}, got ${sum}`);
});

test('the superseded constant is carried so old results stay comparable', () => {
  const f = requireFloor({ asOf: AS_OF });
  assert(f.superseded_bps === 11, 'the fees-only figure is retained for comparison only');
  assert(f.bps > f.superseded_bps, 'and the audited floor is strictly higher');
});

group('conservatism');

test('16 bps is central, not conservative, and the module says which', () => {
  const p = floorPercentile(16);
  // The measured median all-in is 16.01, so the rounded floor of 16 sits a hundredth below it.
  // The substantive claim is not the label but the position: this is a central figure.
  assert(Math.abs(16 - p.median_all_in_bps) < 0.1,
    `16 should sit at the median of ${p.median_all_in_bps}`);
  assert(p.conservative === false, 'and must not be reported as conservative');
  // A quarter of realised positions paid more than 13.6 bps in fees ALONE, which exceeds the
  // entire superseded 11 bps floor.
  assert(p.p75_all_in_bps > 16 && p.p95_all_in_bps > p.p75_all_in_bps, 'the tail is above it');
  assert(p.p75_all_in_bps - 16 > 3, 'a conservative floor would sit more than 3 bps higher');
});

test('a task that wants conservatism must reach the p75', () => {
  assert(floorPercentile(19.19).conservative === true, 'p75 is the conservative mark');
  assert(floorPercentile(11).position === 'below_median', 'the old floor was below the median all-in');
});

group('citation');

test('the citation names every component and the schedule version', () => {
  const c = floorCitation(requireFloor({ asOf: AS_OF }));
  for (const frag of ['16', 'fee', 'execution', 'BOTALIN.FEE.SCHEDULE', 'effective']) {
    assert(c.includes(frag), `citation must mention ${frag}: ${c}`);
  }
  assert(floorCitation(requireFloor({ asOf: AS_OF, stress: true })).includes('stress'),
    'a stress floor says so in its own citation');
});

group('static scan');

const src = readFileSync(ENGINE, 'utf8');

test('every import is on the allowlist: no network, process, or os-exec module', () => {
  const allowed = new Set(['node:fs', 'node:path', 'node:url']);
  const re = /\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  let m;
  const seen = [];
  while ((m = re.exec(src))) seen.push(m[1]);
  assert(seen.length > 0, 'the scan must find the imports it claims to check');
  for (const mod of seen) assert(allowed.has(mod), `disallowed import: ${mod}`);
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

test('the module reads no clock and writes nothing', () => {
  for (const token of ['Date.now', 'Math.random', 'performance.now', 'writeFileSync']) {
    assert(!src.includes(token), `must not be present: ${token}`);
  }
  assert(!/new Date\(\s*\)/.test(src), 'an argument-less Date would make the floor depend on the run time');
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
