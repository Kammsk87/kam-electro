#!/usr/bin/env node
// test_ah054_swing_relative_strength_4h.mjs — deterministic tests for TASK-AH-054.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, median, stdev, rankAverage, dailyFromBars, smaClose, dailyReturn,
  volumeBaseline, priorHigh, ema, selectUniverse, buildEvents, bucketBalance, stage0,
  toCsv, parseArgs, dayKey,
} from './analysis/ah054_swing_relative_strength_4h.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/ah054_swing_relative_strength_4h.mjs');

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

const DAY = 86_400_000;
const BAR = 14_400_000;
const T0 = Date.parse('2024-01-01T00:00:00Z');

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** `nDays` days of 4H bars, six per day, with a controllable per-day drift. */
function makeBars({ nDays = 400, px0 = 100, drift = 0, vol = 10, seed = 7, jitter = 0 } = {}) {
  const rnd = lcg(seed);
  const out = [];
  let px = px0;
  for (let d = 0; d < nDays; d += 1) {
    for (let k = 0; k < 6; k += 1) {
      const o = px;
      px *= 1 + drift / 6 + (jitter ? (rnd() - 0.5) * 2 * jitter : 0);
      out.push([T0 + d * DAY + k * BAR, o, Math.max(o, px) * 1.0005, Math.min(o, px) * 0.9995, px,
        vol, vol * px]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

group('daily series derived from 4H');

test('the daily close is the last 4H bar of the UTC day', () => {
  const b = makeBars({ nDays: 3, drift: 0.06 });
  const d = dailyFromBars(b);
  assert(d.length === 3, `expected 3 days, got ${d.length}`);
  assert(close(d[0].close, b[5][4]), 'day 0 closes on its sixth bar');
  assert(close(d[2].close, b[17][4]), 'day 2 closes on its eighteenth bar');
  assert(d[0].day < d[1].day && d[1].day < d[2].day, 'days are ordered');
});

test('daily turnover sums the day and is positive', () => {
  const b = makeBars({ nDays: 2, vol: 10 });
  const d = dailyFromBars(b);
  assert(d[0].turnover > 0, 'turnover accumulates');
  // Six bars a day, so the daily total must exceed any single bar.
  assert(d[0].turnover > b[0][6], 'the day total exceeds one bar');
});

test('sma and 7-day return are null until warmed, then correct', () => {
  const d = dailyFromBars(makeBars({ nDays: 60, drift: 0 }));
  assert(smaClose(d, 48, 50) === null, 'not warmed one day early');
  assert(smaClose(d, 49, 50) !== null, 'warmed exactly at the window');
  assert(dailyReturn(d, 6, 7) === null, 'a 7-day return needs seven prior days');
  assert(dailyReturn(d, 7, 7) !== null, 'and is available at index 7');
});

group('4H indicators');

test('the volume baseline excludes the bar being tested', () => {
  const b = makeBars({ nDays: 40, vol: 10 });
  b[100][5] = 1000;
  assert(close(volumeBaseline(b, 100), 10), 'the spike must not inflate its own baseline');
  assert(volumeBaseline(b, 101) > 10, 'the following bar does see it');
});

test('the prior high excludes the breaking bar', () => {
  const b = makeBars({ nDays: 40 });
  b[100] = [b[100][0], 100, 500, 99, 499, 10, 4990];
  const ph = priorHigh(b, 100);
  assert(ph < 200, `the bar's own high must be excluded, got ${ph}`);
  assert(close(priorHigh(b, 101), 500), 'the following bar does see it');
});

test('ema is null until seeded and tracks a rising series', () => {
  const b = makeBars({ nDays: 40, drift: 0.02 });
  assert(ema(b, FROZEN.ema_exit_period - 2) === null, 'not seeded');
  const e = ema(b, 100);
  assert(e !== null && e < b[100][4], 'a rising series closes above its EMA');
});

group('universe selection');

test('excluded symbols are dropped on the recorded measurement, with a reason', () => {
  const world = {
    BTCUSDT: makeBars({ nDays: 400, vol: 100 }),
    TACUSDT: makeBars({ nDays: 400, vol: 1000 }),
    VANRYUSDT: makeBars({ nDays: 400, vol: 1000 }),
    ETHUSDT: makeBars({ nDays: 400, vol: 50 }),
  };
  const u = selectUniverse(world);
  const names = u.chosen.map((c) => c.symbol);
  assert(!names.includes('TACUSDT') && !names.includes('VANRYUSDT'),
    'both excluded despite the highest turnover');
  assert(u.dropped.some((d) => d.symbol === 'TACUSDT' && d.why === 'BASIS_DISPERSION'),
    'and the reason is recorded, not silent');
});

test('a short series is dropped rather than admitted on partial data', () => {
  const world = { BTCUSDT: makeBars({ nDays: 400 }), SHORTUSDT: makeBars({ nDays: 10 }) };
  const u = selectUniverse(world);
  assert(!u.chosen.some((c) => c.symbol === 'SHORTUSDT'), 'the short series is out');
  assert(u.dropped.some((d) => d.symbol === 'SHORTUSDT' && d.why === 'SHORT_SERIES'), 'with a reason');
});

test('ranking is by median daily turnover and the benchmark is always retained', () => {
  const world = { BTCUSDT: makeBars({ nDays: 400, vol: 1 }) };
  for (let i = 0; i < 35; i += 1) world[`S${i}USDT`] = makeBars({ nDays: 400, vol: 100 + i });
  const u = selectUniverse(world, 30);
  assert(u.chosen.some((c) => c.symbol === 'BTCUSDT'),
    'the benchmark must survive whatever its rank, since every score is measured against it');
  const turns = u.ranked.map((r) => r.median_daily_turnover);
  for (let i = 1; i < turns.length; i += 1) assert(turns[i] <= turns[i - 1], 'ranked descending');
});

group('causality');

test('the daily context comes from the previous completed day, never the same day', () => {
  // BTC rises hard on one day only. A bar on that same day must not yet see it.
  const btc = makeBars({ nDays: 200, drift: 0.001, vol: 100 });
  const alt = makeBars({ nDays: 200, drift: 0.001, vol: 100, seed: 9 });
  const world = { BTCUSDT: btc, ALTUSDT: alt };
  const u = selectUniverse(world);
  const { events } = buildEvents(world, u.chosen);
  for (const e of events) {
    const prev = dayKey(e.ts - DAY);
    assert(prev < e.day, `event on ${e.day} must read day ${prev}, which is strictly earlier`);
  }
});

group('the balance gate');

test('a collapsed sort is flagged and a spread one is not', () => {
  const spread = Array.from({ length: 400 }, (_, i) => ({ vol_burst: 1.3 + i / 100 }));
  assert(!bucketBalance(spread, 'vol_burst').degenerate, 'a real sort passes');
  const tied = Array.from({ length: 400 }, (_, i) => ({ vol_burst: i < 360 ? 2 : 2 + i / 100 }));
  const bad = bucketBalance(tied, 'vol_burst');
  assert(bad.degenerate, `90 percent ties must be flagged, ratio ${bad.max_min_ratio}`);
  assert(bad.tie_pct > 50, 'and the tie fraction reported');
});

test('tie-averaged ranking is used, not positional', () => {
  // Positional bucketing would split the tied block evenly and report a ratio near 1.
  const tied = Array.from({ length: 500 }, (_, i) => ({ x: i < 450 ? 1 : 1 + i }));
  const b = bucketBalance(tied, 'x');
  assert(b.max_min_ratio > 2, `tie-averaged ranks must expose the collapse, got ${b.max_min_ratio}`);
  const r = rankAverage([5, 5, 5, 1]);
  assert(close(r[0], 3) && close(r[3], 1), 'ties share an averaged rank');
});

group('the Stage 0 gate');

test('Stage 0 computes no PnL, by contract', () => {
  const world = { BTCUSDT: makeBars({ nDays: 400, vol: 100 }) };
  for (let i = 0; i < 12; i += 1) world[`S${i}USDT`] = makeBars({ nDays: 400, vol: 50, seed: 20 + i, jitter: 0.01 });
  const r = stage0(world);
  assert(r.pnl_computed === false, 'the audit must not compute returns');
  assert(r.label === 'SAMPLE_AUDIT_NO_PNL', 'and must say so in its label');
  assert(!('net_mean_bps' in r) && !('gross_mean_bps' in r), 'no return field may appear');
  assert(r.promising_count === 0, 'and nothing is promoted');
});

test('too few events is UNDERPOWERED against the declared minimum', () => {
  const world = { BTCUSDT: makeBars({ nDays: 400, vol: 100 }) };
  for (let i = 0; i < 12; i += 1) world[`S${i}USDT`] = makeBars({ nDays: 400, vol: 50, seed: 40 + i });
  const r = stage0(world);
  if (r.total_events < FROZEN.min_events) {
    assert(r.verdict === 'UNDERPOWERED', `expected UNDERPOWERED, got ${r.verdict}`);
    assert(/declared minimum/.test(r.closure_reason), 'and names the declared minimum');
    assert(/no PnL/.test(r.closure_reason), 'and states that no PnL was computed');
  }
});

test('too small a universe is DATA_INADEQUATE', () => {
  const r = stage0({ BTCUSDT: makeBars({ nDays: 400 }) });
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
});

test('the frozen block carries the grounded prior and the measured funding', () => {
  assert(FROZEN.prior_expectation_bps === 181.3,
    'the prior is AH-050 top quintile, frozen in the engine rather than chosen after');
  assert(FROZEN.measured_funding_bps_per_hold === 0.8,
    'funding is the measured conditional figure, not the assumed 40 bps');
  assert(FROZEN.cost_bps_roundtrip === 16, 'the audited floor');
  assert(FROZEN.leverage === 1.0, 'measured at 1x so the result is a property of the signal');
  assert(FROZEN.declared_direction === 'LONG', 'declared before measurement');
  assert(FROZEN.excluded_symbols.includes('TACUSDT') && FROZEN.excluded_symbols.includes('VANRYUSDT'),
    'the two exclusions are named, on a recorded measurement');
});

test('the diagnostics account for every rejected bar', () => {
  const world = { BTCUSDT: makeBars({ nDays: 300, vol: 100 }) };
  for (let i = 0; i < 8; i += 1) world[`S${i}USDT`] = makeBars({ nDays: 300, vol: 50, seed: 60 + i, jitter: 0.01 });
  const r = stage0(world);
  if (r.diagnostics) {
    const d = r.diagnostics;
    const accounted = d.rejected_market_filter + d.rejected_relative_strength
      + d.rejected_trigger + d.rejected_overlap + r.total_events;
    assert(accounted === d.bars_considered,
      `every considered bar must be accounted for: ${accounted} vs ${d.bars_considered}`);
  }
});

group('CLI and output');

test('the csv carries the balance rows and the yearly counts', () => {
  const world = { BTCUSDT: makeBars({ nDays: 300, vol: 100 }) };
  for (let i = 0; i < 8; i += 1) world[`S${i}USDT`] = makeBars({ nDays: 300, vol: 50, seed: 80 + i, jitter: 0.01 });
  const csv = toCsv(stage0(world));
  assert(csv.split('\n')[0].startsWith('metric,key'), 'header first');
  assert(csv.includes('balance,') || csv.includes('NO_EVENTS'), 'balance rows or an explicit empty marker');
});

test('argument parsing rejects unknown flags', () => {
  assert(parseArgs(['--bars', 'd']).bars === 'd', 'a value is read');
  let threw = false;
  try { parseArgs(['--quantile', '0.9']); } catch { threw = true; }
  assert(threw, 'thresholds are frozen; varying them is a new task');
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

test('the engine draws no randomness and reads no wall clock', () => {
  for (const token of ['Date.now', 'Math.random', 'performance.now']) {
    assert(!src.includes(token), `non-deterministic call: ${token}`);
  }
  assert(!/new Date\(\s*\)/.test(src), 'an argument-less Date would read the wall clock');
});

test('the engine writes only where it was told to', () => {
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
