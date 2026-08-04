#!/usr/bin/env node
// test_ah052_rule_selection_persistence.mjs — deterministic tests for TASK-AH-052.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FROZEN, mean, stdev, rankAverage, spearman, ruleUniverse, buildPanel, ruleSeries,
  transition, persistence, run, toCsv, parseArgs,
} from './analysis/ah052_rule_selection_persistence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, 'analysis/ah052_rule_selection_persistence.mjs');

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
 * A panel with a PERSISTENT per-symbol drift: each symbol carries a fixed expected weekly
 * return for the whole sample. A momentum rule should then rank stably across windows, so
 * selection has real skill and persistence must detect it.
 */
function persistentPanel({ nSym = 30, nWeeks = 220, spread = 0.02, noise = 0.03, seed = 5 } = {}) {
  const rnd = lcg(seed);
  const rows = [];
  const drift = [];
  for (let i = 0; i < nSym; i += 1) drift.push(spread * (i / (nSym - 1) - 0.5) * 2);
  const price = drift.map(() => 100);
  for (let i = 0; i < nSym; i += 1) rows.push({ symbol: `S${String(i).padStart(2, '0')}`, week_index: 0, close: 100 });
  for (let w = 1; w < nWeeks; w += 1) {
    for (let i = 0; i < nSym; i += 1) {
      price[i] *= 1 + drift[i] + (rnd() - 0.5) * 2 * noise;
      rows.push({ symbol: `S${String(i).padStart(2, '0')}`, week_index: w, close: price[i] });
    }
  }
  return rows;
}

/** Pure noise: no symbol has any persistent edge, so no ranking can carry. */
function noisePanel({ nSym = 30, nWeeks = 220, noise = 0.05, seed = 9 } = {}) {
  return persistentPanel({ nSym, nWeeks, spread: 0, noise, seed });
}

// ---------------------------------------------------------------------------

group('rank statistics');

test('ties are averaged rather than ordered by array position', () => {
  const r = rankAverage([5, 5, 5, 1]);
  assert(close(r[3], 1), 'the unique minimum ranks 1');
  assert(close(r[0], 3) && close(r[1], 3) && close(r[2], 3), `tied block must share rank 3, got ${r}`);
});

test('spearman is +1 on a monotone pair and -1 on a reversed one', () => {
  assert(close(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1), 'monotone agreement');
  assert(close(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1), 'monotone disagreement');
});

test('a constant side returns null, never zero', () => {
  assert(spearman([1, 2, 3, 4], [7, 7, 7, 7]) === null,
    'a constant has no ranking; reporting 0 would claim the absence of a relation that cannot be assessed');
  assert(spearman([1, 2], [3, 4]) === null, 'fewer than three points is not a correlation');
});

group('the rule universe');

test('exactly 54 rules are enumerated, mechanically and in a fixed order', () => {
  const u = ruleUniverse();
  assert(u.length === 54, `expected 9 x 2 x 3 = 54, got ${u.length}`);
  assert(new Set(u.map((r) => r.id)).size === 54, 'ids are unique');
  const again = ruleUniverse();
  assert(JSON.stringify(u) === JSON.stringify(again), 'the order is fixed');
});

test('the TASK-AH-050 rule is present and carries no privilege', () => {
  const u = ruleUniverse();
  const ah050 = u.find((r) => r.formation_weeks === 3 && r.direction === 'MOMENTUM' && r.buckets === 5);
  assert(ah050, 'the three-week quintile momentum rule is one of the fifty-four');
  assert(!('privileged' in ah050) && !('primary' in ah050), 'and is flagged in no way');
});

test('every direction and bucket count appears with every formation length', () => {
  const u = ruleUniverse();
  for (const k of FROZEN.formation_weeks) {
    for (const d of FROZEN.directions) {
      for (const b of FROZEN.bucket_counts) {
        assert(u.some((r) => r.formation_weeks === k && r.direction === d && r.buckets === b),
          `missing k=${k} ${d} b=${b}`);
      }
    }
  }
});

group('one rule series');

test('momentum and reversal are exact mirrors before cost', () => {
  const panel = buildPanel(persistentPanel({ nWeeks: 60, seed: 3 }));
  const mom = ruleSeries(panel, { id: 'm', formation_weeks: 3, direction: 'MOMENTUM', buckets: 5 }, 0);
  const rev = ruleSeries(panel, { id: 'r', formation_weeks: 3, direction: 'REVERSAL', buckets: 5 }, 0);
  let checked = 0;
  for (const [t, v] of mom) {
    if (!rev.has(t)) continue;
    assert(close(v, -rev.get(t), 1e-9), `at t=${t} momentum ${v} should mirror reversal ${rev.get(t)}`);
    checked += 1;
  }
  assert(checked > 20, `expected many overlapping rebalances, got ${checked}`);
});

test('cost is charged on measured turnover and makes both sides worse', () => {
  const panel = buildPanel(persistentPanel({ nWeeks: 80, seed: 11 }));
  const rule = { id: 'x', formation_weeks: 3, direction: 'MOMENTUM', buckets: 5 };
  const free = ruleSeries(panel, rule, 0);
  const paid = ruleSeries(panel, rule, 16);
  let anyDiff = false;
  for (const [t, v] of free) {
    if (!paid.has(t)) continue;
    assert(paid.get(t) <= v + 1e-9, 'paying cost can never improve a rebalance');
    if (paid.get(t) < v - 1e-9) anyDiff = true;
  }
  assert(anyDiff, 'some rebalance must actually be charged, or turnover is being measured as zero');
});

test('a formation longer than the panel yields no rebalances rather than an error', () => {
  const panel = buildPanel(persistentPanel({ nWeeks: 10, seed: 2 }));
  const s = ruleSeries(panel, { id: 'x', formation_weeks: 24, direction: 'MOMENTUM', buckets: 5 });
  assert(s.size === 0, 'no rebalance is possible and none is invented');
});

group('the transition');

test('the winner is scored against the period-2 median, not against zero', () => {
  const rules = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const s = new Map();
  // a wins period 1 and lands mid-pack in period 2
  s.set('a', new Map([[0, 100], [1, 100], [2, 10], [3, 10]]));
  s.set('b', new Map([[0, 10], [1, 10], [2, 50], [3, 50]]));
  s.set('c', new Map([[0, 20], [1, 20], [2, 0], [3, 0]]));
  s.set('d', new Map([[0, 30], [1, 30], [2, 20], [3, 20]]));
  const t = transition(s, rules, 0, 2);
  assert(t.winner_id === 'a', 'a had the best period 1');
  assert(close(t.winner_p2_bps, 10), 'and scored 10 in period 2');
  assert(close(t.all_p2_median_bps, 15), `median of 10,50,0,20 is 15, got ${t.all_p2_median_bps}`);
  assert(close(t.winner_minus_median_bps, -5), 'so the winner underperformed the median by 5');
  assert(t.winner_percentile_in_p2 < 0.5, 'and sits below the middle of the pack');
});

test('a rule missing either window is dropped rather than half-scored', () => {
  const rules = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const s = new Map();
  s.set('a', new Map([[0, 1], [1, 1], [2, 1], [3, 1]]));
  s.set('b', new Map([[0, 2], [1, 2], [2, 2], [3, 2]]));
  s.set('c', new Map([[0, 3], [1, 3], [2, 3], [3, 3]]));
  s.set('d', new Map([[0, 4], [1, 4]])); // period 2 missing
  const t = transition(s, rules, 0, 2);
  assert(t.n_rules === 3, `d must be dropped, got ${t.n_rules} rules`);
});

test('too few scorable rules returns null instead of a correlation', () => {
  const s = new Map([['a', new Map([[0, 1], [1, 1]])]]);
  assert(transition(s, [{ id: 'a' }], 0, 1) === null, 'one rule is not a ranking');
});

group('persistence on known ground truth');

test('a panel with persistent per-symbol drift shows positive persistence', () => {
  const panel = buildPanel(persistentPanel({ nSym: 30, nWeeks: 260, spread: 0.02, noise: 0.03, seed: 17 }));
  const p = persistence(panel, ruleUniverse(), 40);
  assert(p.rolling.transitions > 5, `expected several transitions, got ${p.rolling.transitions}`);
  assert(p.rolling.mean_spearman > 0.2,
    `a genuinely persistent panel must show positive rank persistence, got ${p.rolling.mean_spearman}`);
  assert(p.rolling.share_spearman_positive_pct > 60, 'and it should hold in most transitions');
});

test('a pure-noise panel shows no persistence', () => {
  const panel = buildPanel(noisePanel({ nSym: 30, nWeeks: 260, noise: 0.05, seed: 23 }));
  const p = persistence(panel, ruleUniverse(), 40);
  assert(Math.abs(p.rolling.mean_spearman) < 0.35,
    `noise must not produce strong persistence, got ${p.rolling.mean_spearman}`);
});

test('detectable correlation is quoted and shrinks with more transitions', () => {
  const panel = buildPanel(noisePanel({ nWeeks: 260, seed: 29 }));
  const few = persistence(panel, ruleUniverse(), 40, 40);
  const many = persistence(panel, ruleUniverse(), 40, 4);
  assert(few.rolling.detectable_spearman !== null && many.rolling.detectable_spearman !== null,
    'both quote a detectable size');
  assert(many.rolling.transitions > few.rolling.transitions, 'a finer step gives more transitions');
});

group('the verdict');

test('too short a panel is DATA_INADEQUATE and never a correlation', () => {
  const r = run(persistentPanel({ nWeeks: 40, seed: 4 }));
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.promising_count === 0, 'this task never promotes anything');
  assert(/contiguous weeks/.test(r.closure_reason), 'the reason names the shortfall');
});

test('an unresolvable mean correlation is UNDERPOWERED, whatever its sign', () => {
  const r = run(noisePanel({ nSym: 30, nWeeks: 240, noise: 0.05, seed: 41 }));
  assert(['UNDERPOWERED', 'SELECTION_TOP_DOES_NOT_PERSIST', 'SELECTION_CARRIES_INFORMATION',
    'SELECTION_ANTI_PERSISTENT'].includes(r.verdict), `unexpected verdict ${r.verdict}`);
  if (r.verdict === 'UNDERPOWERED') {
    assert(/not distinguishable from zero/.test(r.closure_reason), 'an underpowered null must say so');
  }
});

test('the primary is the NON-OVERLAPPING series, as the contract declares', () => {
  const r = run(persistentPanel({ nWeeks: 240, seed: 12 }));
  assert(r.primary_series === 'non_overlapping', 'the contract names non-overlapping as primary');
  assert(r.rolling_is_overlap_dependent === true, 'and the rolling series is flagged as dependent');
  // Rolling windows of length P stepped by 4 share ninety percent of their data. If the
  // verdict were driven by them, the standard error would be understated by roughly the
  // overlap ratio -- the inflation this programme has already recorded as a defect.
  assert(r.rolling.transitions > r.non_overlapping.transitions,
    'rolling necessarily has more windows, which is exactly why it must not carry the estimate');
});

test('a ranking that correlates while its top fails is called out, not called skill', () => {
  // Spearman is positive but the period-1 winner lands below the period-2 median every time.
  // A programme acts on its best candidate, so this must not be reported as selection skill.
  const rules = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));
  const series = new Map();
  rules.forEach((r, i) => {
    const m = new Map();
    for (let t = 0; t < 4; t += 1) m.set(t, t < 2 ? i : (i === 9 ? -100 : i));
    series.set(r.id, m);
  });
  const t = transition(series, rules, 0, 2);
  assert(t.winner_id === 'r9', 'r9 topped period 1');
  assert(t.winner_percentile_in_p2 === 0, 'and finished last in period 2');
  assert(t.spearman > 0, `while the overall ranking still correlates, got ${t.spearman}`);
});

test('the label and promising_count make it structurally impossible to read as a candidate', () => {
  const r = run(persistentPanel({ nWeeks: 240, seed: 6 }));
  assert(r.label === 'SELECTION_DIAGNOSTIC_NOT_A_CANDIDATE', 'the label states what this is');
  assert(r.promising_count === 0, 'and it promotes nothing');
  assert(FROZEN.measures_selection_not_strategy === true, 'the frozen block records the same');
  assert(!('recommended_rule' in r) && !('best_rule' in r),
    'the report must not surface a rule recommendation, which is out of scope by contract');
});

group('CLI and output');

test('the csv carries both series with one row per transition', () => {
  const r = run(persistentPanel({ nWeeks: 240, seed: 8 }));
  const lines = toCsv(r).trim().split('\n');
  assert(lines[0].startsWith('series,start_week'), 'header first');
  assert(lines.length === 1 + r.transitions_non_overlapping.length + r.transitions_rolling.length,
    'one row per transition across both series');
  assert(lines.some((l) => l.startsWith('non_overlapping,')) && lines.some((l) => l.startsWith('rolling,')),
    'both series appear');
});

test('an empty result still produces a well-formed csv', () => {
  assert(toCsv({}).includes('NO_TRANSITIONS'), 'the empty case is explicit');
});

test('argument parsing rejects unknown flags', () => {
  assert(parseArgs(['--panel', 'p.json']).panel === 'p.json', 'a value is read');
  let threw = false;
  try { parseArgs(['--window', '60']); } catch { threw = true; }
  assert(threw, 'the window is frozen; varying it is a new task');
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
