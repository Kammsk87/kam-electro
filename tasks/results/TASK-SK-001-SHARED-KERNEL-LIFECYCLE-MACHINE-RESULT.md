# TASK-SK-001 Result — Shared Kernel Candidate Lifecycle Machine

Date: 2026-08-07
Deliverables: `shared_kernel/lifecycle.py`, `shared_kernel/test_lifecycle.py`,
`moex-futures-bot/tools/check_paper_gate.py` (rewired)

## Lifecycle footer

- This is infrastructure, not research. It enters and leaves no stage.
- No candidate created. No strategy promoted.
- `check_paper_gate.py` returns `blocked`, exit code 1, and is now blocked for
  two independent reasons instead of one.
- Self-check: 21/21 passing. The MOEX cost-model suite still passes 33/33.

## What was built

A venye-agnostic port of `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md` into
`shared_kernel/lifecycle.py`, consumed by the Python side. The Node side
continues to consume the protocol documents, which are the authority for both.

## Divergences from the proposed specification, and why

The specification supplied by the operator described a five-stage machine while
asking for the nine/ten-state Botalin machine to be ported. Where the sketch and
the source document disagreed, the source document won. Three of the differences
were substantive.

### 1. The front of the ladder was missing

The sketch began at `STAGE_0_FEASIBILITY`. Botalin's machine begins at
`DATA_HEALTH` and passes through `DISCOVERY` and `CANDIDATE_PASSPORT` before any
statistical work.

**This is where all three completed MOEX tasks live.** TASK-MX-001, -002 and -003
each recorded «entered `DATA_HEALTH`, left `DATA_HEALTH`». Under the sketch they
would have had no state to occupy. A machine that cannot represent the work
already done is the wrong machine.

Implemented: all ten states, with `LADDER_TO_STAGE` mapping the Stage 0–4 ladder
from the pipeline protocol onto them. The ladder and the lifecycle are two
framings of one machine, as the protocol document itself states.

### 2. The back of the ladder was collapsed

The sketch went `STAGE_3_PAPER_GATE → STAGE_4_LIVE_ALLOCATION`. Botalin places
four states between paper and any allocation: `MICRO_LIVE_MECHANICS`,
`FORWARD_RETENTION`, `ROUTER_ADMISSION`, `PORTFOLIO_FORWARD`.

They exist because of a specific, expensive lesson: the FADE family reached
perfectly clean live execution — market fills, WS detection, flat verification,
correct slippage — and the signal was still negative at ideal fill.
`MICRO_LIVE_MECHANICS` is the state that proves orders work while proving
nothing whatever about edge. Collapsing it into «live allocation» removes the
distinction that lesson was purchased to establish.

Implemented: all four retained, each requiring its own operator GO where the
source document requires one.

### 3. Failure routes were all terminal, and `DATA_REQUEST` was absent

The sketch made five failure states, all terminal, and did not include
`DATA_REQUEST`. Botalin's five routes are `STRUCTURAL_VARIANT`, `DATA_REQUEST`,
`GUARD_ONLY`, `QUARANTINE`, `REJECTED_FAMILY`, and the first three are how work
continues after a negative result.

**TASK-MX-001 was routed to `DATA_REQUEST`, and that is how TASK-MX-002 came to
exist.** Under the proposed machine this project's own successful sequence would
have been illegal.

Implemented: `NON_TERMINAL_ROUTES` = {`STRUCTURAL_VARIANT`, `DATA_REQUEST`,
`GUARD_ONLY`}; `TERMINAL_ROUTES` = {`QUARANTINE`, `REJECTED_FAMILY`}. Resuming
produces a **new identity** via `structural_variant()`, never a repair of the
closed one — per «a changed rule is a new candidate, not a repair of history».
`test_replays_the_real_mx_history` asserts the actual MX-001 → MX-002 → MX-003
sequence is expressible.

## The dangerous line in the sketch

`transition_to` carried the comment «Проверка допустимости переходов» but
checked only whether the current state was terminal. Nothing prevented
`STAGE_0_FEASIBILITY → STAGE_4_LIVE_ALLOCATION` in a single call.

Implemented: `ALLOWED` permits exactly one successor per state, forward only.
`test_skipping_rungs_is_refused` and `test_backward_transition_is_refused` cover
it. A transition also requires a non-empty `reason`, `evidence` and `task_id`; a
transition nobody can trace to a report is a transition that did not happen.

## The gate cannot open itself

The proposed `check_paper_gate.py` contained
`return {"paper_mode": "allowed", ...}`. It would have returned blocked today,
because no candidate exists — but it would have introduced a code path that
grants paper authorisation from state alone.

The source document is explicit: paper start, live start, coordinator
enablement, approval creation and capital changes «each require a separate fresh
operator GO». That is a human act. A gate able to compute its own authorisation
is the gate that eventually grants it by accident.

Implemented:

- `CandidateLifecycle.can_enter_paper()` returns `False` unconditionally. There
  is no `return True` in its body, and a test asserts this.
- Entry to `QUARANTINED_PAPER_OBSERVER`, `MICRO_LIVE_MECHANICS` and
  `PORTFOLIO_FORWARD` raises `OperatorGoRequired` without an `operator_go_ref`,
  and an earlier GO does not carry forward to a later stage.
- `check_paper_gate.py` now runs two independent checks — the original
  candidate-review check, behaviour unchanged, and the lifecycle check — and
  prints `open` only if both pass. The lifecycle check has no branch that
  returns open; its final `return` is a blocked verdict that names the reason.

Current output:

```
blocked
  candidate_review: blocked - does not declare paper_candidate
  lifecycle:        blocked - no lifecycle records: no candidate identity exists
```

## What this does not do

- It does not evaluate evidence. Whether a candidate deserves to advance is a
  judgement made in a task and recorded in a report; this module only refuses
  transitions that are structurally illegal.
- It does not port the statistical attack battery, the trials ledger, or the
  cost-model contract. Those are separate kernel components; only the cost model
  exists so far, and only for MOEX.
- It changes nothing about any existing result. No candidate identity has been
  created for any MOEX or Botalin family; `data/lifecycle/` does not exist.

## Next

`TASK-SK-002` — port the trials ledger and p-value deflation. That is the
largest remaining gap on the MOEX side: `run_idea_autopilot.py` produced 390
screening passes in a single run with no multiplicity correction of any kind,
while Botalin carries 1,066 documented prior trials against which any p-value
must be deflated.
