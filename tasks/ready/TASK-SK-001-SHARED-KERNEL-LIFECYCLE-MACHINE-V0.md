# TASK-SK-001 - Shared Kernel Candidate Lifecycle Machine v0

Status: **completed 2026-08-07**. Result:
[TASK-SK-001-SHARED-KERNEL-LIFECYCLE-MACHINE-RESULT.md](../results/TASK-SK-001-SHARED-KERNEL-LIFECYCLE-MACHINE-RESULT.md)

Card written after implementation, on operator request, for symmetry with
TASK-MX-001 and TASK-MX-002. This is recorded rather than hidden: the
specification below was agreed in dialogue before the work, but the file did not
exist while the work was done, so this card is a transcription and not a
preregistration. Nothing in it was chosen after seeing a result — the module
produces no measurement — but the distinction matters and is stated.

## Lifecycle

- Infrastructure. Enters and leaves no stage; creates no candidate.
- Governs: every future transition on both venues.

## Objective

Port `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md` into an executable, venue-
agnostic Python module in the shared kernel, and wire the MOEX paper gate to it,
so that the candidate state machine is enforced rather than remembered.

## Architecture

Two layers, per the shared-kernel decision of 2026-08-06:

- **Shared kernel** — `shared_kernel/lifecycle.py`. Knows nothing about an
  exchange, instrument, fee or signal.
- **Venue adapters** — the MOEX bot consumes it through
  `tools/check_paper_gate.py`. The Node side of Botalin continues to consume the
  protocol documents, which remain the authority for both.

## Required properties

The four things a bare enum plus a `current_stage` attribute would not give:

1. **Adjacency.** Exactly one legal successor per state, forward only. A
   candidate cannot reach a live allocation because someone passed the wrong
   enum member.
2. **Traceability.** A transition requires non-empty `reason`, `evidence` and
   `task_id`. A transition nobody can trace to a report did not happen.
3. **Identity.** `model_id` and `reset_ts` are part of the state. Per the source
   document, a changed rule is a new candidate, not a repair of history;
   resuming after a non-terminal route produces a new object via
   `structural_variant()` and never mutates the closed one.
4. **No self-authorisation.** `can_enter_paper()` returns False unconditionally.
   Entry to `QUARANTINED_PAPER_OBSERVER`, `MICRO_LIVE_MECHANICS` and
   `PORTFOLIO_FORWARD` raises `OperatorGoRequired` without an
   `operator_go_ref`, and an earlier GO does not carry forward.

## States and routes

Ten states: `DATA_HEALTH`, `DISCOVERY`, `CANDIDATE_PASSPORT`,
`IDEAL_FILL_AND_OOS`, `EXECUTION_REPLAY`, `QUARANTINED_PAPER_OBSERVER`,
`MICRO_LIVE_MECHANICS`, `FORWARD_RETENTION`, `ROUTER_ADMISSION`,
`PORTFOLIO_FORWARD`.

Five routes, split by whether work continues:

- non-terminal: `STRUCTURAL_VARIANT`, `DATA_REQUEST`, `GUARD_ONLY`
- terminal: `QUARANTINE`, `REJECTED_FAMILY`

`LADDER_TO_STAGE` maps the Stage 0–4 ladder of
`reference/BOTALIN_RESEARCH_PIPELINE_PROTOCOL_2026-08-03.md` onto these states.
The ladder and the lifecycle are two framings of one machine, as that protocol
says itself.

## Safety boundary

Pure state machine. No network, no credential, no order path, no filesystem
write except an explicit `save()` the caller asks for. `check_paper_gate.py` may
be wired to the machine but must retain `blocked` as its only code-reachable
outcome.

## Acceptance

- The machine can express the project's actual history: `TASK-MX-001` →
  `DATA_REQUEST` → `TASK-MX-002` → `TASK-MX-003`. A machine that cannot
  represent work already done is the wrong machine.
- Skipping a rung, moving backwards, leaving a terminal route, resuming without
  a recorded structural difference, and reusing a `model_id` are all refused.
- No `return True` exists in `can_enter_paper`.
- `check_paper_gate.py` returns `blocked`, exit code 1.
- Self-check passes with no test framework installed.

## Deliverables

1. `shared_kernel/lifecycle.py`
2. `shared_kernel/test_lifecycle.py` — 21 checks
3. `moex-futures-bot/tools/check_paper_gate.py` — rewired, behaviour preserved
4. `tasks/results/TASK-SK-001-SHARED-KERNEL-LIFECYCLE-MACHINE-RESULT.md`
