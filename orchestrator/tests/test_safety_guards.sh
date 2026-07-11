#!/usr/bin/env bash
# TASK-001 - Orchestrator Safety Guard Self-Test
#
# Purpose:
#   Verify that the orchestrator safety guards defined in
#   orchestrator/review_cycle.sh actually detect forbidden paths and
#   dangerous commands, and still allow the known-safe test commands.
#
# Design:
#   - Local only. Does NOT launch Claude, does NOT run live trading,
#     deploy, systemd, sudo, or any network/exchange command.
#   - Does NOT read .env, private keys, or secrets.
#   - Does NOT modify trading code. It loads the real guard functions
#     from review_cycle.sh (via static extraction) and exercises them
#     against known good/bad examples.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

REVIEW_CYCLE="orchestrator/review_cycle.sh"
LOG_FILE="logs/tests/TASK-001-safety.log"
mkdir -p "$(dirname "$LOG_FILE")"
: > "$LOG_FILE"

PASS=0
FAIL=0

record() {
  printf '%s\n' "$*" | tee -a "$LOG_FILE"
}

pass() {
  PASS=$((PASS + 1))
  record "PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  record "FAIL: $1"
}

if [[ ! -f "$REVIEW_CYCLE" ]]; then
  record "FAIL: guard source not found: $REVIEW_CYCLE"
  exit 1
fi

# --- Load the real guard functions without executing review_cycle side effects ---
# review_cycle.sh runs top-level code (mkdir/find/exit) and cannot be sourced
# directly, so we statically extract only the guard functions and eval them.
extract_guards() {
  awk '
    /^(forbidden_path|task_forbidden_patterns|task_forbidden_path|forbidden_command|safe_test_command)\(\)[[:space:]]*\{/ { capture=1 }
    capture { print }
    capture && /^\}[[:space:]]*$/ { capture=0 }
  ' "$REVIEW_CYCLE"
}

GUARD_SRC="$(extract_guards)"
eval "$GUARD_SRC"

for fn in forbidden_path task_forbidden_path forbidden_command safe_test_command; do
  if ! declare -F "$fn" >/dev/null 2>&1; then
    record "FAIL: guard function not loaded from review_cycle.sh: $fn"
    exit 1
  fi
done
record "INFO: loaded guard functions from $REVIEW_CYCLE"

# task_forbidden_path() reads the current task's "Запрещенные файлы" section
# via $TASK_PATH. Provide a self-contained fixture so the test does not depend
# on where the live task file currently sits.
FIXTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/botalin-safety-fixture.XXXXXX")"
TASK_PATH="$FIXTURE_DIR/TASK-FIXTURE.md"
cat > "$TASK_PATH" <<'EOF'
# TASK-FIXTURE

## Разрешенные файлы

- orchestrator/tests/test_safety_guards.sh

## Запрещенные файлы

- share/strategy-lab-7q4m2v/**
- crypto-strategy-bot/**
- docs/PROJECT_CONSTITUTION.md

## Прочее
EOF
cleanup() { rm -rf "$FIXTURE_DIR"; }
trap cleanup EXIT

# --- Assertion helpers ---
assert_forbidden_path() {
  if forbidden_path "$1"; then pass "forbidden path detected: $1"; else fail "forbidden path NOT detected: $1"; fi
}
assert_allowed_path() {
  if forbidden_path "$1"; then fail "safe path wrongly flagged: $1"; else pass "safe path allowed: $1"; fi
}
assert_forbidden_command() {
  if forbidden_command "$1"; then pass "forbidden command detected: $1"; else fail "forbidden command NOT detected: $1"; fi
}
assert_safe_command() {
  if safe_test_command "$1"; then pass "safe command accepted: $1"; else fail "safe command wrongly rejected: $1"; fi
}
assert_unsafe_command() {
  if safe_test_command "$1"; then fail "unsafe command wrongly accepted: $1"; else pass "unsafe command rejected: $1"; fi
}

record "== Forbidden paths (must be blocked) =="
assert_forbidden_path ".env"
assert_forbidden_path "config/.env.production"
assert_forbidden_path "id_rsa"
assert_forbidden_path "home/.ssh/id_ed25519"
assert_forbidden_path "certs/server.pem"
assert_forbidden_path "hidden"
assert_forbidden_path "data/hidden/holdout.csv"
assert_forbidden_path "secrets/keys.json"
assert_forbidden_path ".github/workflows/backtest.yml"
assert_forbidden_path "share/strategy-lab-7q4m2v/server-autobot.mjs"
assert_forbidden_path "crypto-strategy-bot/index.html"
assert_forbidden_path "docs/PROJECT_CONSTITUTION.md"

record "== Allowed paths (must NOT be blocked) =="
assert_allowed_path "orchestrator/tests/test_safety_guards.sh"
assert_allowed_path "tasks/results/TASK-001-RESULT.md"
assert_allowed_path "README.md"

record "== Forbidden commands (must be blocked) =="
assert_forbidden_command "sudo apt-get install foo"
assert_forbidden_command "systemctl restart botalin-runner"
assert_forbidden_command "git reset --hard HEAD~1"
assert_forbidden_command "git clean -fd"
assert_forbidden_command "rm -rf /tmp/whatever"
assert_forbidden_command "BOTALIN_REAL_TRADING=true node server-autobot.mjs"
assert_forbidden_command "vercel deploy --prod"
assert_forbidden_command "cat .env"
assert_forbidden_command "echo \$API_SECRET"

record "== Forbidden commands must also be rejected as unsafe test commands =="
assert_unsafe_command "sudo systemctl restart x"
assert_unsafe_command "git reset --hard HEAD"
assert_unsafe_command "rm -rf build"
assert_unsafe_command "BOTALIN_REAL_TRADING=true node run.mjs"
assert_unsafe_command "vercel deploy"

record "== Safe test commands (must be accepted) =="
assert_safe_command "test -f docs/PROJECT_CONSTITUTION.md"
assert_safe_command "git status --short"
assert_safe_command "bash -n orchestrator/run_next.sh"
assert_safe_command "bash -n orchestrator/run_claude_task.sh"
assert_safe_command "bash orchestrator/tests/test_safety_guards.sh"

record "== Summary =="
record "passed=$PASS failed=$FAIL"

if [[ "$FAIL" -ne 0 ]]; then
  record "RESULT: FAIL"
  exit 1
fi
record "RESULT: OK"
exit 0
