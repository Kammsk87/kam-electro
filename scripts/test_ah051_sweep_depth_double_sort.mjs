#!/usr/bin/env node
// test_ah051_sweep_depth_double_sort.mjs — deterministic tests for TASK-AH-051.
//
// No network, no clock, no randomness beyond a seeded generator defined here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, median, stdev, bucketByRank, consumedDepthResponse, continuationBps,
  trainBoundary, trainThresholds, isEvent, doubleSort, conditionerMonotone, stage0, withinSymbolRank,
  toCsv, parseArgs, missingFields,
} from './analysis/ah051_sweep_depth_double_sort.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/ah051_sweep_depth_double_sort.mjs');

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

/**
 * Synthetic events. `slope` is how many bps of continuation are added per unit of NEGATIVE
 * conditioner, and `sizeSlope` how many per unit of log notional — so a positive pair plants
 * exactly the relation the task is looking for.
 */
function synthEvents({ n = 4000, slope = 0, sizeSlope = 0, base = 0, noise = 20, seed = 5 } = {}) {
  const rnd = lcg(seed);
  const syms = ['AAA', 'BBB', 'CCC', 'DDD'];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const sym = syms[i % syms.length];
    const buy = rnd() > 0.5;
    const notional = 100 * Math.exp(4 * rnd());
    const prev = 1000 + 1000 * rnd();
    const resp = (rnd() - 0.5) * 2;               // conditioner in [-1, 1]
    const next = prev * (1 + resp);
    const signal = base + slope * -resp + sizeSlope * Math.log(notional / 100);
    const move = signal + (rnd() - 0.5) * 2 * noise;
    const m0 = 100;
    const m = (bps) => m0 * (1 + (buy ? bps : -bps) / 1e4);
    out.push({
      symbol: sym, ts: 1_700_000_000_000 + i * 60_000, side: buy ? 'BUY' : 'SELL',
      notional, mid_completion: m0,
      mid_60s: m(move), mid_300s: m(move * 0.9), mid_900s: m(move * 1.1),
      bid_depth_prev: buy ? 1000 : prev, bid_depth_next: buy ? 1000 : next,
      ask_depth_prev: buy ? prev : 1000, ask_depth_next: buy ? next : 1000,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

group('bucketing');

test('rank buckets are balanced and deterministic under ties', () => {
  const b = bucketByRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
  const sizes = [0, 0, 0, 0, 0];
  for (const x of b) sizes[x] += 1;
  assert(sizes.every((s) => s === 2), `expected 2 per bucket, got ${sizes}`);
  const t1 = bucketByRank([7, 7, 7, 7, 7, 7], 3);
  const t2 = bucketByRank([7, 7, 7, 7, 7, 7], 3);
  assert(JSON.stringify(t1) === JSON.stringify(t2), 'ties must split identically every time');
});

test('fewer values than buckets is refused rather than squeezed', () => {
  assert(bucketByRank([1, 2, 3], 5) === null, 'five buckets over three values is not a sort');
  assert(bucketByRank([1, 2, 3, 4, 5], 5) !== null, 'exactly five is admissible');
});

group('the conditioner');

test('the consumed side is the ask for a buy and the bid for a sell', () => {
  const buy = { side: 'BUY', ask_depth_prev: 100, ask_depth_next: 50, bid_depth_prev: 100, bid_depth_next: 200 };
  assert(close(consumedDepthResponse(buy), -0.5), 'a buy reads the ask side, which halved');
  const sell = { side: 'SELL', ask_depth_prev: 100, ask_depth_next: 50, bid_depth_prev: 100, bid_depth_next: 200 };
  assert(close(consumedDepthResponse(sell), 1.0), 'a sell reads the bid side, which doubled');
});

test('an undefined ratio drops the event instead of sorting as an extreme', () => {
  assert(consumedDepthResponse({ side: 'BUY', ask_depth_prev: 0, ask_depth_next: 5 }) === null,
    'a zero prior depth has no ratio; Infinity would sort as the strongest withdrawal');
  assert(consumedDepthResponse({ side: 'BUY', ask_depth_prev: NaN, ask_depth_next: 5 }) === null, 'NaN drops');
  assert(consumedDepthResponse({ side: 'BUY', ask_depth_prev: 10 }) === null, 'a missing next depth drops');
});

group('the declared direction');

test('continuation follows the sweep side, so a rising mid pays a buy sweep', () => {
  const buy = { side: 'BUY', mid_completion: 100, mid_60s: 101, mid_300s: 100, mid_900s: 99 };
  assert(close(continuationBps(buy, 60_000), 100, 1e-6), 'a 1 percent rise after a buy sweep is +100 bps');
  assert(close(continuationBps(buy, 900_000), -100, 1e-6), 'and a 1 percent fall is -100 bps');
  const sell = { side: 'SELL', mid_completion: 100, mid_60s: 99, mid_300s: 100, mid_900s: 101 };
  assert(close(continuationBps(sell, 60_000), 100, 1e-6), 'a fall after a sell sweep pays the short');
  assert(close(continuationBps(sell, 900_000), -100, 1e-6), 'and a rise costs it');
});

test('the direction is the mirror of the one AH-048 declared, and is frozen as such', () => {
  assert(FROZEN.declared_direction === 'CONTINUATION',
    'AH-048 declared FADE and measured the mirror; this task declares the mirror explicitly');
  assert(FROZEN.cost_bps_roundtrip === 16, 'the audited floor, not the superseded 11');
  assert(FROZEN.superseded_cost_bps_roundtrip === 11, 'the old floor is kept only for comparison');
  assert(FROZEN.event_percentile === 0.90, 'the top decile, wider than AH-048, so the first sort has range');
});

group('event selection');

test('the notional threshold is fitted on train only and per symbol', () => {
  const rows = synthEvents({ n: 800, seed: 3 });
  const b = trainBoundary(rows);
  const th = trainThresholds(rows, b);
  assert(th.size === 4, 'one threshold per symbol');
  // A symbol seen only after the boundary must not inherit another symbol's threshold.
  const withLate = [...rows, { symbol: 'LATE', ts: b + 10_000, notional: 1e9 }];
  const th2 = trainThresholds(withLate, b);
  assert(!th2.has('LATE'), 'a symbol with no train history gets no threshold');
  assert(isEvent({ symbol: 'LATE', notional: 1e9 }, th2) === false,
    'and is therefore excluded rather than admitted on a borrowed threshold');
});

test('the declared percentile actually selects roughly a decile', () => {
  const rows = synthEvents({ n: 4000, seed: 11 });
  const b = trainBoundary(rows);
  const th = trainThresholds(rows, b);
  const train = rows.filter((e) => e.ts < b);
  const selected = train.filter((e) => isEvent(e, th));
  const share = selected.length / train.length;
  assert(share > 0.05 && share < 0.16, `expected roughly a decile, got ${(100 * share).toFixed(1)}%`);
});

group('per-symbol ranking');

test('rank is computed within each symbol, not across the pool', () => {
  const rows = [
    { symbol: 'BIG', notional: 1e6 }, { symbol: 'BIG', notional: 2e6 }, { symbol: 'BIG', notional: 3e6 },
    { symbol: 'SML', notional: 1 }, { symbol: 'SML', notional: 2 }, { symbol: 'SML', notional: 3 },
  ];
  const r = withinSymbolRank(rows, (x) => x.notional);
  assert(close(r[0], 0) && close(r[2], 2 / 3), 'BIG ranks 0, 1/3, 2/3 within itself');
  assert(close(r[3], 0) && close(r[5], 2 / 3), 'SML ranks identically despite being a million times smaller');
  assert(r[2] === r[5], 'the largest of each symbol carries the same rank');
});

test('a non-finite value is left unranked rather than ranked as an extreme', () => {
  const rows = [{ symbol: 'A', v: 1 }, { symbol: 'A', v: NaN }, { symbol: 'A', v: 3 }];
  const r = withinSymbolRank(rows, (x) => x.v);
  assert(r[1] === null, 'NaN gets no rank');
  assert(r[0] !== null && r[2] !== null, 'the finite values still rank');
});

test('a pooled sort would rank symbols; the per-symbol sort ranks events', () => {
  // Two symbols on completely disjoint notional scales, with the effect tied to each
  // symbol's OWN large sweeps. A pooled first sort puts every SML event in the bottom
  // bucket and every BIG event in the top, so it recovers the symbol, not the relation.
  const rows = [];
  for (let i = 0; i < 3000; i += 1) {
    for (const [sym, scale] of [['BIG', 1e6], ['SML', 1]]) {
      const q = i / 3000;
      const bps = 40 * q; // large-for-its-symbol sweeps continue further
      rows.push({
        symbol: sym, ts: 1_700_000_000_000 + i * 1000, side: 'BUY',
        notional: scale * (1 + q), mid_completion: 100,
        mid_60s: 100 * (1 + bps / 1e4), mid_300s: 100, mid_900s: 100,
        bid_depth_prev: 100, bid_depth_next: 100,
        ask_depth_prev: 100, ask_depth_next: 100 * (1 + (i % 7) / 10),
      });
    }
  }
  const g = doubleSort(rows, 60_000);
  const rowMeans = g.notional_row_totals.map((c) => c.gross_bps);
  for (let i = 1; i < rowMeans.length; i += 1) {
    assert(rowMeans[i] > rowMeans[i - 1],
      `the notional axis must rise with within-symbol size, got ${rowMeans.map((x) => x.toFixed(1))}`);
  }
  const top = g.grid[FROZEN.notional_buckets - 1];
  const syms = new Set();
  for (const c of top) if (c.symbols) syms.add(c.symbols);
  assert(g.grid[0].every((c) => c.symbols === 2) && top.every((c) => c.symbols === 2),
    'both symbols must appear in the bottom and top notional buckets, not one each');
});

group('the double sort');

test('the second sort runs within each notional bucket, not globally', () => {
  // Plant a conditioner effect ONLY in the largest notional bucket. A global second sort would
  // dilute it across sizes; a within-bucket sort must recover it in the top row.
  const rows = synthEvents({ n: 6000, slope: 60, sizeSlope: 0, noise: 10, seed: 7 });
  const g = doubleSort(rows, 60_000);
  assert(g !== null, 'a grid is produced');
  assert(g.grid.length === FROZEN.notional_buckets, 'five notional rows');
  assert(g.grid[0].length === FROZEN.conditioner_buckets, 'five conditioner columns');
  for (const row of g.grid) {
    const counts = row.map((c) => c.n);
    assert(Math.max(...counts) - Math.min(...counts) <= 2,
      `conditioner buckets within a notional row must be balanced, got ${counts}`);
  }
});

test('every usable event lands in exactly one cell', () => {
  const rows = synthEvents({ n: 3000, seed: 19 });
  const g = doubleSort(rows, 60_000);
  const total = g.grid.flat().reduce((a, c) => a + c.n, 0);
  assert(total === g.n_usable, `grid holds ${total} of ${g.n_usable} usable events`);
});

test('a cell below the reporting minimum is computed but flagged unreportable', () => {
  const rows = synthEvents({ n: 200, seed: 23 });
  const g = doubleSort(rows, 60_000);
  const small = g.grid.flat().filter((c) => c.n > 0 && c.n < FROZEN.min_events_per_cell);
  for (const c of small) assert(c.reportable === false, 'a thin cell must never be reportable');
  const big = g.grid.flat().filter((c) => c.n >= FROZEN.min_events_per_cell);
  for (const c of big) assert(c.reportable === true, 'a cell at or above the minimum is reportable');
});

test('a planted conditioner relation is recovered in the right direction', () => {
  const rows = synthEvents({ n: 8000, slope: 80, noise: 10, seed: 31 });
  const g = doubleSort(rows, 60_000);
  const top = g.grid[FROZEN.notional_buckets - 1];
  assert(top[0].gross_bps > top[FROZEN.conditioner_buckets - 1].gross_bps,
    'strongest withdrawal must beat strongest replenishment when the relation is planted');
  assert(conditionerMonotone(top).monotone, `planted relation should order the row: ${JSON.stringify(top.map((c) => c.gross_bps?.toFixed(1)))}`);
});

group('monotonicity');

test('a non-increasing row is monotone and a bumpy one is not', () => {
  const row = (vals) => vals.map((v) => ({ gross_bps: v, reportable: true }));
  assert(conditionerMonotone(row([30, 20, 10, 5, 0])).monotone, 'ordered rows pass');
  const bumpy = conditionerMonotone(row([30, 20, 25, 5, 0]));
  assert(!bumpy.monotone, 'a bump breaks the ordering');
  assert(/bucket 2 exceeds bucket 1/.test(bumpy.reason), `the break must be located: ${bumpy.reason}`);
});

test('unreportable cells are skipped rather than counted as agreement', () => {
  const mixed = [
    { gross_bps: 30, reportable: true }, { gross_bps: 999, reportable: false },
    { gross_bps: 20, reportable: true }, { gross_bps: 10, reportable: true },
  ];
  const m = conditionerMonotone(mixed);
  assert(m.monotone, 'the thin cell must not break an otherwise ordered row');
  assert(m.checked === 3, `only reportable cells are checked, got ${m.checked}`);
  const tooFew = conditionerMonotone([{ gross_bps: 5, reportable: true }, { gross_bps: 4, reportable: true }]);
  assert(!tooFew.monotone, 'two cells are not enough to claim an ordering');
});

group('the Stage 0 verdict');

test('missing fields are DATA_INADEQUATE and name what is missing', () => {
  const r = stage0([{ symbol: 'A', ts: 1, side: 'BUY', notional: 1 }]);
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.missing_fields.includes('ask_depth_prev'), 'the depth fields are named');
  assert(r.promising_count === 0, 'a Stage 0 harness promotes nothing');
});

test('a pure-noise event set never passes, whichever way the extreme cell falls', () => {
  for (const seed of [2, 8, 14, 29, 44]) {
    const r = stage0(synthEvents({ n: 6000, slope: 0, base: 0, noise: 30, seed }));
    assert(r.verdict !== 'STAGE_0_PASS',
      `noise seed ${seed} passed with extreme cell ${r.extreme_cell?.gross_bps?.toFixed(2)} bps`);
  }
});

test('an effect below the floor closes on the measured shortfall, not on significance', () => {
  const r = stage0(synthEvents({ n: 20000, slope: 4, base: 6, noise: 8, seed: 51 }));
  assert(r.verdict === 'STAGE_0_INFEASIBLE' || r.verdict === 'UNDERPOWERED', `got ${r.verdict}`);
  if (r.verdict === 'STAGE_0_INFEASIBLE') {
    assert(/shortfall of/.test(r.closure_reason), `the gap must be quoted: ${r.closure_reason}`);
  }
});

test('an effect that clears the floor but does not order the row is refused', () => {
  // The conditioner carries nothing while the level is high: the extreme cell clears 16 bps
  // on the level alone, and the row is flat rather than ordered.
  const r = stage0(synthEvents({ n: 20000, slope: 0, base: 60, noise: 15, seed: 61 }));
  assert(r.verdict !== 'STAGE_0_PASS',
    'a level that clears the floor without a conditioner relation is not what this task tests');
  assert(/does not order|not distinguishable/.test(r.closure_reason ?? ''),
    `the refusal must name the reason: ${r.closure_reason}`);
});

test('a planted, ordered, floor-clearing relation passes', () => {
  const r = stage0(synthEvents({ n: 20000, slope: 90, base: 30, noise: 10, seed: 71 }));
  assert(r.extreme_cell.reportable, 'the extreme cell is reportable');
  assert(r.conditioner_monotone_in_top_row.monotone, 'the row is ordered');
  assert(r.extreme_cell.net_bps > 0, 'and it clears the floor');
  assert(r.verdict === 'STAGE_0_PASS', `expected PASS, got ${r.verdict}: ${r.closure_reason}`);
});

test('the sealed segment is declared untouched and counted', () => {
  const r = stage0(synthEvents({ n: 6000, seed: 83 }));
  assert(r.sealed_segments_untouched === true, 'declared');
  assert(r.sealed_events_available > 0, 'and counted, so a successor knows what it has');
  assert(r.train_events > 0 && r.train_events < r.total_events, 'train is a strict subset');
});

test('all three horizons are computed and the primary is 60s', () => {
  const r = stage0(synthEvents({ n: 6000, slope: 40, seed: 97 }));
  assert(r.horizons.length === 3, 'one grid per declared horizon');
  assert(FROZEN.primary_horizon_ms === 60_000, 'the primary is the horizon AH-048 resolved best');
  assert(r.horizons.every((h) => h && h.grid.length === FROZEN.notional_buckets), 'each is a full grid');
});

group('CLI and output');

test('the csv emits one row per cell per horizon', () => {
  const r = stage0(synthEvents({ n: 6000, slope: 40, seed: 101 }));
  const lines = toCsv(r).trim().split('\n');
  const expected = 1 + 3 * FROZEN.notional_buckets * FROZEN.conditioner_buckets;
  assert(lines.length === expected, `expected ${expected} lines, got ${lines.length}`);
  assert(lines[0].startsWith('horizon_s,notional_bucket,conditioner_bucket'), 'header names both sorts');
});

test('an empty result still produces a well-formed csv', () => {
  assert(toCsv({ horizons: [] }).includes('NO_GRID'), 'the empty case is explicit');
});

test('argument parsing rejects unknown flags', () => {
  assert(parseArgs(['--events', 'e.json']).events === 'e.json', 'a value is read');
  let threw = false;
  try { parseArgs(['--percentile', '0.95']); } catch { threw = true; }
  assert(threw, 'an undeclared flag is an error, because parameter search is out of scope');
});

group('static scan');

const src = readFileSync(ENGINE, 'utf8');

test('every import is on the allowlist: no network, process, or os-exec module', () => {
  const allowed = new Set(['node:fs', 'node:path', 'node:url']);
  const re = /\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
  let m;
  const seen = [];
  while ((m = re.exec(src))) seen.push(m[1]);
  assert(seen.length > 0, 'the scan must actually find the imports it claims to check');
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
  for (const token of banned) assert(!body.includes(token), `banned token present in engine: ${token}`);
});

test('the engine draws no randomness and reads no clock beyond date formatting', () => {
  for (const token of ['Date.now', 'Math.random', 'performance.now']) {
    assert(!src.includes(token), `non-deterministic call in engine: ${token}`);
  }
  // new Date(ts) is permitted: it formats a supplied timestamp and never reads the wall clock.
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
