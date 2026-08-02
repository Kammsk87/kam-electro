# TASK-023 - Botalin Claude CLI Dispatch Protocol v0

## Objective

Replace fragile UI-driven task handoff to Claude Code with a local,
auditable, task-file-based dispatch protocol. It must let Codex prepare one
bounded research task, let an operator or an explicit controller launch it via
the installed `claude` CLI, and let Codex deterministically verify the result
and select the next task from an inbox/outbox record.

This task builds the protocol and its dry-run tooling only. It must not launch
Claude, create a background agent, send any prompt to a remote model, or start
an automation loop.

## Safety boundary

Do not run `claude`, `claude agents`, any background process, service, timer,
or daemon. Do not modify live/paper state, collectors, coordinator, approval,
KILL, configurations, model_id, RESET_TS, promising_count, secrets, orders,
accounts, or production state. Do not read secrets, use network, install
packages, access the Botalin server, or change the existing warehouse data.

The resulting protocol must make a future launch require both a named task ID
and an explicit operator command. No automatic retry, task chaining, or task
selection is permitted in this v0.

## Required work

1. Define a versioned dispatch envelope: task ID, branch/commit, immutable
   task-file digest, allowlisted deliverables, safety profile, required tests,
   completion evidence, and a declared successor policy.
2. Implement a deterministic dry-run validator that reads one explicit ready
   task and produces a dispatch envelope plus a human-readable command preview.
   It must refuse unknown task IDs, missing files, dirty/uncommitted task files,
   task/branch mismatch, missing safety boundary, forbidden live/paper terms,
   and envelopes that request an automatic successor.
3. Implement a read-only status checker that examines explicit local Git/task
   evidence and classifies a dispatch as `READY`, `RUNNING_UNVERIFIED`,
   `COMPLETED_UNVERIFIED`, `ACCEPTED`, or `BLOCKED`. It must never inspect
   arbitrary home directories, terminals, processes, credentials, or remote
   services.
4. Provide a one-page operator runbook: exact preflight, safe CLI command
   template, expected completion report, how Codex verifies a result, and
   recovery when VS Code UI or Claude CLI is unavailable. Clearly state that
   the dispatcher is not a trading controller.
5. Add synthetic fixtures and deterministic tests for digest stability, refusal
   cases, dirty-state detection in a fixture repository, result verification,
   and non-mutation. The tests must prove that no program invokes `claude`.

## Acceptance

- A dry run creates no process, no network request, no task execution, and no
  mutation outside an explicitly supplied temporary output path.
- The status checker cannot mark a task `ACCEPTED` without a matching commit,
  allowlisted changed paths, result file, and declared tests.
- The runbook has an explicit human handoff for authentication or an OAuth
  failure; the protocol never retries or bypasses it.
- Full tests, syntax check, `git diff --check`, and a static scan pass.
- No research verdict, candidate, or production state changes.

## Allowlisted deliverables

1. `scripts/analysis/build_claude_dispatch_envelope.mjs`
2. `scripts/analysis/check_claude_dispatch_status.mjs`
3. `scripts/test_claude_dispatch_protocol.mjs`
4. `reference/BOTALIN_CLAUDE_CLI_DISPATCH_PROTOCOL_2026-08-02.md`
5. `data/claude_dispatch_protocol_fixture_2026-08-02.json`
6. `tasks/results/TASK-023-BOTALIN-CLAUDE-CLI-DISPATCH-PROTOCOL-V0-RESULT.md`

Commit only the allowlisted deliverables. The report must include the exact
future operator command template but must not execute it.
