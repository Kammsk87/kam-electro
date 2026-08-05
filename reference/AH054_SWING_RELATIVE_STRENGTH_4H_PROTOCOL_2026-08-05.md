# AH-054 — Swing Relative Strength 4H, Stage 0 protocol

Read-only. Public market-data endpoint for the backfill only; no credentials and no account,
order, position or execution path. Nothing written to the server.

**Stage 0 is a sample audit and computes no PnL.** A test asserts that no return field appears
in its output and that `pnl_computed` is false, so the audit cannot be read in the light of a
result it has not seen.

## Frozen specification

| | |
|---|---|
| universe | top 30 by median daily turnover; TAC and VANRY excluded on recorded basis dispersion; short series dropped |
| timeframes | 4H for entry, daily derived from the same 4H series |
| entry | BTC > SMA50(1D) **and** `R7d(alt) − R7d(BTC)` in the top quintile **and** a 4H close above the prior 18-bar high with `vol > 1.3 × SMA20(vol)` |
| direction | LONG, declared |
| exits | −5 % hard stop, 4H close below EMA20(4H), 168-hour timeout |
| leverage | 1.0× at measurement, so the result is a property of the signal |
| costs | 16 bps round trip plus measured funding |

Three construction choices, each tested:

- **the daily series is derived from the same 4H bars**, not joined from a separate feed — two
  feeds can disagree by a tick and the disagreement would land silently inside the filter;
- **the daily context is read at the last completed day strictly before the bar**, so an 08:00
  entry uses the previous day's close; same-day would be look-ahead of up to 24 hours;
- **the volume baseline and the prior high both exclude the bar under test**, otherwise a spike
  inflates its own denominator and the breakout condition is near-tautological.

## Result: `STAGE_0_PASS`

464 entries, 255 train, 209 sealed, 2023-02-20 → 2026-08-03, per year 108 / 152 / 131 / 73.

**Funnel**, exact by test: 202,301 bars considered; 93,279 rejected on the market filter,
85,760 on relative strength, 22,061 on the trigger, 737 on overlap; 464 entries.

**Balance gate**, run before anything else: relative strength 95.5 % distinct at a bucket ratio
of 1.011, `vol_burst` 100 % distinct at 1.011. Neither degenerate — funding velocity, by
contrast, collapsed at 16.08.

**Independence**: minimum spacing between same-symbol entries is 43 bars against a 42-bar
timeout, so no pair overlaps. Median spacing 224 bars.

**Concentration**: all 30 symbols produce entries; the largest share is 5.2 %.

**Regime**: the BTC filter holds on 713 of 1,264 days, 56 % — the same figure obtained
independently when the funding prior was grounded.

## Pre-registered expectation, still ahead of the measurement

Gross **+181 bps** from `LAW.XSECT.WEEKLY_MOMENTUM_BOUNDED`'s top quintile; costs ~17 bps
(16 round trip, ~1 funding measured conditionally on the bull filter); net **~+164 bps**.

Above 181 means the added machinery contributes beyond the cross-sectional signal. Below means
it costs more than it adds.

## Stage 1, authorised and not run

Net per trade after costs and accrued funding; win rate; payoff ratio; median beside mean;
max drawdown; buy-and-hold BTC benchmark; matched null at the identical entry rate;
remove-best-symbol and remove-best-year; measured overlap against AH-050's top quintile.
