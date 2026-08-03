# TASK-AH-047 - Execution Policy: Adverse-Selection Guard v0

## Objective

Measure whether a veto predicate built on aggressive flow and same-interval liquidity change
identifies market states whose forward outcome is systematically adverse to an intended entry.

This is an **execution policy**, not a strategy sleeve. It has `class = GUARD`. It may suppress
an entry; it may never emit a direction, a size, or an entry of its own, and it may never receive
capital. Its KPI is **prevented adverse selection on entries that were going to happen anyway**,
measured in basis points of avoided adverse move. It is not PnL and must never be reported as PnL.

## The honest framing this task must preserve

There are currently **zero admitted sleeves**. A guard that suppresses nothing real saves nothing
real. Therefore v0 measures the *rule itself* against a reference entry population, and the result
report must state explicitly that any saving becomes realisable only when an admitted entry exists
to guard. Reporting a hypothetical saving as revenue is forbidden.

## Motivating measurement

`LAW.EXEC.BID_FILL_ADVERSE_SELECTION` (status `observed`): a passive fill at the touch is followed
by a move against the filled side of −2.11 bps (buy) and −1.50 bps (sell), against a captured
half-spread of +0.72 bps; total −1.07 bps before fees, n = 4,965, t = −9.07. All three statistical
checks are `NOT_RUN`, so the law is observed, not replicated. This task supplies the checks.

## Safety boundary

Read-only. No network fetch beyond read-only reads of the existing archive, no parameter search,
no live/paper, services, collectors, configs, coordinator, approval, KILL, secrets, orders,
accounts or positions. Nothing is written to the server.

## Frozen before any full-sample look

1. **Reference entry population.** At every book snapshot, both a hypothetical long and a
   hypothetical short are evaluated. The guard is judged on how it partitions these, not on any
   selected subset.
2. **Guard predicate.** For an intended long, `VETO` when aggressive sell notional exceeds
   aggressive buy notional in the interval **and** bid-side depth within 10 bps fell over the same
   interval. Mirror for a short. Otherwise `ALLOW`. Two states only, plus `NO_DATA`.
3. **Horizon.** Forward mid move over 60s and 300s from the snapshot.
4. **Splits.** Chronological 55/20/15/10 by snapshot, purge 1 interval, embargo 30 intervals.
5. **Primary metric.** `prevented_adverse_bps` = mean forward move, signed against the intended
   direction, in `VETO` states minus the same in `ALLOW` states. Positive means the guard is
   separating bad states from good ones.
6. **Mandatory control.** A **random guard vetoing at the identical rate**, 1,000 seeded draws.
   A guard that does not beat its own random control at the same veto rate is measuring nothing.
7. **Veto-rate bounds.** A guard vetoing above 80% or below 2% of states is reported as
   `DEGENERATE` regardless of its metric.

## Mandatory data gate

Per symbol: aggressor-classified trade prints, book snapshots with top-of-book depth on both
sides, and a causally usable forward mid. Missing any field is `DATA_INADEQUATE`. Candle-derived
substitutes for aggressor side are refused.

## Acceptance

`GUARD_ADMITTED_RESEARCH_ONLY` requires all of: holdout and forward each at least 1,000 evaluated
states across at least 5 symbols and at least 10 days; positive `prevented_adverse_bps` in both;
the effect surviving remove-best-symbol and remove-best-day; veto rate inside the bounds; and the
real guard beating its random-rate control at p < 0.05, two-sided.

Otherwise: `DATA_INADEQUATE`, `NO_SEPARATION` (the guard does not distinguish states),
`DEGENERATE` (veto rate out of bounds), or `NOT_BETTER_THAN_RANDOM`.

No verdict of this task admits any entry, allocates any capital, or changes `promising_count`.

## Deliverables

1. `scripts/analysis/ah047_execution_policy_guard.mjs`
2. `scripts/test_ah047_execution_policy_guard.mjs`
3. `reference/AH047_EXECUTION_POLICY_GUARD_PROTOCOL_2026-08-03.md`
4. `data/ah047_execution_policy_guard_2026-08-03.{csv,json}`
5. `tasks/results/TASK-AH-047-EXECUTION-POLICY-ADVERSE-SELECTION-GUARD-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, the full replay where the data gate
permits, and `git diff --check`. Commit only the allowlisted deliverables. Push requires separate
explicit approval.
