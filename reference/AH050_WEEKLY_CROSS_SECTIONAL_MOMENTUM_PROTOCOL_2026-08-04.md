# AH-050 — Weekly Cross-Sectional Momentum, Stage 0 protocol

Research only. Read-only. No network beyond a read-only reduction of the existing archive, no
service, credential, exchange, account, order, execution or position path.

## The frozen specification

Declared before any outcome was inspected, and taken from the source paper rather than fitted.

| | |
|---|---|
| Formation | cumulative return over the trailing **3 completed weeks**, on closes |
| Neighbours | 1, 2 and 4 weeks — **reported, never substituted for the primary** |
| Holding | exactly 1 week, no overlap with formation |
| Portfolio | quintiles, **equal-weighted** |
| Long-short | top quintile long, bottom quintile short, zero net investment |
| Rebalance | weekly, non-overlapping |
| Costs | turnover **measured**, charged at 16 bps per side; 32 bps stress; 11 bps reported for comparison only |
| Train | first 55 percent of rebalances; the remainder sealed and untouched |
| Power target | t = 3 |

## Data

Read-only reduction of `/opt/botalin-edge/data/bars_xs/bars.json` (hourly bars, format
`{SYMBOL: [[ts_ms, o, h, l, c, v]]}`) to weekly closes. Nothing was written to the server; the
reducer emitted `symbol week_index close` to stdout and the 45 MB source was never copied.

Week boundaries are anchored to Monday 1970-01-05 00:00 UTC, so they are fixed and
reproducible rather than relative to the archive's own start.

**Two trims, both declared before the run:**

1. The first and last week indices (2880 and 2932) are **partial calendar weeks** at the
   archive edges. Their last bar is not a weekly close, and a return computed against it is
   fabricated. Both dropped.
2. Symbols without an unbroken weekly series over the remaining span are dropped entirely
   rather than interpolated. An interpolated close inside a formation window is a fabricated
   return.

| | |
|---|---|
| Span after trim | week 2881 to 2931, **51 weeks**, 2025-03-24 to 2026-03-15 |
| Symbols with complete series | **87** of 109 |
| Symbols dropped for holes | 22 |
| Rebalances available | 47 total, **25 train**, 22 sealed |

## Result

**Verdict: `STAGE_0_INFEASIBLE`.** Closure reason: only 22 sealed weeks, below the declared
minimum of 30.

### The premise of the task is confirmed

This task existed to test one arithmetic claim: that the cost floor binds only because every
prior test held for minutes. That claim holds.

| | 15-minute horizon (AH-048) | weekly horizon (this task) |
|---|---:|---:|
| Round-trip cost | 16 bps | 14.7 bps per rebalance |
| Available move | 8.94 bps mean | 603 bps weekly sd |
| **Cost as share of the move** | **179 %** | **2.4 %** |

Even the 32 bps double-cost stress leaves cost at 4.9 percent of one weekly standard
deviation. At this horizon the cost floor is not the binding constraint. That is the first
time this has been true anywhere in the programme.

Turnover was **measured, not assumed**: 42 percent of the long book and 50 percent of the
short book are replaced at each rebalance. Charging a full replacement, as a naive model
would, overstates the cost by roughly a factor of two.

### The signal is not there in this sample

| formation | n | gross bps | t | cost bps | net bps | weeks net + |
|---|---:|---:|---:|---:|---:|---:|
| 1 week | 26 | −10.9 | −0.10 | 24.5 | −35.4 | 54 % |
| 2 weeks | 26 | +190.6 | 1.84 | 17.3 | +173.2 | 65 % |
| **3 weeks (primary)** | **25** | **+105.9** | **0.88** | **14.7** | **+91.2** | **72 %** |
| 4 weeks | 25 | +94.5 | 1.28 | 12.9 | +81.7 | 60 % |

The primary point estimate is positive and means nothing at t = 0.88.

**Quintile means (bps, low to high): 70.4, 122.4, 103.1, 48.9, 176.4 — not monotone.**

Monotonicity is the robustness criterion adopted from the source paper, where all five
quintiles order almost perfectly. Here the fourth quintile is the *worst* of the five. A
spread carried by the two extreme buckets with no ordering between them is not a
cross-sectional effect.

The neighbour spread is itself evidence. Formation windows of 1, 2, 3 and 4 weeks overlap
heavily and should behave similarly if a real effect were present. They range from −11 to
+191 bps with no coherent pattern. That is what noise dominance looks like.

### Why the sample cannot resolve it

Weekly long-short dispersion is 603 bps. At t = 3 this sample of 25 train rebalances can only
detect an effect of **362 bps**. The source paper's own effect sizes are 250 to 410 bps.

| true effect | train weeks needed at t = 3 | total weeks needed |
|---:|---:|---:|
| 250 bps | 53 | ~97 |
| 300 bps | 37 | ~68 |
| 410 bps | 20 | ~37 |

We have 51 total weeks. The literature's effect sits **right at the edge** of what this
archive can resolve — not comfortably inside it and not hopelessly outside it.

**This is `UNDERPOWERED`, not evidence of absence.** The formal verdict is
`STAGE_0_INFEASIBLE` because the sealed-segment rule fires first, but the substantive reason
is power, and it must not be reported as a refutation of cross-sectional momentum in crypto.

## Known limitations, stated rather than discovered later

1. **Survivorship.** Dropping the 22 symbols without a complete year keeps only instruments
   that existed and were quoted throughout. That is a selection on survival and it biases
   toward whatever those symbols did.
2. **Equal weight, not value weight.** The source is value-weighted by market capitalisation,
   which this archive does not carry. Dollar-volume weighting would be a different factor
   wearing the same name, so equal weighting was chosen and declared.
3. **One year, one regime.** The source sample is 2014-2018 with a 1.3 percent mean weekly
   market return. Neither sample generalises to the other.
4. **The source charges no costs at all.** Its returns are gross, and it never uses the words
   turnover or fee. Its 4.1 percent figure is also selected — the paper says three-week
   momentum was chosen *"because it generates the largest long-short spread in the data"*
   among four horizons measuring 2.7, 3.3, 4.1 and 2.5. The unselected expectation is nearer
   3 percent.

## What would change the answer

The archive needs to roughly **double, to about two years**, for this test to have the power
to resolve a literature-sized effect with a properly sealed out-of-sample segment.

Unlike every other blocked family in the programme, this one is not waiting on a recorder.
The history already exists and is a backfill rather than a collection wait. That makes it the
cheapest unblock currently on the board — but it is a data task requiring its own approval,
and extending the span reopens the survivorship question rather than settling it.

## Engine defect found and fixed during the build

The first cut of the Stage 0 gate checked power only when the point estimate was negative. A
positive result that was statistically indistinguishable from zero passed silently. A
pure-noise fixture produced +23.2 bps at t = 1.53 and was awarded `STAGE_0_PASS`.

The gate now evaluates power **before** the sign and applies it to both. The regression test
uses that exact fixture and five seeds, so the defect cannot return unnoticed.
