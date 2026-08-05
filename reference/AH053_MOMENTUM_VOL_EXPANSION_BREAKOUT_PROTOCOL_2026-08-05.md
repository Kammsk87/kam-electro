# AH-053 — Momentum Volatility-Expansion Breakout, Stage 0 protocol

Read-only over locally held bar files. No network, live, paper, service, collector, config,
coordinator, approval, KILL, secret, order, account or position path.

## Frozen specification

| | |
|---|---|
| universe | 16 symbols — TAC and VANRY excluded on `LAW.BASIS.LIQUID_PERP_BELOW_COST`, which records their basis dispersion at 23.6 and 30.6 bps against 1.4–4.7 |
| timeframe | 5-minute bars; no 1m series exists, so the 1m variant was not attempted |
| entry | all three on one completed bar: `vol_burst ≥ 1.5` over the trailing 20-bar mean, `vol_expansion ≥ 1.2` over ATR-14, close beyond the 24-bar extreme |
| direction | **with the break**, declared before measurement |
| entry reference | the breaking bar's close, taker |
| exits | 1 % hard stop or a 45-minute time stop, whichever first; no target |
| costs | 16 bps, 32 bps stress, 11 bps for historical comparison only |
| overlap | no entry while a previous one is held |

Two construction choices matter and are both tested:

- the **volume baseline excludes the bar itself**, otherwise a spike inflates its own denominator;
- the **prior extreme excludes the breaking bar**, otherwise "close beyond the extreme" is close
  to tautological, since a bar's high is at least its close.

## Result

`STAGE_0_INFEASIBLE`. Shortfall 19.29 bps.

Data: 17,662 events, 9,714 train, 7,948 sealed and untouched, 99 days, 4,505 LONG / 5,209 SHORT.

### The balance gate, run first

| quantity | distinct | ties | bucket sizes | ratio |
|---|---:|---:|---|---:|
| `vol_burst` | 100 % | 0 % | 1943 / 1943 / 1943 / 1943 / 1942 | 1.0005 |
| `vol_expansion` | 98.5 % | 1.5 % | 1943 / 1943 / 1943 / 1943 / 1942 | 1.0005 |

`vol_burst` runs from 1.63 at p05 to 12.11 at p95, median 3.11. A real sort — funding velocity,
by contrast, degenerated at a ratio of 16.08.

### Returns

| horizon | n | gross mean | median | t | detectable | share > 16 bps |
|---|---:|---:|---:|---:|---:|---:|
| 15 min | 9,714 | −0.56 | −5.44 | −0.95 | 1.78 | 26.5 % |
| 30 min | 9,714 | −3.50 | −7.67 | **−4.59** | 2.28 | 30.0 % |
| 45 min | 9,714 | **−3.29** | −7.87 | **−3.58** | 2.76 | 32.8 % |

Realised under the frozen exits: −2.80 bps mean, −9.20 median, 15.8 % stopped out.

Burst quintiles at 45 minutes: −4.34, −6.08, −5.60, −4.39, **+3.96**. Not monotone; the top
quintile at 12.08× mean burst flips positive but at t = 1.51, unresolved.

## The pre-recorded expectation, and its falsification

| | |
|---|---:|
| expected, from `LAW.FLOW.SWEEP_CONTINUATION_SATURATES` | +8.27 bps |
| measured | −3.29 bps |
| **standard errors from the prior** | **−12.6** |

**The prior is falsified downward.** The saturation law does not carry from tick-level parent
sweeps to bar-level volume bursts, and the sign inverts.

The mechanism: a parent sweep is **one** participant crossing several price levels inside 100 ms,
and the continuation AH-051 measured is that participant's own impact still resolving. A
five-minute bar with high volume and a wide range is an **aggregate** of many participants,
including everyone fading the move. The two events resemble each other in description only.
Aggregating over five minutes destroys the property that made the tick-level event predictive.

This is the first pre-registered expectation in the programme to be falsified. Recording it
before the engine existed is what makes the falsification legible rather than a re-reading.

## Engine defects found by its own tests

**The balance gate could not see a collapse.** The first cut used positional bucketing, which
splits a tied block across boundaries and reports even sizes. On a fixture with 90 percent of
values tied at one number it returned a ratio of 1.00 and declared the sort healthy — hiding
precisely the failure the gate exists to catch. Fixed to tie-averaged ranks. Positional
bucketing is retained for *measuring* the burst profile, where equal cells are wanted; the two
uses are now separate functions with the distinction commented.

**A truncated input.** `LINKUSDT_5m.json` arrived 2,088,960 bytes long from an interrupted
transfer and produced a parse failure. Every bar file is now verified to end with a closing
bracket before use.

## What this closes

The family closes on a measured shortfall, not on power. The mirror — fading the break at
+3.29 bps — is recorded as a train observation and not a result, since continuation was the
declared direction; it is a fifth of the floor in any case.

Dispersion is present: 26 to 33 percent of events clear 16 bps in the break direction while the
conditional mean is negative. That is the same shape as every prior closure — a paying tail not
identifiable by the conditioner in hand.
