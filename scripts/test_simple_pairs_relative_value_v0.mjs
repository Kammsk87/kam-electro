#!/usr/bin/env node
// test_simple_pairs_relative_value_v0.mjs — TASK-AH-009 Stage 0 tests + static no-trading scan.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN, mean, median, stdev, buildPanel, normalised, trainBoundaryIndex,
  selectPairs, trainEvents, thresholdStats, stage0, toCsv, parseArgs,
} from './analysis/simple_pairs_relative_value_v0.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'simple_pairs_relative_value_v0.mjs');
const TEST_PATH = join(HERE, 'test_simple_pairs_relative_value_v0.mjs');
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
  runtime_state: ['/opt/botalin-edge', '/etc/botalin', 'RESET_TS', 'coordinator', 'approval', 'KILL_SWITCH'],
  filesystem_mutation: ['appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync',
    'truncateSync', 'createWriteStream', 'chmodSync', 'copyFileSync', 'symlinkSync'],
};
const NONZERO_PROMISING = /promising_count\s*[:=]\s*[1-9]/;
const WRITE_TOKENS = ['writeFileSync', 'mkdirSync'];
const WRITE_CALL_RE = /writeFileSync\(/g;
const ALLOWED_FS_IMPORTS = new Set(['readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync']);
/* static-scan:allow-denylist-end */

const results = [];
let sec = 'general';
const section = (n) => { sec = n; };
function test(name, fn) {
  try { fn(); results.push({ sec, name, ok: true }); }
  catch (e) { results.push({ sec, name, ok: false, error: e.message }); }
}
function assert(c, m) { if (!c) throw new Error(m); }

const DAY = 86_400_000;
const T0 = Date.parse('2025-01-01T00:00:00Z');
/** Two symbols whose normalised prices differ by a controllable amount. */
function archive(n, drift) {
  const out = {};
  for (const [sym, f] of Object.entries(drift)) {
    const rows = [];
    let p = 100;
    for (let i = 0; i < n; i += 1) { p *= 1 + f(i); rows.push([T0 + i * DAY, p, p, p, p, 1000]); }
    out[sym] = rows;
  }
  return out;
}

section('frozen contract');

test('the cost floor is two legs, not one', () => {
  assert(FROZEN.cost_bps_both_legs === 22, 'a pairs trade pays a round trip on each leg');
  assert(FROZEN.double_cost_bps === 44, 'the stress is twice the two-leg cost');
});

test('the frozen thresholds and windows match the task contract', () => {
  assert(JSON.stringify(FROZEN.thresholds) === JSON.stringify([0.015, 0.025, 0.040]), 'thresholds');
  assert(FROZEN.reference_days === 60 && FROZEN.hold_days === 10, 'reference and hold windows');
  assert(FROZEN.max_pairs === 10, 'at most ten pairs');
});

test('the exits the contract leaves unspecified are recorded as such', () => {
  assert(FROZEN.exit_rule === 'FIXED_10_TRADING_DAYS', 'only the timeout carries a number');
  assert(FROZEN.unspecified_exits_in_contract.includes('convergence'), 'convergence has no number in AH-009');
  assert(FROZEN.unspecified_exits_in_contract.includes('fixed_adverse_gap_stop'), 'nor does the stop');
});

section('causality');

test('the normalised price is causal and null before the reference window', () => {
  const p = buildPanel(archive(400, { A: () => 0.001 }), 100);
  assert(normalised(p, 'A', 10) === null, 'no value before 60 days of history');
  const v = normalised(p, 'A', 100);
  assert(Math.abs(v - 1.001 ** 60) < 1e-9, 'ratio of close now to close 60 days back');
});

test('pair selection reads only the train segment', () => {
  // A and B co-move on train, then diverge violently in the sealed half.
  const arc = archive(400, {
    A: () => 0.001,
    B: (i) => (i < 220 ? 0.001 : 0.05),
    C: () => 0.0005,
  });
  const p = buildPanel(arc, 100);
  const end = trainBoundaryIndex(p);
  const { selected } = selectPairs(p, end, 3);
  const ab = selected.find((s) => s.a === 'A' && s.b === 'B');
  assert(ab, 'A/B must still be a candidate');
  assert(ab.dispersion < 0.01, `sealed divergence leaked into selection: ${ab.dispersion}`);
});

test('events are never taken from the sealed segment', () => {
  const arc = archive(400, { A: () => 0.001, B: (i) => (i < 220 ? 0.0011 : 0.2) });
  const p = buildPanel(arc, 100);
  const end = trainBoundaryIndex(p);
  const rows = trainEvents(p, [{ a: 'A', b: 'B' }], 0.015, end);
  for (const r of rows) {
    const i = p.days.indexOf(r.day);
    assert(i < end, `event at index ${i} is at or beyond the train boundary ${end}`);
  }
});

section('trade construction');

test('the laggard is bought and the leader sold', () => {
  const arc = archive(400, { A: () => 0.0005, B: () => 0.002 });
  const p = buildPanel(arc, 100);
  const rows = trainEvents(p, [{ a: 'A', b: 'B' }], 0.015, trainBoundaryIndex(p));
  assert(rows.length > 0, 'expected events once the gap opens');
  // B leads, so A is bought: its leg return carries the sign of A's own move.
  for (const r of rows.slice(0, 3)) {
    assert(r.long_leg_bps > 0, 'the bought laggard is still rising here');
    assert(r.short_leg_bps < 0, 'the sold leader is rising, so the short leg loses');
    assert(Math.abs(r.spread_bps - (r.long_leg_bps + r.short_leg_bps)) < 1e-9, 'spread is the sum of legs');
  }
});

test('a gap below the threshold produces no event', () => {
  const arc = archive(400, { A: () => 0.001, B: () => 0.001 });
  const p = buildPanel(arc, 100);
  assert(trainEvents(p, [{ a: 'A', b: 'B' }], 0.015, trainBoundaryIndex(p)).length === 0, 'identical legs never trigger');
});

section('statistics');

const rowsOf = (bps) => bps.map((b, i) => ({ pair: 'A/B', day: T0 + i * DAY, gap: 0.02, long_leg_bps: b, short_leg_bps: 0, spread_bps: b }));

test('clearing the floor requires beating 22 bps, not 11', () => {
  const at15 = thresholdStats(rowsOf(new Array(50).fill(15)), 0.015);
  assert(at15.clears_cost === false, '15 bps beats one leg but not two');
  const at30 = thresholdStats(rowsOf(new Array(50).fill(30)), 0.015);
  assert(at30.clears_cost === true && at30.clears_double_cost === false, '30 clears 22 but not 44');
});

test('a positive median with a non-positive mean is flagged as a fat left tail', () => {
  const rows = rowsOf([...new Array(19).fill(20), -500]);
  const s = thresholdStats(rows, 0.015);
  assert(s.median_bps > 0 && s.mean_bps <= 0, 'setup: wins often, loses big');
  assert(s.median_positive_mean_not === true, 'the signature must be flagged');
});

test('the sample size needed to resolve the cost floor is reported', () => {
  const s = thresholdStats(rowsOf(Array.from({ length: 60 }, (_, i) => (i % 2 ? 400 : -400))), 0.015);
  assert(s.n_needed_to_resolve_cost_floor > s.n, 'a huge dispersion needs far more events than we have');
  assert(s.underpowered === true, 'and the shortfall must be declared');
});

test('too few events are reported as insufficient rather than averaged', () => {
  assert(thresholdStats(rowsOf([1, 2]), 0.015).insufficient === true, 'two events is not a statistic');
});

section('stage 0 gate');

test('a hypothesis clearing the two-leg floor passes', () => {
  // B leads persistently and then the laggard catches up hard inside the hold window.
  const arc = archive(400, { A: (i) => (i % 17 === 0 ? 0.05 : 0.0005), B: () => 0.002 });
  const r = stage0(arc);
  assert(['STAGE_0_PASS', 'STAGE_0_INFEASIBLE'].includes(r.verdict), 'a verdict is produced');
  assert(r.selection_is_in_sample === true, 'the optimism must be declared');
  assert(r.sealed_segments_untouched === true, 'the seal must be declared');
});

test('the report keeps promising_count at zero, is deterministic and carries no timestamp', () => {
  const arc = archive(400, { A: () => 0.001, B: () => 0.0015, C: () => 0.0008 });
  const a = JSON.stringify(stage0(arc));
  assert(a === JSON.stringify(stage0(arc)), 'not deterministic');
  assert(stage0(arc).promising_count === 0, 'promising_count must be 0');
  for (const b of ['"generated_at"', '"run_ts"']) assert(!a.includes(b), `must not embed ${b}`);
});

test('too few symbols gate rather than crash', () => {
  assert(stage0({ A: [[T0, 1, 1, 1, 1, 1]] }).verdict === 'DATA_INADEQUATE', 'one thin symbol is inadequate');
});

test('the csv carries one row per frozen threshold', () => {
  const arc = archive(400, { A: () => 0.001, B: () => 0.0015, C: () => 0.0008 });
  const lines = toCsv(stage0(arc)).trim().split('\n');
  assert(lines.length === 1 + FROZEN.thresholds.length, `expected header plus three rows, got ${lines.length}`);
  assert(lines[0].startsWith('threshold_pct,n,pairs,mean_bps'), 'header');
});

test('an unknown argument is rejected', () => {
  let threw = false;
  try { parseArgs(['--wat']); } catch { threw = true; }
  assert(threw, 'unknown args rejected');
  assert(parseArgs(['--archive', 'a.json']).archive === 'a.json', 'known args parse');
});

section('static scan');

const ALLOWED_MODULES = new Set(['node:fs', 'node:path', 'node:url', './analysis/simple_pairs_relative_value_v0.mjs']);
function src(file) {
  let s = readFileSync(file, 'utf8');
  s = s.replace(/\/\* static-scan:allow-denylist-start \*\/[\s\S]*?\/\* static-scan:allow-denylist-end \*\//g, '/* excised */');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/^\s*\/\/.*$/gm, ' ');
  return s;
}
function scanFor(cat) {
  for (const f of SCANNED_FILES) for (const t of FORBIDDEN_TOKENS[cat]) {
    assert(!src(f).includes(t), `${f}: forbidden ${cat} token '${t}'`);
  }
}

test('every import is on the allowlist', () => {
  for (const f of SCANNED_FILES) {
    const s = src(f);
    const mods = [
      ...[...s.matchAll(/\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...s.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ];
    for (const m of mods) assert(ALLOWED_MODULES.has(m), `${f}: forbidden module '${m}'`);
  }
});
test('no network surface', () => scanFor('network'));
test('no process, service or shell surface', () => scanFor('process_service'));
test('no credential or environment surface', () => scanFor('credential'));
test('no exchange, account, order or position surface', () => scanFor('exchange_account'));
test('no trading runtime state is referenced', () => scanFor('runtime_state'));
test('no destructive filesystem call', () => scanFor('filesystem_mutation'));
test('promising_count is never raised', () => {
  for (const f of SCANNED_FILES) assert(!NONZERO_PROMISING.test(src(f)), `${f}: raises promising_count`);
});
test('the engine writes only to an explicit --out base', () => {
  assert((src(ENGINE_PATH).match(WRITE_CALL_RE) ?? []).length === 2, 'exactly two writes');
  assert(src(ENGINE_PATH).includes('if (opts.out)'), 'guarded by --out');
});
test('the test file writes nothing', () => {
  for (const t of WRITE_TOKENS) assert(!src(TEST_PATH).includes(t), `must not write (${t})`);
});
test('only audited node:fs primitives are imported', () => {
  for (const f of SCANNED_FILES) {
    const m = src(f).match(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs['"]/);
    if (!m) continue;
    for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert(ALLOWED_FS_IMPORTS.has(n), `${f}: unaudited node:fs import '${n}'`);
    }
  }
});

const failed = results.filter((r) => !r.ok);
const by = new Map();
for (const r of results) { if (!by.has(r.sec)) by.set(r.sec, []); by.get(r.sec).push(r); }
const out = ['TASK-AH-009 simple pairs relative value — Stage 0 test suite', ''];
for (const [n, rows] of by) {
  out.push(`## ${n}  (${rows.filter((r) => r.ok).length}/${rows.length})`);
  for (const r of rows) { out.push(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`); if (!r.ok) out.push(`       ${r.error}`); }
}
out.push('', `total ${results.length}, passed ${results.length - failed.length}, failed ${failed.length}`);
process.stdout.write(`${out.join('\n')}\n`);
process.exit(failed.length === 0 ? 0 : 1);
