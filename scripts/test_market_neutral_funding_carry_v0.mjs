#!/usr/bin/env node
// test_market_neutral_funding_carry_v0.mjs — TASK-AH-010 Stage 0 tests + static no-trading scan.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN, REQUIRED_FIELDS, mean, median, stdev, missingFields, basis,
  partitionByHedgeability, byAssetHour, carryEvents, concentration, independence,
  summarise, stage0, toCsv, parseArgs,
} from './analysis/market_neutral_funding_carry_v0.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'market_neutral_funding_carry_v0.mjs');
const TEST_PATH = join(HERE, 'test_market_neutral_funding_carry_v0.mjs');
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

const H = 3600_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const row = (o = {}) => ({ ts: T0, asset: 'BTC', funding: 0.00005, mark: 100, oracle: 100, ...o });
/** Hours of one asset at a fixed funding rate and flat basis. */
function series(asset, n, funding, markAt = () => 100) {
  return Array.from({ length: n }, (_, i) => row({ ts: T0 + i * H, asset, funding, mark: markAt(i), oracle: 100 }));
}

section('gate order');

test('hedgeability is gate 1 and is declared as such', () => {
  assert(FROZEN.structure === 'SHORT_PERP_LONG_SPOT', 'the structure is stated');
  const r = stage0([...series('BTC', 400, 0.00005)], ['BTC']);
  assert(r.gate_order[0] === 'HEDGEABILITY', 'hedgeability must come first');
  assert(r.oracle_is_not_tradeable === true, 'the oracle must be declared untradeable');
});

test('an unhedgeable asset is excluded from the universe, not merely flagged', () => {
  const rows = [...series('BTC', 400, 0.00005), ...series('MEME', 400, 0.001)];
  const p = partitionByHedgeability(rows, ['BTC']);
  assert(p.hedgeable.every((r) => r.asset === 'BTC'), 'only hedgeable rows survive');
  assert(p.unhedgeable_assets.includes('MEME'), 'the excluded asset is named');
  assert(p.hedgeable.length + p.unhedgeable.length === rows.length, 'nothing is lost');
});

test('a spectacular unhedgeable asset cannot rescue the verdict', () => {
  // MEME pays enormous funding but has no spot. BTC pays almost nothing.
  const rows = [...series('BTC', 400, 1e-7), ...series('MEME', 400, 0.01)];
  const r = stage0(rows, ['BTC']);
  assert(r.verdict === 'STAGE_0_INFEASIBLE', `got ${r.verdict}`);
  assert(r.unhedgeable_assets_count === 1, 'MEME counted as unhedgeable');
});

section('economics');

test('the cost floor is two legs', () => {
  assert(FROZEN.cost_bps_both_legs === 22 && FROZEN.double_cost_bps === 44, 'two legs, and its double');
});

test('funding accrues hourly and is received by the short', () => {
  const idx = byAssetHour(series('BTC', 300, 0.0001));
  const hours = Array.from({ length: 300 }, (_, i) => T0 + i * H);
  const ev = carryEvents(idx, hours, T0 + 200 * H, 0.00005, 24);
  assert(ev.length > 0, 'expected events');
  assert(Math.abs(ev[0].funding_bps - 1e4 * 0.0001 * 24) < 1e-9, '24 hours at 1 bp each is 24 bps');
  assert(Math.abs(ev[0].net_bps - (ev[0].gross_bps - 22)) < 1e-9, 'net is gross minus the two-leg cost');
});

test('funding below the threshold produces no event', () => {
  const idx = byAssetHour(series('BTC', 300, 0.00001));
  const hours = Array.from({ length: 300 }, (_, i) => T0 + i * H);
  assert(carryEvents(idx, hours, T0 + 200 * H, 0.0001, 24).length === 0, 'below threshold never fires');
});

test('basis P&L is minus the change in basis for a short perp', () => {
  // basis widens from 0 to +100 bps: the short perp loses that.
  const rows = series('BTC', 300, 0.00005, (i) => (i >= 100 ? 101 : 100));
  const idx = byAssetHour(rows);
  const hours = rows.map((r) => r.ts);
  const ev = carryEvents(idx, hours, T0 + 200 * H, 0.00001, 24);
  const crossing = ev.find((e) => e.ts < T0 + 100 * H && e.ts + 24 * H >= T0 + 100 * H);
  assert(crossing && crossing.basis_bps < 0, 'a widening basis must cost the short perp');
});

test('an incomplete funding series drops the event rather than extrapolating', () => {
  const rows = series('BTC', 300, 0.0001).filter((_, i) => i !== 10);
  const idx = byAssetHour(rows);
  const hours = rows.map((r) => r.ts);
  const ev = carryEvents(idx, hours, T0 + 200 * H, 0.00005, 24);
  assert(!ev.some((e) => e.ts <= T0 + 10 * H && e.ts + 24 * H > T0 + 10 * H), 'a gap inside the hold drops the event');
});

section('concentration and independence');

const ev = (asset, net) => ({ asset, ts: T0, day: '2026-01-01', funding_bps: net + 22, basis_bps: 0, gross_bps: net + 22, net_bps: net });

test('a share above 100 percent is reported, not clamped', () => {
  // One winner larger than the total, because everything else is negative.
  const c = concentration([ev('WIN', 1000), ev('A', -300), ev('B', -300)]);
  assert(c.top_asset === 'WIN', 'winner identified');
  assert(c.top_share > 1, `share above 1 must be reported, got ${c.top_share}`);
  assert(c.breaches_share_cap === true, 'and it breaches the cap');
});

test('removing the best asset can flip the mean, and that is reported', () => {
  const c = concentration([ev('WIN', 1000), ev('A', -30), ev('B', -30)]);
  assert(c.without_best_mean_bps === -30, `expected -30, got ${c.without_best_mean_bps}`);
});

test('a balanced book stays inside the cap', () => {
  const c = concentration([ev('A', 100), ev('B', 100), ev('C', 100), ev('D', 100), ev('E', 100)]);
  assert(c.breaches_share_cap === false, 'five equal contributors is 20 percent each');
  assert(FROZEN.max_symbol_share === 0.25, 'the cap is the programme standard');
});

test('overlapping entries are counted as overlapping', () => {
  const i = independence(new Array(991), 168, 301, 50);
  assert(i.non_overlapping_per_asset === 1, '301 hours holds one non-overlapping week');
  assert(i.effective_n === 50, 'one per asset across fifty assets');
  assert(i.inflation_factor > 19, `expected roughly twentyfold inflation, got ${i.inflation_factor}`);
  assert(i.overlapping === true, 'and it must be declared');
});

test('non-overlapping entries are not penalised', () => {
  const i = independence(new Array(50), 24, 1200, 1);
  assert(i.overlapping === false, `50 entries over 1200 hours at a 24h hold do not overlap: ${JSON.stringify(i)}`);
});

test('the naive t and the overlap-adjusted t are both reported', () => {
  const rows = Array.from({ length: 200 }, (_, i) => ev('A', 10 + (i % 2 ? 1 : -1)));
  const s = summarise(rows, 168, 301);
  assert(s.naive_t !== null && s.overlap_adjusted_t !== null, 'both must be present');
  assert(Math.abs(s.naive_t) > Math.abs(s.overlap_adjusted_t), 'the naive t must be the larger, misleading one');
});

section('stage 0');

test('missing fields gate before anything is computed', () => {
  const r = stage0([{ ts: T0, asset: 'BTC' }], ['BTC']);
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.missing_fields.includes('funding'), 'the missing field is named');
});

test('a hedgeable asset with a real premium and a balanced book can pass', () => {
  const assets = ['A', 'B', 'C', 'D', 'E', 'F'];
  const rows = assets.flatMap((a) => series(a, 900, 0.0002));
  const r = stage0(rows, assets);
  assert(['STAGE_0_PASS', 'STAGE_0_INFEASIBLE'].includes(r.verdict), 'a verdict is produced');
  assert(r.hedgeable_assets.length === 6, 'all six are hedgeable');
});

test('the report is deterministic, timestamp-free and keeps promising_count at zero', () => {
  const rows = [...series('BTC', 400, 0.00005), ...series('ETH', 400, 0.00006)];
  const a = JSON.stringify(stage0(rows, ['BTC', 'ETH']));
  assert(a === JSON.stringify(stage0(rows, ['BTC', 'ETH'])), 'not deterministic');
  assert(stage0(rows, ['BTC']).promising_count === 0, 'promising_count must be 0');
  for (const b of ['"generated_at"', '"run_ts"']) assert(!a.includes(b), `must not embed ${b}`);
});

test('the csv reports the all-asset and hedgeable-only universes side by side', () => {
  const rows = [...series('BTC', 400, 0.00005), ...series('MEME', 400, 0.001)];
  const csv = toCsv(stage0(rows, ['BTC']));
  assert(csv.includes(',all,'), 'the all-asset universe is reported');
  assert(csv.includes(',hedgeable,'), 'and the hedgeable-only universe beside it');
  assert(csv.split('\n')[0].includes('effective_n'), 'the effective sample size is a column');
});

test('an unknown argument is rejected', () => {
  let threw = false;
  try { parseArgs(['--wat']); } catch { threw = true; }
  assert(threw, 'unknown args rejected');
  assert(parseArgs(['--hourly', 'h.json']).hourly === 'h.json', 'known args parse');
});

section('static scan');

const ALLOWED_MODULES = new Set(['node:fs', 'node:path', 'node:url', './analysis/market_neutral_funding_carry_v0.mjs']);
function src(f) {
  let s = readFileSync(f, 'utf8');
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
    const mods = [...src(f).matchAll(/\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
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
const out = ['TASK-AH-010 market-neutral funding carry — Stage 0 test suite', ''];
for (const [n, rows] of by) {
  out.push(`## ${n}  (${rows.filter((r) => r.ok).length}/${rows.length})`);
  for (const r of rows) { out.push(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`); if (!r.ok) out.push(`       ${r.error}`); }
}
out.push('', `total ${results.length}, passed ${results.length - failed.length}, failed ${failed.length}`);
process.stdout.write(`${out.join('\n')}\n`);
process.exit(failed.length === 0 ? 0 : 1);
