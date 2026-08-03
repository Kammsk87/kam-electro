# AH-046 — Parent Order Flow Imbalance, Protocol v0

**Task:** TASK-AH-046-PARENT-ORDER-FLOW-IMBALANCE-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. Why parents, not prints

A tape of child prints is not a tape of decisions.

One aggressive order that sweeps three price levels arrives on the public feed as three
prints. Counted naively it triples that actor's apparent footprint, and it buries them
among dust fills whose median notional is $31. Every flow statistic computed on raw
prints — CVD, taker-buy ratio, signed volume — is therefore a statistic about *fills*,
not about *decisions*, and the two are not proportional.

Collapsing children back into parents on one symbol-day changed the picture materially:

| | value |
|---|---|
| child prints | 111,140 |
| parent orders | 26,263 (4.2 fills each) |
| multi-level sweeps | 23.1% of parents, **74.5% of notional** |
| median parent notional | $31 |
| top 5% of parents | 63.6% of flow |

Three quarters of aggressive notional comes from orders that cross more than one level.
That is the population worth measuring, and it is invisible until the prints are joined.

## 1. Frozen before the full-sample look

Fixed by the task contract. Changing one makes a new task with a new identity, not a
repair of this one.

| Parameter | Value |
|---|---|
| Parent burst gap | **100 ms** |
| Neighbour gaps (validation only) | 50 ms, 200 ms |
| Bucket | 5 minutes UTC |
| Horizon | the next 5-minute bucket, mid to mid |
| Signal | `sign(Σ parent buy notional − Σ parent sell notional)` over **all** parents |
| Costs | 11 bps round trip; 22 bps double-cost stress |
| Splits | chronological 55 / 20 / 15 / 10 by bucket |
| Purge / embargo | 1 bucket / 3 buckets |
| Null | 1,000 samples, seeded, two-sided |

### Parent reconstruction rule

A child continues its parent when it shares the aggressor side, arrives within the burst
gap, and its price has **not moved against the aggressor** — a buyer sweeping upward keeps
lifting equal or higher offers; a seller keeps hitting equal or lower bids. A price that
retreats means a different actor, so the parent closes. All three conditions are tested.

### Why the signal is all parents, not the large ones

The exploratory probe tested both. Signed imbalance of **all** parents gave a mean forward
move of +1.96 bps (t = 1.74). The imbalance of the **top 1% by notional** gave +0.13 bps
(t = 0.08) — nothing.

That is the opposite of the intuitive story, and it is the reason the frozen signal uses
the whole population. The plausible reading is that an actor sweeping $143k is closing or
hedging rather than expressing a view; informed flow hides rather than sweeps. The rule is
frozen on the measurement, not on the story.

## 2. Why five minutes

Measured return dispersion for AAVEUSDT against the 11 bps cost floor:

| Horizon | sd of mid move | share of moves beyond 11 bps |
|---|---:|---:|
| 10 s | 3.6 bps | 1.6% |
| 1 min | 8.6 bps | 16.2% |
| **5 min** | **19.5 bps** | **48.1%** |
| 15 min | 35.5 bps | 71.6% |
| 1 h | 57.6 bps | 95.7% |

At 60 seconds the cost floor exceeds one standard deviation of the move. No signal quality
rescues that: you would have to be right about the tail almost every time. Costs stop
dominating somewhere between 5 and 15 minutes, which is why the bucket is 5 minutes and
not the 10-second cadence at which the book is recorded.

## 3. Timing and causality

The signal is read at bucket close. The entry reference is the mid at that same close, and
the outcome is the mid one bucket later. No price inside the outcome window informs the
decision, and `midAtOrBefore` is a binary search that cannot return a snapshot later than
the timestamp asked for. A shipped test appends a far-future snapshot and asserts every
observation is byte-identical.

A bucket with zero imbalance produces no observation — the rule does not trade a coin flip.
A bucket without a usable mid at either boundary is dropped, never imputed.

## 4. Scale, and why aggregation is part of the contract

The archive is 40 symbols × ~24 days. Reconstructing every parent order across it yields
roughly 25 million objects, which does not fit in memory, so extraction reduces each
symbol-day to bucket totals as it streams.

That reduction is a correctness risk: an aggregation bug would be invisible and would look
like a signal. Two defences are shipped:

1. `rehydrateBuckets` recomputes imbalance and direction from the buy and sell totals and
   ignores any `direction` the extractor supplies. A test feeds a deliberately mis-signed
   aggregate and asserts the arithmetic wins.
2. A test runs the identical synthetic panel through both the raw-print path and the
   pre-aggregated path and asserts every split statistic and the verdict match exactly.

## 5. Gates

```
DATA_INADEQUATE → DUPLICATE_OR_OVERLAP → OOS_FAIL_REJECT_FAMILY
                → ROBUSTNESS_FAIL_DEPRIORITIZE → CANDIDATE_PASSPORT_DRAFT
```

`CANDIDATE_PASSPORT_DRAFT` requires: holdout and forward each ≥100 buckets across ≥5
symbols and ≥10 days; positive net mean and median after 11 bps in both; non-negative
median at 22 bps; two-sided null p < 0.05; positive after remove-best-symbol and
remove-best-day; no symbol above 25% of absolute contribution; both neighbour gaps
non-negative on validation; and a **measured** exact ledger overlap against
`RAW_MOMENTUM`, `FAILED_BREAKOUT`, `WICK_RECLAIM`, `AMEL_EVENT` and `LIQUIDITY_GUARD`.

The per-trade ledgers for those families were not retained, so overlap is `UNAVAILABLE`
and blocking. The gate sits **before** any statistic is credited, and a shipped test builds
a result that passes every statistical gate and asserts the verdict is still
`DUPLICATE_OR_OVERLAP`.

## 6. Reporting discipline

Every split reports `net_std_err_bps`, `t_stat` and `cost_floor_gap_x` alongside the mean.
The gap to the cost floor is reported as a multiple, and is `null` when the mean is
negative rather than a misleading number. The result must state that gap explicitly and
must not describe a sub-cost edge as a candidate.

The probe that motivated this task measured a 6× gap on one symbol-day at t = 1.74. That is
the number to beat, and beating it is not the same as clearing it.

## 7. What this protocol cannot deliver

1. It cannot clear the overlap gate. Retained per-trade ledgers do not exist.
2. It cannot correct for multiplicity across the AH series. Any p-value is uncorrected and
   must be deflated against the programme's documented prior-trial count.
3. It cannot make a sub-cost edge tradeable. If the gap does not close, the surviving uses
   are as a guard, at a longer horizon, or with maker fills — each a separate task.
4. It cannot promote anything. A passing rule reaches `CANDIDATE_PASSPORT_DRAFT`, a
   research state, and paper or live remain separate operator-GO decisions.
