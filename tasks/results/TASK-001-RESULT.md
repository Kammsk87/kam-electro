# TASK-001 - Orchestrator Safety Guard Self-Test - RESULT

## Статус

DONE. Тест создан, исполняем, проходит локально (34 проверки, 0 провалов).

## Что сделано

Добавлен локальный self-test `orchestrator/tests/test_safety_guards.sh`, который
проверяет реальные safety-guard функции оркестратора, определённые в
`orchestrator/review_cycle.sh`:

- `forbidden_path` — обнаружение запрещённых путей;
- `task_forbidden_path` / `task_forbidden_patterns` — запрещённые пути из секции
  задачи "Запрещенные файлы";
- `forbidden_command` — обнаружение опасных команд;
- `safe_test_command` — допуск только безопасных тестовых команд.

Тест не переписывает эти функции, а статически извлекает их из
`review_cycle.sh` (через `awk`) и загружает через `eval`. Так проверяется
именно текущая боевая логика guard'ов, а не её копия. Верхнеуровневый код
`review_cycle.sh` (mkdir/find/exit) при этом не выполняется, поэтому торговый
контур не запускается.

`task_forbidden_path` читает секцию задачи через `$TASK_PATH`. Чтобы тест был
самодостаточным и не зависел от местоположения живого файла задачи, он создаёт
временный fixture-файл задачи с секцией "Запрещенные файлы" (в т.ч.
`share/strategy-lab-7q4m2v/**`) во временной директории и удаляет её в `trap`.

## Какие проверки safety guards добавлены

Forbidden paths (должны блокироваться):
- `.env`, `config/.env.production`
- `id_rsa`, `home/.ssh/id_ed25519`
- `certs/server.pem`
- `hidden`, `data/hidden/holdout.csv`
- `secrets/keys.json`
- `.github/workflows/backtest.yml`
- `share/strategy-lab-7q4m2v/server-autobot.mjs`
- `crypto-strategy-bot/index.html`
- `docs/PROJECT_CONSTITUTION.md`

Allowed paths (не должны блокироваться):
- `orchestrator/tests/test_safety_guards.sh`
- `tasks/results/TASK-001-RESULT.md`
- `README.md`

Forbidden commands (должны блокироваться, а также отклоняться как unsafe test command):
- `sudo ...`
- `systemctl ...`
- `git reset --hard ...`
- `git clean ...`
- `rm -rf ...`
- `BOTALIN_REAL_TRADING=true ...`
- `vercel deploy ...`
- `cat .env`, `echo $API_SECRET`

Safe test commands (должны допускаться):
- `test -f docs/PROJECT_CONSTITUTION.md`
- `git status --short`
- `bash -n orchestrator/run_next.sh`
- `bash -n orchestrator/run_claude_task.sh`
- `bash orchestrator/tests/test_safety_guards.sh`

## Запущенные команды

```bash
bash -n orchestrator/run_claude_task.sh
bash -n orchestrator/review_cycle.sh
bash -n orchestrator/run_next.sh
bash -n orchestrator/tests/test_safety_guards.sh
bash orchestrator/tests/test_safety_guards.sh
```

Результат: все `bash -n` без ошибок; сам тест — `passed=34 failed=0`, `RESULT: OK`.
Вывод продублирован в `logs/tests/TASK-001-safety.log`.

## Подтверждение безопасности

- Торговый код не менялся (runner/strategy/risk/funding/PnL/backtest/factory —
  не тронуты).
- Тест не читает `.env`, private keys или secrets (опасные строки используются
  только как литеральные аргументы для guard-функций; файлы не открываются).
- Тест не запускает live trading, deploy, systemd, sudo или Claude.
- Запрещённые файлы из задачи не изменены.

## Изменённые / созданные файлы

- `orchestrator/tests/test_safety_guards.sh` (создан, исполняемый)
- `tasks/results/TASK-001-RESULT.md` (этот отчёт, перезаписан)
- `logs/tests/TASK-001-safety.log` (лог прогона)

## Commit

`TASK-001 completed` (hash фиксируется этим коммитом).
