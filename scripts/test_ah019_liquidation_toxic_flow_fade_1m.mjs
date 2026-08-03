#!/usr/bin/env node
// test_ah019_liquidation_toxic_flow_fade_1m.mjs
//
// Deterministic tests for TASK-AH-019, plus the ship-blocking static no-trading scan.
// Run: node scripts/test_ah019_liquidation_toxic_flow_fade_1m.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FROZEN,
  OVERLAP_FAMILIES,
  REQUIRED_INPUTS,
  REFUSED_SUBSTITUTES,
  LEVEL_STATES,
  mean,
  median,
  percentile,
  seeded,
  bucketOf,
  minuteOfDay,
  flattenRows,
  missingFields,
  validateAggressorSide,
  gateInputs,
  coverageInventory,
  signedTradeFlow,
  cumulativeVolumeDelta,
  bestBid,
  bestAsk,
  depthWithinBps,
  classifyLevel,
  sideLiquidityDelta,
  directionalState,
  openInterestByBucket,
  liquidationsByBucket,
  depthWalk,
  chronology,
  fitTrainThresholds,
  detectEvent,
  stats,
  matchedNull,
  verdictFor,
  run,
  toCsv,
  parseArgs,
} from './analysis/ah019_liquidation_toxic_flow_fade_1m.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = join(HERE, 'analysis', 'ah019_liquidation_toxic_flow_fade_1m.mjs');
const TEST_PATH = join(HERE, 'test_ah019_liquidation_toxic_flow_fade_1m.mjs');
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
function assert(cond, message) { if (!cond) throw new Error(message); }

const T0 = Date.parse('2026-01-01T00:00:00Z');
const MIN = 60_000;
const readerFor = (map) => (path) => {
  if (!(path in map)) throw new Error(`file not found: ${path}`);
  return map[path];
};

// ---------------------------------------------------------------------------
// 1. Data gate — aggressor side is the binding requirement
// ---------------------------------------------------------------------------

section('data gate');

test('with no inputs the run is DATA_INADEQUATE and names every dataset', () => {
  const r = run({}, readerFor({}));
  assert(r.verdict === 'DATA_INADEQUATE', `got ${r.verdict}`);
  assert(r.executable === false, 'must not be executable');
  const named = r.missing_inputs.map((m) => m.dataset).sort();
  assert(JSON.stringify(named) === JSON.stringify(['book', 'liquidations', 'oi', 'trades']),
    `expected all four datasets, got ${JSON.stringify(named)}`);
});

test('a missing dataset lists every field it would have supplied', () => {
  const r = run({}, readerFor({}));
  const trades = r.missing_inputs.find((m) => m.dataset === 'trades');
  for (const f of REQUIRED_INPUTS.trades) assert(trades.missing_fields.includes(f), `omits ${f}`);
});

test('a trades file without an aggressor side is refused', () => {
  const rows = [{ ts: T0, symbol: 'X', price: 100, size: 1 }];
  const r = run({ trades: 't.json' }, readerFor({ 't.json': rows }));
  const trades = r.missing_inputs.find((m) => m.dataset === 'trades');
  assert(trades.missing_fields.includes('side'), 'the missing aggressor side must be named');
});

test('an aggressor side derived from a refused substitute is rejected', () => {
  for (const source of REFUSED_SUBSTITUTES) {
    const rows = [
      { ts: T0, symbol: 'X', price: 100, size: 1, side: 'BUY', side_source: source },
      { ts: T0, symbol: 'X', price: 100, size: 1, side: 'SELL', side_source: source },
    ];
    const problems = validateAggressorSide(rows);
    assert(problems.some((p) => p.includes(source)), `'${source}' must be refused as a side source`);
  }
});

test('a one-sided tape cannot be a real aggressor classification', () => {
  const rows = [
    { ts: T0, symbol: 'X', price: 100, size: 1, side: 'BUY' },
    { ts: T0 + 1, symbol: 'X', price: 100, size: 1, side: 'BUY' },
  ];
  assert(validateAggressorSide(rows).some((p) => p.includes('same aggressor side')), 'a single-sided tape must be refused');
});

test('an unrecognised aggressor label is refused', () => {
  const rows = [{ ts: T0, symbol: 'X', price: 100, size: 1, side: 'UNKNOWN' }];
  assert(validateAggressorSide(rows).some((p) => p.includes('unrecognised')), 'bad labels must be refused');
});

test('a valid two-sided tape passes aggressor validation', () => {
  const rows = [
    { ts: T0, symbol: 'X', price: 100, size: 1, side: 'BUY' },
    { ts: T0, symbol: 'X', price: 100, size: 1, side: 'SELL' },
  ];
  assert(validateAggressorSide(rows).length === 0, 'a clean tape must pass');
});

test('OHLCV-style substitutes are declared and refused by name', () => {
  for (const s of ['candle_direction', 'close_to_close_return', 'later_price_move']) {
    assert(REFUSED_SUBSTITUTES.includes(s), `${s} must be a declared refused substitute`);
  }
});

test('null and blank values count as missing', () => {
  const rows = [{ ts: T0, symbol: 'X', price: 100, size: null, side: 'BUY' }];
  assert(missingFields(rows, REQUIRED_INPUTS.trades).includes('size'), 'null must count as missing');
});

test('the coverage inventory reports per-symbol bucket counts', () => {
  const datasets = {
    trades: [{ ts: T0, symbol: 'A' }, { ts: T0 + MIN, symbol: 'A' }, { ts: T0, symbol: 'B' }],
    book: [{ ts: T0, symbol: 'A' }],
  };
  const inv = coverageInventory(datasets);
  const a = inv.find((r) => r.symbol === 'A');
  assert(a.trades.rows === 2 && a.trades.buckets === 2, 'A should show two trade buckets');
  assert(inv.find((r) => r.symbol === 'B').book.rows === 0, 'B has no book rows');
});

// ---------------------------------------------------------------------------
// 2. Layer 2 — aggressive flow
// ---------------------------------------------------------------------------

section('aggressive flow');

test('signed volume is taker buy notional minus taker sell notional', () => {
  const trades = [
    { ts: T0, symbol: 'X', price: 100, size: 2, side: 'BUY' },
    { ts: T0 + 1000, symbol: 'X', price: 100, size: 3, side: 'SELL' },
  ];
  const b = [...signedTradeFlow(trades).values()][0];
  assert(b.taker_buy_volume === 200 && b.taker_sell_volume === 300, 'leg notionals');
  assert(b.signed_volume === -100, `signed volume should be -100, got ${b.signed_volume}`);
  assert(Math.abs(b.taker_buy_ratio - 0.4) < 1e-12, 'taker buy ratio');
});

test('trades are bucketed into one-minute UTC buckets', () => {
  const trades = [
    { ts: T0 + 59_000, symbol: 'X', price: 1, size: 1, side: 'BUY' },
    { ts: T0 + 61_000, symbol: 'X', price: 1, size: 1, side: 'BUY' },
  ];
  const flow = signedTradeFlow(trades);
  assert(flow.size === 2, 'trades either side of the minute boundary must split');
  assert(bucketOf(T0 + 59_000) === T0, 'bucket floor');
});

test('volume traded at each price is retained for the level decomposition', () => {
  const trades = [
    { ts: T0, symbol: 'X', price: 100, size: 4, side: 'SELL' },
    { ts: T0, symbol: 'X', price: 100, size: 1, side: 'BUY' },
    { ts: T0, symbol: 'X', price: 101, size: 2, side: 'BUY' },
  ];
  const b = [...signedTradeFlow(trades).values()][0];
  assert(b.traded_at_price.get(100).sell === 4, 'sell volume at 100');
  assert(b.traded_at_price.get(100).buy === 1, 'buy volume at 100');
  assert(b.traded_at_price.get(101).buy === 2, 'buy volume at 101');
});

test('CVD accumulates in chronological order per symbol', () => {
  const trades = [
    { ts: T0, symbol: 'X', price: 100, size: 1, side: 'BUY' },
    { ts: T0 + MIN, symbol: 'X', price: 100, size: 3, side: 'SELL' },
    { ts: T0 + 2 * MIN, symbol: 'X', price: 100, size: 1, side: 'BUY' },
  ];
  const flow = cumulativeVolumeDelta(signedTradeFlow(trades));
  const ordered = [...flow.values()].sort((a, b) => a.bucket - b.bucket).map((b) => b.cvd);
  assert(JSON.stringify(ordered) === JSON.stringify([100, -200, -100]), `unexpected CVD path ${JSON.stringify(ordered)}`);
});

// ---------------------------------------------------------------------------
// 3. Layer 3 — absorption versus cancellation (the discriminator)
// ---------------------------------------------------------------------------

section('absorption vs cancellation');

test('a level that holds while being traded through is ABSORPTION', () => {
  const c = classifyLevel(100, 100, 50);
  assert(c.state === 'ABSORPTION', `got ${c.state}`);
  assert(c.netPassiveChange === 50, 'the refill must equal what was taken');
});

test('a level eaten and not refilled is CONSUMPTION', () => {
  const c = classifyLevel(100, 50, 50);
  assert(c.state === 'CONSUMPTION', `got ${c.state}`);
  assert(c.netPassiveChange === 0, 'no passive change');
});

test('a level that vanishes without trading is a PULL, not a fill', () => {
  const c = classifyLevel(100, 0, 0);
  assert(c.state === 'PULL', `got ${c.state}`);
  assert(c.traded === 0, 'nothing traded');
});

test('a level both eaten and withdrawn is PULL_UNDER_PRESSURE', () => {
  const c = classifyLevel(100, 0, 50);
  assert(c.state === 'PULL_UNDER_PRESSURE', `got ${c.state}`);
  assert(c.netPassiveChange === -50, 'half was taken, half withdrawn');
});

test('growth without trading is REPLENISH, and no change is IDLE', () => {
  assert(classifyLevel(100, 150, 0).state === 'REPLENISH', 'growth');
  assert(classifyLevel(100, 100, 0).state === 'IDLE', 'no change');
});

test('the identity size_next = size_prev - traded - cancelled + added always holds', () => {
  for (const [prev, next, traded] of [[100, 100, 50], [100, 50, 50], [100, 0, 0], [100, 0, 50], [80, 120, 10]]) {
    const c = classifyLevel(prev, next, traded);
    assert(Math.abs((prev - traded + c.netPassiveChange) - next) < 1e-9,
      `identity broken for prev=${prev} next=${next} traded=${traded}`);
  }
});

test('identical book deltas classify differently once the tape is known', () => {
  // Same observed shrink of 100 -> 0. Only the tape separates a fill from a cancellation.
  const withoutTrades = classifyLevel(100, 0, 0);
  const withTrades = classifyLevel(100, 0, 100);
  assert(withoutTrades.state === 'PULL', 'no tape volume means the wall was cancelled');
  assert(withTrades.state === 'CONSUMPTION', 'full tape volume means the wall was filled');
  assert(withoutTrades.state !== withTrades.state,
    'this is the whole point: book snapshots alone cannot separate these two');
});

test('a bid is consumed by aggressive sells and an ask by aggressive buys', () => {
  const prev = { bids: [[99, 10]], asks: [[101, 10]] };
  const next = { bids: [[99, 10]], asks: [[101, 10]] };
  const traded = new Map([[99, { buy: 0, sell: 5 }], [101, { buy: 5, sell: 0 }]]);
  const bid = sideLiquidityDelta(prev, next, 'BID', traded);
  const ask = sideLiquidityDelta(prev, next, 'ASK', traded);
  assert(bid.levels[0].traded === 5, 'the bid must see the aggressive sell volume');
  assert(ask.levels[0].traded === 5, 'the ask must see the aggressive buy volume');
  assert(bid.counts.ABSORPTION === 1 && ask.counts.ABSORPTION === 1, 'both held and refilled');
});

test('side liquidity delta aggregates absorbed volume and pulled size', () => {
  const prev = { bids: [[99, 10], [98, 20]], asks: [] };
  const next = { bids: [[99, 10], [98, 0]], asks: [] };
  const traded = new Map([[99, { buy: 0, sell: 4 }]]);
  const d = sideLiquidityDelta(prev, next, 'BID', traded);
  assert(d.absorbed_volume === 4, `absorbed ${d.absorbed_volume}`);
  assert(d.pulled_size === 20, `pulled ${d.pulled_size}`);
  assert(d.counts.ABSORPTION === 1 && d.counts.PULL === 1, 'one of each');
});

test('every classification is a declared state', () => {
  for (const [p, n, t] of [[10, 10, 5], [10, 5, 5], [10, 0, 0], [10, 0, 5], [10, 20, 0], [10, 10, 0]]) {
    assert(LEVEL_STATES.includes(classifyLevel(p, n, t).state), 'undeclared state');
  }
});

// ---------------------------------------------------------------------------
// 4. Composite directional read
// ---------------------------------------------------------------------------

section('directional state');

const emptyDelta = (overrides = {}) => ({
  counts: Object.fromEntries(LEVEL_STATES.map((s) => [s, 0])),
  absorbed_volume: 0, pulled_size: 0, depth_delta: 0, ...overrides,
});

test('buyers eating an ask that holds is absorption, not continuation', () => {
  const ask = emptyDelta({ counts: { ...emptyDelta().counts, ABSORPTION: 3 }, absorbed_volume: 50 });
  const bid = emptyDelta({ depth_delta: 0 });
  const s = directionalState({ taker_buy_ratio: 0.8 }, bid, ask);
  assert(s.state === 'BUYERS_ABSORBED', `got ${s.state}`);
  assert(s.continuation === false, 'absorption implies a likely reversal, not continuation');
});

test('buyers eating an ask that is withdrawn is continuation', () => {
  const ask = emptyDelta({ counts: { ...emptyDelta().counts, PULL: 2, PULL_UNDER_PRESSURE: 1 }, pulled_size: 40 });
  const bid = emptyDelta({ depth_delta: 5 });
  const s = directionalState({ taker_buy_ratio: 0.8 }, bid, ask);
  assert(s.state === 'BUYERS_BREAKING_THROUGH', `got ${s.state}`);
  assert(s.continuation === true, 'a withdrawn wall implies continuation');
});

test('the mirror case holds for aggressive sellers', () => {
  const bid = emptyDelta({ counts: { ...emptyDelta().counts, ABSORPTION: 2 }, absorbed_volume: 30 });
  const ask = emptyDelta();
  assert(directionalState({ taker_buy_ratio: 0.2 }, bid, ask).state === 'SELLERS_ABSORBED', 'sellers absorbed');
  const bid2 = emptyDelta({ counts: { ...emptyDelta().counts, PULL: 3 }, pulled_size: 30 });
  const ask2 = emptyDelta({ depth_delta: 1 });
  assert(directionalState({ taker_buy_ratio: 0.2 }, bid2, ask2).state === 'SELLERS_BREAKING_THROUGH', 'sellers breaking');
});

test('the default is NO_SIGNAL, and no tape means no signal at all', () => {
  assert(directionalState(null, emptyDelta(), emptyDelta()).state === 'NO_SIGNAL', 'null flow');
  assert(directionalState({ taker_buy_ratio: null }, emptyDelta(), emptyDelta()).reason === 'NO_TAPE', 'no tape');
  const s = directionalState({ taker_buy_ratio: 0.8 }, emptyDelta(), emptyDelta());
  assert(s.state === 'NO_SIGNAL', 'flow without an agreeing book change is not a signal');
});

// ---------------------------------------------------------------------------
// 5. Book measurement and executable cost
// ---------------------------------------------------------------------------

section('book and execution');

const BOOK = { bids: [[100, 10], [99.9, 20], [99, 50]], asks: [[100.1, 10], [100.2, 20], [101, 50]] };

test('best bid and ask are the touch', () => {
  assert(bestBid(BOOK) === 100 && bestAsk(BOOK) === 100.1, 'touch prices');
});

test('depth within 10 bps counts only levels inside the band', () => {
  const bid = depthWithinBps(BOOK, 'BID', 10);
  assert(Math.abs(bid - (100 * 10 + 99.9 * 20)) < 1e-6, `expected the two inner levels, got ${bid}`);
  const ask = depthWithinBps(BOOK, 'ASK', 10);
  assert(Math.abs(ask - (100.1 * 10 + 100.2 * 20)) < 1e-6, `expected the two inner levels, got ${ask}`);
});

test('a depth walk returns an executable VWAP, never a candle close', () => {
  // The touch holds exactly 100.1 * 10 = 1001 notional, so 2000 must walk into the second level.
  const touchOnly = depthWalk(BOOK, 'BUY', 1001);
  assert(touchOnly.supported === true && Math.abs(touchOnly.vwap - 100.1) < 1e-9,
    `filling exactly the touch must price at the touch, got ${touchOnly.vwap}`);

  const walked = depthWalk(BOOK, 'BUY', 2000);
  assert(walked.supported === true, 'the tier should be supported');
  assert(walked.vwap > 100.1 && walked.vwap < 100.2,
    `walking two levels must price strictly between them, got ${walked.vwap}`);

  const sell = depthWalk(BOOK, 'SELL', 2000);
  assert(sell.vwap < 100 && sell.vwap > 99.9, `a sell walks down the bids, got ${sell.vwap}`);
});

test('a tier deeper than the book is UNSUPPORTED, not an assumed fill', () => {
  const w = depthWalk(BOOK, 'BUY', 1e9);
  assert(w.supported === false && w.reason === 'INSUFFICIENT_DEPTH', 'must refuse to assume a fill');
  assert(depthWalk({ bids: [], asks: [] }, 'BUY', 100).reason === 'EMPTY_BOOK', 'empty book');
});

test('the declared size tiers are $7, $200 and $1k', () => {
  assert(JSON.stringify(FROZEN.size_tiers_usd) === JSON.stringify([7, 200, 1000]), 'frozen tiers');
});

// ---------------------------------------------------------------------------
// 6. Layer 4 — open interest and liquidations
// ---------------------------------------------------------------------------

section('open interest and liquidations');

test('open interest takes the last observation in each bucket', () => {
  const rows = [
    { ts: T0 + 1000, symbol: 'X', open_interest: 100 },
    { ts: T0 + 50_000, symbol: 'X', open_interest: 90 },
  ];
  const b = [...openInterestByBucket(rows).values()][0];
  assert(b.open_interest === 90, 'the latest observation in the bucket wins');
});

test('liquidation notional is split by side', () => {
  const rows = [
    { ts: T0, symbol: 'X', side: 'LONG', notional: 1000 },
    { ts: T0 + 1000, symbol: 'X', side: 'SHORT', notional: 400 },
    { ts: T0 + 2000, symbol: 'X', side: 'LONG', notional: 500 },
  ];
  const b = [...liquidationsByBucket(rows).values()][0];
  assert(b.long_notional === 1500 && b.short_notional === 400, 'side split');
});

// ---------------------------------------------------------------------------
// 7. Thresholds, detection, statistics
// ---------------------------------------------------------------------------

section('detection and statistics');

function featureSeries(n) {
  return Array.from({ length: n }, (_, i) => ({
    symbol: 'X',
    bucket: T0 + i * MIN,
    signed_volume: i < n * 0.55 ? -i : -1,
    oi_change_5m: -i,
    long_liquidation_notional: i,
    short_liquidation_notional: 0,
    bid_depth_min: 10, bid_depth_final: 100,
    ask_depth_min: 10, ask_depth_final: 100,
    best_bid_recovery_bps: 0, best_ask_recovery_bps: 0,
  }));
}

test('thresholds are fitted on the train segment only', () => {
  const features = featureSeries(200);
  const chrono = chronology(features);
  const t = fitTrainThresholds(features, chrono);
  const trainOnly = features.filter((_, i) => chrono.splitOf(i) === 'train');
  assert(t.get('X').train_buckets === trainOnly.length, 'only train buckets may be fitted');
  const expected = percentile(trainOnly.map((f) => f.signed_volume), FROZEN.q_signed_volume);
  assert(t.get('X').signed_volume_p05 === expected, 'the quantile must come from train alone');
});

test('splits are chronological 55/20/15/10', () => {
  const c = chronology(new Array(1000));
  assert(c.trainEnd === 550 && c.validationEnd === 750 && c.holdoutEnd === 900, 'split boundaries');
});

test('the long fade needs all four conditions together', () => {
  const thresholds = new Map([['X', {
    signed_volume_p05: -50, signed_volume_p95: 50, oi_change_p10: -10,
    long_liq_p95: 100, short_liq_p95: 100, train_buckets: 10,
  }]]);
  const base = {
    symbol: 'X', signed_volume: -100, oi_change_5m: -20, long_liquidation_notional: 200,
    short_liquidation_notional: 0, bid_depth_min: 10, bid_depth_final: 100,
    ask_depth_min: 10, ask_depth_final: 100, best_bid_recovery_bps: 1, best_ask_recovery_bps: 1,
  };
  assert(detectEvent(base, thresholds)?.side === 'LONG', 'all four conditions met should fire');
  assert(detectEvent({ ...base, signed_volume: 0 }, thresholds) === null, 'without extreme sell flow, no event');
  assert(detectEvent({ ...base, oi_change_5m: 5 }, thresholds) === null, 'without OI reduction, no event');
  assert(detectEvent({ ...base, long_liquidation_notional: 0 }, thresholds) === null, 'without liquidations, no event');
  assert(detectEvent({ ...base, bid_depth_final: 10 }, thresholds) === null, 'without replenishment, no event');
  assert(detectEvent({ ...base, best_bid_recovery_bps: 50 }, thresholds) === null, 'without price recovery, no event');
});

test('the short fade is the exact mirror', () => {
  const thresholds = new Map([['X', {
    signed_volume_p05: -50, signed_volume_p95: 50, oi_change_p10: -10,
    long_liq_p95: 100, short_liq_p95: 100, train_buckets: 10,
  }]]);
  const short = {
    symbol: 'X', signed_volume: 100, oi_change_5m: -20, long_liquidation_notional: 0,
    short_liquidation_notional: 200, bid_depth_min: 10, bid_depth_final: 100,
    ask_depth_min: 10, ask_depth_final: 100, best_bid_recovery_bps: 1, best_ask_recovery_bps: 1,
  };
  assert(detectEvent(short, thresholds)?.side === 'SHORT', 'the mirror must fire');
});

test('a missing OI observation blocks detection rather than defaulting', () => {
  const thresholds = new Map([['X', { signed_volume_p05: -50, signed_volume_p95: 50, oi_change_p10: -10, long_liq_p95: 100, short_liq_p95: 100 }]]);
  assert(detectEvent({ symbol: 'X', signed_volume: -100, oi_change_5m: null, long_liquidation_notional: 200 }, thresholds) === null,
    'a null OI change must not be treated as zero');
});

test('drawdown is computed in bucket order, not input order', () => {
  const rows = [
    { symbol: 'X', bucket: T0 + 4 * MIN, gross_bps: -300 },
    { symbol: 'X', bucket: T0, gross_bps: 200 },
    { symbol: 'X', bucket: T0 + 3 * MIN, gross_bps: -300 },
    { symbol: 'X', bucket: T0 + MIN, gross_bps: 200 },
  ];
  assert(stats(rows).max_drawdown_bps === -600, `expected -600, got ${stats(rows).max_drawdown_bps}`);
});

test('costs are subtracted, and double cost is twice the roundtrip', () => {
  const rows = [{ symbol: 'X', bucket: T0, gross_bps: 30 }];
  assert(stats(rows, FROZEN.cost_bps_roundtrip).net_mean_bps === 30 - 11, 'single cost');
  assert(stats(rows, FROZEN.double_cost_bps_roundtrip).net_mean_bps === 30 - 22, 'double cost');
  assert(FROZEN.double_cost_bps_roundtrip === 2 * FROZEN.cost_bps_roundtrip, 'double must be twice');
});

// ---------------------------------------------------------------------------
// 8. Matched null
// ---------------------------------------------------------------------------

section('matched null');

function nullPool(n) {
  return Array.from({ length: n }, (_, i) => ({
    symbol: 'X', side: 'LONG', bucket: T0 + i * MIN, liquidity_bucket: 'MID', gross_bps: (i % 7) - 3,
  }));
}

test('the null matches symbol, side, time of day and liquidity bucket', () => {
  const events = [{ symbol: 'X', side: 'LONG', bucket: T0, liquidity_bucket: 'MID', gross_bps: 40 }];
  const pool = [
    { symbol: 'Y', side: 'LONG', bucket: T0, liquidity_bucket: 'MID', gross_bps: 999 },
    { symbol: 'X', side: 'SHORT', bucket: T0, liquidity_bucket: 'MID', gross_bps: 999 },
    { symbol: 'X', side: 'LONG', bucket: T0, liquidity_bucket: 'THIN', gross_bps: 999 },
    { symbol: 'X', side: 'LONG', bucket: T0, liquidity_bucket: 'MID', gross_bps: 5 },
  ];
  const r = matchedNull(events, pool, 20, 7);
  assert(r.null_median_bps === 5 - FROZEN.cost_bps_roundtrip, `only the fully matched row may be drawn, got ${r.null_median_bps}`);
});

test('the null is two sided and deterministic for a fixed seed', () => {
  const events = [{ symbol: 'X', side: 'LONG', bucket: T0, liquidity_bucket: 'MID', gross_bps: 40 }];
  const pool = nullPool(50);
  const a = matchedNull(events, pool, 100, 5);
  const b = matchedNull(events, pool, 100, 5);
  assert(a.two_sided === true, 'the p-value must be two sided');
  assert(a.p_value === b.p_value, 'same seed must reproduce');
  assert(a.p_value >= 0 && a.p_value <= 1, 'p must be a probability');
});

test('an empty pool yields a null p-value rather than a false pass', () => {
  const r = matchedNull([{ symbol: 'X', side: 'LONG', bucket: T0, liquidity_bucket: 'MID', gross_bps: 1 }], []);
  assert(r.p_value === null, 'no matched control means no p-value');
});

test('the protocol requires at least one thousand null samples', () => {
  assert(FROZEN.null_samples >= 1000, 'null sample floor');
});

// ---------------------------------------------------------------------------
// 9. Verdict ordering
// ---------------------------------------------------------------------------

section('verdicts');

const passing = () => ({
  holdout: { n: 150, symbols: 8, days: 40, net_mean_bps: 12, net_median_bps: 10 },
  forward: { n: 130, symbols: 7, days: 35, net_mean_bps: 9, net_median_bps: 8 },
  null: { p_value: 0.001 },
  double_cost_oos: { net_median_bps: 3 },
  remove_best_symbol: { net_total_bps: 900 },
  remove_best_day: { net_total_bps: 800 },
  concentration: { max_symbol_share: 0.1 },
  exit_neighbours: [{ stats: { net_mean_bps: 4 } }, { stats: { net_mean_bps: 6 } }],
  overlap: { status: 'MEASURED', blocking: false },
});

test('thin data outranks a positive result', () => {
  for (const mutate of [
    (r) => { r.holdout.n = 10; },
    (r) => { r.forward.symbols = 2; },
    (r) => { r.holdout.days = 5; },
  ]) {
    const r = passing();
    mutate(r);
    assert(verdictFor(r) === 'DATA_INADEQUATE', 'insufficient sample must gate first');
  }
});

test('an unmeasured overlap blocks before any statistic is credited', () => {
  const r = passing();
  r.overlap = { status: 'UNAVAILABLE', blocking: true };
  assert(verdictFor(r) === 'DUPLICATE_OR_OVERLAP', `got ${verdictFor(r)}`);
});

test('a non-positive or insignificant OOS result rejects the family', () => {
  for (const mutate of [
    (r) => { r.holdout.net_median_bps = -1; },
    (r) => { r.forward.net_mean_bps = 0; },
    (r) => { r.null.p_value = 0.4; },
    (r) => { r.null.p_value = null; },
  ]) {
    const r = passing();
    mutate(r);
    assert(verdictFor(r) === 'OOS_FAIL_REJECT_FAMILY', 'expected an OOS rejection');
  }
});

test('each robustness breach deprioritizes', () => {
  for (const mutate of [
    (r) => { r.double_cost_oos.net_median_bps = -1; },
    (r) => { r.remove_best_symbol.net_total_bps = -5; },
    (r) => { r.remove_best_day.net_total_bps = 0; },
    (r) => { r.concentration.max_symbol_share = 0.6; },
    (r) => { r.exit_neighbours[0].stats.net_mean_bps = -2; },
  ]) {
    const r = passing();
    mutate(r);
    assert(verdictFor(r) === 'ROBUSTNESS_FAIL_DEPRIORITIZE', 'expected a robustness deprioritization');
  }
});

test('a passport draft needs every gate including a measured overlap', () => {
  assert(verdictFor(passing()) === 'CANDIDATE_PASSPORT_DRAFT', 'the fully passing case');
  assert(OVERLAP_FAMILIES.length >= 7, 'all comparison families must be declared');
});

test('the frozen exits are five minutes with three and fifteen as neighbours', () => {
  assert(FROZEN.primary_exit_minutes === 5, 'primary exit');
  assert(JSON.stringify(FROZEN.exit_neighbour_minutes) === JSON.stringify([3, 15]), 'neighbours');
  assert(FROZEN.entry_label === 'NEXT_MINUTE_BOOK_REFERENCE_ONLY', 'entry label');
});

// ---------------------------------------------------------------------------
// 10. Determinism and output
// ---------------------------------------------------------------------------

section('determinism');

test('two identical runs are byte-identical and carry no timestamp', () => {
  const a = JSON.stringify(run({}, readerFor({})));
  const b = JSON.stringify(run({}, readerFor({})));
  assert(a === b, 'the run is not deterministic');
  for (const banned of ['"generated_at"', '"run_ts"', '"executed_at"']) {
    assert(!a.includes(banned), `must not embed ${banned}`);
  }
});

test('promising_count is zero', () => {
  assert(run({}, readerFor({})).promising_count === 0, 'promising_count must be 0');
});

test('the csv is well formed even with no symbols', () => {
  const csv = toCsv(run({}, readerFor({})));
  const lines = csv.trim().split('\n');
  assert(lines[0].startsWith('symbol,'), 'header');
  assert(lines.length >= 2, 'a placeholder row must be present');
});

test('the seeded PRNG is stable', () => {
  assert(JSON.stringify(Array.from({ length: 4 }, seeded(9))) === JSON.stringify(Array.from({ length: 4 }, seeded(9))), 'stable');
});

test('an unknown argument is rejected', () => {
  let threw = false;
  try { parseArgs(['--wat']); } catch { threw = true; }
  assert(threw, 'unknown arguments must be rejected');
  assert(parseArgs(['--trades', 't.json']).paths.trades === 't.json', 'known arguments parse');
});

// ---------------------------------------------------------------------------
// 11. Static no-trading scan
// ---------------------------------------------------------------------------

section('static scan');

const ALLOWED_MODULES = new Set(['node:fs', 'node:path', 'node:url', './analysis/ah019_liquidation_toxic_flow_fade_1m.mjs']);

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
    // Anchored to a real import statement: a bare /from '...'/ also matches the inside of
    // a template literal, which is a scanner false positive rather than a module load.
    const mods = [
      ...[...src.matchAll(/\bimport\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
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

test('promising_count is never raised in code', () => {
  for (const file of SCANNED_FILES) {
    assert(!NONZERO_PROMISING.test(scannableSource(file)), `${file}: raises promising_count`);
  }
});

test('the engine writes only to an explicit --out base', () => {
  const src = scannableSource(ENGINE_PATH);
  assert((src.match(WRITE_CALL_RE) ?? []).length === 2, 'exactly two writes');
  assert(src.includes('if (opts.out)'), 'writes guarded by --out');
});

test('the test file writes nothing', () => {
  const src = scannableSource(TEST_PATH);
  for (const token of WRITE_TOKENS) assert(!src.includes(token), `must not write (${token})`);
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
const lines = ['TASK-AH-019 liquidation toxic-flow fade 1m — test suite', ''];
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
