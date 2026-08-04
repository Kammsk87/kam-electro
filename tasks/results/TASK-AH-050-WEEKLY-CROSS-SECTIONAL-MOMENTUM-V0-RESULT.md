# TASK-AH-050 — Weekly Cross-Sectional Momentum v0 — RESULT

**Verdict: `STAGE_0_INFEASIBLE` (substantively `UNDERPOWERED`).**
**Lifecycle stage: DISCOVERY. Next permitted transition: DATA_REQUEST or closure.**
**promising_count: 0.** No Stage 1 implementation was written, as the contract requires.

## One-line summary

The cost premise is confirmed and the signal is unresolvable: at a weekly holding period the
measured round trip is 2.4 percent of one weekly standard deviation instead of 179 percent,
but 51 weeks of archive cannot resolve an effect of the size the literature reports.

## What was asked and what was done

The task tested whether cross-sectional momentum, rebalanced weekly, clears the audited cost
floor — the first test in this programme at a horizon where the arithmetic is not hopeless
before it starts. Specification frozen from Liu, Tsyvinski & Wu (JF 2022), with three of their
choices deliberately corrected rather than inherited: costs are charged, the primary horizon
is declared rather than selected, and the equal-weighting deviation is stated.

## Numbers

Universe 87 symbols with a complete series over 51 weeks, 2025-03-24 to 2026-03-15. 47
rebalances, 25 train, 22 sealed and untouched.

| formation | n | gross bps | t | cost bps | net bps | weeks net + |
|---|---:|---:|---:|---:|---:|---:|
| 1 week | 26 | −10.9 | −0.10 | 24.5 | −35.4 | 54 % |
| 2 weeks | 26 | +190.6 | 1.84 | 17.3 | +173.2 | 65 % |
| **3 weeks (primary)** | **25** | **+105.9** | **0.88** | **14.7** | **+91.2** | **72 %** |
| 4 weeks | 25 | +94.5 | 1.28 | 12.9 | +81.7 | 60 % |

Quintile means, low to high: **70.4, 122.4, 103.1, 48.9, 176.4 bps — not monotone.**

Measured turnover: 42 percent long, 50 percent short per rebalance. A naive full-replacement
assumption would have overstated cost by about a factor of two.

## The finding that survives regardless of the signal

| | 15-minute horizon | weekly horizon |
|---|---:|---:|
| Cost | 16 bps | 14.7 bps |
| Available move | 8.94 bps | 603 bps (sd) |
| **Cost as share of move** | **179 %** | **2.4 %** |

The cost floor is a horizon problem, not a market problem. Confirmed by direct measurement.
This is the first place in the programme where the floor is not the binding constraint, and it
holds even under the 32 bps stress, where cost reaches 4.9 percent.

## Why this is not a refutation

Weekly dispersion is 603 bps. At t = 3, this sample detects 362 bps. The source paper's own
effects are 250 to 410 bps. The literature's effect sits at the edge of resolvability here —
not comfortably inside, not hopelessly outside.

Reporting "cross-sectional momentum does not work in crypto" from this sample would be exactly
the error recorded from TASK-AH-009. It is absence of evidence.

Two further reasons the point estimate carries no weight: the quintiles are not ordered, and
four heavily overlapping formation windows produce results ranging from −11 to +191 bps with
no coherent pattern. Both are signatures of noise dominance rather than of a weak effect.

## Limitations declared, not discovered afterwards

1. **Survivorship** — 22 of 109 symbols dropped for incomplete history; what remains is
   selected on having survived and been quoted throughout.
2. **Equal weight** — the source is value-weighted by market cap, which this archive lacks.
3. **One regime** — one year, 2025-2026, against the source's 2014-2018.
4. **The source charges no costs at all**, and its headline horizon is selected on the outcome
   from among four.

## Engine defect found during the build

The first cut of the gate checked power only on a negative point estimate, so a positive
result indistinguishable from zero passed silently. A pure-noise fixture produced +23.2 bps at
t = 1.53 and was awarded `STAGE_0_PASS`. The gate now evaluates power before the sign, for
both signs. The regression test pins that exact fixture across five seeds.

This is worth recording as a lesson in its own right: **a feasibility gate that tests the sign
of a point estimate without testing whether it is resolvable will pass noise roughly half the
time.**

## What would change the answer

The archive needs to roughly double, to about two years. Unlike every other blocked family,
this is a **backfill and not a collection wait** — the history exists. That makes it the
cheapest unblock currently available, but it is a separate data task requiring approval, and
extending the span reopens survivorship rather than settling it.

---

# AMENDMENT — extended-data re-run, same day

The backfill was approved and run. The specification did not change; only the span did. Full
detail in `reference/AH050_EXTENDED_DATA_RERUN_2026-08-04.md`.

**Data.** Public daily klines 2023-01-01 to 2026-08-04 for all 109 symbols, public market-data
endpoint only. Panel rebuilt entirely from that single source. Cross-validated against the
original server-derived panel: **2,193 overlapping symbol-weeks, mean absolute difference
0.00 bps.** Span chosen by a rule written before the backfill finished — earliest start with at
least 40 complete symbols — giving **187 weeks × 43 symbols**, 100 train rebalances, 83 sealed.

**Verdict: `UNDERPOWERED`** — but a materially more informative one.

| | 51 weeks | **187 weeks** |
|---|---:|---:|
| gross mean | 105.9 | **91.1** |
| gross median | 216.8 | **21.0** |
| gross t | 0.88 | **1.48** |
| detectable at t = 3 | 362 | **185** |
| weeks net positive | 72 % | **51 %** |
| quintiles monotone | no | **yes** |

**Three things the extra data settled.**

1. **The published effect is ruled out.** Standard error is now 61.7 bps. The source's 250 to
   410 bps sit 2.6 to 5.2 standard errors above our 91.1. An effect of that magnitude is not
   present in this universe over this period. The 51-week sample could not have said so.
2. **The limiting resource was weeks, not symbols.** A pre-declared wide variant — 99 weeks ×
   76 symbols — gives t = 1.35 and quintiles of 33, 116, 35, 86, 135, not monotone. Nearly
   doubling the cross-section does not buy the ordering; nearly doubling the time series does.
3. **The cross-sectional ordering is real:** 90, 101, 123, 169, 181, monotone across all five.

**One thing it removed.** The 51-week run's flattering median of 217 bps and 72 percent hit
rate were small-sample artifacts. On 100 rebalances the median is 21 bps against a mean of 91
and the hit rate is 51 percent, with a negative net median at the 32 bps stress. Positive mean,
near-zero median, coin-flip hit rate — the payoff-trap signature already recorded as a
rejection route for `FAM.AMEL_DIRECTIONAL`.

**Survivorship is now severe** and is not corrected: 43 of 109 symbols carried a complete
series from January 2023, so the universe is selected on surviving three and a half years.

**Assessment.** The backfill did its job: it converted "we cannot tell" into two definite
statements and dissolved the encouraging-looking parts of the first run. What remains is a
monotone ordering worth about 91 bps a week that cannot be distinguished from zero and whose
payoff shape is a trap. Resolving it at t = 3 would need roughly four times this sample again,
and the shape argues against spending it. Recorded as `LAW.XSECT.WEEKLY_MOMENTUM_BOUNDED`,
which bounds the effect from above rather than establishing it. Sealed segment untouched.

## Deliverables

1. `scripts/analysis/ah050_weekly_cross_sectional_momentum.mjs`
2. `scripts/test_ah050_weekly_cross_sectional_momentum.mjs` — 32/32 passing
3. `reference/AH050_WEEKLY_CROSS_SECTIONAL_MOMENTUM_PROTOCOL_2026-08-04.md`
4. `data/ah050_weekly_cross_sectional_momentum_2026-08-04.{csv,json}`
5. This result file

## Safety

Read-only throughout. The server was read once through a stdout-only reducer; nothing was
written to it and the 45 MB source was never copied. No raw market data is committed — only
the aggregate result artifacts. No live, paper, service, collector, config, coordinator,
approval, KILL, secret, order, account or position path was touched. Sealed segments untouched.
