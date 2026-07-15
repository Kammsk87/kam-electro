#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-prepare}"
ARG2="${2:-}"
mkdir -p logs/codex logs/tests tasks/review tasks/accepted tasks/rejected tasks/results

find_review_task() {
  find tasks/review -maxdepth 1 -type f -name 'TASK-*.md' | sort | head -n 1
}

TASK_PATH="$(find_review_task)"
if [[ -z "$TASK_PATH" ]]; then
  echo "No task in tasks/review" >&2
  exit 0
fi

TASK_FILE="$(basename "$TASK_PATH")"
TASK_ID="${TASK_FILE%.md}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REVIEW_LOG="logs/codex/${TASK_ID}-review-${STAMP}.md"
TEST_LOG="logs/tests/${TASK_ID}-${STAMP}.log"
RESULT_FILE="tasks/results/${TASK_ID}-RESULT.md"

forbidden_path() {
  local path="$1"
  [[ "$path" =~ (^|/)\.env($|[./]) ]] && return 0
  [[ "$path" =~ (^|/)(id_rsa|id_dsa|id_ed25519|known_hosts)$ ]] && return 0
  [[ "$path" =~ \.(pem|key|p12|pfx)$ ]] && return 0
  [[ "$path" =~ (^|/)hidden($|/) ]] && return 0
  [[ "$path" =~ (^|/)secrets?($|/) ]] && return 0
  [[ "$path" =~ share/strategy-lab-7q4m2v/vps/ ]] && return 0
  [[ "$path" =~ \.github/workflows/ ]] && return 0
  task_forbidden_path "$path" && return 0
  return 1
}

task_forbidden_patterns() {
  awk '
    /^##[[:space:]]+Запрещ/ { in_section=1; next }
    /^##[[:space:]]+/ { in_section=0 }
    in_section && /^[[:space:]]*-/ { print }
  ' "$TASK_PATH" \
    | sed -E 's/^[[:space:]]*-[[:space:]]*//; s/`//g; s/[[:space:]]+$//' \
    | grep -E '^[A-Za-z0-9_./*.-]+$' || true
}

task_forbidden_path() {
  local path="$1"
  local pattern
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    if [[ "$pattern" == */** ]]; then
      local prefix="${pattern%/**}"
      [[ "$path" == "$prefix/"* || "$path" == "$prefix" ]] && return 0
    elif [[ "$pattern" == *"*"* ]]; then
      [[ "$path" == $pattern ]] && return 0
    else
      [[ "$path" == "$pattern" ]] && return 0
    fi
  done < <(task_forbidden_patterns)
  return 1
}

forbidden_command() {
  local cmd="$1"
  [[ "$cmd" =~ sudo ]] && return 0
  [[ "$cmd" =~ systemctl|journalctl|service[[:space:]] ]] && return 0
  [[ "$cmd" =~ git[[:space:]]+reset ]] && return 0
  [[ "$cmd" =~ git[[:space:]]+clean ]] && return 0
  [[ "$cmd" =~ git[[:space:]]+checkout[[:space:]]+-- ]] && return 0
  [[ "$cmd" =~ rm[[:space:]]+-rf ]] && return 0
  [[ "$cmd" =~ BOTALIN_REAL_TRADING=true ]] && return 0
  [[ "$cmd" =~ BYBIT_API|API_SECRET|PRIVATE_KEY ]] && return 0
  [[ "$cmd" =~ \.env ]] && return 0
  [[ "$cmd" =~ vercel[[:space:]]+deploy|deploy ]] && return 0
  [[ "$cmd" =~ ssh[[:space:]] ]] && return 0
  [[ "$cmd" =~ npm[[:space:]]+install|pnpm[[:space:]]+install|yarn[[:space:]]+install ]] && return 0
  [[ "$cmd" =~ apt|brew[[:space:]]+install ]] && return 0
  return 1
}

safe_test_command() {
  local cmd="$1"
  forbidden_command "$cmd" && return 1
  [[ "$cmd" =~ ^test[[:space:]]+-f[[:space:]] ]] && return 0
  [[ "$cmd" =~ ^git[[:space:]]+status[[:space:]]+--short$ ]] && return 0
  [[ "$cmd" =~ ^git[[:space:]]+diff ]] && return 0
  [[ "$cmd" =~ ^git[[:space:]]+show ]] && return 0
  [[ "$cmd" =~ ^git[[:space:]]+log ]] && return 0
  [[ "$cmd" =~ ^bash[[:space:]]+-n[[:space:]] ]] && return 0
  [[ "$cmd" =~ ^bash[[:space:]]+orchestrator/tests/ ]] && return 0
  [[ "$cmd" =~ ^node[[:space:]]+tests/ ]] && return 0
  [[ "$cmd" =~ ^node[[:space:]]+scripts/smoke_engine\.mjs$ ]] && return 0
  [[ "$cmd" =~ ^npm[[:space:]]+test$ ]] && return 0
  [[ "$cmd" =~ ^npm[[:space:]]+run[[:space:]]+test ]] && return 0
  [[ "$cmd" =~ ^python3[[:space:]]+-m[[:space:]]+py_compile[[:space:]] ]] && return 0
  [[ "$cmd" =~ ^python3[[:space:]]+-m[[:space:]]+pytest ]] && return 0
  [[ "$cmd" =~ ^pytest ]] && return 0
  return 1
}

extract_test_commands() {
  awk '
    /^```bash[[:space:]]*$/ { in_block=1; next }
    /^```[[:space:]]*$/ { in_block=0; next }
    in_block && $0 !~ /^[[:space:]]*#/ && $0 !~ /^[[:space:]]*$/ { print }
  ' "$TASK_PATH"
}

prepare_review() {
  local base
  if [[ -f "logs/codex/${TASK_ID}.baseline-head" ]]; then
    base="$(cat "logs/codex/${TASK_ID}.baseline-head")"
  else
    base="$(git merge-base HEAD main 2>/dev/null || git rev-parse HEAD~1 2>/dev/null || true)"
  fi
  local baseline_dirty="logs/codex/${TASK_ID}.baseline-dirty-paths"
  {
    echo "# Codex Review Bundle - $TASK_ID"
    echo
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
    echo "## Task"
    echo "$TASK_PATH"
    echo
    echo "## Result Report"
    if [[ -f "$RESULT_FILE" ]]; then
      echo "$RESULT_FILE"
    else
      echo "MISSING: $RESULT_FILE"
    fi
    echo
    echo "## Git Status"
    git status --short
    echo
    echo "## Changed Files"
    if [[ -n "$base" ]]; then
      git diff --name-only "$base"..HEAD || true
    fi
    if [[ -f "$baseline_dirty" ]]; then
      comm -23 <({ git diff --name-only; git diff --name-only --cached; } | sort -u) "$baseline_dirty" || true
    else
      git diff --name-only || true
      git diff --name-only --cached || true
    fi
  } > "$REVIEW_LOG"

  local forbidden_found=0
  while IFS= read -r changed; do
    [[ -z "$changed" ]] && continue
    if forbidden_path "$changed"; then
      echo "FORBIDDEN_CHANGED_FILE: $changed" | tee -a "$REVIEW_LOG"
      forbidden_found=1
    fi
  done < <({
    [[ -n "$base" ]] && git diff --name-only "$base"..HEAD || true
    if [[ -f "$baseline_dirty" ]]; then
      comm -23 <({ git diff --name-only; git diff --name-only --cached; } | sort -u) "$baseline_dirty" || true
    else
      git diff --name-only
      git diff --name-only --cached
    fi
  } | sort -u)

  echo "# Test Log - $TASK_ID" > "$TEST_LOG"
  local test_failed=0
  while IFS= read -r cmd; do
    [[ -z "$cmd" ]] && continue
    if safe_test_command "$cmd"; then
      echo "\$ $cmd" | tee -a "$TEST_LOG"
      set +e
      bash -lc "$cmd" >>"$TEST_LOG" 2>&1
      status=$?
      set -e
      echo "exit_code=$status" >> "$TEST_LOG"
      [[ "$status" -ne 0 ]] && test_failed=1
    else
      echo "SKIPPED_UNSAFE_COMMAND: $cmd" | tee -a "$TEST_LOG"
      test_failed=1
    fi
  done < <(extract_test_commands)

  {
    echo
    echo "## Test Log"
    echo "$TEST_LOG"
    echo
    echo "## Guard Summary"
    echo "forbidden_found=$forbidden_found"
    echo "test_failed=$test_failed"
    echo
    echo "Manual Codex decision required: ACCEPT, REVISION, or REJECT."
  } >> "$REVIEW_LOG"

  # Persist guard result so a later `accept` invocation can refuse to promote
  # a task whose review found forbidden files or failing tests, even though
  # prepare_review already returns this status via its exit code.
  {
    echo "forbidden_found=$forbidden_found"
    echo "test_failed=$test_failed"
  } > "logs/codex/${TASK_ID}.guard-state"

  echo "Review bundle: $REVIEW_LOG"
  echo "Test log: $TEST_LOG"
  [[ "$forbidden_found" -eq 0 && "$test_failed" -eq 0 ]]
}

# Strict ACCEPT preflight. Returns 0 only when every acceptance invariant holds:
#   - review guards passed (no forbidden files, no failed tests);
#   - the result report exists;
#   - the result report cites the current HEAD (full or short hash);
#   - no new uncommitted leftovers appeared vs the task baseline, ignoring the
#     review/test logs the orchestrator itself writes under logs/codex and
#     logs/tests.
# Emits ACCEPT_BLOCKED lines for every failed invariant so Codex sees why.
acceptance_gate() {
  local blocked=0
  local forbidden_found=0 test_failed=0
  local guard_state="logs/codex/${TASK_ID}.guard-state"
  if [[ -f "$guard_state" ]]; then
    # shellcheck source=/dev/null
    source "$guard_state"
  fi
  if [[ "${forbidden_found:-0}" -ne 0 ]]; then
    echo "ACCEPT_BLOCKED: review found forbidden changed files (forbidden_found=${forbidden_found})" >&2
    blocked=1
  fi
  if [[ "${test_failed:-0}" -ne 0 ]]; then
    echo "ACCEPT_BLOCKED: task tests failed or were skipped (test_failed=${test_failed})" >&2
    blocked=1
  fi

  if [[ ! -f "$RESULT_FILE" ]]; then
    echo "ACCEPT_BLOCKED: result report missing: $RESULT_FILE" >&2
    blocked=1
  else
    local head_full head_short
    head_full="$(git rev-parse HEAD 2>/dev/null || true)"
    head_short="$(git rev-parse --short HEAD 2>/dev/null || true)"
    if [[ -z "$head_full" ]] \
      || { ! grep -qF -- "$head_full" "$RESULT_FILE" \
           && ! grep -qF -- "$head_short" "$RESULT_FILE"; }; then
      echo "ACCEPT_BLOCKED: result report is stale - missing HEAD hash (${head_short:-unknown})" >&2
      blocked=1
    fi
  fi

  local baseline_dirty="logs/codex/${TASK_ID}.baseline-dirty-paths"
  local new_dirty
  if [[ -f "$baseline_dirty" ]]; then
    new_dirty="$(comm -23 \
      <(git status --porcelain=v1 | sed -E 's/^...//' | sort -u) \
      <(sort -u "$baseline_dirty"))"
  else
    new_dirty="$(git status --porcelain=v1 | sed -E 's/^...//' | sort -u)"
  fi
  # Ignore the review bundle and test logs this run itself produces.
  new_dirty="$(printf '%s\n' "$new_dirty" \
    | grep -vE '^"?logs/(codex|tests)/' \
    | grep -vE '^[[:space:]]*$' || true)"
  if [[ -n "$new_dirty" ]]; then
    echo "ACCEPT_BLOCKED: new uncommitted leftovers after baseline:" >&2
    printf '%s\n' "$new_dirty" >&2
    blocked=1
  fi

  return "$blocked"
}

run_revision() {
  local remarks_file="$1"
  if [[ -z "$remarks_file" || ! -f "$remarks_file" ]]; then
    echo "Usage: $0 revision path/to/remarks.md" >&2
    exit 64
  fi
  local count_file="logs/codex/${TASK_ID}.revision-count"
  local count=0
  [[ -f "$count_file" ]] && count="$(cat "$count_file")"
  count=$((count + 1))
  if [[ "$count" -gt 3 ]]; then
    echo "Revision limit exceeded for $TASK_ID" >&2
    exit 1
  fi
  echo "$count" > "$count_file"

  command -v claude >/dev/null 2>&1 || {
    echo "claude not found in PATH" >&2
    exit 127
  }

  local prompt_file
  prompt_file="$(mktemp "${TMPDIR:-/tmp}/botalin-claude-revision.XXXXXX")"
  {
    cat orchestrator/prompts/claude_revision.md
    echo
    echo "## Original Task"
    cat "$TASK_PATH"
    echo
    echo "## Codex Remarks"
    cat "$remarks_file"
    echo
    echo "## Current Result Report"
    [[ -f "$RESULT_FILE" ]] && cat "$RESULT_FILE" || echo "Result report missing."
  } > "$prompt_file"

  local log_file="logs/claude/${TASK_ID}-revision-${count}-${STAMP}.log"
  claude -p "$(cat "$prompt_file")" >"$log_file" 2>&1
  cp "$log_file" logs/claude/.log 2>/dev/null || true
  echo "Revision $count launched. Log: $log_file"
}

case "$ACTION" in
  prepare)
    prepare_review
    ;;
  accept)
    # Run the review (guards + tests) but do NOT let its exit code abort here;
    # acceptance_gate consumes the persisted guard result and enforces the full
    # acceptance contract before any promotion.
    prepare_review || true
    if acceptance_gate; then
      mv "$TASK_PATH" "tasks/accepted/${TASK_FILE}"
      echo "ACCEPT recorded for $TASK_ID. Codex must update audit/backlog and create the next ready task."
    else
      echo "ACCEPT refused for $TASK_ID: acceptance evidence incomplete. Task stays in tasks/review." >&2
      exit 1
    fi
    ;;
  revision)
    prepare_review || true
    run_revision "$ARG2"
    ;;
  reject)
    git diff > "logs/codex/${TASK_ID}-rejected-${STAMP}.diff" || true
    mv "$TASK_PATH" "tasks/rejected/${TASK_FILE}"
    echo "REJECT recorded for $TASK_ID. Diff isolated in logs/codex."
    ;;
  *)
    echo "Usage: $0 [prepare|accept|revision remarks.md|reject]" >&2
    exit 64
    ;;
esac
