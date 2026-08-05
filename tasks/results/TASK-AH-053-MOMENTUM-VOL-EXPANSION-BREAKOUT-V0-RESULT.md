# TASK-AH-053 — Momentum Volatility-Expansion Breakout v0 — RESULT

**Verdict: `STAGE_0_INFEASIBLE`.**
**Lifecycle stage: DISCOVERY. Next permitted transition: closure.**
**promising_count: 0.** No Stage 1 implementation was written, as the contract requires.

## One-line summary

The break does not continue — it reverts. Measured continuation is **−3.29 bps at 45 minutes,
t = −3.58** over 9,714 non-overlapping events, against a 16 bps floor and against a pre-recorded
expectation of **+8.27 bps**.

## Setup

16 frozen symbols, 5-minute bars, 2026-01-17 → 2026-07-10. All three entry conditions on the
same completed bar: `vol_burst ≥ 1.5`, `vol_expansion ≥ 1.2`, close beyond the 24-bar extreme.
Direction with the break, declared before measurement.

| | |
|---|---:|
| total events | 17,662 |
| train | **9,714** |
| sealed and untouched | 7,948 |
| symbols with events | 12 of 16 carry ≥200 |
| train days | 99 |
| direction split | 4,505 LONG / 5,209 SHORT |

## Step 1 — the balance gate passed, so the measurement is real

Run before any return was reported, as `CD.FUNDING_VELOCITY` requires.

| quantity | distinct | ties | bucket sizes | ratio | |
|---|---:|---:|---|---:|---|
| `vol_burst` | **100 %** | 0 % | 1943 / 1943 / 1943 / 1943 / 1942 | **1.0005** | balanced |
| `vol_expansion` | 98.5 % | 1.5 % | 1943 / 1943 / 1943 / 1943 / 1942 | **1.0005** | balanced |

`vol_burst` spans p05 1.63 to p95 12.11, median 3.11. This is a real sort, not a collapsed one —
unlike funding velocity, which degenerated at a ratio of 16.08.

## Step 2 — the result

| horizon | n | gross mean | median | t | detectable @ t=3 | share > 16 bps | net @ 16 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 15 min | 9,714 | −0.56 | −5.44 | −0.95 | 1.78 | 26.5 % | −16.56 |
| 30 min | 9,714 | −3.50 | −7.67 | **−4.59** | 2.28 | 30.0 % | −19.50 |
| **45 min** | 9,714 | **−3.29** | −7.87 | **−3.58** | 2.76 | 32.8 % | −19.29 |

**This is a measured negative, not an underpowered one.** At 30 and 45 minutes the effect is
resolved past t = 3 in the direction opposite to the one declared.

Realised under the frozen exits — 1 % hard stop, 45-minute time stop — is **−2.80 bps mean,
−9.20 median, 15.8 % stopped out**, net −18.80.

### Burst-size profile

| quintile | n | mean burst | mean bps | t |
|---|---:|---:|---:|---:|
| q0 | 1,943 | 1.76× | −4.34 | −2.56 |
| q1 | 1,943 | 2.36× | −6.08 | −3.20 |
| q2 | 1,943 | 3.14× | −5.60 | −2.90 |
| q3 | 1,943 | 4.52× | −4.39 | −2.19 |
| q4 | 1,942 | **12.08×** | **+3.96** | +1.51 |

Not monotone. The largest bursts flip positive but at t = 1.51, unresolved, and at 3.96 bps
they remain a quarter of the floor.

## The pre-recorded expectation was wrong, and wrong downward

Recorded in the task before the engine existed:

> `LAW.FLOW.SWEEP_CONTINUATION_SATURATES` measured aggressive-flow continuation rising to
> 8.27 bps at the largest one-in-a-thousand parent order and saturating. Expect the effect near
> 8 bps and below the 16 bps floor.

| | |
|---|---:|
| expected | +8.27 bps |
| measured | **−3.29 bps** |
| difference | −11.56 bps |
| **standard errors from the prior** | **−12.6** |

The prior is falsified — but downward, not upward. **The saturation law does not carry from
tick-level parent sweeps to bar-level volume bursts, and the sign inverts.**

That is the substantive finding of this task, and it has a mechanism. A parent sweep is *one*
participant crossing multiple levels inside 100 ms; the continuation measured in AH-051 is that
participant's own impact still resolving. A five-minute bar with high volume and a wide range is
an **aggregate** of many participants, including everyone fading the move. The two events look
alike at the level of description and are not the same object. Aggregation over five minutes
does not preserve the property that made the tick-level event predictive.

## What this closes

The volatility-expansion breakout closes at Stage 0 on a measured shortfall of 19.29 bps.

The mirror — fading the break — is **+3.29 bps**, and it is recorded here as an observation
rather than a result, per the AH-048 discipline: the direction was declared as continuation
before measurement, so the reverse is a discovery on train and not a finding. It is in any case
a fifth of the floor.

Dispersion exists: 26 to 33 percent of events exceed 16 bps in the break direction. The
conditional mean is still negative. That is the same shape as every prior closure — a paying
tail that is not identifiable by the conditioner in hand.

## Engine defect found by its own tests

The first cut of the balance gate used **positional** bucketing, which hands a tied block out
across bucket boundaries and reports even sizes. On a fixture with 90 percent of values tied at
one number it returned a ratio of 1.00 and declared the sort healthy — it would have hidden
exactly the collapse the gate exists to catch.

Fixed to use tie-averaged ranks, so an identical block lands in one cell and the imbalance
becomes visible. Positional bucketing is retained for *measuring* the burst profile, where equal
cell counts are what you want; the two uses are now distinct and commented.

Separately, an integrity check caught `LINKUSDT_5m.json` truncated at 2,088,960 bytes by an
interrupted transfer. Every bar file is now verified to end with a closing bracket before use.

## Deliverables

1. `scripts/analysis/ah053_momentum_vol_expansion_breakout.mjs`
2. `scripts/test_ah053_momentum_vol_expansion_breakout.mjs` — 24/24 passing
3. `reference/AH053_MOMENTUM_VOL_EXPANSION_BREAKOUT_PROTOCOL_2026-08-05.md`
4. `data/ah053_momentum_vol_expansion_breakout_2026-08-05.{csv,json}`
5. This result file

## Safety

Read-only over locally held bar files. No network, live, paper, service, collector, config,
coordinator, approval, KILL, secret, order, account or position path. No raw market data
committed — only the aggregate result. Sealed segment untouched.
