# TASK-009 - Router Lab Core Scaffold v0

## Goal

Implement the deterministic, pure core of the future Multi-Strategy Router Lab defined by `TASK-006`. This is infrastructure for evaluation, not a strategy and not a backtest claiming edge.

The core must default to `NO_TRADE` whenever the state, evidence, eligibility, timing, execution feasibility, or conflict resolution is incomplete.

## Prerequisites

Read before work:

1. `CLAUDE.md`.
2. `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`.
3. `tasks/ready/TASK-006-MULTI-STRATEGY-ROUTER-ARCHITECTURE-V0.md`.
4. `tasks/results/TASK-006-MULTI-STRATEGY-ROUTER-ARCHITECTURE-V0-RESULT.md`.
5. `/opt/botalin-edge/reference/CAUSAL_ROUTER_DATASET_CONTRACT_2026-07-29.md`.
6. `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`.

Relevant lessons: `LESSON-001`, `LESSON-003`, `LESSON-007`, `LESSON-008`, `LESSON-016`, `LESSON-021`.

## Scope and hard safety boundary

Work in `/opt/botalin-edge`. This task is pure code plus synthetic fixtures only.

Never read keys or environment secrets. Do not call exchange, Telegram, HTTP, WebSocket, order, position, execution, or system endpoints. Do not read runtime logs by default; do not start/stop any process, service, timer, paper run, or live run. Do not modify any config, coordinator, approval, KILL state, strategy, paper factory, model ID, or `RESET_TS`.

The core must not select or promote a real strategy. `promising_count` remains zero.

## Allowed files

- `lib/router_lab_core.mjs`
- `scripts/analysis/router_lab_v0.mjs`
- `scripts/test_router_lab_core.mjs`
- `reference/ROUTER_LAB_V0_IMPLEMENTATION_CONTRACT_2026-07-30.md`
- `tasks/results/TASK-009-ROUTER-LAB-CORE-SCAFFOLD-V0-RESULT.md`

Do not modify any other file. Do not commit generated datasets or runtime output.

## Required design

### A. Pure input contract

Accept only caller-provided, already-normalized decision-time objects:

- canonical decision/regime data from the causal dataset contract;
- sleeve registry records with frozen class, regime predicate result, gate statuses, side, horizon, venue, size tier, factor labels, and declared cost/execution feasibility;
- portfolio state supplied by the caller, with timestamp and provenance.

No function may accept `execution.*` or `outcome.*` as router features. Reject or return `NO_TRADE` if they appear in feature paths.

### B. Deterministic router evaluation

Implement a pure evaluation function that returns one immutable decision record:

- all evaluated sleeves and explicit rejection reason codes;
- selected `SLEEVE_ACTION` or `NO_TRADE`;
- one deterministic primary no-trade reason when no action is allowed;
- input/version hashes or equivalent stable fingerprints;
- no hidden defaults and no dynamic performance weighting.

Mandatory `NO_TRADE` cases include: undefined state, stale/missing required feature, failed data-quality flag, missing execution feasibility, non-admitted sleeve, blocked evidence gate, conflict/opposing directions on same symbol and overlapping horizon, factor cap breach, and unrecognized input enum.

### C. Registry and candidate boundaries

The core may recognize classes `ALPHA_SLEEVE`, `GUARD`, `EVIDENCE_LANE`, `EXECUTION_PROOF` but only an independently pre-admitted `ALPHA_SLEEVE` can ever produce an action in a synthetic fixture. Guards may suppress only. Evidence lanes and execution proofs never emit a trade.

No actual Botalin family or historical strategy may be placed in an admitted registry in this task.

### D. CLI harness

Provide `router_lab_v0.mjs --smoke` using entirely synthetic, in-file or explicitly synthetic fixtures. It must print a compact explanation of decisions and show at least:

- a valid synthetic action;
- `NO_TRADE` on an unknown state;
- guard suppression;
- opposing-sleeve conflict;
- outcome-field leakage refusal;
- factor cap refusal.

No default mode may read runtime data, network, or files outside its own source/test inputs.

### E. Tests

Write focused tests for:

- `NO_TRADE` as default and unknown-state catch-all;
- decision/outcome and decision/execution namespace leakage refusal;
- guard cannot emit direction;
- non-admitted/evidence/execution classes cannot emit direction;
- deterministic conflict and cap behavior;
- stable output for identical inputs;
- no dynamic performance weighting;
- no network, key, exchange, order, position, execution, Telegram, or environment access by static scan;
- smoke mode with synthetic fixtures only.

## Deliverables

The reference contract must map every implementation behavior to the relevant `TASK-006` rule and state what remains blocked until real causal joins and sleeve evidence exist.

The result report must include relevant lessons, lifecycle state, what cannot be concluded, changed files, tests, and `No new lesson.`

## Acceptance commands

```bash
node --check lib/router_lab_core.mjs
node --check scripts/analysis/router_lab_v0.mjs
node --check scripts/test_router_lab_core.mjs
node scripts/test_router_lab_core.mjs
node scripts/analysis/router_lab_v0.mjs --smoke
node scripts/analysis/check_lessons_referenced.mjs --file tasks/results/TASK-009-ROUTER-LAB-CORE-SCAFFOLD-V0-RESULT.md
git diff --check
```

Commit and push only the allowlisted artifacts. If push is blocked by the environment, report it honestly and do not bypass the block.
