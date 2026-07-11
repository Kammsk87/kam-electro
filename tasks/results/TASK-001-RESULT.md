# TASK-001-RESULT — Source of truth inventory for current Botalin Edge

Дата: **2026-07-11**. Ветка: **`task/TASK-001`**. Исполнитель: Claude Code.

## Что было сделано
- Установлено, что `/opt/botalin-edge` **отсутствует на машине Claude Code** (локальный Mac) и **живёт на сервере
  `167.233.205.87`** (git-репо, владелец `botalin`). Это и есть причина, по которой Codex не смог его прочитать
  (`docs/CODEX_AUDIT.md`).
- Прочитаны три исходных документа: `BOTALIN_EDGE_WORKORDER.md`, `HANDOFF.md`, `PROJECT_PLAN.md` (плюс `README.md`,
  `CHARTER.md`, `tasks/TASK-001.md`, `docs/CODEX_AUDIT.md`).
- Собран read-only inventory: полный файловый список (77 tracked-файлов, maxdepth 3), git branch/HEAD/status/remote,
  entrypoints (`scripts/`, `lib/`), тесты, dashboard/API/раннеры (вне форка), env-контракт (имена переменных без
  значений), разделение current/legacy, безопасные и запрещённые команды.
- Создан отчёт **`docs/CURRENT_SOURCE_INVENTORY.md`** со всеми пунктами из критериев готовности TASK-001.

## Какие файлы изменены
- **Создан:** `docs/CURRENT_SOURCE_INVENTORY.md` (единственный разрешённый к изменению файл по TASK-001).
- **Создан:** `tasks/results/TASK-001-RESULT.md` (этот отчёт).
- **НЕ изменялось:** ничего внутри `/opt/botalin-edge`, никакие раннеры/стратегии/risk/funding/PnL/backtest/factory,
  `.env`/секреты, DB migrations, dashboard auth.

## Какие тесты запущены и результаты
Торговые/live-тесты по TASK-001 не требуются. Запущены проверки из задачи + read-only-санити движка:

| Проверка | Команда | Результат |
|---|---|---|
| Наличие отчёта | `test -f docs/CURRENT_SOURCE_INVENTORY.md` | ✅ OK |
| Диф отчёта | `git diff -- docs/CURRENT_SOURCE_INVENTORY.md` | ✅ пуст (файл untracked до коммита) |
| Статус репо | `git status --short docs/ tasks/` | ✅ `?? docs/`, `?? tasks/` |
| Нет секретов в отчёте | grep по паттернам ключей/токенов | ✅ чисто |
| Код форка не изменён | `git -C /opt/botalin-edge status --short` | ✅ только `M logs/shadow_state.json` (runtime, не Claude Code) |
| Smoke движка | `node scripts/smoke_engine.mjs` | ✅ **27/27 вызовов, 0 ошибок** |
| Юнит floorToStep | `node tests/test_floortostep.mjs` | ✅ **10/10 PASS** |

## Что осталось нерешённым
- **Доступ CI/Codex к серверу.** Отчёт снят через SSH; без SSH-доступа Codex снова не увидит форк. Нужен либо
  доступ CI к `167.233.205.87`, либо синхронизация GitHub `origin` (который отставал от серверного `main`).
- **Привязка dashboard-метрик к commit id** не сделана (это отдельная задача, вне scope TASK-001).
- Формальная изоляция legacy (`/opt/botalin`, `share/strategy-lab-7q4m2v/`) от production — вне scope.

## Известные ограничения
- Inventory отражает состояние сервера на **2026-07-11**, HEAD `07189b6…`. Сервер живой (shadow/рекордеры пишут
  runtime-файлы), поэтому `logs/*` и forward-данные меняются вне контроля этой задачи.
- Env-переменные перечислены только по именам (`process.env.*` в `scripts/` и `lib/`); значения секретов не читались.
- `origin` на GitHub может отставать от серверного `main` — перед CI-аудитом сверять `git rev-parse HEAD`.

## Подтверждение
Торговая логика и live/paper trading **не запускались**; ни один `botalin-*` сервис не менялся; код
`/opt/botalin-edge` не изменён.
