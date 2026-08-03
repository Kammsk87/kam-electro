# TASK-001 - Source of truth inventory for current Botalin Edge

## Цель

Создать воспроизводимый inventory актуального проекта `/opt/botalin-edge` и отделить current production/research code от legacy-слоя в старом workspace.

## Зачем это нужно

Codex не смог прочитать `/opt/botalin-edge` в текущем окружении: путь отсутствует. Dashboard показывает актуальную систему, но без source tree невозможно проверить кодом расчет PnL, fees, funding, risk, factory splits, holdout и безопасность.

Эта задача должна дать Claude Code и Codex единый источник правды перед любыми правками торговой логики.

## Что конкретно должен сделать Claude Code

1. Проверить, существует ли `/opt/botalin-edge` на машине, где запускается Claude Code.
2. Прочитать:
   - `/opt/botalin-edge/BOTALIN_EDGE_WORKORDER.md`
   - `/opt/botalin-edge/HANDOFF.md`
   - `/opt/botalin-edge/PROJECT_PLAN.md`
3. Составить список файлов проекта без содержимого секретов.
4. Найти entrypoints, dashboard/API routes, runner scripts, factory scripts, tests, config examples.
5. Определить git status/commit/branch, если `/opt/botalin-edge` является git-репозиторием.
6. Создать отчет `docs/CURRENT_SOURCE_INVENTORY.md`.
7. В отчете явно указать:
   - какие файлы являются актуальными;
   - какие файлы являются legacy;
   - какие команды безопасны для read-only диагностики;
   - какие команды запрещены без отдельного разрешения;
   - какие env vars нужны, но без значений секретов.

## Разрешено менять

- `docs/CURRENT_SOURCE_INVENTORY.md`

## Запрещено менять

- Любые файлы внутри `/opt/botalin-edge`, кроме чтения.
- Любые runner scripts.
- Любые стратегии.
- Любые risk/funding/PnL/backtest/factory файлы.
- Любые `.env`, secret-файлы, API keys, production configs.
- Любые database migrations.
- Любые dashboard auth файлы.

## Критерии готовности

- `docs/CURRENT_SOURCE_INVENTORY.md` создан.
- В отчете есть commit/branch/status или явно написано, что git metadata отсутствует.
- В отчете перечислены все ключевые entrypoints и тестовые команды.
- В отчете явно указано, доступны ли три исходных документа workorder/handoff/plan.
- В отчете нет значений секретов.
- Код проекта не изменен.

## Команды для проверки

```bash
test -f docs/CURRENT_SOURCE_INVENTORY.md
git diff -- docs/CURRENT_SOURCE_INVENTORY.md
git status --short
```

Если `/opt/botalin-edge` существует:

```bash
ls -la /opt/botalin-edge
find /opt/botalin-edge -maxdepth 3 -type f | sort | sed -n '1,240p'
git -C /opt/botalin-edge status --short
git -C /opt/botalin-edge rev-parse --abbrev-ref HEAD
git -C /opt/botalin-edge rev-parse HEAD
```

## Какие тесты должны пройти

Для этой задачи не нужно запускать торговые тесты или live/paper runner.

Должны пройти только read-only проверки:

- наличие `docs/CURRENT_SOURCE_INVENTORY.md`;
- отсутствие изменений в коде `/opt/botalin-edge`;
- отсутствие секретов в отчете.

## Итоговый отчет Claude Code

Claude Code должен создать краткий отчет:

- найден ли `/opt/botalin-edge`;
- какие документы прочитаны;
- какой commit/branch зафиксирован;
- какие entrypoints и тесты найдены;
- какие риски source-of-truth остались;
- подтверждение, что торговая логика и live trading не запускались.
