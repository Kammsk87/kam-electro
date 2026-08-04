# TASK-AH-052 - Rule Selection Persistence v0

## The question, and why it is not another hypothesis

This programme has closed thirty-seven hypotheses. Every closure rests on the same implicit
assumption: that the evidence available when a candidate was ranked carries information about
how it will behave next. That assumption has never been tested.

Bajgrowicz & Scaillet (Journal of Financial Economics 106(3), 2012) tested it directly on
7,846 technical trading rules over the DJIA from 1897 to 2011 and found that **an investor
could never have selected ex ante the rules that would perform best next**. Their persistence
test is distinct from, and stronger than, out-of-sample testing: out-of-sample asks whether a
chosen rule survives, persistence asks whether *choosing* has any skill at all.

If rank in period 1 does not predict period 2, then thirty-seven closures are not thirty-seven
facts about the market. They are thirty-seven observations about noise, and the programme's
priority ordering has no basis.

**This task tests the selection process, not a strategy.** It cannot produce a candidate and
`promising_count` is zero by construction.

## Why the corpus is a rule family and not our own closure record

The obvious corpus is the thirty-seven closed hypotheses themselves. It is not usable:

- the warehouse holds **zero experiments with results at more than one segment**, so there is
  no in-sample/out-of-sample pair per candidate to correlate;
- only four to seven families ran full chronological splits, and a rank correlation over five
  units answers nothing;
- per-symbol per-segment contributions were never retained, and the archives that would allow
  recomputing them were server-side reductions no longer held locally.

That is itself a finding and is recorded as a constraint. In its place the test runs on the
one corpus that is both locally held and adequately powered: the extended weekly panel built
for TASK-AH-050 — 187 weeks and 43 symbols, cross-validated against the server-derived panel
at 0.00 bps mean absolute difference.

**Enumerating a rule family is legitimate here and would not be in a strategy task.** The object
of study is selection *among* rules. A single frozen rule would make the question unaskable.

## The frozen rule universe

Declared before any result is inspected, and enumerated mechanically rather than chosen:

| dimension | values | count |
|---|---|---|
| formation weeks | 1, 2, 3, 4, 6, 8, 12, 16, 24 | 9 |
| direction | momentum (long the top bucket), reversal (long the bottom bucket) | 2 |
| portfolio | terciles, quintiles, deciles | 3 |

**54 rules.** All equal-weighted, one-week hold, non-overlapping, long-short zero net
investment. Turnover is measured per rebalance and charged at the audited 16 bps per side, as
in TASK-AH-050.

No rule is privileged. The three-week quintile momentum rule that TASK-AH-050 measured is one
of the fifty-four and receives no special treatment.

## The persistence protocol

Frozen before the run:

- **Window length P = 40 weeks.** Long enough that a period-1 ranking is not pure noise, short
  enough to yield several non-overlapping transitions over 187 weeks.
- For each start `t`, rank all 54 rules by mean net long-short return over `[t, t+P)`, then
  measure each rule's mean net return over `[t+P, t+2P)`.
- **Primary statistic: Spearman rank correlation** between the period-1 ranking and the
  period-2 outcome, averaged across transitions.
- **Secondary, and the one that matters operationally: the period-2 performance of the
  period-1 winner**, against the median rule and against the mean of all rules in period 2.
- Both non-overlapping transitions (the primary) and rolling transitions stepped by 4 weeks
  (reported, with the overlap dependence stated) are computed.

## What each outcome means

| result | reading |
|---|---|
| mean Spearman clearly positive and the period-1 winner beats the period-2 median | selection carries information; the programme's ranking has a basis |
| mean Spearman near zero and the winner is indistinguishable from a median rule | selection has no skill on this rule class; every "promising on train" verdict was noise |
| mean Spearman clearly negative | worse than no skill: ranking is actively misleading and top-ranked rules should be avoided |

A near-zero result must not be reported as "the rules do not work" — the rules' own
profitability is measured separately and is not the question. The question is whether ranking
them predicts anything.

## Power, declared in advance

With 187 weeks and P = 40 there are three non-overlapping transitions and roughly 27 rolling
ones. Three is too few for the primary statistic to be resolved on its own, so the rolling
series carries the estimate and its overlap dependence is stated rather than ignored. The
detectable correlation at the declared confidence is computed and reported **before** the
verdict, and a null result that the sample cannot resolve is labelled `UNDERPOWERED`, as in
TASK-AH-050.

## Safety boundary

Read-only over a locally held panel. No network, no live/paper, services, collectors, configs,
coordinator, approval, KILL, secrets, orders, accounts or positions. Nothing written to the
server. No raw market data committed.

The rule universe, the window length, the statistic and the cost floor are frozen above.
Searching over any of them is a parameter search and requires a new task with a new identity.

## Acceptance

This task has no Stage 1 and produces no candidate. It is complete when the persistence
statistics are measured, reported with their power, and recorded — whatever they show.

`promising_count` must be 0. Any implementation that emits a rule recommendation is out of
scope and must be rejected in review.

## Deliverables

1. `scripts/analysis/ah052_rule_selection_persistence.mjs`
2. `scripts/test_ah052_rule_selection_persistence.mjs`
3. `reference/AH052_RULE_SELECTION_PERSISTENCE_PROTOCOL_2026-08-04.md`
4. `data/ah052_rule_selection_persistence_2026-08-04.{csv,json}`
5. `tasks/results/TASK-AH-052-RULE-SELECTION-PERSISTENCE-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, and `git diff --check`. Commit only
the allowlisted deliverables. Push requires separate approval.
