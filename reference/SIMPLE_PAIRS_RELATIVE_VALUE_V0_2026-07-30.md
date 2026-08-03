# AH-009 — Simple Pairs Relative-Value, Stage 0 Protocol

**Task:** TASK-AH-009-SIMPLE-PAIRS-RELATIVE-VALUE-V0
**Date:** 2026-08-03 (contract dated 2026-07-30)
**Label:** `DISCOVERY_NOT_PROOF`. Research only. **Closed at Stage 0.**

## 0. Why a Stage 0 gate was added

AH-009 was written on 2026-07-30, before the research pipeline protocol was accepted. That
protocol now requires a Stage 0 feasibility gate ahead of any Stage 1 evaluation. The gate is
supplied here and ran first. It failed, so no Stage 1 was written.

Two facts about the original contract are recorded rather than silently worked around:

1. **Its precondition is unmet.** AH-009 requires AH-005A to report
   `DATA_READY_FOR_FROZEN_AH005`. AH-005A has never been executed. Stage 0 does not need it —
   it is train-only and consumes no sealed data — but Stage 1 could not have proceeded.
2. **Its exit rule is underspecified.** AH-009 names three exits: convergence, ten trading
   days, and a fixed adverse-gap stop. Only the ten-day timeout carries a number. Stage 0
   therefore uses the timeout alone, and the other two are recorded in `FROZEN` as
   `unspecified_exits_in_contract`. They would have to be frozen numerically before Stage 1.

## 1. The cost floor is 22 bps, not 11

A pairs trade has two legs and each pays a round trip. Returns are measured on the per-leg
notional, so the floor is 22 bps and the double-cost stress is 44 bps. AH-009 already required
a pass to be positive after double cost, which is the correct and stricter bar.

This matters: it is the highest cost floor in the programme, and it is the right one.

## 2. Stage 0 is deliberately optimistic

Pairs are selected on the **same train segment they are then measured on**, by lowest dispersion
of the normalised spread. That is in-sample selection, and it is intentional: every figure Stage 0
produces is an **upper bound**. A hypothesis that cannot clear its cost floor under favourable
selection cannot clear it out of sample.

The report carries `selection_is_in_sample: true` so no reader can mistake the number for a
result.

## 3. Guarantees the harness enforces

- The normalised price is `close_t / close_{t-60d}` and is `null` before the reference window.
- Pair selection reads only the train segment. A shipped test makes two symbols co-move on train
  and diverge violently in the sealed half, then asserts the selection dispersion is unchanged.
- Events are never drawn from the sealed segment; a shipped test asserts every event index falls
  before the train boundary.
- The laggard is bought and the leader sold, in equal dollar legs, and the spread return is
  asserted to be exactly the sum of the two leg returns.
- A positive median with a non-positive mean is flagged as `median_positive_mean_not` — the fat
  left tail signature.
- The sample size required to resolve a cost-floor-sized effect at t = 3 is computed and compared
  to the sample actually available, so an underpowered test cannot be read as a negative result.

## 4. Result

Closed at Stage 0. See the task result for the numbers.

None of the three frozen thresholds clears the 22 bps two-leg floor, under in-sample selection.
All three show a positive median with a mean at or below zero, and all three are underpowered to
resolve an effect the size of the cost floor.

## 5. What this protocol cannot conclude

1. That relative-value convergence does not exist here. It concludes the point estimate is
   indistinguishable from zero and the sample cannot resolve a cost-floor-sized effect.
2. That a wider pair universe would fail. It would raise the event count — but widening toward
   many pairs converges on cross-sectional relative value, which TASK-AH-041 already measured and
   found net-negative out of sample.
3. Anything about other thresholds, holding periods or selection rules. Searching over them is a
   parameter search requiring a new task with a new identity.
