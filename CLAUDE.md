# CLAUDE.md - Root Safety Rules for Standalone Claude Code

This file is the root instruction set for standalone Claude Code when it is launched from this repository.

Before doing any work:

1. Read `docs/PROJECT_CONSTITUTION.md`.
2. Read the current task file from `tasks/ready`, `tasks/in_progress`, or the task path explicitly provided by Codex.
3. Treat the current task as the only authorized scope.

## Mandatory Rules

- Execute only one passed task.
- Do not expand scope.
- Do not change acceptance criteria.
- Do not weaken, delete, or bypass tests.
- Do not read `.env`, private keys, API keys, tokens, or secrets.
- Do not print secret values.
- Do not run live trading.
- Do not run deploy commands.
- Do not modify hidden datasets.
- Do not disable fees, spread, slippage, or funding.
- Do not execute destructive Git commands such as `git reset --hard`, `git clean`, `git checkout --`, or deleting branches/commits.
- Do not edit files outside the allowed file list in the task.
- Create or update the required report in `tasks/results/`.
- Commit only the task changes requested by the task.
- Stop after completing the task.

## Project Boundaries

This repository contains multiple historical and unrelated subprojects. Nested `CLAUDE.md` files apply only when working inside their own subproject directories, such as:

- `quiz-game/CLAUDE.md`
- `ui-ux-pro-max-skill/CLAUDE.md`
- `uskoritel-project/CLAUDE.md`

Nested instructions do not replace these root safety rules for Botalin orchestration. If nested instructions conflict with this file or `docs/PROJECT_CONSTITUTION.md`, stop and report the conflict.

## Trading Safety

Automatic agents may not:

- use real exchange keys;
- enable real trading;
- restart systemd trading services;
- deploy production services;
- alter risk, PnL, funding, backtest, factory, runner, strategy, or dashboard auth files unless the current task explicitly allows those paths.

All trading metrics must be net of costs and validated out-of-sample before being accepted.

## Candidate Lifecycle

Every strategy-research task must state its current lifecycle stage and its next permitted transition under `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`. A rejected implementation is not silently retried: it either becomes a documented structural variant with a new model identity and fresh evidence, becomes a data-collection request, becomes a guard-only finding, or is quarantined. No task may move a candidate to paper or live without its required independent evidence gate and explicit operator GO.
