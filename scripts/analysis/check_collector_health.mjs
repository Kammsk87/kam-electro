// check_collector_health.mjs
//
// Audits the two forward collectors deployed 2026-08-06.
//
// WHY THE OBVIOUS VERSION OF THIS IS DANGEROUS
//
// A health check that reads fields the archive does not have returns HEALTHY on a totally
// broken archive -- zero heartbeats and zero gaps look identical to a clean run. That is
// worse than no monitoring, because it manufactures confidence.
//
// So this module asserts the SHAPE first. Every record must match one of the known kinds;
// anything unrecognised is counted and reported as UNKNOWN_RECORD_SHAPE rather than
// skipped. A schema drift in the recorder therefore shows up as a failure here instead of
// as a quietly emptier audit. The field names below were read off the deployed modules,
// not guessed:
//
//   liquidations  data      { ingest_ts, exchange_ts, frame_ts, symbol, S, price, qty, size_usd }
//                 heartbeat { _alive: true, ts, symbols, connected_since, records_so_far }
//                 gap       { _gap: true, from_ts, to_ts, missing_ms, reason }
//   oi_10s        cycle     { t, n, missing, cycle_ms, a: [...] }
//                 failure   { t, _fail: true, reason }
//
// Read-only.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const THRESHOLDS = Object.freeze({
  // The recorder beats every 300 s. Allowing 350 s leaves room for scheduling jitter while
  // still catching a genuinely missed beat.
  heartbeat_max_gap_ms: 350_000,
  oi_interval_ms: 10_000,
  oi_interval_tolerance_ms: 500,
  // A cycle that takes longer than this is arriving on a grid it cannot hold.
  oi_max_request_ms: 5_000,
  max_fail_rate_pct: 1.0,
  max_gap_share_pct: 1.0,
});

export function classify(r) {
  if (!r || typeof r !== 'object') return 'UNKNOWN';
  if (r._alive === true) return 'HEARTBEAT';
  if (r._gap === true) return 'GAP';
  if (r._fail === true) return 'OI_FAIL';
  if (Array.isArray(r.a) && Number.isFinite(r.t)) return 'OI_CYCLE';
  if (Number.isFinite(r.ingest_ts) && Number.isFinite(r.price)) return 'LIQUIDATION';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Liquidation archive
// ---------------------------------------------------------------------------

export function auditLiquidations(records) {
  const kinds = { HEARTBEAT: 0, GAP: 0, LIQUIDATION: 0, UNKNOWN: 0 };
  const beats = [];
  const latencies = [];
  let totalGapMs = 0;
  let firstTs = null;
  let lastTs = null;
  const problems = [];

  for (const r of records) {
    const k = classify(r);
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k === 'HEARTBEAT') { beats.push(r.ts); firstTs ??= r.ts; lastTs = r.ts; }
    else if (k === 'GAP') { totalGapMs += r.missing_ms ?? 0; lastTs = r.to_ts ?? lastTs; }
    else if (k === 'LIQUIDATION') {
      firstTs ??= r.ingest_ts;
      lastTs = r.ingest_ts;
      if (Number.isFinite(r.exchange_ts)) latencies.push(r.ingest_ts - r.exchange_ts);
      // The interpretive-field ban is an archive invariant, so it is enforced here too and
      // not only in the recorder's own tests.
      for (const bad of ['side', 'side_liquidated', 'direction', 'isLong']) {
        if (bad in r) problems.push(`INTERPRETIVE_FIELD_IN_ARCHIVE:${bad}`);
      }
    }
  }

  beats.sort((a, b) => a - b);
  let worstBeatGap = 0;
  let missedBeats = 0;
  for (let i = 1; i < beats.length; i += 1) {
    const d = beats[i] - beats[i - 1];
    if (d > worstBeatGap) worstBeatGap = d;
    if (d > THRESHOLDS.heartbeat_max_gap_ms) missedBeats += 1;
  }

  if (kinds.UNKNOWN > 0) problems.push(`UNKNOWN_RECORD_SHAPE:${kinds.UNKNOWN}`);
  if (beats.length === 0) problems.push('NO_HEARTBEAT_AT_ALL');
  if (missedBeats > 0) problems.push(`MISSED_HEARTBEATS:${missedBeats}`);

  const spanMs = firstTs != null && lastTs != null ? Math.max(0, lastTs - firstTs) : 0;
  const gapSharePct = spanMs > 0 ? (100 * totalGapMs) / spanMs : 0;
  if (gapSharePct > THRESHOLDS.max_gap_share_pct) problems.push(`GAP_SHARE:${gapSharePct.toFixed(2)}%`);

  latencies.sort((a, b) => a - b);

  return {
    kinds,
    span_ms: spanMs,
    heartbeats: beats.length,
    worst_heartbeat_gap_ms: worstBeatGap,
    missed_heartbeats: missedBeats,
    gaps: kinds.GAP,
    total_gap_ms: totalGapMs,
    gap_share_pct: Number(gapSharePct.toFixed(4)),
    liquidations: kinds.LIQUIDATION,
    feed_latency_median_ms: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    feed_latency_p95_ms: latencies.length ? latencies[Math.floor(0.95 * (latencies.length - 1))] : null,
    problems,
    // A quiet market is not a fault. Only a missing heartbeat is. Reporting HEALTHY on zero
    // liquidations is correct and deliberate -- see the note in the recorder.
    status: problems.length === 0 ? 'HEALTHY' : 'DEGRADED',
  };
}

// ---------------------------------------------------------------------------
// Open-interest archive
// ---------------------------------------------------------------------------

export function auditOi(records, expectedSymbols = null) {
  const kinds = { OI_CYCLE: 0, OI_FAIL: 0, UNKNOWN: 0 };
  const stamps = [];
  const reqMs = [];
  const missingCounts = [];
  const problems = [];

  for (const r of records) {
    const k = classify(r);
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k === 'OI_CYCLE') {
      stamps.push(r.t);
      if (Number.isFinite(r.cycle_ms)) reqMs.push(r.cycle_ms);
      if (Number.isFinite(r.missing)) missingCounts.push(r.missing);
    } else if (k === 'OI_FAIL') stamps.push(r.t);
  }

  stamps.sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < stamps.length; i += 1) gaps.push(stamps[i] - stamps[i - 1]);
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;

  const total = kinds.OI_CYCLE + kinds.OI_FAIL;
  const failRate = total ? (100 * kinds.OI_FAIL) / total : 0;

  if (kinds.UNKNOWN > 0) problems.push(`UNKNOWN_RECORD_SHAPE:${kinds.UNKNOWN}`);
  if (medianGap != null && Math.abs(medianGap - THRESHOLDS.oi_interval_ms) > THRESHOLDS.oi_interval_tolerance_ms) {
    problems.push(`OFF_GRID:${medianGap}ms`);
  }
  if (failRate > THRESHOLDS.max_fail_rate_pct) problems.push(`FAIL_RATE:${failRate.toFixed(2)}%`);
  reqMs.sort((a, b) => a - b);
  const p95Req = reqMs.length ? reqMs[Math.floor(0.95 * (reqMs.length - 1))] : null;
  if (p95Req != null && p95Req > THRESHOLDS.oi_max_request_ms) problems.push(`SLOW_REQUESTS_P95:${p95Req}ms`);

  // A symbol that stops being quoted must surface, not vanish quietly. The recorder counts
  // it; this names it when the expected list is supplied.
  let absent = null;
  if (expectedSymbols && kinds.OI_CYCLE > 0) {
    const last = [...records].reverse().find((r) => classify(r) === 'OI_CYCLE');
    const seen = new Set((last.a ?? []).map((row) => row[0]));
    absent = expectedSymbols.filter((s) => !seen.has(s));
  }

  missingCounts.sort((a, b) => a - b);

  return {
    kinds,
    cycles: kinds.OI_CYCLE,
    failures: kinds.OI_FAIL,
    fail_rate_pct: Number(failRate.toFixed(4)),
    median_interval_ms: medianGap,
    request_ms_median: reqMs.length ? reqMs[Math.floor(reqMs.length / 2)] : null,
    request_ms_p95: p95Req,
    missing_symbols_median: missingCounts.length ? missingCounts[Math.floor(missingCounts.length / 2)] : null,
    absent_symbols: absent,
    problems,
    status: problems.length === 0 ? 'HEALTHY' : 'DEGRADED',
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function parseJsonl(text) {
  const out = [];
  let bad = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { bad += 1; }
  }
  return { records: out, unparsable: bad };
}

export function latestDayFile(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

function main(argv) {
  const root = argv[0] || '/opt/botalin-edge/logs';
  const uniPath = argv[1];
  let expected = null;
  if (uniPath && existsSync(uniPath)) {
    expected = JSON.parse(readFileSync(uniPath, 'utf8')).symbols.map((s) => s.symbol);
  }

  const report = { root, checked_at_note: 'timestamps come from the archive, not from this run' };

  const liqFile = latestDayFile(join(root, 'liquidations'));
  if (liqFile) {
    const { records, unparsable } = parseJsonl(readFileSync(liqFile, 'utf8'));
    report.liquidations = { file: liqFile, unparsable, ...auditLiquidations(records) };
    if (unparsable > 0) report.liquidations.problems.push(`UNPARSABLE_LINES:${unparsable}`);
  } else report.liquidations = { status: 'MISSING', problems: ['NO_ARCHIVE'] };

  const oiFile = latestDayFile(join(root, 'oi_10s'));
  if (oiFile) {
    const { records, unparsable } = parseJsonl(readFileSync(oiFile, 'utf8'));
    report.oi_10s = { file: oiFile, unparsable, ...auditOi(records, expected) };
    if (unparsable > 0) report.oi_10s.problems.push(`UNPARSABLE_LINES:${unparsable}`);
  } else report.oi_10s = { status: 'MISSING', problems: ['NO_ARCHIVE'] };

  report.overall = [report.liquidations.status, report.oi_10s.status].every((s) => s === 'HEALTHY')
    ? 'HEALTHY' : 'DEGRADED';

  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
  return report.overall === 'HEALTHY' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
