# TASK-002 - Cost and PnL model audit for Botalin Edge

## Цель

Провести read-only аудит модели издержек и расчета PnL в актуальном `/opt/botalin-edge`.

## Зачем это нужно

TASK-001 установила source of truth, но пока не проверила, как текущий форк считает комиссии, spread, slippage, funding и PnL. Без этого результаты dashboard, factory, shadow и forward-протокола нельзя считать достоверными.

## Что конкретно должен сделать Claude Code

1. Работать с `/opt/botalin-edge` на сервере `167.233.205.87`.
2. Прочитать и описать, где считаются:
   - fees/commissions;
   - spread;
   - slippage;
   - funding;
   - realized/unrealized PnL;
   - NAV/ledger, если код доступен в форке.
3. Проверить, используются ли `lib/costs.mjs` и cost model во всех relevant scans/shadow scripts.
4. Проверить, нет ли путей, где PnL считается gross вместо net.
5. Проверить, не отключены ли fees, spread, slippage или funding флагами/env/default values.
6. Проверить, есть ли тесты на cost/PnL model.
7. Запустить только безопасные read-only тесты, если они не меняют состояние:
   - `node tests/test_floortostep.mjs`
   - `node scripts/smoke_engine.mjs`
8. Создать отчет `docs/COST_MODEL_AUDIT.md`.

## Разрешено менять

- `docs/COST_MODEL_AUDIT.md`
- `tasks/results/TASK-002-RESULT.md`

## Запрещено менять

- Любые файлы внутри `/opt/botalin-edge`, кроме создания итогового отчета, если отчет создается там по согласованию.
- Любые runner scripts.
- Любые стратегии.
- Любые risk/funding/PnL/backtest/factory файлы.
- Любые `.env`, secret-файлы, API keys, production configs.
- Любые database migrations.
- Любые dashboard auth файлы.
- Любые systemd units.

## Критерии готовности

- `docs/COST_MODEL_AUDIT.md` создан.
- В отчете перечислены все найденные места расчета costs/PnL.
- В отчете явно указано, учитываются ли fees, spread, slippage и funding.
- В отчете явно указаны найденные gross-PnL пути или написано, что они не найдены.
- В отчете указаны запущенные тесты и их результат.
- Код проекта не изменен.
- Секреты не прочитаны и не напечатаны.

## Команды для проверки

```bash
test -f docs/COST_MODEL_AUDIT.md
git diff -- docs/COST_MODEL_AUDIT.md tasks/results/TASK-002-RESULT.md
git status --short
```

На сервере, если доступен `/opt/botalin-edge`:

```bash
ssh 167.233.205.87 'cd /opt/botalin-edge && git status --short'
ssh 167.233.205.87 'cd /opt/botalin-edge && node tests/test_floortostep.mjs'
ssh 167.233.205.87 'cd /opt/botalin-edge && node scripts/smoke_engine.mjs'
```

## Какие тесты должны пройти

- `node tests/test_floortostep.mjs`
- `node scripts/smoke_engine.mjs`

Если запуск удаленных тестов невозможен из-за политики доступа, Claude Code должен явно указать это в `tasks/results/TASK-002-RESULT.md` и не обходить ограничение.

## Итоговый отчет Claude Code

Claude Code должен создать краткий отчет:

- какие файлы прочитаны;
- как считается net PnL;
- где учитываются fees/spread/slippage/funding;
- какие gaps найдены;
- какие тесты запущены;
- подтверждение, что live/paper trading и systemd services не запускались и не менялись.
