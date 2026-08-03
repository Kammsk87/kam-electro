# CLAUDE SECURITY AUDIT

Дата: 2026-07-11.

Scope: existing Claude Code settings, project `.claude/`, global `~/.claude/`, hooks, permissions, MCP-like configuration files, shell commands, and environment-sensitive patterns visible from the current workspace.

Secret values are intentionally not reproduced in this report.

## Summary

Standalone Claude Code CLI is installed separately from the VS Code extension:

- Standalone launcher: `/Users/aleksandr/.local/bin/claude`
- Native binary target: `/Users/aleksandr/.local/share/claude/versions/2.1.207`
- VS Code extensions still present:
  - `~/.vscode/extensions/anthropic.claude-code-2.1.204-darwin-arm64`
  - `~/.vscode/extensions/anthropic.claude-code-2.1.206-darwin-arm64`

The main security risk is not the standalone CLI itself. The risk is broad pre-existing Claude permissions and secret-like literals in old settings and shell command allowlists.

## Existing Project Configuration

Project-local Claude config:

- `.claude/settings.local.json`

Root `CLAUDE.md` was absent before this audit and has now been added for standalone orchestration safety.

Nested `CLAUDE.md` files exist and belong to separate subprojects:

- `quiz-game/CLAUDE.md`
- `ui-ux-pro-max-skill/CLAUDE.md`
- `uskoritel-project/CLAUDE.md`

Global Claude config observed:

- `~/.claude/settings.json`
- `~/.claude/settings.local.json`
- `~/.claude/hooks/compress.py`
- `~/.claude/commands/vpn-deploy.md`
- project memories and session logs under `~/.claude/projects/`

## Potentially Dangerous Permissions Found

The existing permission allowlists contain broad or high-impact commands:

- broad `Read` access outside the project, including home-level paths;
- broad `git add`, `git commit`, `git push`, `git fetch`, `git reset`, `git apply`, `git diff`, `git status`;
- remote `ssh` and `scp` patterns;
- commands targeting production-like servers;
- commands involving `systemctl`, service restart, deployment, and VPS administration;
- `curl` calls with authorization headers;
- package installation commands such as `brew install` and `pip3 install`;
- commands that can move project data to `/tmp`;
- commands that can kill processes;
- commands that can access Supabase/Firestore/API endpoints;
- commands that can inspect or use private SSH keys.

These may be useful for older manual workflows, but they are too broad for an automatic Codex -> Claude loop.

## Secret-Like Values Detected

Secret-like or credential-like literals were detected in old Claude settings/allowlisted commands. Values are not printed here.

Categories observed:

- GitHub personal access token-like strings in command allowlists;
- API key-like strings in public API calls;
- bearer token-like strings in curl commands;
- Supabase/Firestore key-like strings in curl commands;
- SSH private key path references;
- remote admin token usage in curl examples.

Some of these may be public anon keys or historical tokens, but the orchestrator must treat them as sensitive.

## Paths and Commands That Require Blocking

Automatic orchestration should block:

- `.env`, `.env.*`;
- `*.pem`, `*.key`, `*.p12`, `*.pfx`;
- `id_rsa`, `id_ed25519`, other private SSH keys;
- hidden datasets and validator inputs;
- `~/.ssh/**`;
- `~/.claude/settings*.json` for writes;
- global Claude session logs and memories for writes;
- trading runner/strategy/risk/funding/PnL/backtest/factory files unless explicitly allowed by the task;
- `.github/workflows/**` unless explicitly allowed by the task.

Commands to block by default:

- `sudo`;
- `systemctl`, `service`, `journalctl`;
- `ssh` and `scp` except for explicitly approved read-only checks;
- `git reset --hard`, `git clean`, `git checkout --`;
- `rm -rf`;
- deploy commands;
- package installation commands;
- `BOTALIN_REAL_TRADING=true`;
- commands containing `API_KEY`, `API_SECRET`, `PRIVATE_KEY`, `TOKEN`, or `.env`;
- commands that print authorization headers.

## Safe Changes Proposed

Already safe to keep:

- standalone CLI installed as an additional executable;
- VS Code Claude extension unchanged;
- existing project structure unchanged;
- backup branch `backup/before-claude-cli`;
- non-destructive stash snapshot for tracked dirty state.

Safe changes made:

- added root `CLAUDE.md` with orchestration safety rules;
- added this audit report;
- added a proposed safe Claude settings file without overwriting existing settings:
  `.claude/settings.orchestrator-safe-proposed.json`.

Recommended next safe changes:

- make orchestrator launch Claude with an explicit safe settings file;
- avoid loading broad legacy `.claude/settings.local.json` in automated runs;
- keep legacy settings for manual VS Code workflows until they are reviewed by the owner;
- rotate any real tokens that appear in historical command allowlists;
- split manual admin/deploy permissions from automated trading research permissions.

## Compatibility Impact

No existing Claude settings were deleted or overwritten.

The proposed safe settings file does not affect existing VS Code Claude Code behavior unless explicitly selected with `--settings`.

Adding root `CLAUDE.md` changes the instructions visible to standalone Claude Code when launched from repository root. This is intentional and limited to safety/orchestration rules.

## Current Risk Level

Risk of losing existing work: low, because no reset/delete/reinitialization was performed.

Risk of accidental privileged action through old Claude permissions: medium to high if the old settings are used by automated Claude without a safe settings override.

Risk of standalone CLI conflicting with VS Code extension: low. They are separate installations and versions.
