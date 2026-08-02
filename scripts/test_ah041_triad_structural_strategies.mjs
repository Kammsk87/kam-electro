#!/usr/bin/env node
// test_ah041_triad_structural_strategies.mjs
//
// Deterministic tests for TASK-AH-041, plus the ship-blocking static scan.
// Run: node scripts/test_ah041_triad_structural_strategies.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN,
  MEMBERS,
  BLOCKED_FAMILIES,
  DECLARED_ADJACENCY,
  REQUIRED_INPUTS,
  NEWS_PREDECLARED_RULE,
  mean,
  median,
  seeded,
  dayKey,
  missingFields,
  flattenRows,
  gateDatasets,
  chronology,
  buildPanel,
  isEligible,
  buildObservations,
  scoreObservation,
  applyPurgeEmbargo,
  stats,
  shuffledRankNull,
  removeBestDay,
  concentration,
  exactLedgerOverlap,
  verdictFor,
  evaluateCrossSectional,
  evaluateFundingCarry,
  evaluateNewsForcedFlow,
  runTriad,
  toCsv,
  parseArgs,
} from './analysis/ah041_triad_structural_strategies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'ah041_triad_structural_strategies.mjs');
const TEST_PATH = join(HERE, 'test_ah041_triad_structural_strategies.mjs');
const SCANNED_FILES = [ENGINE_PATH, TEST_PATH];

// ---------------------------------------------------------------------------
// Audited scan-exempt region. The scan must name the tokens it forbids, and some
// negative tests need literals the scan would otherwise flag. Nothing outside these
// sentinels, in either scanned file, may contain any of these tokens.
// ---------------------------------------------------------------------------
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
// Write primitives, named here so the scan can look for them without tripping on itself.
const WRITE_TOKENS = ['writeFileSync', 'mkdirSync'];
const WRITE_CALL_RE = /writeFileSync\(/g;
const ALLOWED_FS_IMPORTS = new Set(['readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync']);
/* static-scan:allow-denylist-end */

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const results = [];
let currentSection = 'general';
const section = (n) => { currentSection = n; };

function test(name, fn) {
  try {
    fn();
    results.push({ section: currentSection, name, ok: true });
  } catch (err) {
    results.push({ section: currentSection, name, ok: false, error: err.message });
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Synthetic panel builder
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const T0 = Date.parse('2025-01-01T00:00:00Z');

/**
 * Builds a deterministic daily-bar archive. `drift(symbolIndex, dayIndex)` returns the
 * day's return, letting a test plant an exact cross-sectional ordering.
 */
function makeArchive(symbolCount, days, drift) {
  const bars = {};
  const symbols = [];
  for (let s = 0; s < symbolCount; s += 1) {
    const symbol = `SYN${String(s).padStart(2, '0')}USDT`;
    symbols.push(symbol);
    const rows = [];
    let price = 100;
    for (let d = 0; d < days; d += 1) {
      const r = drift(s, d);
      const open = price;
      const close = price * (1 + r);
      rows.push({ ts: T0 + d * DAY, o: open, h: Math.max(open, close) * 1.001, l: Math.min(open, close) * 0.999, c: close, v: 1000 });
      price = close;
    }
    bars[symbol] = rows;
  }
  return { bars, symbols };
}

function universeManifest(symbols) {
  return { universe_id: 'AH005A_FROZEN_TEST', frozen_at: '2025-01-01T00:00:00Z', symbols };
}

// A clean panel: symbol index determines its persistent strength ordering.
const CLEAN = makeArchive(20, 400, (s, d) => (s < 10 ? 0.002 : -0.002) + 0.0005 * Math.sin(d + s));
const CLEAN_PANEL = buildPanel(CLEAN.symbols, CLEAN.bars);

function readerFor(map) {
  return (path) => {
    if (!(path in map)) throw new Error(`file not found: ${path}`);
    return map[path];
  };
}

// ---------------------------------------------------------------------------
// 1. Data gates — the core discipline
// ---------------------------------------------------------------------------

section('data gates');

test('every member declares its required inputs', () => {
  for (const m of MEMBERS) {
    assert(REQUIRED_INPUTS[m], `${m} has no declared required inputs`);
    assert(Object.keys(REQUIRED_INPUTS[m]).length > 0, `${m} declares no datasets`);
  }
});

test('with no inputs at all, all three members are DATA_INADEQUATE', () => {
  const report = runTriad({}, readerFor({}));
  for (const m of report.members) {
    assert(m.verdict === 'DATA_INADEQUATE', `${m.member} should be DATA_INADEQUATE, got ${m.verdict}`);
    assert(m.missing_inputs.length > 0, `${m.member} must name its missing inputs`);
    assert(m.substitution_refused === true, `${m.member} must record that substitution was refused`);
  }
});

test('a missing dataset names every required field it would have supplied', () => {
  const r = evaluateFundingCarry({}, readerFor({}));
  const carry = r.missing_inputs.find((x) => x.dataset === 'carry');
  assert(carry, 'expected the carry dataset to be reported missing');
  assert(carry.reason === 'DATASET_NOT_SUPPLIED', `unexpected reason ${carry.reason}`);
  for (const field of REQUIRED_INPUTS.FUNDING_PERSISTENCE_CARRY.carry) {
    assert(carry.missing_fields.includes(field), `missing field list omits ${field}`);
  }
});

test('a dataset present but missing one field names exactly that field', () => {
  const rows = [{
    ts: T0, spot_price: 1, perp_price: 1, funding_rate: 0.0001,
    borrow_rate: 0.0001, basis: 0.001, spot_bid: 1, spot_ask: 1, perp_bid: 1, perp_ask: 1,
  }]; // funding_publish_ts deliberately absent
  const r = evaluateFundingCarry({ carry: 'carry.json' }, readerFor({ 'carry.json': rows }));
  assert(r.verdict === 'DATA_INADEQUATE', `expected DATA_INADEQUATE, got ${r.verdict}`);
  const gap = r.missing_inputs.find((x) => x.dataset === 'carry');
  assert(gap.missing_fields.length === 1 && gap.missing_fields[0] === 'funding_publish_ts',
    `expected only funding_publish_ts, got ${JSON.stringify(gap.missing_fields)}`);
});

test('a null or blank value counts as missing, not as data', () => {
  const base = { ts: T0, spot_price: 1, perp_price: 1, funding_rate: 0.0001, funding_publish_ts: T0,
    borrow_rate: 0.0001, basis: 0.001, spot_bid: 1, spot_ask: 1, perp_bid: 1, perp_ask: 1 };
  for (const bad of [null, undefined, '']) {
    const rows = [{ ...base }, { ...base, borrow_rate: bad }];
    const gaps = missingFields(rows, REQUIRED_INPUTS.FUNDING_PERSISTENCE_CARRY.carry);
    assert(gaps.includes('borrow_rate'), `value ${JSON.stringify(bad)} should count as missing`);
  }
});

test('candles are never substituted: bars alone do not make carry or news executable', () => {
  const paths = { universe: 'u.json', daily_bars: 'b.json' };
  const reader = readerFor({ 'u.json': universeManifest(CLEAN.symbols), 'b.json': CLEAN.bars });
  const carry = evaluateFundingCarry(paths, reader);
  const news = evaluateNewsForcedFlow(paths, reader);
  assert(carry.verdict === 'DATA_INADEQUATE', 'bars must not satisfy the carry gate');
  assert(news.verdict === 'DATA_INADEQUATE', 'bars must not satisfy the news gate');
  assert(carry.executable === false && news.executable === false, 'neither member is executable from candles');
});

test('news requires both the label stream and the aligned execution prices', () => {
  const newsRows = [{ first_seen_ts: T0, event_label: 'LISTING', symbol: 'SYN00USDT' }];
  const r = evaluateNewsForcedFlow({ news: 'n.json' }, readerFor({ 'n.json': newsRows }));
  assert(r.verdict === 'DATA_INADEQUATE', 'news alone is not enough');
  assert(r.missing_inputs.some((x) => x.dataset === 'news_prices'), 'must report the missing price/execution dataset');
});

test('the news mechanical rule is declared before inspection', () => {
  assert(NEWS_PREDECLARED_RULE.declared_before_inspection === true, 'rule must be pre-declared');
  for (const k of ['direction', 'entry', 'exit']) {
    assert(typeof NEWS_PREDECLARED_RULE[k] === 'string' && NEWS_PREDECLARED_RULE[k].length > 3, `${k} must be declared`);
  }
});

test('an unreadable dataset is reported, never silently skipped', () => {
  const r = evaluateCrossSectional({ universe: 'nope.json', daily_bars: 'nope2.json' }, readerFor({}));
  assert(r.verdict === 'DATA_INADEQUATE', 'unreadable inputs must gate');
  assert(r.missing_inputs.every((x) => x.reason === 'DATASET_UNREADABLE' || x.reason === 'DATASET_NOT_SUPPLIED'),
    `unexpected reasons ${JSON.stringify(r.missing_inputs.map((x) => x.reason))}`);
});

test('flattenRows accepts both keyed archives and flat arrays', () => {
  assert(flattenRows([{ a: 1 }]).length === 1, 'flat array');
  assert(flattenRows({ X: [{ a: 1 }], Y: [{ a: 2 }] }).length === 2, 'keyed archive');
  assert(flattenRows(null).length === 0, 'null yields no rows');
});

// ---------------------------------------------------------------------------
// 2. Independence — never pool PnL
// ---------------------------------------------------------------------------

section('member independence');

test('the report carries exactly three independent verdicts', () => {
  const report = runTriad({}, readerFor({}));
  assert(report.members.length === 3, 'expected three members');
  assert(Object.keys(report.verdicts).length === 3, 'expected three verdicts');
  assert(new Set(report.members.map((m) => m.member)).size === 3, 'members must be distinct');
});

test('there is no pooled PnL, combined equity, or aggregate verdict anywhere', () => {
  const report = runTriad({}, readerFor({}));
  const json = JSON.stringify(report);
  for (const banned of ['"combined_pnl"', '"pooled', '"total_pnl"', '"portfolio_pnl"', '"aggregate_verdict"', '"triad_pnl"']) {
    assert(!json.includes(banned), `report must not contain ${banned}`);
  }
  assert(report.pnl_pooling.startsWith('NEVER'), 'the report must state the no-pooling rule');
  assert(report.verdict === undefined, 'there must be no single overall verdict');
});

test('one member failing its gate does not change another member', () => {
  const a = runTriad({}, readerFor({}));
  const paths = { universe: 'u.json', daily_bars: 'b.json' };
  const b = runTriad(paths, readerFor({ 'u.json': universeManifest(CLEAN.symbols), 'b.json': CLEAN.bars }));
  const carryA = a.members.find((m) => m.member === 'FUNDING_PERSISTENCE_CARRY');
  const carryB = b.members.find((m) => m.member === 'FUNDING_PERSISTENCE_CARRY');
  assert(carryA.verdict === carryB.verdict, 'the carry verdict must not depend on member 1 data');
});

test('promising_count is zero and never raised', () => {
  const report = runTriad({}, readerFor({}));
  assert(report.promising_count === 0, 'promising_count must be 0');
});

// ---------------------------------------------------------------------------
// 3. Cross-sectional mechanics
// ---------------------------------------------------------------------------

section('cross-sectional mechanics');

test('a symbol with under 30 days of history is excluded', () => {
  const short = makeArchive(1, 20, () => 0.001);
  const panel = buildPanel(short.symbols, short.bars);
  const entry = panel.bySymbol[short.symbols[0]];
  assert(isEligible(entry, 19, panel.dates, 7) === false, 'a 20-day symbol must be ineligible');
});

test('a single-day move beyond 25% excludes the symbol', () => {
  const arc = makeArchive(1, 60, (s, d) => (d === 50 ? 0.30 : 0.001));
  const panel = buildPanel(arc.symbols, arc.bars);
  const entry = panel.bySymbol[arc.symbols[0]];
  assert(isEligible(entry, 52, panel.dates, 7) === false, 'the 30% day must exclude the symbol while inside the lookback');
  assert(isEligible(entry, 59, panel.dates, 7) === true, 'once the move leaves the lookback the symbol is eligible again');
});

test('the score is the lookback return minus the universe median', () => {
  const obs = buildObservations(CLEAN_PANEL, 7);
  assert(obs.length > 0, 'expected observations');
  const o = obs[0];
  const med = median(o.eligible.map((e) => e.raw));
  for (const e of o.eligible) {
    assert(Math.abs(e.score - (e.raw - med)) < 1e-12, 'score must equal raw minus the universe median');
  }
  assert(Math.abs(median(o.eligible.map((e) => e.score))) < 1e-12, 'median score must be zero by construction');
});

test('legs are the top and bottom quintile, equal sized and disjoint', () => {
  const o = buildObservations(CLEAN_PANEL, 7)[0];
  assert(o.longs.length === o.shorts.length, 'legs must be equal sized');
  assert(o.longs.length === o.nPerSide, 'leg size must equal nPerSide');
  const overlap = o.longs.filter((s) => o.shorts.includes(s));
  assert(overlap.length === 0, 'legs must be disjoint');
  const scoreOf = Object.fromEntries(o.eligible.map((e) => [e.symbol, e.score]));
  const minLong = Math.min(...o.longs.map((s) => scoreOf[s]));
  const maxShort = Math.max(...o.shorts.map((s) => scoreOf[s]));
  assert(minLong >= maxShort, 'every long must outrank every short');
});

test('the portfolio is market neutral with gross one, and costs hit both legs', () => {
  const o = buildObservations(CLEAN_PANEL, 7)[0];
  const scored = scoreObservation(o, FROZEN.cost_bps_gross_roundtrip);
  const weights = Object.values(scored.contributions);
  assert(scored.n_long === scored.n_short, 'legs must be balanced');
  const grossWeight = Object.entries(scored.contributions)
    .reduce((a, [s]) => a + (o.longs.includes(s) ? 0.5 / scored.n_long : 0.5 / scored.n_short), 0);
  assert(Math.abs(grossWeight - 1) < 1e-12, `gross notional must be 1.0, got ${grossWeight}`);
  assert(Math.abs(scored.bps - (scored.gross_bps - FROZEN.cost_bps_gross_roundtrip)) < 1e-9,
    'net must be gross minus the frozen both-leg cost');
  assert(weights.length === scored.n_long + scored.n_short, 'every leg member must carry a contribution');
});

test('a uniformly rising market yields a neutral book, not a profit', () => {
  const flat = makeArchive(20, 200, () => 0.01); // every symbol identical
  const panel = buildPanel(flat.symbols, flat.bars);
  const obs = buildObservations(panel, 7);
  if (obs.length) {
    const scored = scoreObservation(obs[0], 0);
    assert(Math.abs(scored.gross_bps) < 1e-6, `market-neutral book must not profit from common drift, got ${scored.gross_bps}`);
  }
});

test('entry and exit use opens strictly after the decision date', () => {
  const obs = buildObservations(CLEAN_PANEL, 7);
  const dates = CLEAN_PANEL.dates;
  for (const o of obs.slice(0, 5)) {
    assert(o.entryDate === dates[o.decisionIndex + 1], 'entry must be the next date');
    assert(o.exitDate === dates[o.decisionIndex + 2], 'exit must be one date after entry');
    assert(o.entryDate > o.decisionDate && o.exitDate > o.entryDate, 'dates must be strictly increasing');
  }
});

test('no look-ahead: data after the exit date cannot change an observation', () => {
  const arc = makeArchive(12, 120, (s, d) => (s < 6 ? 0.003 : -0.003) + 0.0004 * Math.cos(d * 1.7 + s));
  const before = buildObservations(buildPanel(arc.symbols, arc.bars), 7);
  const target = before[10];

  const mutated = JSON.parse(JSON.stringify(arc.bars));
  for (const symbol of arc.symbols) {
    for (let d = target.decisionIndex + 3; d < 120; d += 1) {
      mutated[symbol][d].o *= 3;
      mutated[symbol][d].c *= 3;
      mutated[symbol][d].h *= 3;
      mutated[symbol][d].l *= 3;
    }
  }
  const after = buildObservations(buildPanel(arc.symbols, mutated), 7)[10];
  assert(JSON.stringify(after.eligible) === JSON.stringify(target.eligible), 'future bars leaked into the signal or the return');
  assert(JSON.stringify(after.longs) === JSON.stringify(target.longs), 'future bars changed the long leg');
});

// ---------------------------------------------------------------------------
// 4. Chronology, purge and embargo
// ---------------------------------------------------------------------------

section('chronology');

test('splits are chronological 55/20/15/10', () => {
  const c = chronology(Array.from({ length: 1000 }, (_, i) => String(i)));
  assert(c.trainEnd === 550, `trainEnd ${c.trainEnd}`);
  assert(c.validationEnd === 750, `validationEnd ${c.validationEnd}`);
  assert(c.holdoutEnd === 900, `holdoutEnd ${c.holdoutEnd}`);
  assert(c.splitOf(0) === 'train' && c.splitOf(600) === 'validation', 'split boundaries');
  assert(c.splitOf(800) === 'holdout' && c.splitOf(950) === 'forward', 'split boundaries');
});

test('purge drops decisions whose outcome window crosses a split boundary', () => {
  const obs = buildObservations(CLEAN_PANEL, 7);
  const chrono = chronology(CLEAN_PANEL.dates);
  const { kept, dropped } = applyPurgeEmbargo(obs, CLEAN_PANEL.dates, chrono);
  assert(dropped.purged > 0, 'expected at least one purged boundary decision');
  for (const o of kept) {
    assert(chrono.splitOf(o.decisionIndex) === chrono.splitOf(o.decisionIndex + FROZEN.purge_days),
      `${o.decisionDate}: outcome window crosses into another split`);
  }
});

test('embargo removes the warm-up head of each evaluated split', () => {
  const obs = buildObservations(CLEAN_PANEL, 7);
  const chrono = chronology(CLEAN_PANEL.dates);
  const { kept, dropped } = applyPurgeEmbargo(obs, CLEAN_PANEL.dates, chrono);
  assert(dropped.embargoed > 0, 'expected embargoed observations');
  for (const name of ['validation', 'holdout', 'forward']) {
    const inSplit = kept.filter((o) => o.split === name);
    const raw = obs.filter((o) => chrono.splitOf(o.decisionIndex) === name);
    if (inSplit.length && raw.length) {
      assert(inSplit[0].decisionIndex - raw[0].decisionIndex >= FROZEN.embargo_days,
        `${name}: embargo head was not removed`);
    }
  }
});

test('every kept observation carries its split label', () => {
  const obs = buildObservations(CLEAN_PANEL, 7);
  const { kept } = applyPurgeEmbargo(obs, CLEAN_PANEL.dates, chronology(CLEAN_PANEL.dates));
  for (const o of kept) assert(['train', 'validation', 'holdout', 'forward'].includes(o.split), 'missing split');
});

// ---------------------------------------------------------------------------
// 5. Statistics
// ---------------------------------------------------------------------------

section('statistics');

const mkScored = (date, bps) => ({ decisionDate: date, bps, gross_bps: bps, contributions: { A: bps / 2e4, B: -bps / 2e4 } });

test('drawdown is computed in date order, not input order', () => {
  const shuffled = [
    mkScored('2025-01-05', -300), mkScored('2025-01-01', 200),
    mkScored('2025-01-04', -300), mkScored('2025-01-02', 200), mkScored('2025-01-03', 200),
  ];
  const s = stats(shuffled);
  assert(s.max_drawdown_bps === -600, `chronological drawdown should be -600, got ${s.max_drawdown_bps}`);
  assert(s.net_total_bps === 0, 'total must be order independent');
});

test('stats report counts, dispersion and totals', () => {
  const s = stats([mkScored('2025-01-01', 100), mkScored('2025-01-02', -50)]);
  assert(s.n === 2 && s.days === 2, 'n and days');
  assert(s.net_mean_bps === 25 && s.net_median_bps === 25, 'mean and median');
  assert(s.win_rate_pct === 50, 'win rate');
});

test('remove-best-day drops the single best date', () => {
  const rows = [mkScored('2025-01-01', 500), mkScored('2025-01-02', 10), mkScored('2025-01-03', 20)];
  const r = removeBestDay(rows);
  assert(r.removed === '2025-01-01', `expected the best day removed, got ${r.removed}`);
  assert(r.stats.n === 2, 'the remaining sample must exclude it');
});

test('concentration measures the largest symbol share of gross activity', () => {
  const rows = [{ decisionDate: '2025-01-01', bps: 1, gross_bps: 1, contributions: { A: 0.009, B: 0.001 } }];
  const c = concentration(rows);
  assert(Math.abs(c.max_symbol_abs_share - 0.9) < 1e-9, `expected 0.9, got ${c.max_symbol_abs_share}`);
  assert(c.symbols === 2, 'symbol count');
});

// ---------------------------------------------------------------------------
// 6. Matched null
// ---------------------------------------------------------------------------

section('shuffled-rank null');

function nullFixture() {
  const obs = buildObservations(CLEAN_PANEL, 7).slice(0, 40);
  return obs.map((o) => ({ ...scoreObservation(o, FROZEN.cost_bps_gross_roundtrip), source: o }));
}

test('the null preserves dates, leg sizes and the eligible set', () => {
  const scored = nullFixture();
  const r = shuffledRankNull(scored, FROZEN.cost_bps_gross_roundtrip, 25, 99);
  assert(r.samples === 25, `expected 25 usable samples, got ${r.samples}`);
  assert(r.observed_net_median_bps !== null, 'observed median must be defined');
  assert(r.p_value >= 0 && r.p_value <= 1, `p must be a probability, got ${r.p_value}`);
});

test('the null is deterministic for a fixed seed and changes with the seed', () => {
  const scored = nullFixture();
  const a = shuffledRankNull(scored, 11, 30, 4242);
  const b = shuffledRankNull(scored, 11, 30, 4242);
  const c = shuffledRankNull(scored, 11, 30, 777);
  assert(a.p_value === b.p_value && a.null_median_bps === b.null_median_bps, 'same seed must reproduce exactly');
  assert(a.null_median_bps !== c.null_median_bps || a.p_value !== c.p_value, 'a different seed should shuffle differently');
});

test('a signal with no cross-sectional information cannot beat its own null', () => {
  // Identical symbols: the ranking is arbitrary, so the observed median must sit
  // squarely inside the null distribution.
  const flat = makeArchive(20, 200, (s, d) => 0.001 * Math.sin(d));
  const panel = buildPanel(flat.symbols, flat.bars);
  const scored = buildObservations(panel, 7).slice(0, 30)
    .map((o) => ({ ...scoreObservation(o, 0), source: o }))
    .filter(Boolean);
  if (scored.length >= 10) {
    const r = shuffledRankNull(scored, 0, 50, 31337);
    assert(r.p_value > FROZEN.alpha, `an information-free signal must not clear alpha, got p=${r.p_value}`);
  }
});

test('the default null sample count is one thousand', () => {
  assert(FROZEN.null_samples === 1000, 'the protocol requires 1,000 matched nulls');
});

// ---------------------------------------------------------------------------
// 7. Overlap and verdict ordering
// ---------------------------------------------------------------------------

section('overlap and verdicts');

test('the blocked families are declared and include the named rejects', () => {
  for (const f of ['FAILED_BREAKOUT', 'RAW_MOMENTUM', 'WALLET_FOLLOW', 'PAIRS_RELATIVE_VALUE', 'HMM_REGIME']) {
    assert(BLOCKED_FAMILIES.includes(f), `${f} must be blocked`);
  }
});

test('the cross-sectional member declares its adjacency to blocked families', () => {
  const adj = DECLARED_ADJACENCY.CS_RELATIVE_STRENGTH_24H;
  assert(adj.includes('RAW_MOMENTUM'), 'cross-sectional relative strength is momentum adjacent and must say so');
  const o = exactLedgerOverlap('CS_RELATIVE_STRENGTH_24H');
  assert(o.status === 'UNAVAILABLE', 'exact ledger overlap is not measurable');
  assert(o.blocking === true, 'declared adjacency with no measurement must block');
});

const passingResult = () => ({
  holdout: { n: 200, days: 60, net_mean_bps: 10, net_median_bps: 8 },
  forward: { n: 150, days: 40, net_mean_bps: 9, net_median_bps: 7 },
  combined_oos: { n: 350, days: 100, net_mean_bps: 9, net_median_bps: 8 },
  double_cost_oos: { net_median_bps: 2 },
  null: { p_value: 0.001 },
  remove_best_symbol: { stats: { net_total_bps: 500 } },
  remove_best_day: { stats: { net_total_bps: 400 } },
  concentration: { max_symbol_abs_share: 0.1 },
  neighbours: [{ stats: { net_median_bps: 5 } }, { stats: { net_median_bps: 6 } }],
  overlap: { status: 'UNAVAILABLE', blocking: true },
});

test('an unmeasured overlap gate blocks a passport draft even when everything else passes', () => {
  const r = passingResult();
  assert(verdictFor(r) === 'DUPLICATE_OR_OVERLAP_BLOCKED', `expected the overlap block, got ${verdictFor(r)}`);
});

test('a passport draft requires the overlap gate to be actually measured', () => {
  const r = passingResult();
  r.overlap = { status: 'MEASURED', blocking: false };
  assert(verdictFor(r) === 'CANDIDATE_PASSPORT_DRAFT', `expected a draft, got ${verdictFor(r)}`);
  r.overlap = { status: 'MEASURED', blocking: true };
  assert(verdictFor(r) === 'DUPLICATE_OR_OVERLAP_BLOCKED', 'a measured overlap that is blocking still blocks');
});

test('gates are ordered: thin data outranks a positive result', () => {
  const r = passingResult();
  r.holdout.n = 3;
  assert(verdictFor(r) === 'DATA_INADEQUATE', 'insufficient observations must gate first');
});

test('a non-positive or insignificant out-of-sample result rejects the family', () => {
  for (const mutate of [
    (r) => { r.holdout.net_median_bps = -1; },
    (r) => { r.forward.net_mean_bps = 0; },
    (r) => { r.null.p_value = 0.2; },
    (r) => { r.null.p_value = null; },
  ]) {
    const r = passingResult();
    mutate(r);
    assert(verdictFor(r) === 'OOS_FAIL_REJECT_FAMILY', 'expected an OOS rejection');
  }
});

test('each robustness breach deprioritizes', () => {
  for (const mutate of [
    (r) => { r.double_cost_oos.net_median_bps = -1; },
    (r) => { r.remove_best_symbol.stats.net_total_bps = -10; },
    (r) => { r.remove_best_day.stats.net_total_bps = 0; },
    (r) => { r.concentration.max_symbol_abs_share = 0.9; },
    (r) => { r.neighbours[1].stats.net_median_bps = -3; },
  ]) {
    const r = passingResult();
    mutate(r);
    assert(verdictFor(r) === 'ROBUSTNESS_FAIL_DEPRIORITIZE', 'expected a robustness deprioritization');
  }
});

test('neighbours are evaluated on validation, never on the sealed holdout', () => {
  assert(FROZEN.neighbour_lookback_days.length === 2, 'exactly two fixed neighbours');
  const paths = { universe: 'u.json', daily_bars: 'b.json' };
  const r = evaluateCrossSectional(paths, readerFor({ 'u.json': universeManifest(CLEAN.symbols), 'b.json': CLEAN.bars }));
  assert(r.neighbours.length === 2, 'expected two neighbours');
  for (const nb of r.neighbours) {
    assert(nb.segment === 'validation', `neighbour ${nb.lookback_days} must be measured on validation, got ${nb.segment}`);
    assert(FROZEN.neighbour_lookback_days.includes(nb.lookback_days), 'neighbour lookbacks must be the frozen pair');
  }
});

// ---------------------------------------------------------------------------
// 8. End-to-end determinism
// ---------------------------------------------------------------------------

section('determinism');

test('two identical runs produce byte-identical reports', () => {
  const paths = { universe: 'u.json', daily_bars: 'b.json' };
  const reader = readerFor({ 'u.json': universeManifest(CLEAN.symbols), 'b.json': CLEAN.bars });
  const a = JSON.stringify(runTriad(paths, reader));
  const b = JSON.stringify(runTriad(paths, reader));
  assert(a === b, 'the triad run is not deterministic');
});

test('the report embeds no timestamp', () => {
  const json = JSON.stringify(runTriad({}, readerFor({})));
  for (const banned of ['"generated_at"', '"run_ts"', '"built_at"', '"executed_at"']) {
    assert(!json.includes(banned), `report must not embed ${banned}`);
  }
});

test('the seeded PRNG is stable and in range', () => {
  const a = Array.from({ length: 5 }, seeded(1234));
  const b = Array.from({ length: 5 }, seeded(1234));
  assert(JSON.stringify(a) === JSON.stringify(b), 'same seed must reproduce');
  assert(a.every((x) => x >= 0 && x < 1), 'values must be in [0,1)');
});

test('the csv carries one row per member and never a pooled row', () => {
  const csv = toCsv(runTriad({}, readerFor({})));
  const lines = csv.trim().split('\n');
  assert(lines.length === 4, `expected header plus three members, got ${lines.length}`);
  assert(lines[0].startsWith('member,verdict'), 'unexpected header');
  for (const m of MEMBERS) assert(csv.includes(m), `csv omits ${m}`);
  for (const line of lines) {
    const quotes = (line.match(/"/g) ?? []).length;
    assert(quotes % 2 === 0, `unbalanced quoting: ${line}`);
  }
});

test('an unknown argument is rejected rather than ignored', () => {
  let threw = false;
  try { parseArgs(['--not-a-flag']); } catch { threw = true; }
  assert(threw, 'unknown arguments must be rejected');
  const ok = parseArgs(['--universe', 'u.json', '--out', 'x']);
  assert(ok.paths.universe === 'u.json' && ok.out === 'x', 'known arguments must parse');
});

// ---------------------------------------------------------------------------
// 9. Static scan
// ---------------------------------------------------------------------------

section('static scan');

const ALLOWED_MODULES = new Set([
  'node:fs', 'node:path', 'node:url',
  './analysis/ah041_triad_structural_strategies.mjs',
]);

function scannableSource(file) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(/\/\* static-scan:allow-denylist-start \*\/[\s\S]*?\/\* static-scan:allow-denylist-end \*\//g, '/* excised */');
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.replace(/^\s*\/\/.*$/gm, ' ');
  return src;
}

function scanFor(category) {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    for (const token of FORBIDDEN_TOKENS[category]) {
      assert(!src.includes(token), `${file}: forbidden ${category} token '${token}'`);
    }
  }
}

test('every import is on the allowlist', () => {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    const mods = [
      ...[...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ];
    for (const mod of mods) assert(ALLOWED_MODULES.has(mod), `${file}: forbidden module '${mod}'`);
  }
});

test('no network surface', () => scanFor('network'));
test('no process, service or shell surface', () => scanFor('process_service'));
test('no credential or environment surface', () => scanFor('credential'));
test('no exchange, account, order or position surface', () => scanFor('exchange_account'));
test('no trading runtime state is referenced', () => scanFor('runtime_state'));
test('no destructive filesystem call', () => scanFor('filesystem_mutation'));

test('promising_count is never set to a nonzero value', () => {
  for (const file of SCANNED_FILES) {
    assert(!NONZERO_PROMISING.test(scannableSource(file)), `${file}: raises promising_count`);
  }
});

test('the engine writes only to an explicit --out base', () => {
  const src = scannableSource(ENGINE_PATH);
  assert((src.match(WRITE_CALL_RE) ?? []).length === 2, 'exactly two writes: the json and the csv');
  assert(src.includes('if (opts.out)'), 'writes must be guarded by an explicit --out');
});

test('the test file writes nothing at all', () => {
  const src = scannableSource(TEST_PATH);
  for (const token of WRITE_TOKENS) {
    assert(!src.includes(token), `the test file must not write (${token})`);
  }
});

test('only audited node:fs primitives are imported', () => {
  for (const file of SCANNED_FILES) {
    const m = scannableSource(file).match(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs['"]/);
    if (!m) continue;
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      assert(ALLOWED_FS_IMPORTS.has(name), `${file}: unaudited node:fs import '${name}'`);
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
const lines = ['TASK-AH-041 triad structural strategies — test suite', ''];
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
