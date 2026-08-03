# CODEX AUDIT - Botalin Orchestrated Trading Project

Дата: 2026-07-11.
Роль документа: рабочий аудит Codex для управления задачами Claude Code.

## Executive Summary

Проект в текущем workspace смешивает несколько независимых направлений. Актуальный криптотрейдинговый контур Botalin не живет полностью в этом локальном дереве: operational truth виден через dashboard `https://botalin-dashboard.vercel.app`, а source truth для edge-кода был найден TASK-001 на сервере `167.233.205.87` в `/opt/botalin-edge`.

Локальный слой `share/strategy-lab-7q4m2v` и `crypto-strategy-bot` нужно считать legacy/исторической лабораторией. Его нельзя автоматически принимать за production-код текущего edge.

Главный вывод: прежде чем искать новые стратегии, нужно укрепить P0-контур достоверности: source sync, cost/PnL tests, независимый валидатор, split discipline, protection от live trading и секретов.

## Источники, которые изучены

- Root README: проект корня сейчас описывает сайт `КАМ Электро`, то есть workspace не является чистым репозиторием Botalin.
- `crypto-strategy-bot/README.md`: статический MVP генератора стратегий и paper/live UI.
- `crypto-strategy-bot/exchange-api-analysis.md`: план market-data gateway и осторожного перехода к private API.
- `share/strategy-lab-7q4m2v/*`: legacy Node/Python контур стратегий, paper runner, backtests, shadow, optimizer, SQL и VPS unit-файлы.
- `.github/workflows/*`: legacy GitHub Actions для paper-autobot/backtest/health.
- `docs/COST_MODEL_AUDIT.md`: результат TASK-002 по текущему `/opt/botalin-edge`.
- `tasks/results/TASK-002-RESULT.md`: отчет Claude Code по cost/PnL audit.
- Dashboard Botalin, просмотренный ранее через staff-доступ: `/stats`, `/runners`, `/money`, `/factory`, `/b11`.

Root `CLAUDE.md` в текущем workspace не найден. Вложенные `CLAUDE.md` есть в других проектах (`quiz-game`, `ui-ux-pro-max-skill`, `uskoritel-project`) и не являются правилами Botalin.

## Актуальная архитектура

### Current Operational Layer

- Dashboard: `Status`, `Money`, `Factory`, `Runners`, `B1.1`, `Stats`.
- Current edge source: `/opt/botalin-edge` на сервере `167.233.205.87`, git origin `git@github.com:Kammsk87/botalin-edge.git`.
- TASK-001 inventory: branch `main`, HEAD `07189b6c6194c42a2f65b89cd79167bb69db835e`, 77 tracked files, runtime-only dirty file `logs/shadow_state.json`.
- TASK-002 cost audit: fees/slippage/funding/net PnL в текущем edge описаны в `docs/COST_MODEL_AUDIT.md`.

### Legacy Local Lab

- `crypto-strategy-bot`: browser MVP, public WebSocket market data, localStorage learning, visual strategy builder.
- `share/strategy-lab-7q4m2v/server-autobot.mjs`: legacy paper/live-like runner with strategies, risk, Supabase/Firebase fallback, Bybit private API gate.
- `server-backtest.mjs`, `server-shadow.mjs`, `server-optimizer.mjs`, `server-param-search.mjs`: older research/backtest/shadow tools.
- Python hypothesis mining: `tools/hypothesis_mining/label_outcomes.py`, `run_sweep.py`.
- VPS systemd files: `vps/botalin-*.service`, `*.timer`, installer.
- GitHub Actions: scheduled legacy runners and backtest.

## Что уже работает

- Dashboard доступен и показывает живые operational metrics.
- В актуальном edge есть модель издержек: `lib/costs.mjs`, `lib/execution.mjs`, scan/shadow scripts, safe smoke tests.
- TASK-002 показала, что в edge net PnL считается как `gross - cost`; fees и slippage не отключаются env-флагами.
- Funding явно учитывается в funding-осях и `funding_shadow`.
- Есть runner-level и money/NAV представления в dashboard.
- Есть factory-процесс с train/prep стадиями и freeze/survivor концепцией.
- В legacy-слое есть paper trading UI и server runner, но это не current source of truth.

## Что сломано или недоступно

- Текущий edge не синхронизирован как полноценный локальный рабочий репозиторий в этом workspace.
- Root repository грязный и содержит много unrelated проектов и незакоммиченных файлов; автоматический контур должен ограничивать scope задач.
- `claude` не найден в текущем shell через `which claude`; скрипты должны явно проверять наличие CLI перед запуском.
- Legacy workflows и server health относятся к старому контуру и не должны запускаться как current production.
- Legacy SQL RLS-политики выглядят открытыми и не должны переноситься в production без отдельного security review.

## Заглушки и незавершенные части

- Factory на dashboard ранее показывал `validation=0`, `holdout=0`, `survivors=0` для C2-PREP: research cycle не завершен.
- В legacy `crypto-strategy-bot` LLM/backend gateway/backtest описаны как будущие этапы.
- В edge TASK-002 нашла gap: нет регресс-теста cost/PnL, а cost constants продублированы в scan scripts.
- Нет локального независимого валидатора метрик, который Codex может запускать без доверия к отчету Claude.

## Достоверность бэктестов и метрик

Текущие dashboard-метрики полезны operationally, но пока недостаточны как доказательство edge:

- Малые выборки у части runner versions.
- Factory train без validation/holdout нельзя принимать как OOS-доказательство.
- Survivorship bias возможен без полного журнала rejected/frozen candidates.
- Data leakage возможна, если train/validation/holdout пересекаются по времени, активам или outcome labels.
- Look-ahead bias возможен, если candle close/open discipline или funding timestamps нарушены.
- Переобучение вероятно при большом числе версий раннеров и гипотез без preregistration.

Метрики принимаются только после независимого валидатора, который воспроизводит результат из immutable input, commit id и frozen config.

## Комиссии и торговые издержки

По TASK-002 для `/opt/botalin-edge`:

- Fees: учитываются через `lib/costs.mjs`.
- Slippage: учитывается константой `SLIP=0.0005`.
- Spread: directional paths учитывают через slippage buffer; cross-venue axis моделирует basis явно.
- Funding: учитывается в funding-осях, не добавляется в directional candle scans как допущение короткого hold.
- Gross-only PnL path в проверенных файлах не найден.
- Gap: cost constants дублируются в нескольких scripts вместо единого импорта.
- Gap: нет регресс-теста, который фиксирует cost/PnL contract.

## Paper Trading и Live Trading

- Legacy paper trading есть в browser app и server runner.
- Current dashboard показывает live-like operational money/NAV, но live order path должен оставаться заблокированным без отдельного ручного подтверждения.
- Любой запуск `BOTALIN_REAL_TRADING=true`, systemd services, deploy, private exchange keys и `.env` запрещены для автоматического контура.

## Фабрика гипотез

Фабрика гипотез есть, но требует дисциплины:

- Preregistered config перед train.
- Chronological train/validation/holdout.
- Immutable hidden dataset.
- Минимальная forward sample.
- Все rejected/frozen/survivor candidates должны попадать в machine-readable report.
- Следующая версия стратегии не может приниматься на основании одного Claude report или dashboard summary.

## Компоненты, которые нужно сохранить

- Dashboard как operational cockpit.
- Ledger/NAV/Money history.
- Factory cycle и freeze/survivor protocol.
- Runner metrics by version.
- `lib/costs.mjs` и `lib/execution.mjs` в current edge.
- Smoke tests edge: `tests/test_floortostep.mjs`, `scripts/smoke_engine.mjs`.
- Legacy идеи: structured rejected signals, net-of-cost labels, paper journal, health checks.

## Компоненты, которые нужно изолировать

- Legacy `share/strategy-lab-7q4m2v` от current `/opt/botalin-edge`.
- Private API/live trading от research/backtest.
- `.env`, private keys, exchange keys, deployment/systemd commands from agents.
- Hidden datasets and independent validators from strategy implementation tasks.
- Root workspace unrelated projects from Botalin automation scope.

## Упорядоченный Backlog

### P0 - достоверность, безопасность, данные

1. Добавить self-tests для orchestrator safety guards: forbidden paths, forbidden commands, dry-run behavior.
2. Синхронизировать current `/opt/botalin-edge` в проверяемый локальный или CI-readable source path без секретов.
3. Создать независимый validator spec: immutable inputs, commit id, config hash, OOS windows, metric contract.
4. Добавить regression tests для cost/PnL contract: fees, spread/slippage, funding, gross-to-net.
5. Убрать дублирование cost constants через единый модуль или contract test.
6. Проверить ledger/NAV/reconciliation в dashboard/API.
7. Проверить timestamp discipline: candle close/open, funding marks, no incomplete candle leakage.
8. Зафиксировать hidden dataset policy и запрет изменения holdout.

### P1 - исследовательский контур

9. Ввести machine-readable factory report для train/validation/holdout/forward.
10. Добавить preregistration template для каждой гипотезы.
11. Ввести minimum promotion gates: sample size, OOS expectancy, drawdown, stability.
12. Связать dashboard metrics с source commit/version ids.
13. Сформировать rejected/frozen/survivor registry.

### P2 - автоматизация агентов

14. Внедрить Codex -> Claude -> tests -> Codex review task folders.
15. Добавить revision loop с максимум тремя попытками.
16. Добавить daily digest из dashboard/factory без изменения trading state.
17. Добавить task registry и evidence links.

### P3 - улучшение стратегий

18. Проверить V48 на расширенной forward sample без изменения правил.
19. Разобрать отрицательные runners V29/V30/VWAP и зафиксировать причины.
20. Проверить B1.1 funding floor annualization и threshold sensitivity.

## Первая задача для Claude Code

Создана `tasks/ready/TASK-001.md`: добавить self-test для orchestrator safety guards.

Причина выбора: прежде чем отдавать Claude торговые задачи, нужно проверить сам контур безопасности. Это P0-задача, она малая, локальная, не трогает торговый код и доказывает, что dangerous paths/commands не пройдут незамеченными.
