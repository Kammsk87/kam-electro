# `CD.CROSS_EXCHANGE_LEADLAG` clause (c) — RESULT

**Verdict: `CLAUSE_C_FAILS_TRACK_CLOSED`.**
**Disposition moves `DATA_BLOCKED` → `CLOSED_MEASURED`. Clause (a) never needed building.**

The track was blocked on data. It is now closed on measurement, and the clause that closed it
was the cheapest of the three.

## Clause (b) first, because it was the stated blocker

NTP-style probing from the research host, 15 samples per venue, offset taken at the smallest
round trip to minimise path asymmetry:

| | offset @ best RTT | median | best RTT |
|---|---:|---:|---:|
| Bybit | +1.5 ms | +1 ms | 169 ms |
| Binance | −0.5 ms | 0 ms | 235 ms |
| **Binance − Bybit** | **−2 ms** | **−1 ms** | |

Both venues run tightly disciplined clocks. A lag measured in hundreds of milliseconds cannot be
manufactured by skew. Probing from a second machine first gave both venues at ≈ +88 ms against
that machine's own clock while preserving the same small difference — which is what a shared
local-clock error looks like when it cancels in the subtraction.

## Clause (c), which decided it

7 days of Binance `aggTrades` (2026-07-15 → 07-21) against our Bybit tick archive, 9 symbols, a
100 ms grid, **9.4 million grid points**, with a 2-second print-age tolerance rejecting stale
comparisons.

**On the four liquid symbols, after subtracting each symbol's own persistent basis *and* its own
bid-ask bounce:**

| symbol | persistent basis | \|gap\| p99.9 | headroom | clears 16 bps? |
|---|---:|---:|---:|:--:|
| AAVEUSDT | +1.49 | 6.63 | **4.10** | no |
| ARBUSDT | +3.41 | 11.05 | **6.51** | no |
| AVAXUSDT | +0.79 | 6.12 | **3.80** | no |
| BNBUSDT | +11.19 | 15.88 | **2.93** | no |

Nothing comes close. And the criterion's own benchmark makes the point sharper: our **within-venue**
10-second dispersion is 3.6 bps. The cross-venue headroom on liquid pairs is 2.93–6.51 — **the
same order as the noise inside a single venue.**

**The measurement is deliberately biased toward the hypothesis.** The gap is taken print against
print, so a Binance trade at the ask against a Bybit trade at the bid registers a gap even with
identical fair values. What is measured is an **upper bound** on the true fair-value gap. Failing
at the upper bound is a robust failure.

## The pre-registered rule returned the wrong answer

The frozen decision rule returned **`CLAUSE_C_PASSES`**. It is wrong, and it is left in the code
unaltered with its output still reported.

It fired on BNBUSDT, which crosses 16 bps for 0.057 percent of the time. But BNBUSDT's **signed**
mean gap is **+11.19 bps** against a 1.75 bps spread: its entire distribution is displaced, with
Binance sitting ~11 bps above Bybit essentially always. The crossings are the upper tail of a
shifted distribution, not dislocations.

That distinction decides tradability. **A persistent basis does not converge**, so it cannot be
captured by trading one venue — which is precisely what a lead-lag trade does. Capturing it needs
both legs, and 11 bps is a third of the 32 bps two-leg floor.

The correction is implemented as a **second, separately-named verdict** carrying a `post_hoc: true`
flag, with a test asserting that flag exists. A rule written after seeing the data does not get to
overwrite one written before it.

Wide-spread symbols behave exactly as the pre-registration predicted they would: AERGO crosses
16 bps 63.7 percent of the time on an 8.93 bps spread and a −19.21 bps basis; AMAT 27.1 percent on
11.80 and −10.93. Bounce and basis, no opportunity, and the liquidity filter kept both out of the
verdict.

## Clause (a) was never built, and now does not need to be

`data.binance.vision` is available and free — HTTP 206, 17.9 MB per symbol-day for BTC and ETH,
1.2 MB for AAVE/ADA/ARB — but it serves **venue-reported timestamps only**, while clause (a)
demands our own ingest timestamp captured at observation time. Satisfying it properly meant
building a forward Binance recorder.

Testing (c) first saved that build. It was the right order because (c) is the only clause that can
kill the track outright, and it needs no clock precision at all: a gap persisting for seconds is
not sensitive to a 2 ms error.

## What is left, and it is not a lead-lag

BNBUSDT's **+11.19 bps basis is real and stable** across 7 days. It is not a dislocation and not a
lead-lag — it is a structural price difference between two contracts. Capturing it requires
simultaneous execution on both venues, and at 11 bps against a 32 bps two-leg round trip it is a
third of what it would need to be. Recorded in the reopen criterion rather than pursued.

## Files

- `scripts/analysis/cross_venue_gap_clause_c.mjs`
- `scripts/test_cross_venue_gap_clause_c.mjs` — 23/23
- `data/cross_venue_gap_clause_c_2026-08-06.{csv,json}`
- catalogue: `CD.CROSS_EXCHANGE_LEADLAG` → `CLOSED_MEASURED`; the blocked-route census in
  `test_research_warehouse_catalog.mjs` updated from three to two with the reason recorded
