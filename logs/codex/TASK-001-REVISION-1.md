# TASK-001 REVISION 1 - Codex Review

Decision: REVISION.

Claude Code did not complete the current `tasks/review/TASK-001.md`.

## Problems to Fix

1. The required file `orchestrator/tests/test_safety_guards.sh` does not exist.
2. The required checks fail:
   - `bash -n orchestrator/tests/test_safety_guards.sh`
   - `bash orchestrator/tests/test_safety_guards.sh`
3. `tasks/results/TASK-001-RESULT.md` is stale. It describes the old source-inventory task, not the current orchestrator safety guard self-test.
4. The existing commit `efbc9e4 TASK-001 completed` is from an older task and must not be treated as completion of this task.

## Required Fix

Implement only the current task:

- Create `orchestrator/tests/test_safety_guards.sh`.
- Make it executable.
- The test must be local and must not launch Claude.
- The test must not read `.env`, private keys, hidden datasets, or trading secrets.
- The test must not run live trading, deploy, systemd, sudo, destructive Git, or trading code.
- The test must check at least the forbidden path examples and forbidden command examples listed in `tasks/review/TASK-001.md`.
- The test must check the safe command examples listed in `tasks/review/TASK-001.md`.
- Update `tasks/results/TASK-001-RESULT.md` so it describes this safety guard task only.
- Run all commands from the task.
- Create a new commit with message `TASK-001 completed` after the fix.

## Allowed Files

- `orchestrator/tests/test_safety_guards.sh`
- `tasks/results/TASK-001-RESULT.md`
- `logs/tests/TASK-001-safety.log`

## Forbidden

Do not modify trading code, strategy code, runner code, risk/funding/PnL/backtest/factory files, `.env`, secrets, hidden datasets, systemd files, GitHub workflows, docs constitution/audit/orchestrator files, or task acceptance criteria.
