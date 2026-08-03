# TASK-001 - Orchestrator Safety Guard Self-Test

## Идентификатор

TASK-001

## Цель

Добавить небольшой self-test для orchestrator safety guards, который проверяет, что контур обнаруживает запрещенные пути и опасные команды до запуска торговых задач.

## Обоснование

Перед тем как давать Claude Code задачи по торговому коду, нужно проверить саму систему управления. Если safety guards не тестируются, автоматический контур может случайно пропустить `.env`, private keys, live trading, `sudo`, deploy или destructive Git-команды.

## Разрешенные файлы

- `orchestrator/tests/test_safety_guards.sh`
- `tasks/results/TASK-001-RESULT.md`
- `logs/tests/TASK-001-safety.log`

## Запрещенные файлы

- `docs/PROJECT_CONSTITUTION.md`
- `docs/CODEX_AUDIT.md`
- `docs/ORCHESTRATOR.md`
- `share/strategy-lab-7q4m2v/**`
- `crypto-strategy-bot/**`
- `.github/workflows/**`
- любые `.env`, `*.pem`, `id_rsa`, private keys, API keys
- hidden datasets
- independent validator files, если они появятся
- любые trading runner, strategy, risk, funding, PnL, backtest, factory файлы

## Конкретные требования

1. Создать `orchestrator/tests/test_safety_guards.sh`.
2. Тест должен быть локальным и не запускать Claude.
3. Тест должен проверять минимум:
   - forbidden path examples: `.env`, `id_rsa`, `hidden`, `share/strategy-lab-7q4m2v/server-autobot.mjs`;
   - forbidden command examples: `sudo`, `systemctl`, `git reset --hard`, `git clean`, `rm -rf`, `BOTALIN_REAL_TRADING=true`, `vercel deploy`;
   - safe command examples: `test -f docs/PROJECT_CONSTITUTION.md`, `git status --short`, `bash -n orchestrator/run_next.sh`.
4. Если текущие orchestrator scripts не экспортируют функции, тест может проверять их через dry-run/static assertions, но не должен менять торговый код.
5. Записать краткий результат в `tasks/results/TASK-001-RESULT.md`.

## Критерии готовности

- `orchestrator/tests/test_safety_guards.sh` создан и исполняем.
- Тест проходит локально.
- Тест не читает `.env` и private keys.
- Тест не запускает live trading, deploy, systemd, sudo или Claude.
- Запрещенные файлы не изменены.
- `tasks/results/TASK-001-RESULT.md` создан.
- Git commit создан с сообщением `TASK-001 completed`.

## Команды тестирования

```bash
bash -n orchestrator/run_claude_task.sh
bash -n orchestrator/review_cycle.sh
bash -n orchestrator/run_next.sh
bash -n orchestrator/tests/test_safety_guards.sh
bash orchestrator/tests/test_safety_guards.sh
```

## Ожидаемый итоговый отчет

Claude Code должен создать `tasks/results/TASK-001-RESULT.md` и указать:

- какие проверки safety guards добавлены;
- какие команды были запущены;
- подтверждение, что торговый код не менялся;
- список измененных файлов;
- commit hash.
