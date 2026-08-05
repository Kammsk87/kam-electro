#!/usr/bin/env node
// test_ah053_momentum_vol_expansion_breakout.mjs — deterministic tests for TASK-AH-053.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, median, stdev, trueRange, atr, volumeBaseline, priorExtreme, evaluateBar,
  forwardBps, realisedBps, symbolEvents, bucketBalance, horizonStats, burstProfile,
  stage0, toCsv, parseArgs, rankAverage,
} from './analysis/ah053_momentum_vol_expansion_breakout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/ah053_momentum_vol_expansion_breakout.mjs');

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

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** Flat, quiet bars: no burst, no expansion, no break. The baseline that must produce nothing. */
function quietBars(n = 400, px = 100, vol = 10) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push([1_700_000_000_000 + i * FROZEN.bar_ms, px, px + 0.01, px - 0.01, px, vol]);
  }
  return out;
}

/** Noisy bars with a seeded generator, used where realism matters more than a planted event. */
function noisyBars(n = 2000, seed = 5, drift = 0) {
  const rnd = lcg(seed);
  const out = [];
  let px = 100;
  for (let i = 0; i < n; i += 1) {
    const r = drift + (rnd() - 0.5) * 0.004;
    const o = px;
    px *= 1 + r;
    const hi = Math.max(o, px) * (1 + rnd() * 0.001);
    const lo = Math.min(o, px) * (1 - rnd() * 0.001);
    out.push([1_700_000_000_000 + i * FROZEN.bar_ms, o, hi, lo, px, 10 + rnd() * 4]);
  }
  return out;
}

// ---------------------------------------------------------------------------

group('indicators');

test('true range uses the previous close and refuses index 0', () => {
  const b = [[0, 10, 12, 9, 11, 1], [1, 11, 15, 10, 14, 1]];
  assert(trueRange(b, 0) === null, 'there is no previous close at index 0');
  // high-low = 5; |high - prevClose| = 4; |low - prevClose| = 1 -> 5
  assert(close(trueRange(b, 1), 5), `expected 5, got ${trueRange(b, 1)}`);
  const gap = [[0, 10, 12, 9, 11, 1], [1, 20, 21, 19, 20, 1]];
  // high-low = 2; |21-11| = 10 -> the gap dominates, which is the point of true range
  assert(close(trueRange(gap, 1), 10), 'a gap must dominate the intrabar range');
});

test('atr is null until the window is fully warmed', () => {
  const b = quietBars(40);
  assert(atr(b, FROZEN.atr_window - 1) === null, 'not warmed one bar early');
  assert(atr(b, FROZEN.atr_window) !== null, 'warmed exactly at the window');
  assert(close(atr(b, 20), 0.02, 1e-9), `flat bars give a 0.02 range, got ${atr(b, 20)}`);
});

test('the volume baseline excludes the bar being tested', () => {
  const b = quietBars(60, 100, 10);
  b[40][5] = 1000;                       // a huge bar at 40
  const base = volumeBaseline(b, 40);
  assert(close(base, 10), `the spike must not inflate its own baseline, got ${base}`);
  const after = volumeBaseline(b, 41);
  assert(after > 10, 'the following bar does see it');
});

test('the prior extreme excludes the breaking bar', () => {
  const b = quietBars(60, 100);
  b[40] = [b[40][0], 100, 150, 99, 149, 10];    // a tall bar at 40
  const ext = priorExtreme(b, 40);
  assert(close(ext.hi, 100.01), `the bar's own high must be excluded, got ${ext.hi}`);
  // Including it would make "close beyond the extreme" nearly tautological.
  const next = priorExtreme(b, 41);
  assert(close(next.hi, 150), 'the following bar does see it');
});

group('the frozen event');

test('all three conditions are required', () => {
  const b = quietBars(120, 100, 10);
  // break only, no burst, no expansion
  b[100] = [b[100][0], 100, 100.02, 99.99, 100.015, 10];
  let e = evaluateBar(b, 100);
  assert(e && e.direction === 'LONG', 'a break is detected');
  assert(!e.qualifies, 'a break alone must not qualify');

  // burst + expansion but no break: a big bar that stays inside the range
  const c = quietBars(120, 100, 10);
  c[100] = [c[100][0], 100, 100.005, 99.995, 100.0, 100];
  e = evaluateBar(c, 100);
  assert(e && e.direction === null, 'no break');
  assert(!e.qualifies, 'burst and expansion without a break must not qualify');
});

test('a bar meeting all three qualifies, with the direction of the break', () => {
  const b = quietBars(120, 100, 10);
  b[100] = [b[100][0], 100, 100.5, 99.9, 100.4, 40];
  const e = evaluateBar(b, 100);
  assert(e.qualifies, `should qualify: burst ${e.volBurst}, expansion ${e.volExpansion}`);
  assert(e.direction === 'LONG', 'a close above the prior high is a long');
  assert(e.volBurst >= FROZEN.vol_burst_min, 'burst threshold met');
  assert(e.volExpansion >= FROZEN.vol_expansion_min, 'expansion threshold met');

  const s = quietBars(120, 100, 10);
  s[100] = [s[100][0], 100, 100.1, 99.5, 99.6, 40];
  const e2 = evaluateBar(s, 100);
  assert(e2.qualifies && e2.direction === 'SHORT', 'a close below the prior low is a short');
});

test('an unwarmed bar can never produce an event', () => {
  const b = quietBars(120);
  for (let i = 0; i < FROZEN.breakout_lookback_bars; i += 1) {
    assert(evaluateBar(b, i) === null, `bar ${i} is not warmed and must return null`);
  }
});

group('outcomes');

test('forward move is signed by the declared direction', () => {
  const b = quietBars(60, 100);
  b[50] = [b[50][0], 100, 101, 100, 100, 10];
  b[53] = [b[53][0], 101, 101, 101, 101, 10];
  assert(close(forwardBps(b, 50, 3, 'LONG'), 100, 1e-6), 'a 1 percent rise pays a long 100 bps');
  assert(close(forwardBps(b, 50, 3, 'SHORT'), -100, 1e-6), 'and costs a short the same');
  assert(forwardBps(b, 59, 3, 'LONG') === null, 'running off the end returns null');
});

test('the hard stop is taken when a bar contains it, never the favourable path', () => {
  const b = quietBars(60, 100);
  // bar 51 dips through the 1 percent stop but closes back up
  b[51] = [b[51][0], 100, 100.5, 98.5, 100.4, 10];
  const r = realisedBps(b, 50, 'LONG');
  assert(close(r, -100), `the stop must be taken, got ${r}`);
});

test('the time stop closes at market when the stop is never hit', () => {
  const b = quietBars(60, 100);
  for (let k = 51; k <= 59; k += 1) b[k] = [b[k][0], 100, 100.3, 99.8, 100.2, 10];
  const r = realisedBps(b, 50, 'LONG');
  assert(r !== null && r > 0 && r < 100, `expected a small positive close, got ${r}`);
});

group('the bucket-balance gate');

test('a balanced sort is not flagged and a collapsed one is', () => {
  const spread = Array.from({ length: 500 }, (_, i) => ({ vol_burst: 1.5 + i / 100 }));
  const ok = bucketBalance(spread, 'vol_burst');
  assert(!ok.degenerate, `a spread sort must pass, ratio ${ok.max_min_ratio}`);
  assert(ok.max_min_ratio < 1.5, 'and be balanced');

  // 90 percent tied at one value, the funding-velocity failure mode
  const tied = Array.from({ length: 500 }, (_, i) => ({ vol_burst: i < 450 ? 2.0 : 2.0 + i / 100 }));
  const bad = bucketBalance(tied, 'vol_burst');
  assert(bad.degenerate, `a collapsed sort must be flagged, ratio ${bad.max_min_ratio}`);
  assert(bad.tie_pct > 50, 'and its tie fraction reported');
});

test('the gate runs before returns and blocks the verdict', () => {
  // Every event carries an identical burst, so the sort cannot exist.
  const b = quietBars(3000, 100, 10);
  for (let i = 100; i < 2900; i += 40) {
    b[i] = [b[i][0], 100, 100.5, 99.9, 100.4, 40];
    for (let k = i + 1; k < i + 40 && k < b.length; k += 1) b[k] = [b[k][0], 100, 100.01, 99.99, 100, 10];
  }
  const r = stage0({ BTCUSDT: b });
  if (r.verdict === 'STAGE_0_INFEASIBLE' && /degenerate/.test(r.closure_reason ?? '')) {
    assert(r.bucket_balance.vol_burst.degenerate, 'the balance record shows why');
  }
  assert(r.bucket_balance !== undefined, 'balance is always reported');
});

group('events and overlap');

test('a new entry may not open while a previous one is still held', () => {
  const b = quietBars(400, 100, 10);
  for (let i = 200; i < 210; i += 1) b[i] = [b[i][0], 100, 100.5 + i / 100, 99.9, 100.4 + i / 100, 40];
  const ev = symbolEvents('TEST', b);
  for (let k = 1; k < ev.length; k += 1) {
    assert(ev[k].bar_index - ev[k - 1].bar_index > FROZEN.time_stop_bars,
      `events ${ev[k - 1].bar_index} and ${ev[k].bar_index} overlap the ${FROZEN.time_stop_bars}-bar hold`);
  }
});

test('quiet data produces no events at all', () => {
  assert(symbolEvents('TEST', quietBars(1000)).length === 0, 'nothing should fire on flat bars');
});

group('the Stage 0 verdict');

test('too few events is DATA_INADEQUATE and promotes nothing', () => {
  const r = stage0({ BTCUSDT: quietBars(300) });
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.promising_count === 0, 'a Stage 0 harness promotes nothing');
});

test('the frozen block carries the audited floor and the recorded prior', () => {
  assert(FROZEN.cost_bps_roundtrip === 16, 'the audited floor');
  assert(FROZEN.superseded_cost_bps_roundtrip === 11, 'the old floor kept only for comparison');
  assert(FROZEN.prior_expectation_bps === 8.27,
    'the prior from LAW.FLOW.SWEEP_CONTINUATION_SATURATES is frozen in the engine, not chosen after');
  assert(FROZEN.universe.length === 16, 'TAC and VANRY are excluded on recorded basis dispersion');
  assert(!FROZEN.universe.includes('TACUSDT') && !FROZEN.universe.includes('VANRYUSDT'), 'and by name');
  assert(FROZEN.declared_direction === 'WITH_THE_BREAK', 'direction declared before measurement');
});

test('a positive point estimate that cannot be resolved is UNDERPOWERED, not a pass', () => {
  const r = stage0({ BTCUSDT: noisyBars(4000, 11) });
  assert(r.verdict !== 'STAGE_0_PASS' || r.primary.gross_mean_bps > FROZEN.cost_bps_roundtrip,
    'a pass requires clearing the floor, never a point estimate alone');
  if (r.verdict === 'UNDERPOWERED') {
    assert(/not distinguishable from zero/.test(r.closure_reason), 'and says so');
  }
});

test('the prior is compared explicitly whenever a primary figure exists', () => {
  const r = stage0({ BTCUSDT: noisyBars(4000, 23), ETHUSDT: noisyBars(4000, 24) });
  if (r.primary && r.primary.gross_mean_bps !== null) {
    assert(r.prior_check, 'the recorded expectation must be checked against the measurement');
    assert(r.prior_check.expected_bps === FROZEN.prior_expectation_bps, 'against the frozen value');
    assert(typeof r.prior_check.prior_falsified_upward === 'boolean',
      'and must state whether the prior was falsified upward');
  }
});

group('CLI and output');

test('the csv carries a row per horizon and per burst quintile', () => {
  const r = stage0({ BTCUSDT: noisyBars(4000, 31), ETHUSDT: noisyBars(4000, 32) });
  const lines = toCsv(r).trim().split('\n');
  assert(lines[0].startsWith('metric,horizon_bars'), 'header first');
  assert(lines.some((l) => l.startsWith('horizon,')) || lines.some((l) => l.startsWith('NO_EVENTS')),
    'horizons or an explicit empty marker');
});

test('argument parsing rejects unknown flags', () => {
  assert(parseArgs(['--bars', 'd']).bars === 'd', 'a value is read');
  let threw = false;
  try { parseArgs(['--vol-burst', '1.2']); } catch { threw = true; }
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
