# AH-050 — extended-data re-run, 2026-08-04

The original Stage 0 closed `STAGE_0_INFEASIBLE` on 51 weeks with the substantive reason being
power: the sample could resolve only 362 bps at t = 3 against literature effects of 250 to 410.
It named the unblock as a backfill rather than a collection wait. This is that backfill and the
re-run on the same frozen specification.

**The specification did not change.** Formation 3 weeks, hold 1, quintiles, equal-weighted, no
overlap, turnover measured and charged at 16 bps per side, neighbours 1/2/4 reported and never
substituted. Only the data span changed.

## The backfill

Public daily klines, 2023-01-01 to 2026-08-04, for all 109 symbols carried by the
cross-sectional bar archive. Public market-data endpoint only: no credentials were read or
sent and no account, order, position or execution path was contacted. 109 of 109 symbols
returned bars, 1,312 daily bars each.

The panel was rebuilt **entirely from this one source** rather than spliced onto the existing
server-derived series, so no join between two conventions exists to go wrong.

### Cross-source validation

The overlapping period was checked cell by cell against the original panel, which was derived
from hourly bars on the server rather than from daily bars here.

**2,193 overlapping symbol-weeks. Mean absolute difference 0.00 bps. Worst 0.0 bps.**

The two sources agree exactly. That removes any question of the new result differing from the
old one because of where the data came from.

## Span selection, declared before the backfill finished

The archive start and the symbol count trade off directly: coins listed later cannot carry a
long history. The rule was written into `build_panel.mjs` before any result was inspected:

> take the **earliest** start week at which at least **40** symbols have a complete weekly
> series through the end.

Forty is five quintiles of eight. The criterion is coverage and never looks at returns. The
full coverage table is printed by the builder and is reproduced in part here:

| start | weeks | complete symbols |
|---|---:|---:|
| 2023-01-02 | 187 | 43 |
| 2023-09-11 | 151 | 53 |
| 2024-06-17 | 111 | 71 |
| **2024-09-09** | **99** | **76** |
| 2025-03-24 | 71 | 87 |
| 2026-01-26 | 27 | 108 |

**Primary: 187 weeks × 43 symbols.** A second point was declared before running it, to separate
"too few weeks" from "too few symbols": the **wide variant**, maximum symbols subject to at
least 99 weeks, giving 99 weeks × 76 symbols. It is reported whatever it shows and is not an
alternative to select between.

## Result

**Verdict: `UNDERPOWERED`.**

| | 51 weeks × 87 sym | **187 weeks × 43 sym** | 99 weeks × 76 sym |
|---|---:|---:|---:|
| train rebalances | 25 | **100** | 52 |
| gross mean | 105.9 | **91.1** | 102.6 |
| gross median | 216.8 | **21.0** | 192.1 |
| gross t | 0.88 | **1.48** | 1.35 |
| detectable at t = 3 | 362 | **185** | 229 |
| measured cost | 14.7 | **14.6** | 14.2 |
| net mean | 91.2 | **76.5** | 88.4 |
| weeks net positive | 72 % | **51 %** | 62 % |
| quintiles monotone | no | **yes** | no |
| sealed weeks | 22 | **83** | 47 |

Quintile means, low to high:

```
 51w:   70   122   103    49   176     not monotone
187w:   90   101   123   169   181     MONOTONE
 99w:   33   116    35    86   135     not monotone
```

Neighbours on the primary panel — 1, 2 and 4 weeks give 54.6, 56.3 and 72.0 bps at t of 0.79,
0.87 and 1.15. All positive and all pointing the same way, unlike the 51-week run where the
one-week formation came out negative.

## What the extra data settled, and what it did not

**Settled: the literature's effect size is ruled out here.** Standard error is now 61.7 bps.
Liu, Tsyvinski & Wu report 250 to 410 bps weekly. Against our estimate of 91.1 those sit **2.6,
3.4 and 5.2 standard errors away**. An effect of the magnitude they report is not present in
this universe over this period. The 51-week sample could not have said that.

**Settled: the limiting factor was weeks, not symbols.** The monotone quintile ordering appears
in the 187-week panel with 43 symbols and does not appear in the 99-week panel with 76. Nearly
doubling the cross-section does not buy it; nearly doubling the time series does. That makes
sense — quintile means are averaged across rebalances.

**Settled: the cross-sectional ordering is real.** 90, 101, 123, 169, 181 across five buckets
is the structure the source describes, and it emerged only once there were enough rebalances to
see it.

**Not settled: whether the ~91 bps spread is anything.** t = 1.48. It remains indistinguishable
from zero, and it now looks worse on shape than it did on 51 weeks:

- the median collapsed from 217 to **21 bps** while the mean stayed near 91;
- the share of weeks that are net positive fell from 72 % to **51 %**.

Positive mean, near-zero median, coin-flip hit rate. That is the payoff-trap signature the
catalogue already records as a rejection route for `FAM.AMEL_DIRECTIONAL` — a handful of large
weeks carrying an otherwise flat series. The 51-week sample's flattering median and 72 % hit
rate were a small-sample artifact, and more data removed them rather than confirming them.

At the 32 bps double-cost stress the net median is **negative** (−6.8 bps).

## Limitations

1. **Survivorship is now much stronger.** 43 of 109 symbols carried a complete series from
   January 2023. Those are the coins that existed and stayed listed for three and a half years.
   The source's own finding is that crypto momentum lives in the larger coins, so the test is
   well aimed at the right population — but that population is selected on survival, and the
   selection is more severe here than in the 51-week run.
2. Equal weight, not the source's value weight; the archive carries no market capitalisation.
3. The sealed segment of 83 weeks was **not touched**. The gate did not pass, so there was
   nothing to confirm.

## Assessment

The backfill did what it was supposed to do. It converted "we cannot tell" into two definite
statements — the literature's effect is not here, and the limiting resource was time rather
than breadth — and it turned an apparently healthy 72 % hit rate into a 51 % one.

What remains is a monotone cross-sectional ordering worth about 91 bps a week that cannot be
distinguished from zero and whose payoff shape is a trap. That is not a candidate. Whether it
is a small real effect or nothing would need roughly a further quadrupling of the sample to
resolve at t = 3, and the shape argues against spending it.
