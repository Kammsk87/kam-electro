# Botalin Claude CLI Dispatch Protocol v0

## Purpose

This is a local, task-file-based handoff protocol for one bounded research
task. It creates a deterministic dispatch envelope before a human starts
Claude Code, then accepts a reported result only after local evidence passes
the status checker. It is not a trading controller and cannot start a live or
paper process, collectors, services, orders, or account actions.

## Preflight

1. Work from the branch named in the task fixture and keep the ready task
   committed and clean.
2. Build the envelope without executing Claude:

```sh
node scripts/analysis/build_claude_dispatch_envelope.mjs \
  --task tasks/ready/TASK-023-BOTALIN-CLAUDE-CLI-DISPATCH-PROTOCOL-V0.md \
  --json
```

3. Confirm the printed mode is `DRY_RUN_ONLY`, `process_started=false`, and
   `network_used=false`. Read the preview and confirm the named task is the
   only task to be given to Claude.

## Explicit Human Handoff

After preflight, an operator may manually run this template for the envelope's
task path. The protocol does not run it itself:

```sh
claude -p "Execute tasks/ready/<TASK-ID>.md only; obey its safety boundary and commit only its allowlisted deliverables. Report the commit, tests, changed paths, and result artifact. Do not choose or start a successor."
```

Authentication, OAuth, subscription, and organization-policy failures are a
human handoff. Sign in through the approved Claude Code UI or ask the
organization administrator to enable the required access; do not retry,
bypass, or add credentials to this repository. If the VS Code UI is
unavailable, keep the task unstarted and preserve the dry-run envelope for a
later manual launch.

## Expected Completion Report

The Claude report must state the task ID, commit hash, result artifact path,
changed paths, every declared test result, and whether independent Codex
review is still required. A prose claim alone is not acceptance evidence.

## Codex Verification

Create or provide explicit local evidence that mirrors the envelope and then
run:

```sh
node scripts/analysis/check_claude_dispatch_status.mjs \
  --envelope <envelope.json> \
  --evidence <local-evidence.json> \
  --json
```

Only `ACCEPTED` is a completed handoff. `READY`, `RUNNING_UNVERIFIED`, and
`COMPLETED_UNVERIFIED` require no action by the protocol. `BLOCKED` means the
task, commit, paths, or test evidence does not match and must be reviewed by a
human. Selecting or starting any next task is a separate operator and Codex
review decision.
