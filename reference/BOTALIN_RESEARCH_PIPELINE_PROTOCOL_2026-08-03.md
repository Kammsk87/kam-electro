# Botalin Research Pipeline — Standing Protocol

**Date:** 2026-08-03
**Status:** DRAFT, operator-directed. Binding only once Codex accepts it; until then it is a
recommendation, not a rule.
**Scope:** every strategy-research task from hypothesis to any live order.

## 0. Why this exists

The stages below are not new. They are already in
`docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`. What has been missing is enforcement and, more
specifically, a cheap check *before* the expensive ones: gate `G3` (executable replay) has
never been passed by any family, because no replay harness was ever built, and two tasks in
one session were fully implemented before anyone asked whether their horizon could pay the
round trip at all.

Every rule below is followed by the measurement that earned it. A rule without evidence is
an opinion and does not belong here.

## The ladder

```
Stage 0  FEASIBILITY          minutes      can this idea pay for itself, in principle?
Stage 1  IDEAL FILL + OOS     hours        does the signal predict, before execution?
Stage 2  EXECUTION REPLAY     days         does it survive the real book at real size?
Stage 3  PAPER OBSERVER       weeks        does it survive data generated after the freeze?
Stage 4  MICRO-LIVE MECHANICS operator GO  do our orders actually work?
```

A stage is entered only from the stage before it. A negative result **closes the family**
along a named route; it does not send it back for tuning.

---

## Stage 0 — Feasibility

**Input:** a proposed horizon, a size tier, an execution contour (maker or taker), and the
frozen cost model. No strategy code.

**What it asks:** what would have to be true for this idea to be tradeable at all?

Two checks, both minutes of work:

1. **Horizon vs cost floor.** Measure the dispersion of the move over the intended horizon
   and the share of moves beyond the round-trip cost.
2. **Execution contour.** If the plan depends on maker fills, simulate them pessimistically
   before assuming the spread is earned.

**Kill condition:** the horizon's move distribution cannot pay the round trip, or the
execution contour is negative before any signal is applied.

**Evidence.** Measured on AAVEUSDT, 2026-07-15:

| Horizon | sd of mid move | share beyond 11 bps |
|---|---:|---:|
| 10 s | 3.6 bps | 1.6% |
| 1 min | 8.6 bps | 16.2% |
| 5 min | 19.5 bps | 48.1% |
| 15 min | 35.5 bps | 71.6% |

At 60 seconds the cost floor exceeds one standard deviation of the move. No signal quality
rescues that. This check alone would have closed TASK-AH-019 and TASK-AH-046 before either
was written.

Maker contour, same day, 8,638 placements per side, pessimistic last-in-queue assumption:
fill rate 28%, half-spread captured +0.72 bps, forward move conditional on fill −2.11 bps
(buy) and −1.50 bps (sell), **total −1.07 bps before fees, t = −9.07**. Adverse selection
exceeded the captured spread threefold. That closed the maker contour for the whole class in
one run, with no backtest.

**What it does not prove:** nothing about any specific signal. Passing Stage 0 means the idea
is not arithmetically dead, not that it works.

---

## Stage 1 — Ideal fill and out-of-sample

**Input:** a frozen rule — entry, exit, stop, target, timeout, universe, timeframe — declared
before any result is seen.

**Ideal fill has a precise definition:** the executable-side quote at the first tick with
`ingest_ts` strictly greater than the decision time `t`. **Not a candle close.** A backtest
priced on the close of the signal bar is a leak, and it passes garbage to the expensive
stages downstream.

**The statistical attacks belong inside this stage, not after it:**

- chronological splits with purge and embargo sized to the outcome window and feature warm-up;
- matched null, ≥1,000 samples, two-sided, seeded;
- remove-best symbol, remove-best day;
- concentration;
- two pre-declared parameter neighbours, **measured on validation, never on holdout**.

**Precision is quoted on the gross mean, never on the cost-inclusive net mean.** A t-statistic
on a mean that carries a constant cost only ever tests whether the cost differs from zero, and
it grows more impressive with every added observation regardless of signal quality.

**Kill condition:** non-positive at ideal fill, or indistinguishable from its matched null.
Route to `STRUCTURAL_VARIANT`, `DATA_REQUEST`, `GUARD_ONLY`, `QUARANTINE` or
`REJECTED_FAMILY` — never to an execution fix.

**Evidence.** TASK-AH-046 measured +1.96 bps at t = 1.74 on one symbol-day (n = 288) and
+0.073 bps at t = 0.50 out of sample (n = 56,073). Going straight from the probe to an
execution simulator would have spent the expensive stage on noise. Separately, the first full
run reported t-statistics of −101, −75 and −53 — all computed on the cost-inclusive net mean,
and all meaningless.

**What it does not prove:** that the result is executable. Ideal fill is a *necessary screen*,
deliberately optimistic.

---

## Stage 2 — Execution replay

**Input:** a rule that survived Stage 1 unchanged.

Replay against recorded books at declared size tiers, with queue position, latency band,
partial fills, no-fills, and spread crossing. A tier the book cannot absorb is `UNSUPPORTED`,
never an assumed fill. Report ideal and executable outcomes side by side; the gap between them
is the number that matters.

**Kill condition:** expectancy does not survive the real book at the intended clip. Route to
execution redesign, a venue or size restriction, or reject.

**This is gate G3, and no Botalin family has ever passed it** — the harness does not exist.
Building it is infrastructure, used by every later candidate, not a one-off cost.

**What it does not prove:** that it will work forward. Replay is still historical.

---

## Stage 3 — Quarantined paper observer

**Input:** a rule that survived Stage 2, with a written freeze manifest and a `freeze_ts`.

Accrues an immutable forward cohort on data generated **after** the freeze. Independent day
clusters, pre-registered stopping rule.

**Kill condition:** the forward cohort fails its pre-registered rule.

**What it does not prove:** execution. Paper is a hypothesis generator; it has already lied
about fills and regime in this programme. It never substitutes for Stage 2.

---

## Stage 4 — Micro-live mechanics

**Input:** everything above, plus a **fresh explicit operator GO for this specific run.** Not
a standing authorization, not implied by any earlier stage.

Bounded to 1–3 fills, with a decision trace and independent flat verification.

**What it proves:** that our orders work — the order routes, the fill is detected, the position
closes flat, the side is correct.

**What it does not prove — and this is the point most easily lost: it does not prove edge.**
N is far too small, and a symbolic clip receives better execution than a real one. In the
two-axis evidence framework this is axis X3, which proves mechanics and never edge.

**Evidence.** The FADE family reached perfectly clean live execution — market fills, WS
detection, flat verification, correct slippage — and the signal was still negative at ideal
fill. Execution was polished for a rule that never had an edge. Calling this stage "checking
reality" invites exactly that mistake.

---

## Rules that cut across every stage

**Kill conditions are pre-registered.** Each stage declares, before it runs, what result would
close the family. A ladder without them becomes a loop: fail, adjust, pass.

**Overlap is checked before any statistic is credited.** A family adjacent to a rejected one
cannot reach a passport draft until exact trade-timestamp overlap has been *measured*. It is
currently `UNAVAILABLE` for every comparison family because the per-trade ledgers were never
retained — so today, no adjacent family can pass, and that is the correct answer, not an
obstacle to work around.

**A rejected family returns only with a recorded structural difference, a new task ID and a
new model identity** — and confirmation on data generated after the failure was recorded.

**Multiplicity is inherited.** The trials ledger records 1,066 documented prior trials, of which
1,046 exist only as aggregate batches. Any p-value is uncorrected until deflated against that
count, and the count is a floor known to be too low.

**Nothing promotes.** The ceiling of this pipeline is `CANDIDATE_PASSPORT_DRAFT`, a research
state. `promising_count` stays `0`. Paper start, live start, coordinator enablement, approval
creation and capital changes each require a separate fresh operator GO.

---

## The one-line version

**Before building anything, compute what would have to be true for the idea to work, and check
that first.** Stage 0 costs minutes and would have saved two full task implementations in a
single session.

---

## What this protocol cannot fix

1. It cannot create edge. It only stops us paying for the discovery that there is none.
2. It cannot clear the overlap gate — that needs retained per-trade ledgers which do not exist.
3. It cannot shorten Stage 3. A forward cohort takes the time it takes.
4. It cannot substitute for Codex acceptance. Until then this is a recommendation.
