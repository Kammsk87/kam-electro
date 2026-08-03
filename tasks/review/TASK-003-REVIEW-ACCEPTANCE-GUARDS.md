# TASK-003-REVIEW-ACCEPTANCE-GUARDS - Strict ACCEPT Preflight

## Идентификатор

TASK-003-REVIEW-ACCEPTANCE-GUARDS

## Цель

Усилить `orchestrator/review_cycle.sh`, чтобы действие `accept` не могло принять задачу автоматически при неполном evidence: отсутствующий/stale result report, неверный commit hash, проваленные тесты, forbidden files или новые незакоммиченные leftovers должны блокировать `ACCEPT`.

## Обоснование

TASK-002 показала реальную проблему: реализация была правильной, но result report содержал неверный commit hash, и это обнаружил только ручной Codex review. Перед переходом к торговым задачам acceptance должен автоматически проверять базовые инварианты отчёта и рабочего дерева.

## Разрешенные файлы

- `orchestrator/review_cycle.sh`
- `orchestrator/tests/test_safety_guards.sh`
- `tasks/results/TASK-003-REVIEW-ACCEPTANCE-GUARDS-RESULT.md`
- `logs/tests/TASK-003-REVIEW-ACCEPTANCE-GUARDS.log`

## Запрещенные файлы

- `CLAUDE.md`
- `docs/PROJECT_CONSTITUTION.md`
- `docs/CODEX_AUDIT.md`
- `docs/ORCHESTRATOR.md`
- `docs/CLAUDE_SECURITY_AUDIT.md`
- `.claude/settings.local.json`
- `.claude/settings.orchestrator-safe-proposed.json`
- `orchestrator/run_claude_task.sh`
- `share/strategy-lab-7q4m2v/**`
- `crypto-strategy-bot/**`
- `.github/workflows/**`
- любые `.env`, `*.pem`, `id_rsa`, private keys, API keys
- hidden datasets
- любые trading runner, strategy, risk, funding, PnL, backtest, factory файлы

## Конкретные требования

1. В `orchestrator/review_cycle.sh` добавить явную acceptance-проверку перед `mv "$TASK_PATH" tasks/accepted/`:
   - `prepare_review` должен возвращать/сохранять результат так, чтобы `accept` мог остановиться при `forbidden_found=1` или `test_failed=1`;
   - `accept` должен остановиться, если `tasks/results/<TASK-ID>-RESULT.md` отсутствует;
   - `accept` должен остановиться, если result report не содержит текущий `HEAD` full hash или short hash;
   - `accept` должен остановиться, если после baseline появились новые незакоммиченные changed files, кроме review/test logs под `logs/codex/` и `logs/tests/`;
   - при остановке задача должна оставаться в `tasks/review`, а не переноситься в `accepted`.
2. Добавить self-test проверки в `orchestrator/tests/test_safety_guards.sh`:
   - acceptance guard functions/strings присутствуют в `review_cycle.sh`;
   - `accept` не должен быть простым `prepare_review && mv`;
   - проверяется наличие логики для result report, HEAD hash и new dirty leftovers;
   - тест остаётся локальным и не запускает Claude.
3. Не менять торговый код и старые `.claude` настройки.
4. Создать отчёт `tasks/results/TASK-003-REVIEW-ACCEPTANCE-GUARDS-RESULT.md`.

## Критерии готовности

- `bash -n orchestrator/review_cycle.sh` проходит.
- `bash -n orchestrator/tests/test_safety_guards.sh` проходит.
- `bash orchestrator/tests/test_safety_guards.sh` проходит.
- `orchestrator/review_cycle.sh accept` больше не переносит задачу в accepted, если acceptance evidence неполное.
- Result report содержит актуальный commit hash.
- Запрещенные файлы не изменены.
- Git commit создан с сообщением `TASK-003-REVIEW-ACCEPTANCE-GUARDS completed`.

## Команды тестирования

```bash
bash -n orchestrator/run_claude_task.sh
bash -n orchestrator/review_cycle.sh
bash -n orchestrator/run_next.sh
bash -n orchestrator/tests/test_safety_guards.sh
bash orchestrator/tests/test_safety_guards.sh
```

## Ожидаемый итоговый отчет

Claude Code должен создать `tasks/results/TASK-003-REVIEW-ACCEPTANCE-GUARDS-RESULT.md` и указать:

- какие acceptance checks добавлены;
- как проверяется result report и commit hash;
- как проверяются new dirty leftovers;
- какие команды были запущены;
- подтверждение, что торговый код и `.claude` настройки не менялись;
- список измененных файлов;
- commit hash.
