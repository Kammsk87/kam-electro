#!/usr/bin/env node
// test_ah047_execution_policy_guard.mjs
//
// Deterministic tests for TASK-AH-047, plus the ship-blocking static no-trading scan.
// Run: node scripts/test_ah047_execution_policy_guard.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN, GUARD_STATES, INTENTS, REQUIRED_FIELDS, REFUSED_SUBSTITUTES,
  mean, median, stdev, seeded, dayKey,
  missingFields, gateStates, guardState, signedForward, buildStates,
  chronology, assignSplits, separation, randomRateControl, removeBest,
  verdictFor, report, toCsv, parseArgs,
} from './analysis/ah047_execution_policy_guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'ah047_execution_policy_guard.mjs');
const TEST_PATH = join(HERE, 'test_ah047_execution_policy_guard.mjs');
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
function assert(cond, m) { if (!cond) throw new Error(m); }

const T0 = Date.parse('2026-01-01T00:00:00Z');
const S = 10_000; // snapshot spacing

function row(o = {}) {
  return {
    ts: T0, symbol: 'X', bid: 99.5, ask: 100.5,
    buy_notional: 100, sell_notional: 100,
    bid_depth_prev: 1000, bid_depth_next: 1000,
    ask_depth_prev: 1000, ask_depth_next: 1000,
    ...o,
  };
}

// ---------------------------------------------------------------------------
// 1. It is a guard, structurally
// ---------------------------------------------------------------------------

section('guard class invariants');

test('the engine declares class GUARD and never emits a direction', () => {
  assert(FROZEN.class === 'GUARD', 'class must be GUARD');
  for (const intent of INTENTS) {
    const s = guardState(row({ buy_notional: 10, sell_notional: 500, bid_depth_next: 500 }), intent);
    assert(GUARD_STATES.includes(s), `guard returned ${s}, outside the declared state set`);
    assert(s !== 'LONG' && s !== 'SHORT', 'a guard may never emit a direction');
  }
});

test('the guard has exactly three states and no others', () => {
  assert(GUARD_STATES.length === 3, 'ALLOW, VETO, NO_DATA only');
  assert(guardState(null, 'LONG') === 'NO_DATA', 'no input means NO_DATA');
  assert(guardState(row(), 'SIDEWAYS') === 'NO_DATA', 'an unknown intent is NO_DATA, never a guess');
});

test('the guard fails closed on missing depth, never open', () => {
  for (const f of ['bid_depth_prev', 'bid_depth_next', 'ask_depth_prev', 'ask_depth_next']) {
    const bad = row({ buy_notional: 10, sell_notional: 500 });
    delete bad[f];
    assert(guardState(bad, 'LONG') === 'NO_DATA', `missing ${f} must yield NO_DATA, not ALLOW`);
  }
});

test('the report never presents the KPI as PnL and records that nothing is guarded yet', () => {
  const r = report([row()]);
  const json = JSON.stringify(r);
  for (const banned of ['"pnl"', '"net_pnl"', '"revenue"', '"profit"', '"equity"']) {
    assert(!json.includes(banned), `a guard report must not contain ${banned}`);
  }
  assert(r.kpi_note.includes('NOT PnL'), 'the KPI note must say it is not PnL');
  assert(r.admitted_sleeves_available_to_guard === 0, 'with zero admitted sleeves the saving is potential');
  assert(r.promising_count === 0, 'promising_count must be 0');
});

// ---------------------------------------------------------------------------
// 2. The predicate
// ---------------------------------------------------------------------------

section('predicate');

test('a long is vetoed when sellers dominate and bid depth falls', () => {
  const s = row({ buy_notional: 10, sell_notional: 500, bid_depth_prev: 1000, bid_depth_next: 400 });
  assert(guardState(s, 'LONG') === 'VETO', 'both conditions met should veto a long');
});

test('either condition alone is not enough to veto', () => {
  const flowOnly = row({ buy_notional: 10, sell_notional: 500, bid_depth_next: 1200 });
  assert(guardState(flowOnly, 'LONG') === 'ALLOW', 'selling into a thickening bid is not a veto');
  const depthOnly = row({ buy_notional: 500, sell_notional: 10, bid_depth_next: 400 });
  assert(guardState(depthOnly, 'LONG') === 'ALLOW', 'thinning bid with buyers dominant is not a veto');
});

test('the short case is the exact mirror', () => {
  const s = row({ buy_notional: 500, sell_notional: 10, ask_depth_prev: 1000, ask_depth_next: 400 });
  assert(guardState(s, 'SHORT') === 'VETO', 'buyers eating a thinning ask should veto a short');
  assert(guardState(s, 'LONG') === 'ALLOW', 'the same state does not veto the opposite intent');
});

test('balanced flow allows, and missing flow is NO_DATA', () => {
  assert(guardState(row(), 'LONG') === 'ALLOW', 'zero net flow allows');
  assert(guardState(row({ buy_notional: NaN }), 'LONG') === 'NO_DATA', 'unusable flow is NO_DATA');
});

test('the forward move is signed against the intent', () => {
  assert(Math.abs(signedForward(100, 101, 'LONG') - 100) < 1e-9, 'a rise is good for a long');
  assert(Math.abs(signedForward(100, 101, 'SHORT') + 100) < 1e-9, 'a rise is bad for a short');
  assert(signedForward(0, 101, 'LONG') === null, 'a zero entry mid yields null');
});

// ---------------------------------------------------------------------------
// 3. State construction
// ---------------------------------------------------------------------------

section('state construction');

function series(n, mutate = () => ({})) {
  return Array.from({ length: n }, (_, i) => row({ ts: T0 + i * S, ...mutate(i) }));
}

test('both intents are always evaluated, never a selected subset', () => {
  const st = buildStates(series(50));
  const longs = st.filter((s) => s.intent === 'LONG').length;
  const shorts = st.filter((s) => s.intent === 'SHORT').length;
  assert(longs === shorts && longs > 0, `both intents must be evaluated equally, got ${longs}/${shorts}`);
});

test('the forward mid never comes from after the horizon', () => {
  const rows = series(40, (i) => ({ bid: 99.5 + i, ask: 100.5 + i }));
  const st = buildStates(rows, 60_000);
  const first = st.find((s) => s.intent === 'LONG');
  // 60s at 10s spacing is 6 snapshots ahead; mid moves +1 per snapshot from 100
  const expected = 1e4 * ((100 + 6) - 100) / 100;
  assert(Math.abs(first.forward_bps - expected) < 1e-6, `expected ${expected}, got ${first.forward_bps}`);
});

test('a state with no snapshot inside the horizon is dropped, not imputed', () => {
  const rows = [row({ ts: T0 }), row({ ts: T0 + 10 * 60_000 })];
  assert(buildStates(rows, 60_000).length === 0, 'a gap wider than the horizon yields no state');
});

test('symbols are kept separate', () => {
  const rows = [...series(20), ...series(20).map((r) => ({ ...r, symbol: 'Y' }))];
  const st = buildStates(rows);
  assert(new Set(st.map((s) => s.symbol)).size === 2, 'two symbols');
});

// ---------------------------------------------------------------------------
// 4. Chronology
// ---------------------------------------------------------------------------

section('chronology');

test('splits are chronological 55/20/15/10', () => {
  const c = chronology(1000);
  assert(c.trainEnd === 550 && c.validationEnd === 750 && c.holdoutEnd === 900, 'boundaries');
});

test('purge and embargo remove boundary and warm-up states', () => {
  const { kept, dropped } = assignSplits(buildStates(series(600)));
  assert(dropped.purged > 0, 'expected purged boundary states');
  assert(dropped.embargoed > 0, 'expected embargoed heads');
  for (const s of kept) assert(['train', 'validation', 'holdout', 'forward'].includes(s.split), 'split label');
});

// ---------------------------------------------------------------------------
// 5. Separation metric
// ---------------------------------------------------------------------------

section('separation');

const st = (state, fwd, extra = {}) => ({ symbol: 'X', ts: T0, day: dayKey(T0), intent: 'LONG', state, forward_bps: fwd, ...extra });

test('separation is ALLOW mean minus VETO mean', () => {
  const s = separation([st('ALLOW', 10), st('ALLOW', 10), st('VETO', -10), st('VETO', -10)]);
  assert(s.prevented_adverse_bps === 20, `expected 20, got ${s.prevented_adverse_bps}`);
  assert(s.veto_rate === 0.5, 'veto rate');
  assert(s.allow_mean_bps === 10 && s.veto_mean_bps === -10, 'leg means');
});

test('a guard that never vetoes, or always vetoes, is degenerate', () => {
  const never = separation([st('ALLOW', 1), st('ALLOW', 2)]);
  assert(never.degenerate === true && never.prevented_adverse_bps === null, 'no veto means no separation');
  const rows = [...Array.from({ length: 99 }, () => st('VETO', -1)), st('ALLOW', 1)];
  assert(separation(rows).degenerate === true, 'a 99% veto rate is degenerate');
});

test('the degenerate bounds are the frozen ones', () => {
  assert(FROZEN.veto_rate_min === 0.02 && FROZEN.veto_rate_max === 0.80, 'frozen bounds');
});

test('NO_DATA states are excluded from the rate but counted', () => {
  const s = separation([st('ALLOW', 1), st('VETO', -1), st('NO_DATA', 0)]);
  assert(s.no_data === 1 && s.evaluated === 2, 'NO_DATA counted separately');
  assert(s.veto_rate === 0.5, 'the rate is over evaluated states only');
});

// ---------------------------------------------------------------------------
// 6. The control that decides everything
// ---------------------------------------------------------------------------

section('random-rate control');

test('a guard that separates nothing does not beat its random control', () => {
  // States are assigned ALLOW/VETO independently of the outcome.
  const rnd = seeded(1);
  const rows = Array.from({ length: 4000 }, () => st(rnd() < 0.3 ? 'VETO' : 'ALLOW', (rnd() - 0.5) * 20));
  const c = randomRateControl(rows, 200, 5);
  assert(c.beats_random === false, `a null guard must not beat random, p=${c.p_value}`);
});

test('a guard that genuinely separates does beat its random control', () => {
  const rnd = seeded(2);
  const rows = Array.from({ length: 4000 }, () => {
    const bad = rnd() < 0.3;
    return st(bad ? 'VETO' : 'ALLOW', (bad ? -8 : 2) + (rnd() - 0.5) * 4);
  });
  const c = randomRateControl(rows, 200, 5);
  assert(c.beats_random === true, `a real separation should beat random, p=${c.p_value}`);
  assert(c.observed_separation_bps > c.control_mean_separation_bps, 'observed must exceed the control centre');
});

test('the control vetoes at the same rate as the real guard', () => {
  const rows = [...Array.from({ length: 300 }, () => st('VETO', -5)), ...Array.from({ length: 700 }, () => st('ALLOW', 5))];
  const observedRate = separation(rows).veto_rate;
  assert(Math.abs(observedRate - 0.3) < 1e-9, 'setup rate');
  const c = randomRateControl(rows, 100, 7);
  assert(c.samples > 0 && c.two_sided === true, 'the control must run and be two sided');
});

test('the control is deterministic for a fixed seed', () => {
  const rnd = seeded(3);
  const rows = Array.from({ length: 500 }, () => st(rnd() < 0.4 ? 'VETO' : 'ALLOW', (rnd() - 0.5) * 10));
  assert(randomRateControl(rows, 50, 11).p_value === randomRateControl(rows, 50, 11).p_value, 'same seed reproduces');
});

test('remove-best drops the strongest contributing symbol and day', () => {
  const rows = [
    st('VETO', -100, { symbol: 'A' }), st('ALLOW', 100, { symbol: 'A' }),
    st('VETO', -1, { symbol: 'B' }), st('ALLOW', 1, { symbol: 'B' }),
  ];
  assert(removeBest(rows, 'symbol').removed === 'A', 'A carries the separation');
});

// ---------------------------------------------------------------------------
// 7. Verdict ordering
// ---------------------------------------------------------------------------

section('verdicts');

const passing = () => ({
  holdout: { evaluated: 5000, symbols: 8, days: 20, prevented_adverse_bps: 3, degenerate: false },
  forward: { evaluated: 3000, symbols: 7, days: 15, prevented_adverse_bps: 2, degenerate: false },
  random_control: { beats_random: true },
  remove_best_symbol: { separation: { prevented_adverse_bps: 2 } },
  remove_best_day: { separation: { prevented_adverse_bps: 2 } },
});

test('thin data gates first', () => {
  for (const mutate of [(r) => { r.holdout.evaluated = 10; }, (r) => { r.forward.symbols = 1; }, (r) => { r.holdout.days = 2; }]) {
    const r = passing(); mutate(r);
    assert(verdictFor(r) === 'DATA_INADEQUATE', 'insufficient sample gates first');
  }
});

test('a degenerate veto rate outranks a good metric', () => {
  const r = passing(); r.holdout.degenerate = true;
  assert(verdictFor(r) === 'DEGENERATE', `got ${verdictFor(r)}`);
});

test('no separation is reported as such', () => {
  for (const mutate of [(r) => { r.holdout.prevented_adverse_bps = -1; }, (r) => { r.forward.prevented_adverse_bps = 0; }]) {
    const r = passing(); mutate(r);
    assert(verdictFor(r) === 'NO_SEPARATION', 'expected NO_SEPARATION');
  }
});

test('failing the random control blocks admission even with a positive metric', () => {
  const r = passing(); r.random_control.beats_random = false;
  assert(verdictFor(r) === 'NOT_BETTER_THAN_RANDOM', `got ${verdictFor(r)}`);
});

test('remove-best must survive', () => {
  const r = passing(); r.remove_best_day.separation.prevented_adverse_bps = -1;
  assert(verdictFor(r) === 'NO_SEPARATION', 'a separation carried by one day is not a separation');
});

test('the best possible verdict is research-only and admits no entry', () => {
  assert(verdictFor(passing()) === 'GUARD_ADMITTED_RESEARCH_ONLY', 'the fully passing case');
});

// ---------------------------------------------------------------------------
// 8. End to end
// ---------------------------------------------------------------------------

section('end to end');

test('an empty input gates rather than crashing', () => {
  const r = report([]);
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.missing_inputs.length > 0, 'missing fields named');
});

test('a missing required field is named exactly', () => {
  const bad = [row()];
  delete bad[0].bid_depth_prev;
  const r = report(bad);
  assert(r.missing_inputs[0].missing_fields.includes('bid_depth_prev'), 'the missing field must be named');
});

test('an aggressor side from a refused substitute is rejected', () => {
  for (const src of REFUSED_SUBSTITUTES) {
    const r = report([row({ side_source: src })]);
    assert(r.verdict === 'DATA_INADEQUATE', `${src} must gate`);
    assert(r.missing_inputs[0].reason === 'AGGRESSOR_SIDE_UNUSABLE', 'reason must name the substitute');
  }
});

test('two identical runs are byte-identical and carry no timestamp', () => {
  const rows = series(400, (i) => ({ bid: 99.5 + Math.sin(i) * 0.1, ask: 100.5 + Math.sin(i) * 0.1 }));
  const a = JSON.stringify(report(rows));
  assert(a === JSON.stringify(report(rows)), 'not deterministic');
  for (const b of ['"generated_at"', '"run_ts"']) assert(!a.includes(b), `must not embed ${b}`);
});

test('both frozen horizons are reported', () => {
  const rows = series(400, (i) => ({ bid: 99.5 + Math.sin(i) * 0.1, ask: 100.5 + Math.sin(i) * 0.1 }));
  const r = report(rows);
  assert(r.horizons.length === 2, 'two horizons');
  assert(r.horizons.map((h) => h.horizon_ms).join() === FROZEN.horizons_ms.join(), 'frozen horizons');
});

test('the csv has one row per split and balanced quoting', () => {
  const rows = series(400, (i) => ({ bid: 99.5 + Math.sin(i) * 0.1, ask: 100.5 + Math.sin(i) * 0.1 }));
  const csv = toCsv(report(rows));
  const lines = csv.trim().split('\n');
  assert(lines[0].startsWith('split,evaluated'), 'header');
  for (const l of lines) assert(((l.match(/"/g) ?? []).length) % 2 === 0, 'balanced quoting');
});

test('an unknown argument is rejected', () => {
  let threw = false;
  try { parseArgs(['--wat']); } catch { threw = true; }
  assert(threw, 'unknown args rejected');
  assert(parseArgs(['--states', 's.json']).states === 's.json', 'known args parse');
});

// ---------------------------------------------------------------------------
// 9. Static scan
// ---------------------------------------------------------------------------

section('static scan');

const ALLOWED_MODULES = new Set(['node:fs', 'node:path', 'node:url', './analysis/ah047_execution_policy_guard.mjs']);

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
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
const bySection = new Map();
for (const r of results) {
  if (!bySection.has(r.section)) bySection.set(r.section, []);
  bySection.get(r.section).push(r);
}
const lines = ['TASK-AH-047 execution policy guard — test suite', ''];
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
