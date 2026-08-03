# TASK-002-ORCHESTRATOR-PREFLIGHT - Safe Claude CLI Preflight

## Идентификатор

TASK-002-ORCHESTRATOR-PREFLIGHT

## Цель

Закрепить preflight-защиту оркестратора перед запуском Claude Code: автоматический контур должен использовать standalone CLI `/Users/aleksandr/.local/bin/claude`, safe-mode и безопасный settings-файл, а также не должен запускаться при отсутствии этих условий.

## Обоснование

TASK-001 проверила guard-функции, но старые `.claude` настройки содержат широкие permissions и secret-like строки. Перед торговыми задачами нужно гарантировать, что автоматический запуск Claude не наследует опасные legacy-разрешения.

## Разрешенные файлы

- `orchestrator/run_claude_task.sh`
- `orchestrator/tests/test_safety_guards.sh`
- `tasks/results/TASK-002-ORCHESTRATOR-PREFLIGHT-RESULT.md`
- `logs/tests/TASK-002-ORCHESTRATOR-PREFLIGHT.log`

## Запрещенные файлы

- `CLAUDE.md`
- `docs/PROJECT_CONSTITUTION.md`
- `docs/CODEX_AUDIT.md`
- `docs/ORCHESTRATOR.md`
- `docs/CLAUDE_SECURITY_AUDIT.md`
- `.claude/settings.local.json`
- `.claude/settings.orchestrator-safe-proposed.json`
- `share/strategy-lab-7q4m2v/**`
- `crypto-strategy-bot/**`
- `.github/workflows/**`
- любые `.env`, `*.pem`, `id_rsa`, private keys, API keys
- hidden datasets
- любые trading runner, strategy, risk, funding, PnL, backtest, factory файлы

## Конкретные требования

1. В `orchestrator/run_claude_task.sh` добавить явный preflight:
   - `CLAUDE_BIN` по умолчанию должен быть `/Users/aleksandr/.local/bin/claude`;
   - если файл отсутствует или не исполняем, скрипт должен остановиться до перемещения задачи;
   - если путь `CLAUDE_BIN` содержит `.vscode/extensions` или `Visual Studio Code`, скрипт должен остановиться;
   - должен проверяться файл `.claude/settings.orchestrator-safe-proposed.json`;
   - реальный запуск Claude должен использовать `--safe-mode` и `--settings .claude/settings.orchestrator-safe-proposed.json`;
   - `--dangerously-skip-permissions` запрещен и не должен появляться в скрипте.
2. Добавить проверки этих условий в `orchestrator/tests/test_safety_guards.sh`:
   - standalone CLI path присутствует в скрипте;
   - `--safe-mode` присутствует в команде запуска;
   - safe settings path присутствует;
   - `.vscode/extensions` блокируется или явно проверяется как forbidden CLI source;
   - `--dangerously-skip-permissions` отсутствует.
3. Тест должен оставаться локальным и не запускать Claude.
4. Записать краткий результат в `tasks/results/TASK-002-ORCHESTRATOR-PREFLIGHT-RESULT.md`.

## Критерии готовности

- `bash -n orchestrator/run_claude_task.sh` проходит.
- `bash -n orchestrator/tests/test_safety_guards.sh` проходит.
- `bash orchestrator/tests/test_safety_guards.sh` проходит.
- `orchestrator/run_claude_task.sh` содержит safe-mode запуск standalone CLI.
- Claude не запускается тестом.
- Запрещенные файлы не изменены.
- Git commit создан с сообщением `TASK-002-ORCHESTRATOR-PREFLIGHT completed`.

## Команды тестирования

```bash
bash -n orchestrator/run_claude_task.sh
bash -n orchestrator/review_cycle.sh
bash -n orchestrator/run_next.sh
bash -n orchestrator/tests/test_safety_guards.sh
bash orchestrator/tests/test_safety_guards.sh
```

## Ожидаемый итоговый отчет

Claude Code должен создать `tasks/results/TASK-002-ORCHESTRATOR-PREFLIGHT-RESULT.md` и указать:

- какие preflight-проверки добавлены;
- как подтверждено использование standalone CLI;
- как подтверждено использование safe-mode/settings;
- какие команды были запущены;
- подтверждение, что торговый код и старые `.claude` настройки не менялись;
- список измененных файлов;
- commit hash.
