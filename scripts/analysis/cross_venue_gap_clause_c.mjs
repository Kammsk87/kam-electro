// cross_venue_gap_clause_c.mjs — clause (c) of CD.CROSS_EXCHANGE_LEADLAG
//
// WHAT THIS DECIDES
//
// The reopen criterion has three clauses and this is the only one that can kill the track
// outright:
//
//   (c) A pre-declared expectation that the cross-venue spread exceeds the audited 16 bps
//       round trip FOR LONG ENOUGH TO ACT, since our own measured 10-second dispersion is
//       3.6 bps and a spread below the floor is untradeable however reliably it is detected.
//
// It is also the cheapest and the least assumption-laden. A gap that persists for seconds
// is not sensitive to the 1-2 ms venue clock offset measured on 2026-08-06, so this needs
// no clock precision at all. If it fails, clause (a) -- which requires building a forward
// Binance recorder -- never needs building.
//
// ============================ PRE-REGISTERED, BEFORE ANY RUN ==================
//
// EXPECTATION: P(|gap| > 16 bps) is essentially zero on the liquid symbols. Cross-venue
//   lead-lag is among the most competed relationships in this market and is arbitraged by
//   colocated firms in microseconds; residual gaps at the 100 ms scale run 1-5 bps against
//   our own 10-second dispersion of 3.6 bps.
//
// THE MEASUREMENT IS DELIBERATELY BIASED TOWARD THE HYPOTHESIS. The gap is taken between
//   trade PRINTS on each venue, and a print on Binance at the ask against a print on Bybit
//   at the bid shows a gap even when fair values are identical. So the measured quantity is
//   an UPPER BOUND on the true fair-value gap. If even the bounce-inflated gap does not
//   clear 16 bps, the true gap certainly does not, and the failure is robust.
//
//   Because of that bias, a symbol whose own Bybit spread is wide will show wide gaps that
//   are pure bounce and no arbitrage at all. AMATUSDT's median Bybit spread is 14.13 bps,
//   so it can manufacture 14 bps of apparent gap on its own. Every symbol's result is
//   therefore reported ALONGSIDE its own spread, and an excursion of the same order as the
//   spread is bounce, not opportunity.
//
// DECISION RULE, fixed in advance:
//   share of time |gap| > 16 bps, with excursions lasting >= 1s, materially above zero
//     on liquid symbols                                  -> CLAUSE_C_PASSES
//   otherwise                                            -> CLAUSE_C_FAILS_TRACK_CLOSED
// =============================================================================
//
// Read-only. Writes only to --out.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FROZEN = Object.freeze({
  module: 'CROSS_VENUE_GAP_CLAUSE_C',
  grid_ms: 100,
  // Either venue's last print older than this and the grid point is rejected. Without it a
  // fresh price gets compared against a stale one and the gap is manufactured -- the same
  // defect that produced a 39-hour median staleness in the first G3 run.
  max_print_age_ms: 2_000,
  floor_bps: 16,
  two_leg_floor_bps: 32,
  // Measured 2026-08-06 from the research host: Binance minus Bybit, -2 ms at best RTT.
  // Applied as zero because 2 ms on a 100 ms grid is below one grid step; recorded so the
  // choice is visible rather than implicit.
  clock_offset_applied_ms: 0,
  clock_offset_measured_ms: -2,
  min_excursion_ms: 1_000,
  own_dispersion_bps: 3.6,
});

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function gapBps(binancePx, bybitPx) {
  if (!(binancePx > 0) || !(bybitPx > 0)) return null;
  return 1e4 * ((binancePx - bybitPx) / bybitPx);
}

// Last observation at or before `t`, rejected if older than the tolerance.
export function lastAt(series, t, maxAge = FROZEN.max_print_age_ms) {
  if (!series.length) return null;
  let lo = 0; let hi = series.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (series[m].ts <= t) lo = m + 1; else hi = m; }
  const r = lo > 0 ? series[lo - 1] : null;
  if (!r) return null;
  return (t - r.ts) > maxAge ? null : r;
}

// Runs of consecutive grid points above the threshold, in milliseconds.
export function excursions(flags, gridMs = FROZEN.grid_ms) {
  const out = [];
  let run = 0;
  for (const f of flags) {
    if (f) run += 1;
    else if (run > 0) { out.push(run * gridMs); run = 0; }
  }
  if (run > 0) out.push(run * gridMs);
  return out;
}

export function quantiles(sorted, ps) {
  if (!sorted.length) return ps.map(() => null);
  return ps.map((p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]);
}

export function runSymbol(binance, bybit, spreadBps = null) {
  if (!binance.length || !bybit.length) return { n: 0, status: 'NO_DATA' };
  const from = Math.max(binance[0].ts, bybit[0].ts);
  const to = Math.min(binance[binance.length - 1].ts, bybit[bybit.length - 1].ts);
  if (!(to > from)) return { n: 0, status: 'NO_OVERLAP' };

  const abs = [];
  const flags16 = [];
  const flags32 = [];
  let n = 0; let rejected = 0; let sum = 0;

  for (let t = from; t <= to; t += FROZEN.grid_ms) {
    const a = lastAt(binance, t + FROZEN.clock_offset_applied_ms);
    const b = lastAt(bybit, t);
    if (!a || !b) { rejected += 1; flags16.push(false); flags32.push(false); continue; }
    const g = gapBps(a.px, b.px);
    if (g == null) { rejected += 1; flags16.push(false); flags32.push(false); continue; }
    n += 1; sum += g;
    const ag = Math.abs(g);
    abs.push(ag);
    flags16.push(ag > FROZEN.floor_bps);
    flags32.push(ag > FROZEN.two_leg_floor_bps);
  }

  if (n < 2) return { n, status: 'TOO_FEW' };
  abs.sort((x, y) => x - y);
  const [p50, p90, p99, p999, p9999] = quantiles(abs, [0.5, 0.9, 0.99, 0.999, 0.9999]);
  const ex16 = excursions(flags16).filter((d) => d >= FROZEN.min_excursion_ms);
  const ex32 = excursions(flags32).filter((d) => d >= FROZEN.min_excursion_ms);
  const over16 = abs.filter((x) => x > FROZEN.floor_bps).length;
  const over32 = abs.filter((x) => x > FROZEN.two_leg_floor_bps).length;

  return {
    status: 'OK',
    n,
    rejected,
    span_hours: (to - from) / 3_600_000,
    mean_signed_bps: sum / n,
    abs_p50: p50,
    abs_p90: p90,
    abs_p99: p99,
    abs_p999: p999,
    abs_p9999: p9999,
    abs_max: abs[abs.length - 1],
    pct_over_16: (100 * over16) / n,
    pct_over_32: (100 * over32) / n,
    excursions_over_16_ge_1s: ex16.length,
    excursions_over_32_ge_1s: ex32.length,
    longest_excursion_16_ms: ex16.length ? Math.max(...ex16) : 0,
    own_bybit_spread_bps: spreadBps,
    // If the 99.9th percentile of the gap is not clearly above the venue's own spread, what
    // is being measured is bid-ask bounce rather than a cross-venue dislocation.
    gap_exceeds_own_spread: spreadBps != null ? p999 > 2 * spreadBps : null,
  };
}

export function verdict(perSymbol) {
  const usable = perSymbol.filter((s) => s.status === 'OK');
  if (!usable.length) return 'UNRESOLVED';
  // Liquid symbols only: on a wide-spread symbol the excursions are bounce by construction.
  const liquid = usable.filter((s) => (s.own_bybit_spread_bps ?? 99) < 3);
  const pool = liquid.length ? liquid : usable;
  const anyReal = pool.some((s) => s.pct_over_16 > 0.01 && s.excursions_over_16_ge_1s > 0);
  return anyReal ? 'CLAUSE_C_PASSES' : 'CLAUSE_C_FAILS_TRACK_CLOSED';
}

// ---------------------------------------------------------------------------
// A CORRECTION TO THE FROZEN RULE, WRITTEN AFTER SEEING THE DATA
// ---------------------------------------------------------------------------
//
// The frozen `verdict` above returns CLAUSE_C_PASSES on this archive, and it is WRONG.
// It fires on BNBUSDT, whose gap crosses 16 bps for 0.057 percent of the time -- but that
// symbol's SIGNED mean gap is +11.19 bps against its own 1.75 bps spread. Its entire
// distribution is displaced: Binance sits about 11 bps above Bybit essentially always. The
// threshold crossings are the upper tail of a shifted distribution, not dislocations.
//
// That distinction decides tradability. A persistent basis does NOT converge, so it cannot
// be captured by trading one venue; it needs both legs, and 11 bps is a third of the 32 bps
// two-leg floor. A dislocation converges, which is what a lead-lag trade requires.
//
// The frozen rule is left exactly as it was and its output is still reported. This is a
// SECOND, post-hoc reading, labelled as such, and it does not get to overwrite the first.

export function basisAdjustedVerdict(perSymbol) {
  const usable = perSymbol.filter((s) => s.status === 'OK');
  if (!usable.length) return { verdict: 'UNRESOLVED', detail: [] };
  const detail = usable.map((s) => {
    const basis = Math.abs(s.mean_signed_bps ?? 0);
    // Excess above the symbol's own persistent displacement AND its own bid-ask bounce.
    const headroom = s.abs_p999 - basis - (s.own_bybit_spread_bps ?? 0);
    return {
      symbol: s.symbol,
      persistent_basis_bps: s.mean_signed_bps,
      p999_bps: s.abs_p999,
      headroom_over_basis_and_spread_bps: headroom,
      clears_floor: headroom > FROZEN.floor_bps,
      liquid: (s.own_bybit_spread_bps ?? 99) < 3,
    };
  });
  const anyLiquidClears = detail.some((d) => d.liquid && d.clears_floor);
  return {
    verdict: anyLiquidClears ? 'CLAUSE_C_PASSES' : 'CLAUSE_C_FAILS_TRACK_CLOSED',
    basis: 'excursion must exceed the symbol\'s own persistent basis AND its own spread by the 16 bps floor',
    post_hoc: true,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function parsePairs(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const ts = +line.slice(0, sp);
    const px = +line.slice(sp + 1);
    if (Number.isFinite(ts) && px > 0) out.push({ ts, px });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

export function loadDir(dir, suffix) {
  const out = {};
  for (const f of readdirSync(dir)) {
    const m = new RegExp(`^(.+)${suffix}$`).exec(f);
    if (!m) continue;
    out[m[1]] = parsePairs(readFileSync(join(dir, f), 'utf8'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (a === '--binance') o.binance = next();
    else if (a === '--bybit') o.bybit = next();
    else if (a === '--spreads') o.spreads = next();
    else if (a === '--out') o.out = next();
    else if (a === '-h' || a === '--help') o.help = true;
  }
  return o;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.binance || !opts.bybit) {
    process.stdout.write('usage: --binance <dir> --bybit <dir> [--spreads <json>] [--out <base>]\n');
    return opts.help ? 0 : 1;
  }
  const bin = loadDir(opts.binance, '\\.txt');
  const byb = loadDir(opts.bybit, '\\.ticks\\.txt');
  let spreads = {};
  if (opts.spreads) { try { spreads = JSON.parse(readFileSync(opts.spreads, 'utf8')); } catch { /* */ } }

  const symbols = Object.keys(bin).filter((s) => byb[s]?.length).sort();
  const per = symbols.map((s) => ({ symbol: s, ...runSymbol(bin[s], byb[s], spreads[s] ?? null) }));
  const v = verdict(per);
  const corrected = basisAdjustedVerdict(per);

  const report = {
    module: FROZEN.module, frozen: FROZEN, symbols: symbols.length,
    verdict_frozen_rule: v,
    verdict_frozen_rule_note: 'the pre-registered rule; it fires on a persistent basis and is wrong here',
    verdict_basis_adjusted: corrected,
    per_symbol: per,
  };
  if (opts.out) {
    writeFileSync(`${opts.out}.json`, `${JSON.stringify(report, null, 1)}\n`);
    const rows = ['symbol,n,span_h,abs_p50,abs_p99,abs_p999,abs_max,pct_over_16,pct_over_32,exc16_ge1s,own_spread_bps'];
    for (const s of per) {
      rows.push([s.symbol, s.n, s.span_hours, s.abs_p50, s.abs_p99, s.abs_p999, s.abs_max,
        s.pct_over_16, s.pct_over_32, s.excursions_over_16_ge_1s, s.own_bybit_spread_bps].join(','));
    }
    writeFileSync(`${opts.out}.csv`, `${rows.join('\n')}\n`);
    process.stdout.write(`wrote ${opts.out}.json and ${opts.out}.csv\n`);
  }
  process.stdout.write(`${JSON.stringify({ verdict_frozen_rule: v, verdict_basis_adjusted: corrected, per_symbol: per }, null, 1)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
