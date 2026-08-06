// Tests for check_collector_health.mjs
import assert from 'node:assert';
import {
  THRESHOLDS, classify, auditLiquidations, auditOi, parseJsonl,
} from './analysis/check_collector_health.mjs';

let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

const beat = (ts) => ({ _alive: true, ts, symbols: 37, connected_since: 1, records_so_far: 0 });
const liq = (ts, lat = 250) => ({
  ingest_ts: ts, exchange_ts: ts - lat, frame_ts: ts - 50,
  symbol: 'LINKUSDT', S: 'Sell', price: 8.256, qty: 66.7, size_usd: 550.6752,
});
const cyc = (t2, missing = 0, cycleMs = 400) => ({ t: t2, n: 36, missing, cycle_ms: cycleMs, a: [['BTCUSDT', 1, 2, null]] });

// --- the failure this module exists to prevent -------------------------------

t('an archive of the WRONG shape is DEGRADED, never silently HEALTHY', () => {
  // This is the specification's own bug: it reads r._type and r.gap_ms, neither of which
  // the recorder writes. A checker built that way sees zero heartbeats and zero gaps and
  // calls it healthy. Here the same records must be refused.
  const wrong = [{ _type: '_alive' }, { _type: '_gap', gap_ms: 5000 }];
  const r = auditLiquidations(wrong);
  assert.strictEqual(r.status, 'DEGRADED');
  assert.ok(r.problems.some((p) => p.startsWith('UNKNOWN_RECORD_SHAPE')), JSON.stringify(r.problems));
  assert.strictEqual(r.heartbeats, 0);
});

t('an empty archive is DEGRADED, because a dead recorder writes nothing', () => {
  const r = auditLiquidations([]);
  assert.strictEqual(r.status, 'DEGRADED');
  assert.ok(r.problems.includes('NO_HEARTBEAT_AT_ALL'));
});

// --- classification ----------------------------------------------------------

t('each real record kind is recognised', () => {
  assert.strictEqual(classify(beat(1)), 'HEARTBEAT');
  assert.strictEqual(classify({ _gap: true, from_ts: 1, to_ts: 2, missing_ms: 1 }), 'GAP');
  assert.strictEqual(classify({ t: 1, _fail: true, reason: 'TIMEOUT' }), 'OI_FAIL');
  assert.strictEqual(classify(cyc(1)), 'OI_CYCLE');
  assert.strictEqual(classify(liq(1000)), 'LIQUIDATION');
  assert.strictEqual(classify({ nonsense: 1 }), 'UNKNOWN');
  assert.strictEqual(classify(null), 'UNKNOWN');
});

// --- liquidations ------------------------------------------------------------

t('a quiet market with beats is HEALTHY: zero liquidations is not a fault', () => {
  const recs = [beat(0), beat(300_000), beat(600_000)];
  const r = auditLiquidations(recs);
  assert.strictEqual(r.status, 'HEALTHY');
  assert.strictEqual(r.liquidations, 0);
});

t('a missed heartbeat is caught', () => {
  const r = auditLiquidations([beat(0), beat(400_000)]);
  assert.strictEqual(r.missed_heartbeats, 1);
  assert.strictEqual(r.status, 'DEGRADED');
  assert.strictEqual(r.worst_heartbeat_gap_ms, 400_000);
});

t('a beat exactly at the tolerance is not a miss', () => {
  const r = auditLiquidations([beat(0), beat(THRESHOLDS.heartbeat_max_gap_ms)]);
  assert.strictEqual(r.missed_heartbeats, 0);
});

t('gap time is summed and expressed as a share of the span', () => {
  const recs = [beat(0), { _gap: true, from_ts: 10_000, to_ts: 40_000, missing_ms: 30_000 }, beat(300_000)];
  const r = auditLiquidations(recs);
  assert.strictEqual(r.total_gap_ms, 30_000);
  assert.ok(r.gap_share_pct > 1, `share ${r.gap_share_pct}`);
  assert.ok(r.problems.some((p) => p.startsWith('GAP_SHARE')));
});

t('feed latency percentiles are reported from both clocks', () => {
  const r = auditLiquidations([beat(0), liq(1000, 100), liq(2000, 200), liq(3000, 300)]);
  assert.strictEqual(r.feed_latency_median_ms, 200);
  assert.strictEqual(r.liquidations, 3);
});

t('an interpretive field appearing in the archive is a failure', () => {
  // The recorder forbids these. If one ever reaches disk the archive is compromised, so
  // the audit refuses it too rather than trusting the writer.
  const bad = { ...liq(1000), direction: 'LONG' };
  const r = auditLiquidations([beat(0), bad]);
  assert.ok(r.problems.some((p) => p.includes('INTERPRETIVE_FIELD_IN_ARCHIVE:direction')));
  assert.strictEqual(r.status, 'DEGRADED');
});

// --- open interest -----------------------------------------------------------

t('an on-grid archive is HEALTHY', () => {
  const r = auditOi([cyc(0), cyc(10_000), cyc(20_000), cyc(30_000)]);
  assert.strictEqual(r.status, 'HEALTHY');
  assert.strictEqual(r.median_interval_ms, 10_000);
  assert.strictEqual(r.failures, 0);
});

t('an off-grid cadence is caught', () => {
  const r = auditOi([cyc(0), cyc(30_000), cyc(60_000), cyc(90_000)]);
  assert.ok(r.problems.some((p) => p.startsWith('OFF_GRID')), JSON.stringify(r.problems));
});

t('failures count toward the grid and raise the fail rate', () => {
  const recs = [cyc(0), { t: 10_000, _fail: true, reason: 'TIMEOUT' }, cyc(20_000), cyc(30_000)];
  const r = auditOi(recs);
  assert.strictEqual(r.failures, 1);
  assert.ok(r.fail_rate_pct > THRESHOLDS.max_fail_rate_pct);
  assert.strictEqual(r.median_interval_ms, 10_000, 'a failed cycle still marks the grid');
});

t('slow requests are flagged before they push the cycle off grid', () => {
  const r = auditOi([cyc(0, 0, 9000), cyc(10_000, 0, 9000), cyc(20_000, 0, 9000)]);
  assert.ok(r.problems.some((p) => p.startsWith('SLOW_REQUESTS_P95')));
});

t('an absent symbol is named, not just counted', () => {
  const last = { t: 10_000, n: 1, missing: 1, cycle_ms: 400, a: [['BTCUSDT', 1, 2, null]] };
  const r = auditOi([cyc(0), last], ['BTCUSDT', 'AERGOUSDT']);
  assert.deepStrictEqual(r.absent_symbols, ['AERGOUSDT']);
});

t('unknown OI shapes are refused rather than skipped', () => {
  const r = auditOi([cyc(0), { garbage: true }]);
  assert.ok(r.problems.some((p) => p.startsWith('UNKNOWN_RECORD_SHAPE')));
  assert.strictEqual(r.status, 'DEGRADED');
});

// --- parsing -----------------------------------------------------------------

t('unparsable lines are counted, never dropped in silence', () => {
  const { records, unparsable } = parseJsonl('{"a":1}\nnot json\n\n{"b":2}\n');
  assert.strictEqual(records.length, 2);
  assert.strictEqual(unparsable, 1);
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
