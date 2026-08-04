# G3 — Executable replay for a GUARD

Effective 2026-08-05. Defines gate G3 for candidates of class `GUARD`. The gate battery in
`tasks/results/TASK-006-MULTI-STRATEGY-ROUTER-ARCHITECTURE-V0-RESULT.md` §3.1 recognises
`class ∈ {ALPHA_SLEEVE, GUARD, EVIDENCE_LANE, EXECUTION_PROOF}` but states every gate in
`ALPHA_SLEEVE` terms. G3 reads:

> **G3 Executable replay** — Does it survive the real book? At-event executable prices, spread
> crossing, depth-limited size tiers, no-fill and partial-fill accounting, declared latency
> band; **expectancy remains positive net of all costs**.

**A guard has no expectancy.** It never enters and never exits. Applied literally, G3 is
unpassable for a guard not because guards fail it but because it asks a question they cannot
answer. This document supplies the question they can.

Written now, while the second archive span for `LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`
is still accumulating, so that the definition is not authored under pressure from a result.

## 1. What a guard produces

A guard produces a **difference between two executions of the same intent stream** — one where
its vetoes are honoured and one where they are not. That difference, not a P&L, is the object
G3 must measure under real book mechanics.

## 2. The intent stream

**The intent stream is exhaustive and synthetic, not a strategy's.** At every decision point,
both a LONG and a SHORT intent are evaluated, exactly as
`ah047_execution_policy_guard.mjs` did at ideal fill.

This is deliberate. Replaying a guard against a particular strategy's intents entangles the
guard's value with that strategy's quality, and the programme currently has no admitted
strategy to borrow. An exhaustive stream also removes the selection freedom that a chosen
intent set would introduce.

Decision points are the recorded book snapshots **plus** a declared set of offsets inside each
snapshot interval — see §4, which is the crux of this gate.

## 3. The paired replay

Two runs over the identical intent stream, under identical execution mechanics:

| | |
|---|---|
| **Run B** (baseline) | every intent is sent |
| **Run G** (guarded) | intents the guard vetoes are not sent; everything else is identical |

Execution mechanics apply to **both** runs and are the ones G3 already requires of an alpha
sleeve: at-event executable prices, spread crossing, depth-limited size tiers, queue position
for any passive leg, no-fill and partial-fill accounting, and a declared latency band.

**Primary measure:** the difference in realised outcome per *executed* intent between B and G,
at the frozen horizon. Not total: a guard that suppresses half the book will reduce total
adverse selection trivially.

**Secondary, reported always:** veto rate, fill rate in each run, and the outcome distribution
of the ALLOW set alone.

## 4. Staleness — the crux of this gate

This is the part that could close the guard, and it is stated first rather than discovered.

`guardState` consumes depth at the start and end of a book interval plus aggressive notional
within it. At ideal fill in TASK-AH-047 every intent was evaluated **exactly at a snapshot
boundary**, so the state was zero seconds old. That is not how execution works.

The recorded book is written event-driven at a cadence of roughly ten seconds. An intent
arriving between snapshots must use the state as of the **last completed** snapshot, which may
be up to a full interval stale, plus the latency band on top.

G3 therefore requires the guard to be evaluated at **declared offsets inside the interval**,
not only at its boundary:

- offset 0 (the ideal-fill case, retained only as the upper bound it is);
- offsets at 25, 50 and 75 percent of the median interval;
- each with the declared latency band added.

A pilot against this section was run on 2026-08-05 (`reference/GUARD_STALENESS_DECAY_PILOT_2026-08-05.md`).
It confirms the section's premise and sharpens it: on one symbol-day the separation retains 82
percent at 1 s, 81 percent at 3 s, **54 percent at 5 s** and 31 percent at 8 s, with the decay
carried by the VETO side rising toward zero — the adverse move is largely consumed within the
first seconds. At a 10-second cadence a real intent carries a mean staleness near 5 seconds, so
the expected retention is about half. The pilot is underpowered on its own (t = 1.92 even at
offset 0) and is a shape indication, not a measurement.

**Kill condition specific to guards:** if the measured separation decays to zero by the 50
percent offset, the guard is an artifact of snapshot alignment rather than a usable execution
policy, and no latency engineering rescues it — the input simply is not there when the decision
is made. That outcome is `CLOSED_MEASURED` against a data-cadence constraint, not a signal
failure, and the successor is a data request for a faster book feed.

## 5. Controls

Both are mandatory and both must be run under the same execution mechanics as the guard.

**C1 — random veto at the identical rate.** A guard must beat a random guard vetoing at exactly
its own rate. Already applied at ideal fill in TASK-AH-047, where the measured guard beat the
random control by roughly twenty standard deviations; G3 requires it again under execution
mechanics, because a veto that survives at ideal fill may not survive once the vetoed intents
are the ones that would not have filled anyway.

**C2 — the allow-set mean.** If the ALLOW set's mean outcome turns materially positive, the
predicate is selecting direction rather than suppressing bad states. That breaks the producing
law's own recorded review criterion and the candidate must be reclassified out of `GUARD`
before it can proceed.

## 6. Acceptance

G3 passes for a `GUARD` when all of the following hold on TRAIN+VALIDATION, and are
re-reported unchanged on HOLDOUT:

1. the per-executed-intent difference between runs B and G is positive at the frozen horizon
   and at both neighbour horizons;
2. it survives at every declared offset in §4, not only at offset 0;
3. it beats control C1 at the pre-registered alpha, block-clustered;
4. control C2 holds — the allow-set mean does not turn materially positive;
5. the veto rate is stable across symbols and across time blocks, and is reported; a guard
   whose veto rate drifts materially is measuring the regime, not the state;
6. it survives remove-best-symbol and remove-best-block, as G5 requires of any candidate;
7. the difference is stated in basis points per executed intent alongside the round-trip cost
   floor, so its magnitude is legible against the thing it is meant to improve.

**A guard is never required to clear the cost floor.** It does not pay one. Its saving is
compared against the floor for scale only: a saving of a fraction of a basis point on a trade
already paying sixteen is a real but small improvement, and the report must present it as such
rather than as an edge.

## 7. What G3 does not authorise

Passing G3 makes a guard `ADMITTED_RESEARCH_ONLY` under the same rule as any other class. It is
not a paper or live authorisation; those require the independent evidence gate and an explicit
operator GO under `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`.

A guard that passes G3 also does not become a direction signal. `CD.SELECTION_ON_INSAMPLE_RANK`
and the producing law's review criterion both stand: the inverse of a veto is not an entry.

## 8. Why this was written before the data arrived

Three consecutive tasks produced verdict-inverting harness defects, none found by reading the
implementation. Rule R6 of the Chief Scientist protocol requires a harness to be checked against
an independent computation. A gate definition authored after seeing the result it judges is the
same failure in a slower form.

The staleness requirement in §4 is the concrete reason this could not wait: it changes what has
to be recorded, and had it been discovered after the archive completed, it would have cost
another collection cycle.
