// funding_pre_clearing_impulse.mjs — HYP.FUNDING_PRE_CLEARING_IMPULSE
//
// THE HYPOTHESIS
//
// In the 60 to 5 seconds before an 8-hour funding settlement (00:00, 08:00, 16:00 UTC),
// traders about to PAY funding close out and traders about to RECEIVE it step in, which
// should push price against the payer. With FR > 0 longs pay, so the thesis predicts
// downward pressure; with FR < 0, upward. Signed accordingly, the thesis predicts a
// POSITIVE impulse.
//
// WHY THIS IS NOT A RETRY OF CD.FUNDING_VELOCITY
//
// That closure measured a +/- 30 MINUTE window: 60.75 bps at settlement against 64.14 in
// matched controls, a difference of -3.38 at t=-1.23, i.e. settlement windows moved LESS.
// This window is 55 seconds, sixty-five times narrower. A 55-second impulse would be
// diluted to nothing inside a 30-minute average, so the wide null does not refute it. It
// does supply a strong prior, and the prior below respects that.
//
// ============================ PRE-REGISTERED, BEFORE ANY RUN ==================
//
// PRIMARY: all settlements, signed by the prevailing funding rate. The thesis is about
//   DIRECTION, which applies at any magnitude, so no magnitude filter gates the primary.
//
// SECONDARY, DECLARED UNDERPOWERED IN ADVANCE: the |FR| >= 0.03% subset the operator
//   proposed. Measured on the funding archive first: it covers 2.3 percent of
//   observations, because the median |FR| here is 0.0087 percent. It is reported, and it
//   is not the primary, and a positive result on 2 percent of the sample after a null
//   primary is a subgroup finding and will be labelled one.
//
// CONTROL: the identical 55-second window before every NON-settlement hour, signed by the
//   same funding rate. This is the load-bearing part. The wide study's entire finding was
//   that settlement windows stop looking special the moment they are compared to
//   something, so a raw pre-settlement move means nothing on its own.
//
// EXPECTATION: +0.50 to +2.50 bps over control, from the operator's registration.
//   Standing alongside it, this module's own view: the wide study reached at most 6.07 bps
//   over THIRTY MINUTES, and 55 seconds has less time to accumulate, not more, so the
//   honest centre is nearer the bottom of that range than the top.
//
// TWO SEPARATE VERDICTS, because the operator's registration conflated them:
//   PHYSICS   settlement minus control, resolvable at t=3  -> IMPULSE_EXISTS / NO_IMPULSE
//   ECONOMICS the same quantity against the 16 bps floor   -> TRADEABLE / BELOW_FLOOR
//   By the registered prior of 0.5-2.5 bps the economics verdict is BELOW_FLOOR before a
//   line runs. Recording that in advance is the point: it stops a real physical finding
//   from being read as a strategy.
// =============================================================================
//
// CAUSALITY: the funding rate used for an event is the last one observed at or before
// T-60s. Funding is published in advance, so this is known at decision time.
//
// Read-only. Writes only to --out.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseTickFile } from './g3_guard_execution_harness.mjs';

export const FROZEN = Object.freeze({
  module: 'FUNDING_PRE_CLEARING_IMPULSE',
  hypothesis_id: 'HYP.FUNDING_PRE_CLEARING_IMPULSE',
  settlement_hours_utc: Object.freeze([0, 8, 16]),
  window_start_s: -60,
  window_end_s: -5,
  // A price must be found within this of the window edge, or the event is rejected. The
  // G3 harness learned this the hard way: without it, a price from hours away gets matched
  // and produces a confident number from nothing.
  max_price_age_ms: 5_000,
  // Causal: the rate must be observed at or before the window opens.
  funding_max_age_ms: 30 * 60_000,
  high_fr_threshold: 0.0003,
  prior_range_bps: Object.freeze([0.5, 2.5]),
  cost_floor_bps: 16,
  resolve_at_t: 3,
});

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function isSettlementHour(ts) {
  return FROZEN.settlement_hours_utc.includes(new Date(ts).getUTCHours());
}

// Every hour boundary in [from, to], tagged settlement or control.
export function hourBoundaries(from, to) {
  const out = [];
  const H = 3_600_000;
  let t = Math.ceil(from / H) * H;
  for (; t <= to; t += H) out.push({ ts: t, settlement: isSettlementHour(t) });
  return out;
}

// Positive = consistent with the thesis. FR > 0 (longs pay) predicts price DOWN, so the
// raw return is flipped by the sign of the rate.
export function signedImpulseBps(fundingRate, pxStart, pxEnd) {
  if (!(pxStart > 0) || !(pxEnd > 0) || !Number.isFinite(fundingRate) || fundingRate === 0) return null;
  const raw = 1e4 * ((pxEnd - pxStart) / pxStart);
  return -Math.sign(fundingRate) * raw;
}

export function priceAt(prices, target) {
  if (!prices.length) return null;
  let lo = 0; let hi = prices.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (prices[m].ts < target) lo = m + 1; else hi = m; }
  const after = lo < prices.length ? prices[lo] : null;
  const before = lo > 0 ? prices[lo - 1] : null;
  const cand = [before, after].filter(Boolean)
    .map((p) => ({ p, d: Math.abs(p.ts - target) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!cand || cand.d > FROZEN.max_price_age_ms) return null;
  return cand.p;
}

// Last funding observation at or before `target`. Never after: that would be lookahead.
export function fundingAt(rates, target) {
  if (!rates.length) return null;
  let lo = 0; let hi = rates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (rates[m].ts <= target) lo = m + 1; else hi = m; }
  const r = lo > 0 ? rates[lo - 1] : null;
  if (!r) return null;
  if (target - r.ts > FROZEN.funding_max_age_ms) return null;
  return r;
}

export function measureEvent(prices, rates, boundaryTs) {
  const startTs = boundaryTs + FROZEN.window_start_s * 1000;
  const endTs = boundaryTs + FROZEN.window_end_s * 1000;
  const fr = fundingAt(rates, startTs);
  if (!fr) return { status: 'NO_FUNDING' };
  const a = priceAt(prices, startTs);
  if (!a) return { status: 'NO_START_PRICE' };
  const b = priceAt(prices, endTs);
  if (!b) return { status: 'NO_END_PRICE' };
  const imp = signedImpulseBps(fr.rate, a.px, b.px);
  if (imp == null) return { status: 'ZERO_OR_BAD_RATE' };
  return { status: 'OK', impulse_bps: imp, funding_rate: fr.rate, abs_fr: Math.abs(fr.rate), boundary_ts: boundaryTs };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function moments(values) {
  const n = values.length;
  if (n < 2) return { n, mean: null, se: null, t: null };
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const varr = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(varr / n);
  return { n, mean, se, t: se > 0 ? mean / se : null };
}

// Events at the same instant across symbols move together, so a naive SE over
// symbol-events overstates precision. This clusters on the boundary timestamp: the unit
// of independence is the settlement, not the symbol-settlement.
export function clusteredMoments(events) {
  const byTs = new Map();
  for (const e of events) {
    if (!byTs.has(e.boundary_ts)) byTs.set(e.boundary_ts, []);
    byTs.get(e.boundary_ts).push(e.impulse_bps);
  }
  const clusterMeans = [...byTs.values()].map((v) => v.reduce((s, x) => s + x, 0) / v.length);
  return { ...moments(clusterMeans), clusters: byTs.size, symbol_events: events.length };
}

export function compare(testStats, controlStats) {
  if (testStats.mean == null || controlStats.mean == null) return { difference_bps: null, t: null };
  const diff = testStats.mean - controlStats.mean;
  const se = Math.hypot(testStats.se, controlStats.se);
  return { difference_bps: diff, se_bps: se, t: se > 0 ? diff / se : null };
}

export function verdicts(comparison) {
  const t = comparison.t;
  const d = comparison.difference_bps;
  if (t == null || Math.abs(t) < FROZEN.resolve_at_t) {
    return { physics: 'UNRESOLVED', economics: 'UNRESOLVED' };
  }
  return {
    physics: d > 0 ? 'IMPULSE_EXISTS' : 'IMPULSE_INVERTED',
    economics: d >= FROZEN.cost_floor_bps ? 'TRADEABLE' : 'BELOW_FLOOR',
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadFunding(path) {
  const bySymbol = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const [ts, sym, rate] = line.split(' ');
    const r = Number(rate);
    if (!sym || !Number.isFinite(r)) continue;
    (bySymbol[sym] ??= []).push({ ts: Number(ts), rate: r });
  }
  for (const k of Object.keys(bySymbol)) bySymbol[k].sort((a, b) => a.ts - b.ts);
  return bySymbol;
}

export function loadTicks(dirs) {
  const bySymbol = {};
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      const m = /^(.+)\.ticks\.txt$/.exec(f);
      if (!m) continue;
      const parsed = parseTickFile(readFileSync(join(dir, f), 'utf8'));
      // push(...parsed) blows the call stack on a multi-million-element tape.
      const dest = (bySymbol[m[1]] ??= []);
      for (const p of parsed) dest.push(p);
    }
  }
  for (const k of Object.keys(bySymbol)) bySymbol[k].sort((a, b) => a.ts - b.ts);
  return bySymbol;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const o = { ticks: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (a === '--ticks') o.ticks.push(next());
    else if (a === '--funding') o.funding = next();
    else if (a === '--out') o.out = next();
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.ticks.length || !opts.funding) {
    process.stdout.write('usage: --ticks <dir> [--ticks <dir>...] --funding <file> [--out <base>]\n');
    return opts.help ? 0 : 1;
  }

  const funding = loadFunding(opts.funding);
  const ticks = loadTicks(opts.ticks);
  const symbols = Object.keys(ticks).filter((s) => funding[s]?.length && ticks[s].length).sort();

  const settle = []; const control = [];
  const rejects = new Map();
  const perSymbol = [];

  for (const sym of symbols) {
    const px = ticks[sym]; const fr = funding[sym];
    const from = Math.max(px[0].ts, fr[0].ts);
    const to = Math.min(px[px.length - 1].ts, fr[fr.length - 1].ts);
    const s = []; const c = [];
    for (const b of hourBoundaries(from, to)) {
      const r = measureEvent(px, fr, b.ts);
      if (r.status !== 'OK') { rejects.set(r.status, (rejects.get(r.status) ?? 0) + 1); continue; }
      const rec = { ...r, symbol: sym };
      if (b.settlement) { settle.push(rec); s.push(rec); } else { control.push(rec); c.push(rec); }
    }
    if (s.length > 1) {
      perSymbol.push({
        symbol: sym,
        settlement: moments(s.map((x) => x.impulse_bps)),
        control: moments(c.map((x) => x.impulse_bps)),
      });
    }
  }

  const build = (sSet, cSet, label) => {
    const st = clusteredMoments(sSet);
    const ct = clusteredMoments(cSet);
    const cmp = compare(st, ct);
    return { label, settlement: st, control: ct, comparison: cmp, verdicts: verdicts(cmp) };
  };

  const primary = build(settle, control, 'PRIMARY_ALL_SETTLEMENTS_SIGNED');
  const hi = FROZEN.high_fr_threshold;
  const secondary = build(
    settle.filter((x) => x.abs_fr >= hi),
    control.filter((x) => x.abs_fr >= hi),
    'SECONDARY_HIGH_FR_DECLARED_UNDERPOWERED',
  );

  const report = {
    module: FROZEN.module,
    frozen: FROZEN,
    symbols: symbols.length,
    primary,
    secondary,
    prior_check: {
      registered_range_bps: FROZEN.prior_range_bps,
      measured_bps: primary.comparison.difference_bps,
      inside_range: primary.comparison.difference_bps != null
        && primary.comparison.difference_bps >= FROZEN.prior_range_bps[0]
        && primary.comparison.difference_bps <= FROZEN.prior_range_bps[1],
    },
    rejects: Object.fromEntries(rejects),
    per_symbol: perSymbol,
  };

  if (opts.out) {
    writeFileSync(`${opts.out}.json`, `${JSON.stringify(report, null, 1)}\n`);
    const rows = ['symbol,settle_n,settle_mean_bps,settle_t,control_n,control_mean_bps,control_t'];
    for (const p of perSymbol) {
      rows.push([p.symbol, p.settlement.n, p.settlement.mean, p.settlement.t,
        p.control.n, p.control.mean, p.control.t].join(','));
    }
    writeFileSync(`${opts.out}.csv`, `${rows.join('\n')}\n`);
    process.stdout.write(`wrote ${opts.out}.json and ${opts.out}.csv\n`);
  }

  process.stdout.write(`${JSON.stringify({ ...report, per_symbol: undefined, frozen: undefined }, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
