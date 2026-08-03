# TASK-AH-047 — Execution Policy: Adverse-Selection Guard v0 (Result)

**Task ID:** TASK-AH-047-EXECUTION-POLICY-ADVERSE-SELECTION-GUARD-V0
**Date:** 2026-08-03
**Class:** `GUARD` — suppresses only. Never emits a direction, size or entry. Never receives capital.
**Label:** `DISCOVERY_NOT_PROOF`.

## 0. Verdict

**`DATA_INADEQUATE`** — the archive cannot supply 10 days in each of holdout and forward.

**But the guard separated states, strongly and consistently, and it beat its random-rate control.**
This is the first positive measurement of the session, and it is reported with the gate intact
rather than by relaxing the contract.

`promising_count` remains `0`. No entry was admitted. Nothing was allocated.

## 1. Result — 1,559,363 states across 10 symbols

| Split | evaluated | symbols | days | veto % | ALLOW mean | VETO mean | **prevented bps** | t |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Train | 1,715,280 | 10 | 15 | 14.8 | +0.126 | −0.726 | **+0.852** | 23.4 |
| Validation | 623,672 | 10 | 4 | 12.4 | +0.084 | −0.595 | **+0.679** | 11.7 |
| Holdout | 467,740 | 9 | 4 | 13.6 | +0.095 | −0.605 | **+0.700** | 14.8 |
| Forward | 311,800 | 9 | 3 | 12.8 | +0.095 | −0.642 | **+0.737** | 13.9 |
| **Combined OOS** | 779,540 | 9 | 6 | 13.3 | +0.095 | −0.620 | **+0.715** | 20.1 |

All four splits positive. Veto rate stable at 12–15%, comfortably inside the 2–80% bounds.

**Random-rate control:** observed separation +0.715 against a control centre of 0.000
(sd 0.036), **p = 0.000**. The real predicate sits roughly twenty standard deviations above a
random guard vetoing at the identical rate. This was the test designed to kill the result, and
it did not.

**Robustness:**

| Check | Result |
|---|---|
| Remove best symbol (`ADAUSDT`) | +0.658 |
| Remove best day (2026-08-01) | +0.684 |
| Horizon 60s | +0.715, t = 20.1 |
| Horizon 300s | +0.676, t = 8.4 |
| **AAVEUSDT excluded** (the symbol the predicate came from) | **+0.729, t = 18.7**, beats random p = 0.000 |

That last row matters most. The predicate was derived from a measurement on AAVEUSDT, which is
inside the sample. Removing it leaves the effect *slightly stronger*, so it is not an artefact of
the symbol that motivated it.

## 2. What the numbers actually say

**The ALLOW mean is +0.095 bps — essentially zero.** The VETO mean is −0.620.

The guard is not finding profitable states. It is identifying states that are reliably bad and
removing them. That is exactly what a guard should do, and it is the shape that confirms the
predicate is not secretly picking direction — had ALLOW been strongly positive, the thing would
have been an entry signal wearing a safety label.

**Magnitude in context:** +0.715 bps of avoided adverse move, against an 11 bps round trip, is
about 6.5% of the cost of a trade. Modest, but the cost floor does not apply here: a guard pays no
round trip. It avoids part of an adverse move on a trade whose cost is already being paid. A
0.7 bps *entry* edge would be dead on arrival; a 0.7 bps *saving* is not the same object.

## 3. Why the verdict is still DATA_INADEQUATE

The frozen contract requires at least 10 days in **each** of holdout and forward. The archive
covers ~26 days, so a 55/20/15/10 split yields 4 days and 3 days. The gate fires correctly.

The contract was not relaxed. Had the day requirement been met, every other gate passed: veto
rate in bounds, positive separation in both segments, remove-best survived, random control beaten.
The verdict would have been `GUARD_ADMITTED_RESEARCH_ONLY`.

**What would change it:** roughly 70 days of archive at this split ratio, or a pre-registered
change of split ratio in a new task with a new identity. Not a relaxation of this one.

## 4. A fail-open defect the tests caught

The first implementation returned `ALLOW` on zero net flow **before** validating the intent, so an
unrecognised intent fell through to `ALLOW`. A guard that opens when it does not understand the
question is worse than no guard.

Fixed: the intent check now runs first, and missing or non-finite depth on either side also
resolves to `NO_DATA`. Both cases are now covered by tests. Fail-closed is now structural rather
than incidental.

## 5. Honest limits

1. **The saving is potential, not realised.** There are zero admitted sleeves. The report records
   `admitted_sleeves_available_to_guard: 0`. Reporting this as revenue would be exactly the error
   the execution-policy naming exists to prevent.
2. **Uncorrected for multiplicity.** One predicate, frozen in the contract before the engine
   existed, derived from a recorded law rather than fished — cleaner than usual, but the p-value
   is still uncorrected against the programme's 1,066 documented prior trials.
3. **Ten symbols, 26 days, one venue.** The day-count gate is the binding limit, and it is real.
4. **No search for a better predicate.** That would be a parameter search and is out of scope by
   contract. This measures the one frozen rule.

## 6. Checks

| Check | Result |
|---|---|
| `node --check` (both scripts) | pass |
| Deterministic unit tests | **48 / 48 pass** |
| Static no-trading scan (11 assertions) | pass |
| Full replay, 10 symbols, 1.56M states | pass |
| `git diff --check` | clean |
| gitleaks | **NOT RUN — binary not installed, offline** |

Suite: guard class invariants 4/4 · predicate 5/5 · state construction 4/4 · chronology 2/2 ·
separation 4/4 · random-rate control 5/5 · verdicts 6/6 · end to end 7/7 · static scan 11/11.

Extraction used the validated server-side `awk` reduction pattern: read-only, nothing written to
the server, no raw market data copied into the repository.

## 7. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | `DISCOVERY` |
| Lifecycle state left | `DISCOVERY` — no transition |
| Position in the state machine | Guard remains research-only; no entry admitted |
| Next permitted transition | none performed |
| Evidence gate | day-count gate failed; every other gate passed |
| Failure route | `DATA_REQUEST` — a longer archive |
| Next queued task and owner | Operator/Codex. Natural next steps: promote `LAW.EXEC.BID_FILL_ADVERSE_SELECTION` from `observed` toward `replicated` using these checks, and record this guard measurement as a law in its own right |
| What this task cannot conclude | §5 |
| Files changed | The 6 allowlisted deliverables only |
| Prohibitions respected | Read-only server reads; nothing written to the server; no raw data copied into the repository; no parameter search; no live/paper, services, collectors, configs, coordinator, approval, KILL, secrets, orders, accounts or positions. `promising_count` remains `0` |

**Relevant lessons:**

- **LESSON-021** — the guard was measured at the level it operates on, and its saving is not
  claimed as edge.
- **LESSON-011** — the effect survives remove-best-symbol and remove-best-day, and holds without
  the symbol that motivated it.
- **LESSON-019** — the p-value is uncorrected and said to be so.

**Candidate new lesson:** a separation metric on a suppression rule is meaningless without a
control that suppresses at the same rate. Vetoing high-variance states flatters any such metric.
Proposed for the ledger; not recorded unilaterally.

## 8. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`; only the six allowlisted
files were staged. **Push not performed — it requires separate explicit approval.**
