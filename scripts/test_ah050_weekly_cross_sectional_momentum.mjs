#!/usr/bin/env node
// test_ah050_weekly_cross_sectional_momentum.mjs — deterministic tests for TASK-AH-050.
//
// No network, no clock, no randomness beyond a seeded generator defined here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, median, stdev, assignQuantiles, buildPanel, weekReturn, formationReturn,
  rebalance, costBps, runSeries, seriesStats, quintileProfile, power, stage0, toCsv, parseArgs,
} from './analysis/ah050_weekly_cross_sectional_momentum.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/ah050_weekly_cross_sectional_momentum.mjs');

let passed = 0;
let failed = 0;
let section = '';
const results = [];

function group(name) { section = name; results.push({ kind: 'group', name }); }
function test(name, fn) {
  try { fn(); passed += 1; results.push({ kind: 'ok', name, section }); }
  catch (err) { failed += 1; results.push({ kind: 'fail', name, section, message: err.message }); }
}
function assert(cond, message) { if (!cond) throw new Error(message); }
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------
// A deterministic panel with a planted effect
// ---------------------------------------------------------------------------

/** Seeded LCG so the fixtures are reproducible without touching Math.random. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

/**
 * Build a panel of `nSym` symbols over `nWeeks` weeks. `carry` is the fraction of a symbol's
 * three-week formation return that persists into the following week — the planted momentum.
 * carry = 0 gives a pure noise panel with no cross-sectional effect at all.
 */
function synthPanel({ nSym = 25, nWeeks = 60, carry = 0, noise = 0.05, seed = 7 } = {}) {
  const rnd = lcg(seed);
  const rows = [];
  const price = new Map();
  const hist = new Map();
  for (let i = 0; i < nSym; i += 1) {
    const s = `SYM${String(i).padStart(2, '0')}`;
    price.set(s, 100);
    hist.set(s, []);
    rows.push({ symbol: s, week_index: 0, close: 100 });
  }
  for (let w = 1; w < nWeeks; w += 1) {
    for (const [s, p] of price) {
      const h = hist.get(s);
      const form = h.length >= 3 ? h.slice(-3).reduce((a, b) => a * (1 + b), 1) - 1 : 0;
      const r = carry * form + (rnd() - 0.5) * 2 * noise;
      const next = p * (1 + r);
      price.set(s, next);
      h.push(r);
      rows.push({ symbol: s, week_index: w, close: next });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------

group('quantile assignment');

test('quintiles split a clean cross-section into equal buckets', () => {
  const q = assignQuantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert(q.length === 10, 'one bucket per value');
  const sizes = [0, 0, 0, 0, 0];
  for (const b of q) sizes[b] += 1;
  assert(sizes.every((x) => x === 2), `expected 2 per bucket, got ${sizes}`);
  assert(q[0] === 0 && q[9] === 4, 'lowest value in the bottom bucket, highest in the top');
});

test('a cross-section smaller than the bucket count is refused, not squeezed', () => {
  assert(assignQuantiles([1, 2, 3, 4]) === null,
    'five quintiles over four symbols is not a cross-section and must not manufacture a spread');
  assert(assignQuantiles([1, 2, 3, 4, 5]) !== null, 'exactly five is admissible');
});

test('ties break by incoming order, never by float noise', () => {
  const a = assignQuantiles([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  const b = assignQuantiles([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  assert(JSON.stringify(a) === JSON.stringify(b), 'identical input must give an identical split');
  assert(a[0] === 0 && a[9] === 4, 'a fully tied cross-section still splits by position');
});

test('an uneven cross-section keeps buckets within one of each other', () => {
  const q = assignQuantiles([1, 2, 3, 4, 5, 6, 7]);
  const sizes = [0, 0, 0, 0, 0];
  for (const x of q) sizes[x] += 1;
  assert(Math.max(...sizes) - Math.min(...sizes) <= 1, `unbalanced buckets ${sizes}`);
  assert(sizes.reduce((a, b) => a + b, 0) === 7, 'every symbol is placed');
});

group('the weekly panel');

test('a symbol with a hole is dropped, never interpolated', () => {
  const rows = [
    { symbol: 'A', week_index: 0, close: 1 }, { symbol: 'A', week_index: 1, close: 2 },
    { symbol: 'A', week_index: 2, close: 3 },
    { symbol: 'B', week_index: 0, close: 1 }, { symbol: 'B', week_index: 2, close: 3 },
  ];
  const p = buildPanel(rows);
  assert(p.symbols.length === 1 && p.symbols[0] === 'A', 'only the complete symbol survives');
  assert(p.dropped.length === 1 && p.dropped[0].symbol === 'B', 'the hole is reported, not silently dropped');
  assert(p.weeks.length === 3, 'the week axis still spans the full range');
});

test('non-positive and non-finite closes are refused at the door', () => {
  const rows = [
    { symbol: 'A', week_index: 0, close: 1 }, { symbol: 'A', week_index: 1, close: 0 },
    { symbol: 'B', week_index: 0, close: 1 }, { symbol: 'B', week_index: 1, close: NaN },
  ];
  const p = buildPanel(rows);
  assert(p.symbols.length === 0, 'a zero or NaN close makes the series incomplete');
});

test('an empty panel is empty rather than an exception', () => {
  const p = buildPanel([]);
  assert(p.weeks.length === 0 && p.symbols.length === 0, 'empty in, empty out');
});

group('returns and formation');

test('the formation window and the holding week never overlap', () => {
  const series = [100, 110, 121, 133.1, 146.41];
  const f = formationReturn(series, 3, 3);
  assert(close(f, 0.331, 1e-9), `formation over weeks 1..3 should be 0.331, got ${f}`);
  const fwd = weekReturn(series, 4);
  assert(close(fwd, 0.1, 1e-9), `holding week 4 should be 0.10, got ${fwd}`);
  // The formation ends at position 3 and the holding week is 3 -> 4. If they overlapped, the
  // holding return would already be inside the signal and the whole test would be circular.
  assert(close(series[3] / series[0] - 1, f, 1e-9), 'formation uses closes 0 and 3 only');
});

test('a formation window that runs off the start returns null rather than a short window', () => {
  const series = [100, 110, 121];
  assert(formationReturn(series, 2, 3) === null, 'three weeks of formation are not available at t=2');
  assert(formationReturn(series, 2, 2) !== null, 'two weeks are');
  assert(weekReturn(series, 0) === null, 'there is no return into the first observation');
});

group('the rebalance and its cost');

test('the first rebalance is charged full turnover on both sides', () => {
  const rows = synthPanel({ nSym: 10, nWeeks: 8, carry: 0, seed: 3 });
  const panel = buildPanel(rows);
  const r = rebalance(panel, 3, 3, null, null);
  assert(r !== null, 'a rebalance is available');
  assert(r.turnover_long === 1 && r.turnover_short === 1, 'an empty prior book means everything is new');
  assert(close(costBps(r, 16), 32, 1e-9), `full turnover on both sides costs 32 bps, got ${costBps(r, 16)}`);
});

test('a name that stays in the book is not retraded', () => {
  const rows = synthPanel({ nSym: 10, nWeeks: 8, carry: 0, seed: 3 });
  const panel = buildPanel(rows);
  const r = rebalance(panel, 3, 3, null, null);
  const same = rebalance(panel, 4, 3, new Set(r.long_symbols), new Set(r.short_symbols));
  assert(same.turnover_long <= 1 && same.turnover_long >= 0, 'turnover is a fraction');
  // Charging every rebalance as a full replacement would overstate cost exactly as badly as
  // charging nothing understates it, which is the defect this task exists to avoid.
  const identical = rebalance(panel, 4, 3, new Set(panel.symbols), new Set(panel.symbols));
  assert(identical.turnover_long === 0 && identical.turnover_short === 0,
    'a book already holding every name turns over nothing');
  assert(costBps(identical, 16) === 0, 'and therefore costs nothing');
});

test('every symbol in the cross-section lands in exactly one quintile', () => {
  const rows = synthPanel({ nSym: 23, nWeeks: 10, carry: 0, seed: 11 });
  const panel = buildPanel(rows);
  const r = rebalance(panel, 3, 3, null, null);
  const total = r.quintile_sizes.reduce((a, b) => a + b, 0);
  assert(total === r.n_cross_section, `sizes ${r.quintile_sizes} sum to ${total}, cross-section is ${r.n_cross_section}`);
  const overlap = r.long_symbols.filter((s) => r.short_symbols.includes(s));
  assert(overlap.length === 0, 'the long and short books are disjoint');
});

group('statistics');

test('precision is quoted on gross, so the cost term cannot manufacture a t-statistic', () => {
  // A pure-noise panel: the gross spread is centred near zero, the net spread is a large
  // negative constant plus that noise. A t on the net series would report that 32 bps is not
  // zero. This is the AH-046 defect and it must not recur.
  const rows = synthPanel({ nSym: 25, nWeeks: 120, carry: 0, noise: 0.02, seed: 5 });
  const panel = buildPanel(rows);
  const s = seriesStats(runSeries(panel, 3));
  assert(Math.abs(s.gross_t_stat) < 3, `noise panel should not show a gross t of ${s.gross_t_stat}`);
  const netMean = s.net_mean_bps;
  const netSd = stdev(runSeries(panel, 3).map((r) => r.gross_bps - costBps(r, 16)));
  const netT = netMean / (netSd / Math.sqrt(s.n));
  assert(Math.abs(netT) > Math.abs(s.gross_t_stat),
    'the net t is inflated by the constant cost, which is exactly why gross is reported');
});

test('net is gross minus measured cost, with no rounding of the cost away', () => {
  const rows = synthPanel({ nSym: 15, nWeeks: 40, carry: 0, seed: 9 });
  const series = runSeries(buildPanel(rows), 3);
  const s = seriesStats(series, 16);
  assert(close(s.net_mean_bps, s.gross_mean_bps - s.mean_cost_bps, 1e-9),
    'net mean must equal gross mean minus mean cost');
  const d = seriesStats(series, 32);
  assert(close(d.mean_cost_bps, 2 * s.mean_cost_bps, 1e-9), 'double the per-side rate doubles the cost');
  assert(d.net_mean_bps < s.net_mean_bps, 'the stress case is strictly worse');
});

test('a monotone quintile profile is recognised and a spiky one is not', () => {
  const monotone = [{ quintile_means: [-0.03, -0.01, 0.00, 0.01, 0.03] }];
  assert(quintileProfile(monotone).monotone, 'an ordered profile is monotone');
  const spiky = [{ quintile_means: [-0.03, 0.02, -0.01, 0.00, 0.03] }];
  assert(!quintileProfile(spiky).monotone,
    'a spread carried by the two extreme buckets alone is not a cross-sectional ordering');
  assert(quintileProfile([]).monotone === false, 'no rebalances is not monotone');
});

test('detectable effect size is reported and scales as 1/sqrt(n)', () => {
  const few = power([{ gross_bps: 10 }, { gross_bps: -10 }, { gross_bps: 20 }, { gross_bps: -20 }]);
  assert(few.detectable_bps > 0, 'a detectable size is quoted');
  const many = power(Array.from({ length: 400 }, (_, i) => ({ gross_bps: i % 2 ? 10 : -10 })));
  assert(many.detectable_bps < few.detectable_bps, 'more observations detect a smaller effect');
  assert(power([]).detectable_bps === null, 'no series, no claim');
});

group('the Stage 0 verdict');

test('too few weeks or symbols is DATA_INADEQUATE, not a spread', () => {
  const r = stage0([
    { symbol: 'A', week_index: 0, close: 1 }, { symbol: 'A', week_index: 1, close: 2 },
  ]);
  assert(r.verdict === 'DATA_INADEQUATE', `expected DATA_INADEQUATE, got ${r.verdict}`);
  assert(r.promising_count === 0, 'a Stage 0 harness never promotes anything');
  assert(r.closure_reason, 'the reason is stated');
});

test('an adequate span with too few sealed weeks closes as INFEASIBLE', () => {
  const rows = synthPanel({ nSym: 20, nWeeks: 30, carry: 0, seed: 4 });
  const r = stage0(rows);
  assert(r.verdict === 'STAGE_0_INFEASIBLE', `expected INFEASIBLE, got ${r.verdict}`);
  assert(/sealed weeks/.test(r.closure_reason), `reason should name the sealed shortfall: ${r.closure_reason}`);
  assert(r.sealed_segments_untouched === true, 'the sealed segment is declared untouched');
});

test('a pure-noise panel never passes, whichever way its point estimate happens to fall', () => {
  // Several seeds, because the point of this test is that the verdict must not depend on
  // which side of zero the noise landed. Seed 13 in particular produces a +23 bps gross mean
  // at t = 1.5 — a lucky positive that an earlier cut of the gate passed silently.
  for (const seed of [5, 13, 21, 33, 47]) {
    const r = stage0(synthPanel({ nSym: 30, nWeeks: 220, carry: 0, noise: 0.05, seed }));
    assert(r.verdict !== 'STAGE_0_PASS',
      `noise panel seed ${seed} passed with gross ${r.train.gross_mean_bps?.toFixed(1)} bps at t=${r.train.gross_t_stat?.toFixed(2)}`);
    assert(r.power.detectable_bps !== null, 'the detectable effect size is always reported');
  }
});

test('a positive point estimate that is not distinguishable from zero is UNDERPOWERED', () => {
  const r = stage0(synthPanel({ nSym: 30, nWeeks: 220, carry: 0, noise: 0.05, seed: 13 }));
  assert(r.train.gross_mean_bps > 0, 'this fixture is chosen precisely because the noise came out positive');
  assert(Math.abs(r.train.gross_t_stat) < FROZEN.power_target_t, 'and because it is under the declared t');
  assert(r.verdict === 'UNDERPOWERED', `expected UNDERPOWERED, got ${r.verdict}`);
  assert(/absence of evidence/.test(r.closure_reason), 'an underpowered null must say so');
  assert(/positive point estimate/.test(r.closure_reason),
    'and must state explicitly that a positive point estimate at this precision is not a finding');
});

test('a planted momentum effect large enough to pay its turnover passes', () => {
  const rows = synthPanel({ nSym: 30, nWeeks: 220, carry: 0.35, noise: 0.05, seed: 13 });
  const r = stage0(rows);
  assert(r.train.gross_mean_bps > 0, `planted carry should give a positive gross, got ${r.train.gross_mean_bps}`);
  assert(r.train.net_mean_bps > 0, `and it should survive measured turnover, got ${r.train.net_mean_bps}`);
  assert(r.verdict === 'STAGE_0_PASS', `expected PASS, got ${r.verdict}: ${r.closure_reason}`);
});

test('a planted effect too weak to be resolved does not pass on its point estimate alone', () => {
  const rows = synthPanel({ nSym: 30, nWeeks: 220, carry: 0.02, noise: 0.05, seed: 13 });
  const r = stage0(rows);
  assert(r.verdict !== 'STAGE_0_PASS', 'a signal that cannot be resolved must not pass');
  assert(r.train.mean_cost_bps > 0, 'the measured cost is quoted whatever the verdict');
  assert(r.train.net_mean_bps > 0 && r.verdict === 'UNDERPOWERED',
    'net is positive here, so the only thing standing between it and a PASS is precision');
});

test('neighbours are reported for all three lengths and never substituted for the primary', () => {
  const rows = synthPanel({ nSym: 25, nWeeks: 200, carry: 0.2, seed: 17 });
  const r = stage0(rows);
  assert(r.neighbours.length === 3, 'one entry per declared neighbour');
  assert(JSON.stringify(r.neighbours.map((n) => n.formation_weeks)) === JSON.stringify([1, 2, 4]),
    'the neighbour set is exactly the frozen one');
  assert(r.frozen.formation_weeks === 3, 'the primary horizon stays three weeks whatever the neighbours do');
});

test('the frozen block records the corrected cost floor and the superseded one', () => {
  assert(FROZEN.cost_bps_per_side === 16, 'the audited floor is 16 bps per side');
  assert(FROZEN.double_cost_bps_per_side === 32, 'the stress case doubles it');
  assert(FROZEN.superseded_cost_bps_per_side === 11,
    'the old fee-only floor is retained only for comparison against the historical record');
  assert(FROZEN.overlap === 'NONE', 'overlapping windows inflate n and t and are forbidden');
  assert(FROZEN.weighting === 'EQUAL', 'the value-weighting deviation is declared in the frozen block');
});

test('a passing run reports all three cost regimes so the comparison is auditable', () => {
  const rows = synthPanel({ nSym: 30, nWeeks: 220, carry: 0.35, seed: 13 });
  const r = stage0(rows);
  assert(r.train_at_superseded_floor.net_mean_bps > r.train.net_mean_bps,
    'the superseded 11 bps floor is more permissive, and that must be visible');
  assert(r.train_double_cost.net_mean_bps < r.train.net_mean_bps, 'the stress case is stricter');
});

group('CLI and output');

test('the csv carries a row per cost regime and per neighbour', () => {
  const rows = synthPanel({ nSym: 25, nWeeks: 200, carry: 0.2, seed: 17 });
  const csv = toCsv(stage0(rows));
  const lines = csv.trim().split('\n');
  assert(lines[0].startsWith('metric,formation_weeks'), 'header first');
  assert(lines.length === 7, `expected header + 3 regimes + 3 neighbours, got ${lines.length}`);
  assert(csv.includes('train_double_cost') && csv.includes('train_at_superseded_floor'), 'both stress rows present');
});

test('an empty result still produces a well-formed csv', () => {
  const csv = toCsv({ neighbours: [] });
  assert(csv.includes('NO_REBALANCES'), 'the empty case is explicit rather than a bare header');
});

test('argument parsing rejects unknown flags and missing values', () => {
  assert(parseArgs(['--panel', 'p.json']).panel === 'p.json', 'a value is read');
  let threw = false;
  try { parseArgs(['--panel']); } catch { threw = true; }
  assert(threw, 'a flag without a value is an error');
  threw = false;
  try { parseArgs(['--search', 'x']); } catch { threw = true; }
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
  for (const token of banned) {
    assert(!body.includes(token), `banned token present in engine: ${token}`);
  }
});

test('the engine reads no clock and draws no randomness', () => {
  for (const token of ['Date.now', 'new Date', 'Math.random', 'performance.now']) {
    assert(!src.includes(token), `non-deterministic call in engine: ${token}`);
  }
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
    const ok = n.filter((x) => x.kind === 'ok').length;
    process.stdout.write(`## ${r.name}  (${ok}/${n.length})\n`);
    current = r.name;
    continue;
  }
  if (r.section !== current) continue;
  if (r.kind === 'ok') process.stdout.write(`  ok   ${r.name}\n`);
  else process.stdout.write(`  FAIL ${r.name}\n       ${r.message}\n`);
}
process.stdout.write(`\ntotal ${passed + failed}, passed ${passed}, failed ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
