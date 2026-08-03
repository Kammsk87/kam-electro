# TASK-003-REVIEW-ACCEPTANCE-GUARDS - Codex Revision 1

Decision: REVISION.

Fix only the issues below. Do not expand scope and do not change trading code, `.claude` settings, docs, or `orchestrator/run_claude_task.sh`.

## Required fixes

1. Fix false forbidden-file detection in `prepare_review`.
   - Current review bundle marks allowed task files as forbidden:
     - `orchestrator/review_cycle.sh`
     - `orchestrator/tests/test_safety_guards.sh`
   - These files are explicitly allowed in the task and must not be reported as `FORBIDDEN_CHANGED_FILE`.
   - The review cycle must still block files listed in the task forbidden section and global forbidden paths.

2. Fix stale result report hash.
   - Current `HEAD` is `6f07f78271744311cbfb25757c39304e4ec02657`.
   - The result report currently contains stale hash `dae3af4e1b8077b1ab0f48d7567415f767c4d8ee`.
   - After the revision commit, `tasks/results/TASK-003-REVIEW-ACCEPTANCE-GUARDS-RESULT.md` must contain the final current `HEAD` full hash or short hash.

3. Add/adjust self-tests so this regression is caught.
   - Include a check that task-allowed files changed by TASK-003 are not classified as forbidden by the review-cycle logic.
   - Keep the tests local; do not launch Claude from tests.

## Verification commands

Run:

```bash
bash -n orchestrator/run_claude_task.sh
bash -n orchestrator/review_cycle.sh
bash -n orchestrator/run_next.sh
bash -n orchestrator/tests/test_safety_guards.sh
bash orchestrator/tests/test_safety_guards.sh
```

Also verify:

```bash
./orchestrator/review_cycle.sh prepare
```

Expected:

- tests pass;
- review bundle does not report `FORBIDDEN_CHANGED_FILE` for `orchestrator/review_cycle.sh` or `orchestrator/tests/test_safety_guards.sh`;
- task remains in `tasks/review`;
- no forbidden files are changed;
- create a separate revision commit.
