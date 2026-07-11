#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

TASK_PATH="${1:-}"
if [[ -z "$TASK_PATH" ]]; then
  echo "Usage: $0 [--dry-run] tasks/ready/TASK-001.md" >&2
  exit 64
fi

if [[ ! -f "$TASK_PATH" ]]; then
  echo "Task not found: $TASK_PATH" >&2
  exit 66
fi

case "$TASK_PATH" in
  tasks/ready/TASK-*.md) ;;
  *)
    echo "Task must be in tasks/ready: $TASK_PATH" >&2
    exit 65
    ;;
esac

mkdir -p logs/claude tasks/in_progress tasks/review tasks/results
mkdir -p logs/codex

# Standalone Claude CLI is the only sanctioned binary for the automatic loop.
# Default to the standalone install; never silently fall back to a bare PATH
# entry or a VS Code extension shim that could carry broad legacy permissions.
STANDALONE_CLAUDE_BIN="/Users/aleksandr/.local/bin/claude"
CLAUDE_BIN="${CLAUDE_BIN:-$STANDALONE_CLAUDE_BIN}"

# Safe, minimally-privileged settings applied to every automatic Claude launch.
SAFE_SETTINGS=".claude/settings.orchestrator-safe-proposed.json"

TASK_FILE="$(basename "$TASK_PATH")"
TASK_ID="${TASK_FILE%.md}"
BRANCH="task/${TASK_ID}"
IN_PROGRESS="tasks/in_progress/${TASK_FILE}"
REVIEW_TASK="tasks/review/${TASK_FILE}"
RESULT_FILE="tasks/results/${TASK_ID}-RESULT.md"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="logs/claude/${TASK_ID}-${STAMP}.log"
LATEST_LOG="logs/claude/.log"
PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/botalin-claude-prompt.XXXXXX")"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  cp "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_executable() {
  if [[ "$1" == */* ]]; then
    [[ -x "$1" ]] || fail "Required executable not found: $1"
  else
    require_cmd "$1"
  fi
}

# guard_claude_source rejects any Claude binary that resolves to a VS Code
# extension. The automatic loop must use the standalone CLI, never an IDE shim
# that could inherit broad editor permissions. This is a configuration error
# and is enforced in every mode, including --dry-run.
guard_claude_source() {
  case "$CLAUDE_BIN" in
    *.vscode/extensions*|*"Visual Studio Code"*)
      fail "Forbidden Claude CLI source (VS Code extension): $CLAUDE_BIN"
      ;;
  esac
}

# preflight_claude enforces the full launch contract before any task state is
# mutated: sanctioned standalone binary, executable on disk, and a present safe
# settings file. It must run before the task is moved to in_progress so a bad
# environment never leaves a task stranded.
preflight_claude() {
  guard_claude_source
  if [[ "$CLAUDE_BIN" != /* ]]; then
    fail "CLAUDE_BIN must be an absolute standalone path, got: $CLAUDE_BIN"
  fi
  if [[ ! -f "$CLAUDE_BIN" || ! -x "$CLAUDE_BIN" ]]; then
    fail "Standalone Claude CLI missing or not executable: $CLAUDE_BIN"
  fi
  if [[ ! -f "$SAFE_SETTINGS" ]]; then
    fail "Safe orchestrator settings file not found: $SAFE_SETTINGS"
  fi
}

# A VS Code source is always a hard stop, regardless of run mode.
guard_claude_source

if [[ -e "$IN_PROGRESS" || -e "$REVIEW_TASK" ]]; then
  fail "Task already exists in in_progress or review: $TASK_ID"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "DRY RUN: task=$TASK_PATH task_id=$TASK_ID branch=$BRANCH result=$RESULT_FILE"
  if [[ "$CLAUDE_BIN" == */* && -x "$CLAUDE_BIN" ]]; then
    log "DRY RUN: claude found at $CLAUDE_BIN"
  elif command -v "$CLAUDE_BIN" >/dev/null 2>&1; then
    log "DRY RUN: claude found at $(command -v "$CLAUDE_BIN")"
  else
    log "DRY RUN: claude not found in PATH; real run would stop before moving task"
  fi
  log "DRY RUN: no files moved, no branch created, Claude not launched"
  cp "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
  exit 0
fi

require_cmd git
preflight_claude
require_executable "$CLAUDE_BIN"

log "Starting $TASK_ID"
log "Using Claude CLI: $CLAUDE_BIN"
log "Preflight passed: standalone CLI + safe settings ($SAFE_SETTINGS)"
log "Moving task to in_progress"
mv "$TASK_PATH" "$IN_PROGRESS"

restore_task_on_failure() {
  if [[ -f "$IN_PROGRESS" && ! -f "$REVIEW_TASK" ]]; then
    mv "$IN_PROGRESS" "$TASK_PATH" 2>/dev/null || true
  fi
}
trap restore_task_on_failure ERR

CURRENT_BRANCH="$(git branch --show-current || true)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    log "Switching to existing branch $BRANCH"
    git switch "$BRANCH" >>"$LOG_FILE" 2>&1
  else
    log "Creating branch $BRANCH"
    git switch -c "$BRANCH" >>"$LOG_FILE" 2>&1
  fi
fi

git rev-parse HEAD > "logs/codex/${TASK_ID}.baseline-head"
git status --porcelain=v1 | sed -E 's/^...//' | sort -u > "logs/codex/${TASK_ID}.baseline-dirty-paths"

RESULT_BEFORE_SUM=""
if [[ -f "$RESULT_FILE" ]]; then
  RESULT_BEFORE_SUM="$(cksum "$RESULT_FILE" 2>/dev/null || true)"
fi

{
  echo "# Immediate Instruction"
  echo
  echo "Execute the task in the Current Task section now. Do not ask what to do."
  echo "If an older task, old result report, or old commit has the same TASK id, ignore it and follow only the Current Task below."
  echo "Overwrite the task result report with the result for the Current Task."
  echo
  echo "# Codex Context"
  echo
  if [[ -f CLAUDE.md ]]; then
    echo "## CLAUDE.md"
    cat CLAUDE.md
  else
    echo "## CLAUDE.md"
    echo "Root CLAUDE.md is not present in this workspace."
  fi
  echo
  echo "## docs/PROJECT_CONSTITUTION.md"
  cat docs/PROJECT_CONSTITUTION.md
  echo
  echo "## docs/CODEX_AUDIT.md"
  cat docs/CODEX_AUDIT.md
  echo
  echo "## Execution Rules"
  cat orchestrator/prompts/claude_execute.md
  echo
  echo "## Current Task"
  cat "$IN_PROGRESS"
} > "$PROMPT_FILE"

log "Launching Claude Code with standalone CLI in safe mode"
set +e
"$CLAUDE_BIN" \
  --safe-mode \
  --settings "$SAFE_SETTINGS" \
  --allowedTools "Read,Edit,Write,Glob,Grep,Bash(git *),Bash(bash *),Bash(chmod *),Bash(mkdir *),Bash(test *)" \
  --disallowedTools "Bash(sudo *),Bash(systemctl *),Bash(service *),Bash(journalctl *),Bash(ssh *),Bash(scp *),Bash(curl *),Bash(git reset *),Bash(git clean *),Bash(rm -rf *),Bash(*BOTALIN_REAL_TRADING=true*),Bash(*deploy*),Bash(*API_KEY*),Bash(*API_SECRET*),Bash(*PRIVATE_KEY*),Bash(*TOKEN*),Read(.env),Read(.env.*),Read(**/*.pem),Read(**/*.key),Read(**/id_rsa),Read(**/id_ed25519)" \
  -p "$(cat "$PROMPT_FILE")" >>"$LOG_FILE" 2>&1
CLAUDE_STATUS=$?
set -e

if [[ "$CLAUDE_STATUS" -ne 0 ]]; then
  fail "Claude exited with code $CLAUDE_STATUS"
fi

if [[ ! -f "$RESULT_FILE" ]]; then
  fail "Expected result report not found: $RESULT_FILE"
fi

RESULT_AFTER_SUM="$(cksum "$RESULT_FILE" 2>/dev/null || true)"
if [[ -n "$RESULT_BEFORE_SUM" && "$RESULT_BEFORE_SUM" == "$RESULT_AFTER_SUM" ]]; then
  fail "Result report exists but was not updated by this run: $RESULT_FILE"
fi

log "Moving task to review"
mv "$IN_PROGRESS" "$REVIEW_TASK"
trap - ERR

log "Claude completed $TASK_ID; task is waiting for Codex review"
cp "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
