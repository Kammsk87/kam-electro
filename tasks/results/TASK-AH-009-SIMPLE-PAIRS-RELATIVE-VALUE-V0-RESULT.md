# TASK-AH-009 — Simple Pairs Relative-Value v0 (Result)

**Task ID:** TASK-AH-009-SIMPLE-PAIRS-RELATIVE-VALUE-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. Verdict

**`STAGE_0_INFEASIBLE`** — closed. No Stage 1 was written. Holdout and forward untouched.

`promising_count` remains `0`.

## 1. Result — train only, in-sample pair selection

86 symbols with a full year of daily bars, 3,655 candidate pairs, 10 selected by lowest train
spread dispersion, weekly decisions, 10-day hold.

| Threshold | events | pairs | mean bps | median bps | sd | t | 95% CI | clears 22 bps? |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 1.5% | 170 | 10 | **+1.02** | +18.61 | 402 | 0.03 | [−59, +61] | no |
| 2.5% | 150 | 10 | **−8.51** | +13.74 | 408 | −0.26 | [−74, +57] | no |
| 4.0% | 125 | 10 | **−2.97** | +30.86 | 418 | −0.08 | [−76, +70] | no |

Cost floor 22 bps, double-cost stress 44 bps. Nothing comes close, and these are **upper
bounds**: the pairs were chosen on the same segment they were measured on.

## 2. Two findings beyond the verdict

**Positive median, mean at or below zero, at every threshold.** The spread usually converges —
median +18.6, +13.7, +30.9 bps — and occasionally blows out badly enough to erase all of it.
Standard deviation is roughly 400 bps against a 22 bps floor. This is the textbook pairs profile:
wins small and often, loses large and rarely. The mean is the number that matters, and it is zero.

**The test is underpowered, and says so.** Resolving a 22 bps effect at t = 3 against a 400 bps
dispersion needs roughly 3,000 events. We have 125–170. The harness computes this and sets
`underpowered: true` rather than letting a wide confidence interval read as a clean negative.

So the honest statement is not "convergence does not exist". It is: **the point estimate is
indistinguishable from zero under favourable selection, and the sample cannot resolve an effect
the size of the cost floor.**

## 3. Why widening the universe does not rescue it

More events would come from more pairs. But as the pair count grows, pair-specific selection
matters less and the strategy converges on cross-sectional relative value — which
**TASK-AH-041 already measured, and found net-negative out of sample.**

Both ends of the spectrum are therefore covered: few pairs is underpowered, many pairs is
AH-041 and negative. That closes the relative-value category rather than merely pausing it.

## 4. Two defects in the original contract

Recorded rather than worked around:

1. **Unmet precondition.** AH-009 requires AH-005A to report `DATA_READY_FOR_FROZEN_AH005`.
   AH-005A has never been executed. Stage 0 does not need it — it is train-only — but Stage 1
   could not have proceeded, and running Stage 1 without noticing would have been a governance
   failure.
2. **Underspecified exit.** The contract names convergence, ten trading days, and a fixed
   adverse-gap stop. Only the timeout carries a number. Stage 0 used the timeout alone and
   recorded the other two as `unspecified_exits_in_contract`. They must be frozen numerically
   before any successor.

## 5. Checks

| Check | Result |
|---|---|
| `node --check` (both scripts) | pass |
| Deterministic unit tests | **28 / 28 pass** |
| Static no-trading scan (11 assertions) | pass |
| Stage 0 replay, 86 symbols, 3,655 candidate pairs | pass |
| `git diff --check` | clean |
| gitleaks | **NOT RUN — binary not installed, offline** |

The suite asserts the seal directly: two symbols are made to co-move on train and diverge
violently in the sealed half, and pair-selection dispersion must be unchanged. It also asserts
every event index falls before the train boundary, that the spread return is exactly the sum of
the two legs, and that 15 bps clears one leg but not two.

Daily bars were reduced from the hourly archive on the server, read-only, with nothing written
there and no raw market data committed.

## 6. What this task cannot conclude

1. That relative-value convergence is absent. Only that its point estimate is zero here and the
   sample cannot resolve a cost-floor-sized effect.
2. Anything about other thresholds, holds or selection rules — all parameter searches.
3. Anything out of sample. Nothing out of sample was read.

## 7. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | `DISCOVERY` |
| Lifecycle state left | `CLOSED` at Stage 0 |
| Evidence gate | Stage 0 kill condition met under favourable in-sample selection |
| Failure route | `REJECTED_FAMILY` for this formulation; the category is closed jointly with AH-041 |
| Next queued task and owner | Operator/Codex |
| What this task cannot conclude | §6 |
| Files changed | The 5 files AH-009 allows, plus nothing else |
| Prohibitions respected | Existing data only; read-only server reads; nothing written to the server; no network, keys, exchange endpoints, paper/live, runner, service, coordinator, approval, KILL, configuration, model-ID or RESET_TS. `promising_count` remains `0` |

**Relevant lessons:**

- **LESSON-011** — a positive median with a zero mean is a tiny-N pocket wearing a different hat;
  the fat left tail is now flagged automatically.
- **LESSON-019** — 445 events across three thresholds were consumed and belong in the ledger.
- **LESSON-021** — the gate is economics before implementation; no Stage 1 was built.

**Candidate new lesson:** an underpowered test must declare itself. Reporting a wide confidence
interval as a negative result is how a programme convinces itself it has closed something it has
merely failed to measure. The required sample size should be computed and compared to the sample
in hand, every time.

## 8. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`. **Push not performed.**
