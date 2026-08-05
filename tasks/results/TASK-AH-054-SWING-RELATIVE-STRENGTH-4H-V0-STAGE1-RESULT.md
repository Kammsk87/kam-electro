# TASK-AH-054 — Swing Relative Strength 4H v0 — STAGE 1 RESULT (TRAIN ONLY)

**Label: `TRAIN_ONLY_NOT_A_PASSPORT`. promising_count: 0.**
**The 209 sealed events were not touched and must not be spent.**

## Verdict

**The family does not pass.** It beats its matched null and lands close to its pre-registered
prior, and then fails on concentration: **92.8 percent of the total net result comes from one
calendar year**, and removing that year takes the effect from t = 2.36 to **t = 0.44**.

## Headline numbers, 255 train trades

| | gross | net |
|---|---:|---:|
| mean | +325.9 bps | **+309.6 bps** |
| median | −389.0 bps | **−405.1 bps** |

| | |
|---|---:|
| t on net | **2.36** |
| detectable at t = 3 | 393.7 bps |
| win rate | **30.6 %** |
| average win | +1,969.8 bps |
| average loss | −422.0 bps |
| **payoff ratio** | **4.67** |
| p05 / p95 | −516.2 / +3,624.9 |
| mean hold | 13.6 bars (≈2.3 days) |
| exits | EMA 116, STOP 121, TIMEOUT 18 |
| max drawdown | −11,787.7 bps |

Funding over the actual hold is charged at the measured conditional rate and is immaterial:
gross to net differs by 16.3 bps, of which about 0.3 is funding.

## Correction: my own payoff-trap flag is a false positive here

The engine raised `payoff_trap_signature: true` on the rule *positive mean with a non-positive
median*. **That rule is too crude and the diagnosis it implies is wrong.**

The recorded payoff trap — `FAM.AMEL_DIRECTIONAL`, and the Bybit account — is **77.5 percent
wins at a payoff ratio of 0.089**: many tiny wins against rare catastrophic losses, needing a
91.9 percent win rate to break even. Unsurvivable arithmetic.

This is the mirror image: **30.6 percent wins at a payoff ratio of 4.67**. Many small losses
against rare large wins. The arithmetic closes cleanly — 0.306 × 1,970 − 0.694 × 422 = +310 bps,
which is the measured mean. That is the ordinary shape of a stopped trend-following strategy,
not a trap.

The flag should require **payoff ratio below 1** alongside the median condition. Recorded here
rather than silently corrected, because a detector that fires on the healthy case is worse than
none.

## What actually fails it

### 1. One year carries almost everything

| year | n | mean net | total net |
|---|---:|---:|---:|
| 2023 | 108 | +52.4 bps | +5,656 |
| **2024** | **147** | **+498.6 bps** | **+73,297** |

Remove-best-year removes 2024, which is **92.8 percent of the total net**:

| | n | net mean | net median | t |
|---|---:|---:|---:|---:|
| all train | 255 | +309.6 | −405.1 | **2.36** |
| without 2024 | 108 | **+52.4** | −516.0 | **0.44** |

In 2023 the strategy returned 52 bps a trade and could not be distinguished from zero.

The task's Stage 1 acceptance requires survival of remove-best-year. It does not survive.

**A structural note that makes this worse, not better.** The chronological 55 percent split puts
**only 2023 and 2024 in train**; all of 2025 and 2026 sit in the sealed segment. So the training
period contains exactly two years and one of them is the entire result. There is no third year
in view to say whether 2024 was the regime or the exception.

### 2. It loses to simply holding BTC in three trades out of four

Benchmark is BTC held over the **identical window of each trade**, not a single buy-and-hold
figure for the span.

| | |
|---|---:|
| BTC mean over the same windows | +126.2 bps |
| BTC median | −19.6 bps |
| excess mean | +183.4 bps |
| **excess median** | **−256.2 bps** |
| **trades beating BTC** | **27.1 %** |

The mean advantage over BTC comes from the same handful of outliers that carry the mean itself.
In **72.9 percent** of cases holding BTC over the same days would have done better.

### 3. Remove-best-symbol survives, which is the one robustness test it passes

WIF carries 23.9 percent of the total. Without it: n = 245, net mean +245.4 bps, t = 2.25. No
single symbol carries the result.

## What it does pass

**The matched null.** Same number of entries per symbol, placed at random admissible bars, under
the identical exit ladder, 200 draws:

| | |
|---|---:|
| null mean | +15.5 bps |
| null p05 / p95 | −57.4 / +101.9 |
| **strategy** | **+309.6 bps** |

The strategy is well outside the null's 95th percentile. **The entry condition does carry
information** — the result is not merely an artifact of holding these symbols in this period
under this exit ladder.

**The pre-registered prior.** Recorded as +181.3 bps gross before the engine existed; measured
+325.9. The difference is **1.1 standard errors** — not a falsification in either direction.
The prior was about right, which is the first time in the programme a pre-registration has
landed on target.

## Disposition

The signal is real enough to beat its null and to match its prior, and it is not established:
one year of two carries 93 percent of it, and it loses to passive BTC in three quarters of its
trades.

**The sealed 209 events stay sealed.** Spending them now would consume the only independent
evidence available on a candidate that has already failed a robustness test on train — and
`CD.SELECTION_ON_INSAMPLE_RANK` measured what an in-sample winner is worth.

The honest next step is not a holdout run. It is a longer train segment containing more than two
years, so that remove-best-year has something to remove. That means re-splitting a longer
history, not re-reading this one.

## Safety

Train segment only. Read-only. No live, paper, service, collector, config, coordinator,
approval, KILL, secret, order, account or position path. Sealed segment untouched, and recorded
as such.
