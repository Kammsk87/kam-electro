#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

mkdir -p tasks/ready tasks/in_progress tasks/review logs/codex

next_task() {
  find tasks/ready -maxdepth 1 -type f -name 'TASK-*.md' | sort | head -n 1
}

if find tasks/in_progress -maxdepth 1 -type f -name 'TASK-*.md' | grep -q .; then
  echo "A task is already in progress. Stop."
  exit 1
fi

if find tasks/review -maxdepth 1 -type f -name 'TASK-*.md' | grep -q .; then
  echo "A task is waiting for Codex review. Stop."
  exit 1
fi

TASK_PATH="$(next_task)"
if [[ -z "$TASK_PATH" ]]; then
  echo "No ready tasks."
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "DRY RUN: next task is $TASK_PATH"
  ./orchestrator/run_claude_task.sh --dry-run "$TASK_PATH"
  echo "DRY RUN: review_cycle would run after Claude completes."
  exit 0
fi

./orchestrator/run_claude_task.sh "$TASK_PATH"
./orchestrator/review_cycle.sh prepare
