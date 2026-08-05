# TASK-AH-054 — Swing Relative Strength 4H v0

## Position in the register

The signal is inherited from a family already closed. `CD.WEEKLY_XSECT_MOMENTUM` recorded
weekly cross-sectional momentum as **`CLOSED_UNDERPOWERED`**: the published 250–410 bps effect
was excluded at 2.6–5.2 standard errors, the residual of 91.1 bps could not be distinguished
from zero at t = 1.48, and the payoff shape was a trap — median 21 bps against a mean of 91,
with 51 percent of weeks net positive.

**This is a new family rather than a reopen of that decision.** AH-050 measured an unconditional
equal-weighted long-short portfolio rebalanced weekly with no timing, no market filter and no
stop. This is long-only, gated on a market regime, triggered by an intraday breakout, and
carries a hard stop, a trailing exit and a timeout. The signal class is shared; the object is
not.

Because the class is shared, **the overlap must be measured, not asserted.** The event ledger is
retained and the share of AH-054 entries whose symbol-week falls in AH-050's top quintile is
reported whatever it shows.

## Two numbers in the source proposal were assumed; both are replaced by measurements

Recorded here because the difference decides what a pass would mean.

### Expected gross return

The proposal assumed +350 to +500 bps per trade. **Our own measurement says roughly half that.**

`LAW.XSECT.WEEKLY_MOMENTUM_BOUNDED` records the quintile profile of weekly cross-sectional
momentum over 100 non-overlapping weeks and 43 symbols: **90.3, 101.3, 122.7, 169.2, 181.3 bps**,
monotone. The **top quintile returns +181.3 bps** on a one-week hold.

That is the tightest available prior and it is ours.

### Funding carry

The proposal assumed roughly 40 bps of accumulated funding over a 7-day hold, and treated it as
the principal cost. Measured on `EDGE.DATA.AXISA` — 18 Bybit symbols, 375 days, distinct 8-hour
settlements only:

| | mean 8h rate | 7-day cost to a long |
|---|---:|---:|
| unconditional | −0.02 bps | −0.5 bps |
| **conditional on BTC > SMA50(1D)** | **+0.04 bps** | **+0.8 bps** |
| conditional on BTC below | −0.09 bps | −1.9 bps |

The conditional figure is the one that applies, because this strategy is long-only inside the
bull filter — and computing it conditionally rather than unconditionally is the correction
`TASK-AH-010` had to make after an unconditional mean came out zero by construction.

**Funding over a 7-day hold costs a long about 0.8 bps, not 40.** The proposal overstates it by
roughly fiftyfold. Funding is not the arbiter here; it is a rounding error.

The bull filter is satisfied on 712 of 1,263 days, 56 percent, so it is a real regime split and
not a rare-event filter.

## Pre-registered expectation

Declared before any engine exists, so the result is informative in both directions.

| | |
|---|---:|
| **expected gross per trade** | **+181 bps** (AH-050 top quintile, one-week hold) |
| entry + exit cost | 16 bps |
| funding over 7 days | ~1 bps |
| **total cost** | **~17 bps** |
| **expected net** | **~+164 bps** |

**What would falsify the prior upward:** a gross materially above 181 bps would mean the added
machinery — market filter, breakout trigger, stop, trailing exit — is contributing beyond the
cross-sectional signal itself. That is the claim being tested.

**What would falsify it downward:** a gross materially below 181 bps would mean the machinery
costs more than it adds. The hard stop is the most likely culprit: truncating the left tail
raises the win rate and usually lowers the mean, which is exactly the arithmetic that killed the
account this proposal came from — 77.5 percent wins at a payoff ratio of 0.089.

**Neither outcome is a surprise to be reinterpreted afterwards.** The number is 181, recorded
now.

## Frozen specification

**Universe.** Top-30 by median daily notional volume from the available archive, with two
exclusions made on pre-existing measurements rather than outcomes: symbols whose recorded basis
dispersion exceeds 20 bps (`LAW.BASIS.LIQUID_PERP_BELOW_COST` puts TAC at 23.6 and VANRY at
30.6), and symbols without complete coverage over the evaluated span.

**Timeframes.** 4H for entry and exit, 1D for the market filter and the relative-strength
formation.

**Span.** 2023-01-01 onward, subject to the coverage rule above.

**Entry — all three required:**

1. **Market context:** BTC close above its 50-day simple moving average on the 1D series.
2. **Relative strength:** `R7d(alt) − R7d(BTC)` in the **top quintile** of the cross-section,
   measured on completed daily closes.
3. **Trigger:** a 4H close above the highest high of the prior **18 completed 4H bars**
   (three days), with `vol_4h > 1.3 × SMA20(vol_4h)`.

The 18-bar window **excludes the breaking bar**, as in AH-053, because a bar's own high is at
least its close and including it makes the condition close to tautological.

**Direction: LONG only.** Declared before measurement.

**Entry reference:** the breaking 4H bar's close, taker.

**Exits, whichever comes first:**

- hard stop at **−5.0 %** from entry, live from the moment of entry;
- 4H close below **EMA20(4H)**;
- timeout at **168 hours**, 42 completed 4H bars.

**Leverage: 1.0×.** The specification permits up to 1.5×; the measurement is run at 1.0× so the
result is a property of the signal and not of the leverage. Leverage scales both sides and
cannot change the sign.

**Costs:** 16 bps round trip, 32 bps stress, plus funding accrued over the actual holding
period at the measured rate rather than an assumed one.

**Splits:** chronological 55/20/15/10 with purge and embargo sized to the 7-day formation.
Holdout and forward sealed at Stage 0.

**Overlap:** no new entry in a symbol while a position in it is held. Portfolio-level caps —
two concurrent positions, sector correlation lock — are **not** applied at Stage 0, because they
change the sample rather than the signal and would confound the per-trade measurement. They
belong to Stage 1 sizing.

## Stage 0 gate — sample audit and degeneracy, no PnL

Run before any return is computed.

1. **Coverage:** symbols with complete 4H and 1D series over the span, and the resulting universe
   after the exclusions.
2. **Signal count N,** total and per symbol and per year, after the overlap rule.
3. **Bucket balance with tie fraction reported first** for the relative-strength score and for
   `vol_burst`, as `CD.FUNDING_VELOCITY` requires after the funding sort degenerated at a ratio
   of 16.08.
4. **Spacing:** the distribution of intervals between consecutive entries, to establish that the
   overlap rule leaves genuinely independent trades.
5. **Regime balance:** the share of the span in which the BTC filter is satisfied, and the share
   of entries falling in each year.

**Kill conditions.**

- `N < 100` → **`UNDERPOWERED`**, recorded without computing PnL.
- Either sort degenerate → **`STAGE_0_INFEASIBLE`**; a collapsed sort cannot support a
  conditional result.
- Fewer than 30 events per out-of-sample segment → `STAGE_0_INFEASIBLE`.

Stage 1 is not written unless Stage 0 passes.

## Stage 1, if reached

Per-trade net return after 16 bps and measured funding; win rate; payoff ratio; max drawdown;
median alongside mean, because a positive mean with a near-zero median is the payoff-trap
signature already recorded against `FAM.AMEL_DIRECTIONAL` and visible in the Bybit account this
proposal derives from. Benchmarked against buy-and-hold BTC over the identical span. Matched
null at the identical entry rate. Remove-best-symbol and remove-best-year. Measured overlap
against AH-050's top quintile.

## Safety boundary

Read-only over local or public market-data sources. No live, paper, service, collector, config,
coordinator, approval, KILL, secret, order, account or position path. Nothing written to the
server. No raw market data committed.

The universe rule, both timeframes, all three entry conditions, the lookback, the direction, all
three exits, the leverage and the cost floor are frozen above. Searching over any of them is a
parameter search and requires a new task with a new identity.

## Deliverables

1. `scripts/analysis/ah054_swing_relative_strength_4h.mjs`
2. `scripts/test_ah054_swing_relative_strength_4h.mjs`
3. `reference/AH054_SWING_RELATIVE_STRENGTH_4H_PROTOCOL_2026-08-05.md`
4. `data/ah054_swing_relative_strength_4h_2026-08-05.{csv,json}`
5. `tasks/results/TASK-AH-054-SWING-RELATIVE-STRENGTH-4H-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, and `git diff --check`. Commit only the
allowlisted deliverables. Push requires separate approval.
