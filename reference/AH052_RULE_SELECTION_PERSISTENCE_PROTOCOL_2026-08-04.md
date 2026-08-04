# AH-052 — Rule Selection Persistence, protocol

Research only. Read-only over a locally held panel. No network, service, credential, exchange,
account, order, execution or position path. This task measures the selection step and produces
no candidate; `promising_count` is 0 by construction.

## The question

Out-of-sample testing asks whether a chosen rule survives. **Persistence asks whether choosing
has any skill at all.** Bajgrowicz & Scaillet (JFE 106(3), 2012) applied it to 7,846 technical
rules over the DJIA from 1897 to 2011 and found that an investor could never have selected ex
ante the rules that would perform best next.

The programme has closed thirty-seven hypotheses on the unexamined premise that the evidence
available at ranking time carries information about what comes next.

## Why the corpus is a rule family and not our own closure record

The obvious corpus — the thirty-seven closed hypotheses — is not usable, and that is itself a
finding:

- the warehouse holds **zero experiments with results at more than one segment**, so there is
  no in-sample/out-of-sample pair per candidate to correlate;
- only four to seven families ran full chronological splits, and a rank correlation over five
  units answers nothing;
- per-symbol per-segment contributions were never retained, and the archives that would allow
  recomputing them were server-side reductions no longer held locally.

Enumerating a rule family is legitimate here and would be a parameter search in a strategy
task. The object of study is selection *among* rules, so a single frozen rule would make the
question unaskable.

## Frozen specification

| | |
|---|---|
| Rules | 9 formations × 2 directions × 3 portfolio widths = **54** |
| Formations | 1, 2, 3, 4, 6, 8, 12, 16, 24 weeks |
| Directions | momentum (long top bucket), reversal (long bottom bucket) |
| Portfolios | terciles, quintiles, deciles |
| Holding | 1 week, equal-weighted, no overlap |
| Costs | turnover measured, 16 bps per side |
| Window | P = 40 weeks |
| Primary series | **non-overlapping transitions** |
| Descriptive series | rolling, step 4 weeks, explicitly overlap-dependent |
| Panel | TASK-AH-050 extended: 187 weeks × 43 symbols |

## Statistics

**Rank persistence.** Spearman correlation between the period-1 ranking of the 54 rules and
their period-2 outcomes, averaged across transitions.

**Winner persistence — the operational one.** Where the period-1 winner lands in the period-2
distribution, as a percentile. A ranking can correlate across its middle while its top is
noise, and only the top matters for a programme that acts on its best candidate. The winner is
scored against the period-2 **median of all rules**, never against zero: beating zero would
only say the rule class was profitable that period, whereas the question is whether choosing
beat not choosing.

## Result

**`SELECTION_TOP_DOES_NOT_PERSIST`.**

| | non-overlapping (primary) | rolling (dependent) |
|---|---:|---:|
| transitions | 3 | 21 |
| mean Spearman | 0.078 | 0.228 |
| detectable Spearman | 0.193 | 0.145 |
| winner − median | −34.9 bps | −8.3 bps |
| winner percentile | 0.245 | 0.468 |
| winner above median | 0 % | 33 % |

| start | winner | p1 | p2 | median p2 | percentile | ρ |
|---|---|---:|---:|---:|---:|---:|
| 24 | `k16_MOM_b10` | +282 | −23 | −11 | 0.42 | 0.03 |
| 64 | `k3_MOM_b10` | +130 | −37 | −14 | 0.26 | −0.06 |
| 104 | `k6_REV_b10` | +160 | −82 | −12 | 0.06 | 0.27 |

All three winners were **decile** portfolios — the most concentrated width, therefore the
widest dispersion, therefore the most likely to top an in-sample window and revert. That is an
overfitting signature, not a market fact.

## Power, stated before the verdict

Three independent transitions. Under the null that the winner is a random draw, landing below
the median three times of three has probability 1/8. **This result does not establish the
finding on its own.** Its weight is corroborative: it agrees with a study spanning 7,846 rules
and a century of data.

## The overlap trap, demonstrated on this engine

The rolling series reports mean Spearman 0.228 against 0.145 detectable, which reads as
resolvable evidence of selection skill. It is not. Windows of 40 weeks stepped by 4 share
ninety percent of their data; 21 transitions are not 21 observations.

The first cut of the engine used rolling as primary and returned
`SELECTION_CARRIES_INFORMATION` — the opposite verdict — despite this contract naming
non-overlapping as primary. The contract was written first and the engine disagreed with it.
Caught by reading the contract against the output, pinned by a regression test asserting
`primary_series === 'non_overlapping'`.

## Consequence

A closure is a statement that something failed, and failure is far easier to establish than
success; this result does not invalidate the thirty-seven closures. It bears the other way:
**a candidate that tops an in-sample leaderboard has thereby earned close to nothing.**
Attention should follow a mechanism and survival on sealed data, never an in-sample rank.
