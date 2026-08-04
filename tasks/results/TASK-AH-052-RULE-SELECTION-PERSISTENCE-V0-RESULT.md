# TASK-AH-052 — Rule Selection Persistence v0 — RESULT

**Verdict: `SELECTION_TOP_DOES_NOT_PERSIST`.**
**Label: `SELECTION_DIAGNOSTIC_NOT_A_CANDIDATE`. promising_count: 0 by construction.**

This task measures the programme's selection step, not a strategy. It cannot produce a
candidate and emits no rule recommendation.

## One-line summary

Across three independent transitions, the best rule of one 40-week window landed at the 25th
percentile of the next and went outright negative every time — consistent with the published
finding, though three transitions cannot establish it alone.

## Setup

54 rules enumerated mechanically: formation ∈ {1,2,3,4,6,8,12,16,24} weeks × direction ∈
{momentum, reversal} × portfolio ∈ {terciles, quintiles, deciles}. All equal-weighted, one-week
hold, no overlap, turnover measured and charged at 16 bps per side. The three-week quintile
momentum rule that TASK-AH-050 measured is one of the fifty-four and carries no privilege.

Panel: the TASK-AH-050 extended panel — 187 weeks × 43 symbols, cross-validated against the
server-derived series at 0.00 bps mean absolute difference. Window P = 40 weeks.

## Result

| | **non-overlapping (primary)** | rolling (overlap-dependent) |
|---|---:|---:|
| transitions | **3** | 21 |
| mean Spearman | **0.078** | 0.228 |
| detectable Spearman | **0.193** | 0.145 |
| winner − median | **−34.9 bps** | −8.3 bps |
| winner percentile in period 2 | **0.245** | 0.468 |
| winner above median | **0 %** | 33 % |

Per transition, independent series:

| start | period-1 winner | p1 | p2 | median p2 | winner percentile | Spearman |
|---|---|---:|---:|---:|---:|---:|
| 24 | `k16_MOM_b10` | +282 | **−23** | −11 | 0.42 | 0.03 |
| 64 | `k3_MOM_b10` | +130 | **−37** | −14 | 0.26 | −0.06 |
| 104 | `k6_REV_b10` | +160 | **−82** | −12 | 0.06 | 0.27 |

## What this says

**The rank ordering as a whole carries nothing resolvable.** Mean Spearman 0.078 against 0.193
detectable on three independent transitions.

**The top of the ranking — where selection actually operates — did worse than the middle.** All
three period-1 winners underperformed the period-2 median, and all three were outright negative
after having averaged +190 bps in the window that selected them. A programme acts on its best
candidate, so this is the statistic that matters, and it points the wrong way.

**Every winner was a decile portfolio.** `b10` in all three, the most concentrated of the three
portfolio widths. The most concentrated variant has the widest dispersion, so it most often
tops an in-sample window and most often reverts. That is an overfitting signature rather than a
market fact, and it is visible here in three of three.

## What this does not say

Three independent transitions is a small sample. Under the null that the winner is a random
draw from the field, landing below the median three times out of three has probability 1/8.
**That is not conventional significance and this result does not establish the finding on its
own.** Its weight comes from agreeing with Bajgrowicz & Scaillet, who reached the same
conclusion over 7,846 rules and a century of daily data.

It also says nothing about whether the rules are profitable. That is measured elsewhere and is
a different question. The question here was whether *ranking* them predicts anything.

## The overlap trap, demonstrated on our own engine

The rolling series shows mean Spearman 0.228 with a detectable threshold of 0.145 — which
reads as resolvable evidence of selection skill. It is not. Windows of 40 weeks stepped by 4
share ninety percent of their data, so 21 transitions are not 21 observations and the standard
error is understated by roughly the overlap ratio.

**The first cut of this engine used the rolling series as the primary and returned
`SELECTION_CARRIES_INFORMATION`** — the opposite verdict — despite the task contract naming the
non-overlapping series as primary. The contract was written before the engine and the engine
disagreed with it. Caught by reading the contract against the output, and pinned by a
regression test asserting `primary_series === 'non_overlapping'`.

This is the third harness defect in three tasks, after AH-050's one-sided power check and
AH-051's cross-symbol pooling. All three inverted or falsified a verdict, and none was found by
reading the implementation.

## Consequence for the programme

The programme has closed thirty-seven hypotheses on the premise that the evidence available at
ranking time carries information about what comes next. On this rule class and this data, the
top of a ranking does not persist.

That does not invalidate the closures — a closure is a statement that something failed, and
failure is far easier to establish than success. It bears on the opposite direction: **any
future claim that a candidate looks promising on train should be treated as carrying close to
no information about its out-of-sample behaviour**, and priority orderings built on in-sample
rank should not be trusted.

The practical rule this supports: a candidate earns attention from a *mechanism* and from
surviving sealed data, never from topping an in-sample leaderboard.

## Deliverables

1. `scripts/analysis/ah052_rule_selection_persistence.mjs`
2. `scripts/test_ah052_rule_selection_persistence.mjs` — 27/27 passing
3. `reference/AH052_RULE_SELECTION_PERSISTENCE_PROTOCOL_2026-08-04.md`
4. `data/ah052_rule_selection_persistence_2026-08-04.{csv,json}`
5. This result file

## Safety

Read-only over a locally held panel. No network, live, paper, service, collector, config,
coordinator, approval, KILL, secret, order, account or position path. No raw market data
committed. `promising_count` is 0 and the engine emits no rule recommendation.
