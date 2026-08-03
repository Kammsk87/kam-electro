#!/usr/bin/env node
// market_neutral_funding_carry_v0.mjs
//
// TASK-AH-010 — Market-Neutral Funding Carry. Research only.
//
// STAGE 0 FEASIBILITY HARNESS. The accepted pipeline protocol requires a Stage 0 gate before
// any Stage 1 evaluation; AH-010 predates that protocol, so the gate is supplied here. It
// failed, so no Stage 1 was written.
//
// The gate order is deliberate and is the whole lesson of this task:
//
//   GATE 1  HEDGEABILITY   an asset with no tradeable spot cannot carry, at any premium
//   GATE 2  ECONOMICS      does funding net of basis drift cover the two-leg cost floor
//   GATE 3  CONCENTRATION  is the result carried by one asset
//   GATE 4  INDEPENDENCE   how many of the claimed observations actually are
//
// Hedgeability comes first because premium and hedgeability are not independent: where the
// premium is large the hedge is usually absent, and that is often *why* the premium is large.
// Measuring the premium before checking the hedge produces an attractive number about a trade
// that cannot be put on.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads explicitly supplied local files; writes only to an explicit --out.
// Deterministic: no clock, no randomness, no environment read.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  task: 'TASK-AH-010',
  stage: 0,
  structure: 'SHORT_PERP_LONG_SPOT',
  // Thresholds are the documented 10-12% annualised carry floor and multiples of it.
  annualised_thresholds: [0.10, 0.20, 0.50],
  hold_hours: [24, 72, 168],
  primary_hold_hours: 72,
  cost_bps_both_legs: 22,
  double_cost_bps: 44,
  train_fraction: 0.55,
  max_symbol_share: 0.25,
  min_events: 20,
  hours_per_year: 8760,
});

export const REQUIRED_FIELDS = Object.freeze(['ts', 'asset', 'funding', 'mark', 'oracle']);

// ---------------------------------------------------------------------------

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const stdev = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export function missingFields(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [...REQUIRED_FIELDS];
  const missing = new Set();
  for (const f of REQUIRED_FIELDS) {
    for (const r of rows) {
      const v = r?.[f];
      if (v === undefined || v === null || v === '') { missing.add(f); break; }
    }
  }
  return [...missing];
}

/** Basis of the perp over the index. The short-perp/long-spot P&L is minus its change. */
export const basis = (r) => (r.mark - r.oracle) / r.oracle;

// ---------------------------------------------------------------------------
// GATE 1 — hedgeability
// ---------------------------------------------------------------------------

/**
 * An asset is carryable only if a tradeable spot leg exists for it. This is a hard filter,
 * not a flag: a perp with no spot is a naked directional position, not a carry.
 */
export function partitionByHedgeability(rows, hedgeableAssets) {
  const set = new Set(hedgeableAssets);
  const hedgeable = [];
  const unhedgeable = [];
  for (const r of rows) (set.has(r.asset) ? hedgeable : unhedgeable).push(r);
  return {
    hedgeable,
    unhedgeable,
    hedgeable_assets: [...new Set(hedgeable.map((r) => r.asset))].sort(),
    unhedgeable_assets: [...new Set(unhedgeable.map((r) => r.asset))].sort(),
  };
}

// ---------------------------------------------------------------------------
// GATE 2 — economics
// ---------------------------------------------------------------------------

export function byAssetHour(rows) {
  const out = {};
  for (const r of rows) { (out[r.asset] ??= {})[r.ts] = r; }
  return out;
}

/**
 * One event per (asset, hour) where funding at entry clears the threshold. Funding accrues
 * hourly and is received by the short. TRAIN ONLY.
 */
export function carryEvents(index, hours, trainEndTs, thresholdPerHour, holdHours) {
  const ev = [];
  for (const [asset, m] of Object.entries(index)) {
    for (const h0 of hours) {
      if (h0 >= trainEndTs) break;
      const entry = m[h0];
      if (!entry || entry.funding < thresholdPerHour) continue;
      const exit = m[h0 + holdHours * 3600_000];
      if (!exit) continue;
      let accrued = 0;
      let complete = true;
      for (let k = 0; k < holdHours; k += 1) {
        const s = m[h0 + k * 3600_000];
        if (!s) { complete = false; break; }
        accrued += s.funding;
      }
      if (!complete) continue;
      const funding_bps = 1e4 * accrued;
      const basis_bps = -1e4 * (basis(exit) - basis(entry));
      ev.push({
        asset, ts: h0, day: new Date(h0).toISOString().slice(0, 10),
        funding_bps, basis_bps,
        gross_bps: funding_bps + basis_bps,
        net_bps: funding_bps + basis_bps - FROZEN.cost_bps_both_legs,
      });
    }
  }
  return ev;
}

// ---------------------------------------------------------------------------
// GATES 3 and 4 — concentration and independence
// ---------------------------------------------------------------------------

export function concentration(events) {
  const byAsset = {};
  for (const e of events) byAsset[e.asset] = (byAsset[e.asset] || 0) + e.net_bps;
  const entries = Object.entries(byAsset).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!entries.length) return { top_asset: null, top_share: null, without_best_mean_bps: null };
  const without = events.filter((e) => e.asset !== entries[0][0]).map((e) => e.net_bps);
  return {
    top_asset: entries[0][0],
    top_asset_net_bps: entries[0][1],
    total_net_bps: total,
    // Share can exceed 1 when the rest of the book is net negative — that is itself the finding.
    top_share: total !== 0 ? entries[0][1] / total : null,
    without_best_mean_bps: without.length ? mean(without) : null,
    without_best_n: without.length,
    breaches_share_cap: total !== 0 ? Math.abs(entries[0][1] / total) > FROZEN.max_symbol_share : null,
  };
}

/**
 * Entries taken every hour with a multi-hour hold overlap heavily. A t-statistic computed as
 * though they were independent is inflated by roughly the overlap factor.
 */
export function independence(events, holdHours, trainHours, assetCount) {
  const perAsset = Math.max(1, Math.floor(trainHours / holdHours));
  const effective = perAsset * Math.max(1, assetCount);
  return {
    claimed_n: events.length,
    non_overlapping_per_asset: perAsset,
    effective_n: effective,
    inflation_factor: events.length / effective,
    overlapping: events.length > effective,
  };
}

export function summarise(events, holdHours, trainHours) {
  if (events.length < FROZEN.min_events) return { hold_hours: holdHours, n: events.length, insufficient: true };
  const net = events.map((e) => e.net_bps);
  const assets = new Set(events.map((e) => e.asset));
  const conc = concentration(events);
  const ind = independence(events, holdHours, trainHours, assets.size);
  const m = mean(net);
  const sd = stdev(net);
  return {
    hold_hours: holdHours,
    n: events.length,
    assets: assets.size,
    days: new Set(events.map((e) => e.day)).size,
    funding_mean_bps: mean(events.map((e) => e.funding_bps)),
    basis_mean_bps: mean(events.map((e) => e.basis_bps)),
    gross_mean_bps: mean(events.map((e) => e.gross_bps)),
    net_mean_bps: m,
    net_median_bps: median(net),
    net_sd_bps: sd,
    loss_rate_pct: (100 * net.filter((x) => x < 0).length) / net.length,
    clears_cost: mean(events.map((e) => e.gross_bps)) > FROZEN.cost_bps_both_legs,
    concentration: conc,
    independence: ind,
    // Naive t, reported only alongside the inflation factor that makes it misleading.
    naive_t: sd > 0 ? m / (sd / Math.sqrt(net.length)) : null,
    overlap_adjusted_t: sd > 0 ? m / (sd / Math.sqrt(ind.effective_n)) : null,
  };
}

// ---------------------------------------------------------------------------

export function stage0(rows, hedgeableAssets) {
  const gaps = missingFields(rows);
  if (gaps.length > 0) {
    return { task: FROZEN.task, stage: 0, verdict: 'DATA_INADEQUATE', promising_count: 0,
      frozen: FROZEN, missing_fields: gaps };
  }
  const hours = [...new Set(rows.map((r) => r.ts))].sort((a, b) => a - b);
  const trainEndTs = hours[Math.floor(hours.length * FROZEN.train_fraction)];
  const trainHours = hours.filter((h) => h < trainEndTs).length;

  const part = partitionByHedgeability(rows, hedgeableAssets);
  const idxHedgeable = byAssetHour(part.hedgeable);
  const idxAll = byAssetHour(rows);

  const byThreshold = FROZEN.annualised_thresholds.map((ann) => {
    const th = ann / FROZEN.hours_per_year;
    const holds = FROZEN.hold_hours.map((h) => {
      const all = carryEvents(idxAll, hours, trainEndTs, th, h);
      const hedged = carryEvents(idxHedgeable, hours, trainEndTs, th, h);
      return {
        hold_hours: h,
        all_assets: summarise(all, h, trainHours),
        hedgeable_only: summarise(hedged, h, trainHours),
        hedgeable_share_of_events: all.length ? hedged.length / all.length : null,
      };
    });
    return { annualised_threshold: ann, per_hour_threshold: th, holds };
  });

  // GATE 1 decides first: the trade only exists on hedgeable assets.
  const anyHedgeableClears = byThreshold.some((t) => t.holds.some((h) => {
    const s = h.hedgeable_only;
    return !s.insufficient && s.clears_cost && s.concentration?.breaches_share_cap === false
      && s.net_median_bps > 0;
  }));

  const out = {
    task: FROZEN.task,
    stage: 0,
    label: 'DISCOVERY_NOT_PROOF',
    promising_count: 0,
    frozen: FROZEN,
    gate_order: ['HEDGEABILITY', 'ECONOMICS', 'CONCENTRATION', 'INDEPENDENCE'],
    sealed_segments_untouched: true,
    oracle_is_not_tradeable: true,
    oracle_note: 'oraclePx is an index. It measures basis but cannot be a hedge leg. Only assets with a real spot quote are carryable.',
    total_assets: new Set(rows.map((r) => r.asset)).size,
    hedgeable_assets: part.hedgeable_assets,
    unhedgeable_assets_count: part.unhedgeable_assets.length,
    train_hours: trainHours,
    by_threshold: byThreshold,
  };
  out.verdict = anyHedgeableClears ? 'STAGE_0_PASS' : 'STAGE_0_INFEASIBLE';
  out.closure_reason = anyHedgeableClears ? null
    : 'on assets with a tradeable spot leg, no frozen threshold and hold clears the 22 bps two-leg floor with a positive median and concentration inside the cap';
  return out;
}

export function toCsv(r) {
  const header = 'threshold_pct,hold_h,universe,n,assets,funding_bps,basis_bps,gross_bps,net_mean_bps,net_median_bps,loss_rate_pct,top_share,without_best_bps,naive_t,effective_n,adjusted_t';
  const c = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(4) : v);
  const lines = [];
  for (const t of r.by_threshold ?? []) {
    for (const h of t.holds) {
      for (const [label, s] of [['all', h.all_assets], ['hedgeable', h.hedgeable_only]]) {
        if (s.insufficient) { lines.push([(t.annualised_threshold * 100).toFixed(0), h.hold_hours, label, s.n, '', '', '', '', '', '', '', '', '', '', '', ''].join(',')); continue; }
        lines.push([(t.annualised_threshold * 100).toFixed(0), h.hold_hours, label, s.n, s.assets,
          c(s.funding_mean_bps), c(s.basis_mean_bps), c(s.gross_mean_bps), c(s.net_mean_bps),
          c(s.net_median_bps), c(s.loss_rate_pct), c(s.concentration.top_share),
          c(s.concentration.without_best_mean_bps), c(s.naive_t), s.independence.effective_n,
          c(s.overlap_adjusted_t)].join(','));
      }
    }
  }
  if (!lines.length) lines.push('NO_EVENTS,,,0,,,,,,,,,,,,');
  return [header, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------

const USAGE = `market_neutral_funding_carry_v0.mjs — TASK-AH-010 Stage 0 harness, research only

Usage:
  node scripts/analysis/market_neutral_funding_carry_v0.mjs --hourly <file> --hedgeable <file> [--out <base>]

  --hourly <file>     Rows: ts, asset, funding, mark, oracle
  --hedgeable <file>  JSON array of asset names with a tradeable spot leg
  --out <base>        Write <base>.json and <base>.csv

Hedgeability is gate 1. An asset with no tradeable spot is excluded from the carry universe,
not merely flagged: a perp with no hedge is a naked directional position.`;

export function parseArgs(argv) {
  const opts = { hourly: null, hedgeable: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { opts.help = true; continue; }
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (arg === '--hourly') opts.hourly = next();
    else if (arg === '--hedgeable') opts.hedgeable = next();
    else if (arg === '--out') opts.out = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

export function readJsonFile(path) {
  const p = resolve(path);
  if (!existsSync(p)) throw new Error(`file not found: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help || !opts.hourly || !opts.hedgeable) { process.stdout.write(`${USAGE}\n`); return opts.help ? 0 : 64; }

  const r = stage0(readJsonFile(opts.hourly), readJsonFile(opts.hedgeable));
  process.stdout.write(`${JSON.stringify({ task: r.task, verdict: r.verdict, closure_reason: r.closure_reason,
    hedgeable_assets: r.hedgeable_assets?.length, unhedgeable: r.unhedgeable_assets_count }, null, 2)}\n`);

  if (opts.out) {
    const base = resolve(opts.out);
    mkdirSync(dirname(base), { recursive: true });
    writeFileSync(`${base}.json`, `${JSON.stringify(r, null, 2)}\n`, 'utf8');
    writeFileSync(`${base}.csv`, toCsv(r), 'utf8');
    process.stdout.write(`wrote ${base}.json\nwrote ${base}.csv\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
