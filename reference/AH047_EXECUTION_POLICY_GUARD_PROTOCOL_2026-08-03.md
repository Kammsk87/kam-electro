# AH-047 — Execution Policy: Adverse-Selection Guard, Protocol v0

**Task:** TASK-AH-047-EXECUTION-POLICY-ADVERSE-SELECTION-GUARD-V0
**Date:** 2026-08-03
**Class:** `GUARD`
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. What this is, and what it is deliberately not

This is an **execution policy**, not a strategy sleeve. It suppresses; it never emits a
direction, a size, or an entry, and it never receives capital. The naming is not cosmetic: as
soon as a guard is described as a sleeve, someone computes a PnL for it and reports a return
that does not exist.

Its KPI is **prevented adverse selection in basis points** — the adverse move avoided on
entries that were going to happen anyway. That is not PnL, and the engine's report carries a
`kpi_note` saying so, with a shipped test asserting the report contains no `pnl`, `revenue`,
`profit` or `equity` key.

**There are currently zero admitted sleeves.** A guard that suppresses nothing real saves
nothing real. Everything measured here is therefore *potential*, realisable only once an
admitted entry exists to guard. The report records `admitted_sleeves_available_to_guard: 0`.

## 1. Frozen before the run

| Element | Value |
|---|---|
| Reference population | every snapshot, **both** a hypothetical long and a hypothetical short |
| Predicate (LONG) | `VETO` when aggressive sell notional > buy notional **and** bid depth fell |
| Predicate (SHORT) | exact mirror on buy notional and ask depth |
| States | `ALLOW`, `VETO`, `NO_DATA` — three, closed |
| Horizon | 60s primary, 300s reported |
| Splits | chronological 55/20/15/10, purge 1, embargo 30 intervals |
| Primary metric | `prevented_adverse_bps` = mean forward move in ALLOW minus mean in VETO, each signed against its intent |
| Control | random guard vetoing at the **identical rate**, 1,000 seeded draws, two-sided |
| Veto-rate bounds | below 2% or above 80% is `DEGENERATE` regardless of the metric |

The predicate was written into the task contract before the engine existed, and it was derived
from an already-recorded law (`LAW.EXEC.BID_FILL_ADVERSE_SELECTION`) rather than fished from the
data. Only one predicate was tested.

## 2. Why both intents are always evaluated

The guard is judged on how it partitions the **whole** population, never on a selected subset.
Evaluating only longs, or only the states the guard happens to like, would let the veto rate
and the metric be chosen together. A shipped test asserts long and short states are produced in
equal number.

## 3. The control that decides everything

A guard that vetoes high-variance states will flatter any separation metric without carrying
information. The only way to tell is a **random guard vetoing at the same rate**.

If the real predicate cannot beat its own random control at the identical veto rate, its
separation is an artefact of how many states were removed rather than which ones. The engine
computes this, the verdict ladder places `NOT_BETTER_THAN_RANDOM` ahead of admission, and two
shipped tests check both directions: a deliberately information-free guard must fail the control,
and a deliberately separating guard must pass it.

## 4. Fail closed

A guard is a safety component, so every unknown resolves to `NO_DATA`, never to `ALLOW`:

- an unrecognised intent;
- missing or non-finite aggressive flow;
- missing or non-finite depth on either side.

This was not the original behaviour. The first implementation returned `ALLOW` on zero net flow
*before* validating the intent, so an unrecognised intent fell through to `ALLOW` — a guard that
opens when it does not understand the question. The shipped test caught it and the intent check
now runs first. Both the fail-open case and the missing-depth cases are now covered by tests.

## 5. Verdict ladder

```
DATA_INADEQUATE          not enough states, symbols or days
DEGENERATE               veto rate outside 2%..80%
NO_SEPARATION            prevented_adverse_bps <= 0, or it does not survive remove-best
NOT_BETTER_THAN_RANDOM   the random-rate control is not beaten
GUARD_ADMITTED_RESEARCH_ONLY
```

The best attainable verdict is research-only. It admits no entry, allocates no capital, and does
not change `promising_count`.

## 6. Interpreting the metric honestly

`prevented_adverse_bps` is the gap between two conditional means. A guard that works shows a
**near-zero ALLOW mean and a negative VETO mean** — it removes a known negative rather than
creating a positive. If the ALLOW mean were strongly positive, that would indicate the predicate
is picking direction, which a guard is forbidden to do.

The cost floor does not apply to this number. A guard pays no round trip; it avoids part of an
adverse move on a trade whose cost is already being paid. So a saving well below 11 bps is still
meaningful, in a way that a 0.7 bps *entry* edge would not be.

## 7. What this protocol cannot deliver

1. It cannot make the saving real. With zero admitted sleeves it is potential.
2. It cannot correct for multiplicity across the AH series.
3. It cannot establish that the predicate is the best one. One predicate was frozen and tested;
   searching for a better one would be a parameter search and is out of scope by contract.
4. It cannot promote anything.
