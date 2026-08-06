// Tests for the two forward collectors.
import assert from 'node:assert';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FROZEN as LIQ, topicsFor, chunk, backoffMs, toRecords, gapRecord, dayOf, heartbeatRecord,
} from './collectors/liquidation_recorder.mjs';
import {
  FROZEN as OI, toRow, buildCycle, failureRecord, createRecorder as createOi,
} from './collectors/oi_high_freq_recorder.mjs';

let total = 0; let passed = 0;
const t = (name, fn) => {
  total += 1;
  try { fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};
const ta = async (name, fn) => {
  total += 1;
  try { await fn(); passed += 1; } catch (e) { process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
};

// --- liquidation recorder ----------------------------------------------------

// The exact frame captured from the live feed before the module was written.
const LIVE = {
  topic: 'allLiquidation.ADAUSDT',
  type: 'snapshot',
  ts: 1786014947330,
  data: [{ T: 1786014946933, s: 'ADAUSDT', S: 'Sell', v: '13248', p: '0.1915' }],
};

t('the real captured frame parses to exactly one record', () => {
  const r = toRecords(LIVE, 1786014947400);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].symbol, 'ADAUSDT');
  assert.strictEqual(r[0].price, 0.1915);
  assert.strictEqual(r[0].qty, 13248);
  assert.ok(Math.abs(r[0].size_usd - 2536.992) < 1e-6, `got ${r[0].size_usd}`);
});

t('both clocks are kept, so feed latency stays measurable', () => {
  const r = toRecords(LIVE, 1786014947400)[0];
  assert.strictEqual(r.exchange_ts, 1786014946933);
  assert.strictEqual(r.ingest_ts, 1786014947400);
  assert.strictEqual(r.frame_ts, 1786014947330);
  assert.ok(r.ingest_ts > r.exchange_ts, 'ingest must follow the exchange stamp');
});

t('the ambiguous side field is stored verbatim and never reinterpreted', () => {
  const r = toRecords(LIVE, 1)[0];
  assert.strictEqual(r.S, 'Sell');
  // If any of these ever appear, someone has baked a direction convention into the
  // archive that cannot be undone. That is the failure this test exists to prevent.
  for (const k of ['side', 'side_liquidated', 'liquidated_side', 'direction', 'isLong']) {
    assert.ok(!(k in r), `interpretive field "${k}" must not be written`);
  }
});

t('a frame from another topic is ignored', () => {
  assert.deepStrictEqual(toRecords({ topic: 'tickers.BTCUSDT', data: [{ p: '1', v: '1' }] }, 1), []);
});

t('malformed frames yield nothing instead of throwing', () => {
  for (const bad of [null, undefined, 42, 'x', {}, { topic: 'allLiquidation.X' }, { topic: 'allLiquidation.X', data: 'no' }]) {
    assert.deepStrictEqual(toRecords(bad, 1), [], `threw or returned on ${JSON.stringify(bad)}`);
  }
});

t('rows with a zero or negative price or size are dropped', () => {
  const m = { topic: 'allLiquidation.X', ts: 1, data: [
    { T: 1, s: 'X', S: 'Buy', v: '0', p: '10' },
    { T: 1, s: 'X', S: 'Buy', v: '5', p: '0' },
    { T: 1, s: 'X', S: 'Buy', v: '5', p: '10' },
  ] };
  assert.strictEqual(toRecords(m, 1).length, 1);
});

t('a gap record states the exact missing interval and refuses the wrong reading', () => {
  const g = gapRecord(1000, 4000, 'RECONNECT', 37);
  assert.strictEqual(g._gap, true);
  assert.strictEqual(g.missing_ms, 3000);
  assert.ok(/NOT evidence of no liquidations/.test(g.note));
});

t('a heartbeat proves the recorder was up while the market was silent', () => {
  // Found by running: 75 seconds connected, zero liquidations, no file created at all.
  // Without this record an outage and a quiet market are the same bytes on disk.
  const h = heartbeatRecord(9, 37, 5, 0);
  assert.strictEqual(h._alive, true);
  assert.strictEqual(h.connected_since, 5);
  assert.ok(/not no data/.test(h.note));
});

t('the heartbeat interval is short enough to bound any silent hole', () => {
  assert.ok(LIQ.heartbeat_ms > 0 && LIQ.heartbeat_ms <= 600_000, 'a hole must be bounded by minutes, not hours');
});

t('topics carry the verified prefix', () => {
  assert.deepStrictEqual(topicsFor(['BTCUSDT']), ['allLiquidation.BTCUSDT']);
  assert.strictEqual(LIQ.topic_prefix, 'allLiquidation.');
});

t('subscribe args are chunked to the frame limit with nothing lost', () => {
  const args = Array.from({ length: 37 }, (_, i) => `t${i}`);
  const c = chunk(args, 10);
  assert.strictEqual(c.length, 4);
  assert.deepStrictEqual(c.flat(), args);
});

t('backoff grows, is capped, and is jittered', () => {
  assert.strictEqual(backoffMs(0, () => 1), LIQ.backoff_base_ms);
  assert.strictEqual(backoffMs(3, () => 1), 8 * LIQ.backoff_base_ms);
  assert.strictEqual(backoffMs(99, () => 1), LIQ.backoff_max_ms);
  assert.strictEqual(backoffMs(5, () => 0), 0, 'full jitter must be able to reach zero');
  assert.ok(backoffMs(5, () => 0.5) < backoffMs(5, () => 1), 'jitter must vary the delay');
});

t('backoff never goes negative on a negative attempt', () => {
  assert.ok(backoffMs(-3, () => 1) >= 0);
});

t('dayOf is UTC, so files do not shift with the host timezone', () => {
  assert.strictEqual(dayOf(Date.UTC(2026, 7, 6, 23, 59, 59)), '2026-08-06');
});

// --- OI recorder -------------------------------------------------------------

t('a ticker becomes a compact row', () => {
  const r = toRow({ symbol: 'AAVEUSDT', openInterest: '475209.76', lastPrice: '90.38', fundingRate: '-0.00002443' });
  assert.deepStrictEqual(r, ['AAVEUSDT', 475209.76, 90.38, -0.00002443]);
});

t('a ticker without a usable price or open interest is rejected', () => {
  assert.strictEqual(toRow({ symbol: 'X', openInterest: 'abc', lastPrice: '1' }), null);
  assert.strictEqual(toRow({ symbol: 'X', openInterest: '1', lastPrice: '0' }), null);
  assert.strictEqual(toRow(null), null);
});

t('a missing funding rate is null rather than zero', () => {
  const r = toRow({ symbol: 'X', openInterest: '1', lastPrice: '2' });
  assert.strictEqual(r[3], null, 'zero would be a real funding rate and a lie here');
});

t('a cycle keeps only wanted symbols and counts the ones that vanished', () => {
  const list = [
    { symbol: 'A', openInterest: '1', lastPrice: '1' },
    { symbol: 'Z', openInterest: '1', lastPrice: '1' },
  ];
  const c = buildCycle(list, ['A', 'B'], 111, 42);
  assert.strictEqual(c.n, 1);
  assert.strictEqual(c.missing, 1, 'B disappeared and must be counted, not ignored');
  assert.strictEqual(c.t, 111);
  assert.strictEqual(c.cycle_ms, 42);
});

t('a failed cycle is recorded as missing, never as unchanged', () => {
  const f = failureRecord(5, 'TIMEOUT', 37);
  assert.strictEqual(f._fail, true);
  assert.strictEqual(f.t, 5);
  assert.ok(/never as unchanged/.test(f.note));
});

t('the OI grid matches the book recorder so the two can be joined', () => {
  assert.strictEqual(OI.interval_ms, 10_000);
  assert.ok(/ob_recorder/.test(OI.aligned_with));
});

await ta('a failing fetch writes a failure line and keeps running', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oi-'));
  const rec = createOi({
    symbols: ['A'], root, now: () => Date.UTC(2026, 7, 6, 12),
    fetchImpl: async () => { throw new Error('ECONNRESET'); },
  });
  await rec.cycle();
  const p = join(root, 'oi_10s', '2026-08-06.jsonl');
  assert.ok(existsSync(p), 'a failure must still produce a line');
  const line = JSON.parse(readFileSync(p, 'utf8').trim());
  assert.strictEqual(line._fail, true);
  assert.strictEqual(rec.counts.failures, 1);
});

await ta('a good fetch writes one cycle line with the wanted rows', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oi-'));
  const rec = createOi({
    symbols: ['A'], root, now: () => Date.UTC(2026, 7, 6, 12),
    fetchImpl: async () => ({ json: async () => ({ result: { list: [{ symbol: 'A', openInterest: '7', lastPrice: '2' }] } }) }),
  });
  await rec.cycle();
  const line = JSON.parse(readFileSync(join(root, 'oi_10s', '2026-08-06.jsonl'), 'utf8').trim());
  assert.strictEqual(line.n, 1);
  assert.deepStrictEqual(line.a[0], ['A', 7, 2, null]);
  assert.strictEqual(rec.counts.cycles, 1);
});

process.stdout.write(`total ${total}, passed ${passed}, failed ${total - passed}\n`);
process.exit(total === passed ? 0 : 1);
