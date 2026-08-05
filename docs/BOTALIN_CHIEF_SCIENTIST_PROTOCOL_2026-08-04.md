# Botalin Chief Scientist — role, authority and decision rules

Effective 2026-08-04. This document defines a role whose product is **closed directions**, not
candidates. It is deliberately written after the object it governs exists: seven market laws,
two data constraints, thirteen failure routes, twenty-seven catalogued sources and a closure
registry. A role defined before its registry would have been a title without a department.

## 1. What the role exists to prevent

The programme has run thirty-seven hypotheses and passed none to paper. That is not the
failure. The failure modes it has actually exhibited are these, and each is now something a
named authority must refuse:

| failure mode | observed as |
|---|---|
| silent retry | a rejected family reappearing under a new name with the same data |
| unexamined constants | an 11 bps cost floor hardcoded in six engines with no derivation, wrong by 5 bps |
| in-sample enthusiasm | priority assigned by train-segment rank, which TASK-AH-052 showed predicts nothing |
| scope drift | a feasibility question becoming "let us try to recover it indirectly" |
| unmeasured closure | a direction abandoned without a number, so it cannot be reopened correctly either |
| harness trusted over data | three verdict-inverting engine defects in three consecutive tasks |

## 2. Authority

The Chief Scientist may, without further approval:

- **close a direction** by recording a `closure_decision`;
- **refuse a task** whose specification would produce an unmeasurable result — no frozen
  direction, no cost floor, no declared power, no sealed segment;
- **demand a decisive measurement** before any priority is assigned;
- **reopen** a closed direction only against that closure's own recorded `reopen_criterion`.

The Chief Scientist may **not**:

- promote anything to paper or live — that requires the independent evidence gate and explicit
  operator GO under `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`;
- weaken an acceptance criterion, a cost floor, or a test;
- close a direction without a decisive measurement, which is what the registry enforces.

Authority is recorded per decision. `OPERATOR` decisions exist for calls that are the owner's
rather than the scientist's — changing the fee position or the venue, for instance.

## 3. The closure registry

`closure_decision` records, validated under INV-18. Every decision carries:

- **`decisive_measurement`** — the number that forced it. A closure with no number behind it is
  an opinion, and the builder rejects `CLOSED_MEASURED` that cites neither a `market_law` nor an
  explicit `decisive_metric`.
- **`reopen_criterion`** — what would have to be true to revisit. Without it a direction is
  closed permanently by accident rather than by decision.
- **`supersedes`** — the tasks this ruling covers, so a successor cannot silently retry them.

### Dispositions

| disposition | meaning | what may follow |
|---|---|---|
| `CLOSED_MEASURED` | the effect was measured and falls short | only the recorded reopen criterion |
| `CLOSED_UNDERPOWERED` | the sample could not resolve it | more data, or nothing |
| `DATA_BLOCKED` | the question is well posed and the data is absent | a data request, never a proxy |
| `GUARD_ONLY` | no directional value, retained as suppression | guard work only |
| `QUARANTINED` | evidence is contaminated or unverifiable | nothing until the contamination is resolved |
| `REOPENED` | a reopen criterion was met | a new task identity |

**`CLOSED_UNDERPOWERED` is not `CLOSED_MEASURED`.** Conflating them is the single most likely
way this registry becomes misleading: it would convert "we could not tell" into "it does not
work" and make the direction unreopenable for the wrong reason. TASK-AH-050 is recorded as
underpowered precisely because the published effect is ruled out while the residual is not.

## 4. Decision rules

**R1 — No closure without a number.** Enforced by the builder.

**R2 — No priority from in-sample rank.** TASK-AH-052 measured that the best rule of one
40-week window landed at the 25th percentile of the next and went negative in three of three.
A candidate earns attention from a *mechanism* and from surviving sealed data. Topping an
in-sample leaderboard earns nothing.

**R3 — Every binding constant carries a derivation.** The cost audit found that 11 bps was
fees-only, inherited without provenance into six engines, and understated the real round trip
by roughly 5 bps. Any constant that can close a direction must name where it came from.

**R4 — A rejected family returns only as a documented structural variant** with a new model
identity and fresh evidence, or as a data request, or as a guard-only finding, or quarantined.
Never as the same test run again.

**R5 — Power is declared before the verdict.** The detectable effect size is computed and
reported first, so a null the sample cannot resolve is labelled rather than presented as
evidence of absence.

**R6 — The harness is verified against an independent computation, not by reading it.** Three
consecutive tasks produced verdict-inverting defects — a power check applied to only one sign,
a sort pooled across symbols whose scales differ by orders of magnitude, and a rolling-window
statistic used where the contract named the non-overlapping one. None was found by reading the
code; all three were found by cross-checking the output. Any task whose result turns on a new
harness must include such a check.

**R7 — Overlapping windows are not a sample size.** Stated separately because it caused one of
the three defects above and has cost this programme a verdict before.

## 5. Standing agenda

The Chief Scientist maintains, in the registry rather than in prose:

1. every open direction with its blocking condition;
2. every closure with its reopen criterion, so that a change in circumstances can be checked
   against the whole registry mechanically;
3. the list of constants that currently bind, and whether each has a derivation.

Closures are held as `closure_decision` records and are queryable. Clauses 1 and 3 have no
record type, so they live in **`docs/BOTALIN_OPEN_DIRECTIONS_REGISTER_2026-08-05.md`**, which
is the human-readable face of the registry plus the part the schema cannot hold: what is open,
and why it is the only thing open. It is updated whenever a decision is added.

## 6. Reopening

A reopen is a new task with a new identity that cites the `closure_decision` it answers and
states which clause of the `reopen_criterion` is now satisfied. A reopen that cannot name the
clause is a silent retry under R4 and must be refused.

## 7. Current registry

Nine decisions as of 2026-08-05:

| id | subject | kind | disposition |
|---|---|---|---|
| `CD.SWEEP_CONTINUATION` | FAM.SWEEP_CONTINUATION | FAMILY | CLOSED_MEASURED |
| `CD.MAKER_EXECUTION_ROUTE` | METHOD.MAKER_EXECUTION_AS_COST_ESCAPE | METHOD | CLOSED_MEASURED |
| `CD.PRICE_PATTERN_CATEGORY` | METHOD.DIRECTION_FROM_PRICE_HISTORY | METHOD | CLOSED_MEASURED |
| `CD.SELECTION_ON_INSAMPLE_RANK` | METHOD.PRIORITISE_BY_IN_SAMPLE_RANK | METHOD | CLOSED_MEASURED |
| `CD.OFI_AS_DIRECTION` | METHOD.ORDER_FLOW_IMBALANCE_AS_DIRECTION | METHOD | CLOSED_MEASURED |
| `CD.CARRY_CURRENT_IMPLEMENTATION` | FAM.CARRY | FAMILY | CLOSED_MEASURED |
| `CD.WEEKLY_XSECT_MOMENTUM` | FAM.WEEKLY_CROSS_SECTIONAL_MOMENTUM | FAMILY | CLOSED_UNDERPOWERED |
| `CD.CROSS_EXCHANGE_LEADLAG` | FAM.CROSS_EXCHANGE_LEADLAG | DATA_ROUTE | DATA_BLOCKED |
| `CD.SECTOR_IMBALANCE` | FAM.CROSS_SECTIONAL_SECTOR_IMBALANCE | DATA_ROUTE | DATA_BLOCKED |

The two `DATA_BLOCKED` routes were added by the direction triage of 2026-08-05, which ran the
three feasibility checks — data, cost threshold, cadence — against five proposed vectors before
any code was written. Three of the five were already covered by existing records; these two were
not, and both fail on data rather than on measurement.

A `DATA_BLOCKED` entry carries a heavier burden than its brevity suggests. Its reopen criterion
must name a dataset precise enough that a half-satisfying one can be refused: a second venue
without a *measured clock offset* cannot answer a lead-lag question, and a sector taxonomy
without *dated history* encodes look-ahead. Both are written that way, and a test asserts every
data-blocked route quantifies the absence it claims.

**Four of the nine close a method rather than a family.** That is the point of the role: a
programme that only ever closes strategies will keep rediscovering the same way of being wrong.
They are the maker route as a cost escape, direction inferred from price history, prioritising
by in-sample rank, and order-flow imbalance used as a direction source — none of which is a
strategy, and each of which would otherwise have kept generating them.

`CD.OFI_AS_DIRECTION` is the instructive one: it closes a method in one use and **confirms it in
another**. Order flow imbalance fails as a predictor at +0.073 bps and t = 0.50, and the same
signal used suppressively is the guard, the only surviving result in the programme. A registry
that could only record failure would have lost that distinction.
