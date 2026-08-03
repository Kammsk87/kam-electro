#!/usr/bin/env node
// test_ah048_large_sweep_forced_flow_fade.mjs
//
// Deterministic tests for the TASK-AH-048 Stage 0 harness, plus the static no-trading scan.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN, REQUIRED_FIELDS, mean, median, stdev, dayKey, missingFields,
  trainBoundary, trainThresholds, isEvent, fadedMoveBps, horizonStats, stage0, toCsv, parseArgs,
} from './analysis/ah048_large_sweep_forced_flow_fade.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'ah048_large_sweep_forced_flow_fade.mjs');
const TEST_PATH = join(HERE, 'test_ah048_large_sweep_forced_flow_fade.mjs');
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
function assert(c, m) { if (!c) throw new Error(m); }

const T0 = Date.parse('2026-01-01T00:00:00Z');
const ev = (o = {}) => ({
  symbol: 'X', ts: T0, side: 'BUY', notional: 1000,
  mid_completion: 100, mid_60s: 100, mid_300s: 100, mid_900s: 100, ...o,
});

// ---------------------------------------------------------------------------
section('frozen contract');

test('the direction was declared FADE before inspection', () => {
  assert(FROZEN.declared_direction === 'FADE', 'the contract declares a fade');
  assert(FROZEN.stage === 0, 'this harness is Stage 0 only');
  assert(FROZEN.percentile_fitted_on === 'train_only_per_symbol', 'threshold fitted on train alone');
});

test('the three horizons and the cost model are frozen', () => {
  assert(JSON.stringify(FROZEN.horizons_ms) === JSON.stringify([60_000, 300_000, 900_000]), 'horizons');
  assert(FROZEN.primary_horizon_ms === 300_000, 'primary horizon');
  assert(FROZEN.double_cost_bps_roundtrip === 2 * FROZEN.cost_bps_roundtrip, 'double is twice');
});

// ---------------------------------------------------------------------------
section('event definition');

test('the train boundary splits at the frozen fraction of events by time', () => {
  const events = Array.from({ length: 100 }, (_, i) => ev({ ts: T0 + i * 1000 }));
  assert(trainBoundary(events) === T0 + 55 * 1000, 'boundary at 55 percent');
  assert(trainBoundary([]) === null, 'no events, no boundary');
});

test('the threshold is fitted on train only and per symbol', () => {
  const events = [
    ...Array.from({ length: 100 }, (_, i) => ev({ symbol: 'A', ts: T0 + i, notional: i })),
    ...Array.from({ length: 100 }, (_, i) => ev({ symbol: 'B', ts: T0 + i, notional: i * 10 })),
    // sealed-segment events, far larger, must not move the threshold
    ...Array.from({ length: 50 }, (_, i) => ev({ symbol: 'A', ts: T0 + 10_000 + i, notional: 1e9 })),
  ];
  const b = T0 + 5_000;
  const t = trainThresholds(events, b);
  assert(t.get('A') < 1000, `sealed events leaked into the threshold: ${t.get('A')}`);
  assert(t.get('B') > t.get('A'), 'thresholds are per symbol');
});

test('a symbol with no train events is excluded, never given a borrowed threshold', () => {
  const events = [ev({ symbol: 'A', ts: T0, notional: 10 }), ev({ symbol: 'B', ts: T0 + 10_000, notional: 10 })];
  const t = trainThresholds(events, T0 + 5_000);
  assert(t.get('B') === undefined, 'B has no train events and gets no threshold');
  assert(isEvent(ev({ symbol: 'B', notional: 1e9 }), t) === false, 'and therefore produces no event');
});

test('only sweeps at or above the threshold are events', () => {
  const t = new Map([['X', 1000]]);
  assert(isEvent(ev({ notional: 1000 }), t) === true, 'at the threshold counts');
  assert(isEvent(ev({ notional: 999 }), t) === false, 'below does not');
});

// ---------------------------------------------------------------------------
section('fade arithmetic');

test('a buy sweep is faded short, so a rising mid is a loss', () => {
  const e = ev({ side: 'BUY', mid_completion: 100, mid_60s: 101 });
  assert(Math.abs(fadedMoveBps(e, 60_000) + 100) < 1e-9, 'fading a buy into a rise loses 100 bps');
});

test('a sell sweep is faded long, so a rising mid is a gain', () => {
  const e = ev({ side: 'SELL', mid_completion: 100, mid_300s: 101 });
  assert(Math.abs(fadedMoveBps(e, 300_000) - 100) < 1e-9, 'fading a sell into a rise gains 100 bps');
});

test('a missing or zero mid yields null rather than a fabricated move', () => {
  assert(fadedMoveBps(ev({ mid_completion: 0 }), 60_000) === null, 'zero entry mid');
  assert(fadedMoveBps(ev({ mid_900s: 0 }), 900_000) === null, 'zero exit mid');
});

test('the mirror is reported as the exact negation, and labelled as such', () => {
  const events = [ev({ side: 'BUY', mid_60s: 101 }), ev({ side: 'BUY', mid_60s: 101 })];
  const h = horizonStats(events, 60_000);
  assert(Math.abs(h.faded_mean_bps + h.mirror_continuation_mean_bps) < 1e-9, 'mirror is the negation');
  assert(h.clears_cost === false, 'a losing fade does not clear cost');
});

test('the cost floor is a strict threshold', () => {
  // Exact equality is not expressible in floating point here: 100 * (1 + 11/1e4) lands at
  // 11.000000000001 bps. So the boundary is asserted either side of the floor instead.
  const up = (bps) => ev({ side: 'SELL', mid_60s: 100 * (1 + bps / 1e4) });
  const under = horizonStats([up(10.9), up(10.9)], 60_000);
  assert(under.clears_cost === false, `just below the floor must not clear, got ${under.faded_mean_bps}`);
  const over = horizonStats([up(11.1), up(11.1)], 60_000);
  assert(over.clears_cost === true, `just above the floor must clear, got ${over.faded_mean_bps}`);
  const mirror = horizonStats([ev({ side: 'BUY', mid_60s: 100 * (1 + 20 / 1e4) })], 60_000);
  assert(mirror.clears_cost === false && mirror.mirror_clears_cost === true,
    'a losing fade whose mirror clears must be flagged on the mirror only');
});

// ---------------------------------------------------------------------------
section('stage 0 gate');

test('missing fields gate before anything is computed', () => {
  const r = stage0([{ symbol: 'X', ts: T0 }]);
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  for (const f of ['side', 'notional', 'mid_completion']) {
    assert(r.missing_fields.includes(f), `${f} must be named`);
  }
});

test('too few sealed events closes the hypothesis', () => {
  const events = Array.from({ length: 40 }, (_, i) => ev({ ts: T0 + i * 1000, notional: 1000 + i }));
  const r = stage0(events);
  assert(r.verdict === 'STAGE_0_INFEASIBLE', `got ${r.verdict}`);
  assert(r.closure_reason.includes('sealed events'), 'the reason must name the shortfall');
});

test('a hypothesis clearing the cost floor in either direction passes the gate', () => {
  // A sell sweep followed by a large rise: the fade wins by far more than the cost floor.
  const events = Array.from({ length: 400 }, (_, i) => ev({
    symbol: `S${i % 6}`, ts: T0 + i * 1000, notional: 1000 + i,
    side: 'SELL', mid_completion: 100, mid_60s: 105, mid_300s: 105, mid_900s: 105,
  }));
  const r = stage0(events);
  assert(r.verdict === 'STAGE_0_PASS', `got ${r.verdict}: ${r.closure_reason}`);
});

test('a hypothesis clearing in neither direction is closed', () => {
  const events = Array.from({ length: 400 }, (_, i) => ev({
    symbol: `S${i % 6}`, ts: T0 + i * 1000, notional: 1000 + i,
    side: 'SELL', mid_completion: 100, mid_60s: 100.01, mid_300s: 100.01, mid_900s: 100.01,
  }));
  const r = stage0(events);
  assert(r.verdict === 'STAGE_0_INFEASIBLE', `got ${r.verdict}`);
  assert(r.closure_reason.includes('round-trip cost'), 'the reason must name the cost floor');
});

test('the sealed segments are never read for a statistic', () => {
  const events = Array.from({ length: 400 }, (_, i) => ev({
    symbol: `S${i % 6}`, ts: T0 + i * 1000, notional: 1000 + i,
    // sealed half is given an enormous favourable move that must not appear anywhere
    side: 'SELL', mid_completion: 100, mid_60s: i > 220 ? 900 : 100.01,
    mid_300s: i > 220 ? 900 : 100.01, mid_900s: i > 220 ? 900 : 100.01,
  }));
  const r = stage0(events);
  assert(r.sealed_segments_untouched === true, 'the report must declare the seal');
  for (const h of r.horizons) {
    assert(Math.abs(h.faded_mean_bps) < 100, `a sealed-segment move leaked into ${h.horizon_ms}ms: ${h.faded_mean_bps}`);
  }
});

test('the report is deterministic, carries no timestamp, and keeps promising_count at zero', () => {
  const events = Array.from({ length: 300 }, (_, i) => ev({ symbol: `S${i % 6}`, ts: T0 + i * 1000, notional: 1000 + i }));
  const a = JSON.stringify(stage0(events));
  assert(a === JSON.stringify(stage0(events)), 'not deterministic');
  for (const b of ['"generated_at"', '"run_ts"']) assert(!a.includes(b), `must not embed ${b}`);
  assert(stage0(events).promising_count === 0, 'promising_count must be 0');
});

test('the csv has one row per frozen horizon', () => {
  const events = Array.from({ length: 300 }, (_, i) => ev({ symbol: `S${i % 6}`, ts: T0 + i * 1000, notional: 1000 + i }));
  const lines = toCsv(stage0(events)).trim().split('\n');
  assert(lines.length === 1 + FROZEN.horizons_ms.length, `expected header plus three horizons, got ${lines.length}`);
  assert(lines[0].startsWith('horizon_s,n,faded_mean_bps'), 'header');
});

test('an unknown argument is rejected', () => {
  let threw = false;
  try { parseArgs(['--wat']); } catch { threw = true; }
  assert(threw, 'unknown args rejected');
  assert(parseArgs(['--events', 'e.json']).events === 'e.json', 'known args parse');
});

// ---------------------------------------------------------------------------
section('static scan');

const ALLOWED_MODULES = new Set(['node:fs', 'node:path', 'node:url', './analysis/ah048_large_sweep_forced_flow_fade.mjs']);
function scannableSource(file) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(/\/\* static-scan:allow-denylist-start \*\/[\s\S]*?\/\* static-scan:allow-denylist-end \*\//g, '/* excised */');
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.replace(/^\s*\/\/.*$/gm, ' ');
  return src;
}
function scanFor(cat) {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    for (const t of FORBIDDEN_TOKENS[cat]) assert(!src.includes(t), `${file}: forbidden ${cat} token '${t}'`);
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
    for (const m of mods) assert(ALLOWED_MODULES.has(m), `${file}: forbidden module '${m}'`);
  }
});

test('no network surface', () => scanFor('network'));
test('no process, service or shell surface', () => scanFor('process_service'));
test('no credential or environment surface', () => scanFor('credential'));
test('no exchange, account, order or position surface', () => scanFor('exchange_account'));
test('no trading runtime state is referenced', () => scanFor('runtime_state'));
test('no destructive filesystem call', () => scanFor('filesystem_mutation'));

test('promising_count is never raised', () => {
  for (const f of SCANNED_FILES) assert(!NONZERO_PROMISING.test(scannableSource(f)), `${f}: raises promising_count`);
});

test('the engine writes only to an explicit --out base', () => {
  const src = scannableSource(ENGINE_PATH);
  assert((src.match(WRITE_CALL_RE) ?? []).length === 2, 'exactly two writes');
  assert(src.includes('if (opts.out)'), 'guarded by --out');
});

test('the test file writes nothing', () => {
  const src = scannableSource(TEST_PATH);
  for (const t of WRITE_TOKENS) assert(!src.includes(t), `must not write (${t})`);
});

test('only audited node:fs primitives are imported', () => {
  for (const file of SCANNED_FILES) {
    const m = scannableSource(file).match(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs['"]/);
    if (!m) continue;
    for (const n of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      assert(ALLOWED_FS_IMPORTS.has(n), `${file}: unaudited node:fs import '${n}'`);
    }
  }
});

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
const bySection = new Map();
for (const r of results) {
  if (!bySection.has(r.section)) bySection.set(r.section, []);
  bySection.get(r.section).push(r);
}
const lines = ['TASK-AH-048 large sweep forced-flow fade — Stage 0 test suite', ''];
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
