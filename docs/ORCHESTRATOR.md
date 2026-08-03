# ORCHESTRATOR

Этот контур связывает Codex и Claude Code:

```text
Codex создает задачу -> Claude выполняет одну задачу -> тесты -> Codex review -> ACCEPT/REVISION/REJECT
```

Claude не выбирает следующую задачу и не меняет критерии приемки. Codex остается управляющим агентом.

## Структура

- `orchestrator/run_next.sh` - удобный запуск следующей ready-задачи.
- `orchestrator/run_claude_task.sh` - переносит задачу в `in_progress`, создает branch, запускает `claude -p`, пишет лог.
- `orchestrator/review_cycle.sh` - готовит review bundle, проверяет diff, forbidden paths и безопасно запускает тестовые команды из задачи.
- `orchestrator/prompts/claude_execute.md` - системный промт выполнения.
- `orchestrator/prompts/claude_revision.md` - системный промт исправления замечаний.
- `tasks/ready` - задачи, которые можно запускать.
- `tasks/in_progress` - задача сейчас у Claude.
- `tasks/review` - задача ждет Codex review.
- `tasks/accepted` - принятые задачи.
- `tasks/rejected` - отклоненные задачи.
- `tasks/results` - отчеты Claude.
- `logs/claude` - вывод Claude.
- `logs/tests` - вывод тестов.
- `logs/codex` - review bundle и решения Codex.

## Как запустить

Dry run без запуска Claude и без движения задач:

```bash
./orchestrator/run_next.sh --dry-run
```

Обычный запуск следующей ready-задачи:

```bash
./orchestrator/run_next.sh
```

Запуск конкретной задачи:

```bash
./orchestrator/run_claude_task.sh tasks/ready/TASK-001.md
```

Подготовить review по задаче в `tasks/review`:

```bash
./orchestrator/review_cycle.sh
```

## Как смотреть логи

```bash
ls logs/claude
ls logs/tests
ls logs/codex
```

Последний вывод Claude дублируется в:

```text
logs/claude/.log
```

## Как остановить

Скрипты не запускают бесконечный цикл. Один запуск обрабатывает максимум одну задачу.

Если процесс уже идет, останови его стандартно через terminal interrupt. После этого проверь:

```bash
git status --short
ls tasks/in_progress
ls tasks/review
```

## Как вернуть изменения

Автоматический контур сам не выполняет destructive Git-команды.

При REJECT `review_cycle.sh reject` сохраняет diff в `logs/codex` и перемещает задачу в `tasks/rejected`. Откат кода делает только человек или Codex после отдельного подтверждения.

## Что требует ручного подтверждения

- Live trading.
- Деплой.
- `sudo`.
- systemd actions.
- Чтение `.env` или private keys.
- Передача реальных exchange keys.
- Изменение hidden dataset.
- Изменение independent validator.
- Destructive Git-команды: `git reset --hard`, `git clean`, `git checkout --`, удаление файлов или репозитория.

## Ограничения

Если `claude` не найден в `PATH`, `run_claude_task.sh` остановится до изменения задачи.

Review script не принимает работу автоматически. Он только готовит evidence для Codex.
