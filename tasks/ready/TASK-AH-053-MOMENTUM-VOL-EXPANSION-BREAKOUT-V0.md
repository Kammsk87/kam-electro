# TASK-AH-053 — Momentum Volatility-Expansion Breakout v0

## Provenance, and why this is not a silent retry

The construction comes from a reading of the operator's historical Bybit account: the
`HIGH_LEVERAGE_DIRECTIONAL` archetype, 472 trades, +$2,114.33 net.

**That provenance does not survive inspection and is recorded here so it is not repeated as
support.** Three checks, all against the committed forensics artefacts:

1. **The +$2,114 excludes its own blowups.** `LIQUIDATION_BUST` is a separate archetype bucket
   of 18 trades at −$10,870.23; the archetype counts sum to 1,238, the full ledger, so the
   buckets partition without overlap. Those 18 were 8× leverage LONG directional positions —
   the same behaviour. The arithmetic for high-leverage directional trading as a whole is
   **−$8,756**, not +$2,114.
2. **The entry fields do not exist for those trades.** `vol_burst`, `vol_expansion`,
   `at_new_high` and `at_new_low` appear only in `bybit_low_leverage_entry_logic_ledger`, which
   holds **19 rows**, not 472. Closed-PnL carries no pre-entry price path.
3. **Two of those 19 are classified `breakout_chase`,** and both would fail the filter derived
   from them: `vol_burst` 0.74 and 0.71 against a proposed threshold of 1.5. Together they made
   −$0.21. The producing engine's own verdict on that subset is `DATA_INSUFFICIENT`, with
   `materially_better_than_full: false` and all eight best stop-replay cells negative.

**The hypothesis is therefore tested on its own merits, not on that evidence.** It is worth
testing because the mechanism is stated and falsifiable, not because an account made money.

## Why this is a structural variant of TASK-AH-039 rather than a repeat

AH-039 was rejected `OOS_FAIL_REJECT_FAMILY` at −13.53 bps over 2,186 out-of-sample
observations. Its precondition is the **opposite** of this one.

| | AH-039 | this task |
|---|---|---|
| precondition | volatility **compression** — Bollinger20/2 width ≤ prior-120 percentile for six bars, ATR below prior-60 median | volatility **expansion** — volume burst and range above ATR |
| break | first ±0.2 ATR move out of the squeeze | close beyond a 2-hour extreme |
| timeframe | 1h bars | 5m bars |
| entry | next bar open | the breaking bar's close |
| exit | 2.5R or 18 bars | 1.0 % hard stop, 45-minute time stop |
| universe | 87 eligible of 109 | 16 liquid symbols |
| cost floor | 11 bps (superseded) | **16 bps (audited)** |

AH-039 gates on quiet before the break. This gates on noise at the break. They are not the same
test, and a negative here would close a genuinely different cell rather than confirm the old one.

**Overlap cannot be measured against AH-039** — its result records
`overlap: {"status":"UNAVAILABLE", "note":"Rejected-family timestamp ledgers not retained"}`.
This task must therefore **retain its own event-timestamp ledger**, so that any successor can
measure overlap against it. That omission is why this comparison has to be argued rather than
computed.

## Pre-recorded expectation

Declared before the run, so the result is informative in both directions.

**The tightest applicable prior is `LAW.FLOW.SWEEP_CONTINUATION_SATURATES`.** It measured
continuation after aggressive parent orders across nine within-symbol percentile bands: it rises
monotonically with size, from 4.40 bps below the median to **8.27 bps for the largest one in a
thousand**, and saturates there. A volume burst that breaks a two-hour extreme is a large
aggressive flow event by construction.

**Expectation: gross continuation lands near 8 bps, and below the 16 bps floor.**

Two secondary expectations:

- the effect rises with burst size and flattens, mirroring the saturation shape;
- no bucket clears 16 bps at any horizon.

**What would falsify the prior.** A gross effect above 16 bps would mean the saturation law does
not generalise from tick-level parent sweeps to bar-level volume bursts. That is a finding worth
having, and it is the reason to run this rather than close it on the register.

**What this expectation is not.** It is not a prediction that the task fails. It is the number
against which the result will be read, recorded before the result exists, because
`CD.SELECTION_ON_INSAMPLE_RANK` established that a candidate topping an in-sample comparison has
thereby earned nothing.

## Frozen specification

**Universe — 16 symbols.** The bar archive holds 18 with 5m coverage: AAVE, ADA, ARB, BTC, DOGE,
ENA, ETH, HYPE, LINK, NEAR, SOL, SUI, TAC, UNI, VANRY, WLD, XLM, XRP. **TAC and VANRY are
excluded** on a pre-existing measurement, not an outcome: `LAW.BASIS.LIQUID_PERP_BELOW_COST`
records their basis dispersion at 23.6 and 30.6 bps against 1.4–4.7 for the rest, which is the
signature of illiquidity. No other symbol may be dropped for any reason.

**Timeframe: 5-minute bars.** The archive carries 5m, 15m and 1h; there is no 1m series, so the
1m variant in the source proposal is not testable and is not attempted.

**Entry conditions, all three required on the same completed bar:**

1. `vol_burst ≥ 1.5` — bar volume over the trailing 20-bar simple mean;
2. `vol_expansion ≥ 1.2` — bar high-low range over ATR-14;
3. the bar's **close** beyond the extreme of the trailing 24 bars (2 hours), high for a long,
   low for a short.

**Direction: with the break.** Long on a new high, short on a new low. Declared before
measurement, so a reversion result counts as a refutation rather than a rediscovery.

**Entry reference:** the breaking bar's close. Taker, paying the full round trip.

**Exits, whichever comes first:**

- hard stop at **1.0 %** from entry;
- time stop at **45 minutes**, nine bars, closed at market regardless of PnL;
- no target. A target would make the payoff ratio a fitted parameter, and the account this came
  from died of exactly that arithmetic.

**Costs:** 16 bps round trip, 32 bps double-cost stress. The superseded 11 bps is reported only
for comparison against the historical record.

**Splits:** chronological 55/20/15/10 with purge and embargo sized to the 24-bar lookback.
Holdout and forward sealed at Stage 0.

**Overlap:** entries closer than the 45-minute holding window on the same symbol are dropped,
so windows cannot inflate n or t.

## Stage 0 gate — train only

1. event count per symbol and per day, and the **bucket balance with tie fraction reported
   before any return**, as `CD.FUNDING_VELOCITY` requires after the funding sort degenerated;
2. gross move in the declared direction at 15, 30 and 45 minutes;
3. the share of events clearing 16 bps;
4. the effect size detectable at t = 3 in this sample, reported **before** the verdict.

**Kill condition.** The family closes at Stage 0 if the train-only gross mean is below the round
trip, or fewer than 30 events per out-of-sample segment are available. A positive point estimate
that the sample cannot resolve is `UNDERPOWERED`, not a pass — the defect found and fixed in
TASK-AH-050.

## Acceptance

If Stage 0 passes, Stage 1 requires: positive net mean **and median** after 16 bps on holdout
and forward; non-negative median at 32 bps; a two-sided matched null at p < 0.05 against a
control drawn at the identical event rate; survival of remove-best-symbol and remove-best-day;
no symbol above 25 % of contribution; monotonicity of the effect in burst size; both neighbour
horizons non-negative; and the event-timestamp ledger retained.

If Stage 0 fails, the result is `STAGE_0_INFEASIBLE` or `UNDERPOWERED`, the measured gap to the
floor is stated explicitly, and the outcome is compared against the pre-recorded expectation
above — including whether the saturation prior held.

## Safety boundary

Read-only. No network, live, paper, service, collector, config, coordinator, approval, KILL,
secret, order, account or position path. Nothing written to the server. No raw market data
committed.

The universe, timeframe, all three entry thresholds, the lookback, the direction, both exits and
the cost floor are frozen above. Searching over any of them is a parameter search and requires a
new task with a new identity.

## Deliverables

1. `scripts/analysis/ah053_momentum_vol_expansion_breakout.mjs`
2. `scripts/test_ah053_momentum_vol_expansion_breakout.mjs`
3. `reference/AH053_MOMENTUM_VOL_EXPANSION_BREAKOUT_PROTOCOL_2026-08-05.md`
4. `data/ah053_momentum_vol_expansion_breakout_2026-08-05.{csv,json}`
5. `tasks/results/TASK-AH-053-MOMENTUM-VOL-EXPANSION-BREAKOUT-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, the replay the gate permits, and
`git diff --check`. Commit only the allowlisted deliverables. Push requires separate approval.
