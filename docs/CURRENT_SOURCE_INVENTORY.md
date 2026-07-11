# CURRENT_SOURCE_INVENTORY — Botalin Edge

Задача: **TASK-001** (`tasks/TASK-001.md`).
Дата инвентаризации: **2026-07-11**.
Автор: Claude Code (read-only-инвентаризация, торговая логика не запускалась).

---

## 0. Резюме (TL;DR)

| Вопрос | Ответ |
|---|---|
| `/opt/botalin-edge` найден? | **Да**, но НЕ на машине Claude Code (локальный Mac), а на сервере **`167.233.205.87`** (пользователь ops: `botalin`). Доступ по SSH из `~/.ssh/config`. |
| Это git-репозиторий? | Да. `origin git@github.com:Kammsk87/botalin-edge.git`. |
| Ветка / HEAD | `main` / `07189b6c6194c42a2f65b89cd79167bb69db835e`. |
| Git status | `1` изменённый файл рабочего дерева: `logs/shadow_state.json` (M) — runtime-состояние shadow, не код. |
| Три исходных документа доступны? | **Да**: `BOTALIN_EDGE_WORKORDER.md`, `HANDOFF.md`, `PROJECT_PLAN.md` прочитаны. |
| Секреты в отчёте? | **Нет.** Указаны только имена env-переменных и пути секрет-файлов, без значений. |
| Код проекта изменён? | **Нет.** Все операции — read-only. |

> **Важно про «источник правды»:** аудит Codex (`docs/CODEX_AUDIT.md`) не смог прочитать `/opt/botalin-edge`, т.к.
> пути нет в окружении Codex и он опирался на dashboard + legacy-workspace. Причина: **проект живёт на удалённом
> сервере `167.233.205.87`**, а не в локальном workspace `New project KAM` и не в окружении Codex. Настоящий отчёт
> закрывает этот разрыв: даёт файловый inventory, git-метаданные и env-контракт актуального форка.

---

## 1. Расположение и доступ

- **Актуальный research-форк:** `/opt/botalin-edge` на сервере `167.233.205.87` (git-репо, пушабельный).
- **Владелец файлов:** `botalin:botalin`. Ops выполнять как `sudo -u botalin` (урок: root-owned файлы ломают
  сервисы `EACCES`).
- **Доступ Claude Code:** только по SSH — `ssh 167.233.205.87 '<команда>'` (Host прописан в `~/.ssh/config`,
  `User root`, ключ `id_vpn_server`).
- **Легаси боевой бот:** `/opt/botalin` (на том же сервере) — live/paper, `server-autobot.mjs`, `microstructure.db`,
  `liquidations.db`. **НЕ часть этого форка.**
- **Легаси-workspace (локально на Mac):** `New project KAM/share/strategy-lab-7q4m2v/` и `crypto-strategy-bot/` —
  историко-обучающий слой, НЕ production.
- **Dashboard:** `https://botalin-dashboard.vercel.app` (Vercel) — отдельный деплой, НЕ в этом репозитории.

---

## 2. Git-метаданные `/opt/botalin-edge`

```
branch : main
HEAD   : 07189b6c6194c42a2f65b89cd79167bb69db835e
remote : origin  git@github.com:Kammsk87/botalin-edge.git
status : ' M logs/shadow_state.json'   (1 файл, runtime-состояние, не код)
tracked files : 77
```

Последние коммиты:
```
07189b6 docs: PROJECT_PLAN + HANDOFF + WORKORDER — current state
0ef5fcb Axis2(A): OKX forward recorder launched; Axis3 quarterly-basis SPEC (на ревью)
29390aa BLOCK6 axis2 scan (Bybit-Binance dispersion, K=9, TRAIN): 0 candidates
2c93000 Axis2 backfill: cross-venue funding+prices; manifest committed BEFORE scan
bd5770b Axis2 dispersion spec: 4 edits
```

> ⚠️ Push `/opt/botalin` заблокирован (триаж gitleaks). Для `/opt/botalin-edge` push разрешён, но force-push —
> только по аппруву. gitleaks pre-push активен.

---

## 3. Структура проекта (актуальные файлы)

**Всё в `/opt/botalin-edge` — это АКТУАЛЬНЫЙ research-форк.** Легаси лежит вне форка (см. §6).

### 3.1 Документы (source of truth)
| Файл | Роль |
|---|---|
| `README.md` | вход, статус «БЛОК 0», что импортировано/не импортировано |
| `CHARTER.md` | философия, 8 неизменных правил, структура блоков (инварианты) |
| `PROJECT_PLAN.md` | стратегия (фабрика: EDGE ∧ EXECUTION ∧ RISK) |
| `HANDOFF.md` | операционное состояние: сервисы, таймеры, ключевые состояния |
| `BOTALIN_EDGE_WORKORDER.md` | реестр задач/статусов, воронка фальсификации |
| `OVERVIEW.md` | честный scorecard результатов |
| `DATA_SCHEMA.md` | схемы всех данных |
| `DIAGNOSTICS_SUMMARY.md` | вердикты req1–4, системные находки |
| `SIGNALS.md`, `SHADOW.md`, `SPRINT.md` | спека сигналов, shadow-граница, спринт |
| `BLOCK2_SPEC.md`, `BLOCK6_AXIS1_SPEC.md`, `BLOCK6_AXIS2_DISPERSION_SPEC.md`, `BLOCK6_AXIS3_QUARTERLY_SPEC.md` | спеки блоков/осей |
| `reference/AXIS1_FUNDING_REPORT.md`, `reference/INCIDENT_ARB_ROOTCAUSE.md`, `reference/LEGACY_SIGNALS.md`, `reference/audit_six_prereg.md` | референсные отчёты/пост-мортемы |

### 3.2 Библиотеки (`lib/`)
| Файл | Роль | Статус |
|---|---|---|
| `lib/costs.mjs` | модель издержек (TASK-71): реальные fee + slippage | активна во всех сканах |
| `lib/execution.mjs` | дисциплина close (TASK-64) | для БЛОКА 5, в research не исполняется |
| `lib/signals_engine.mjs` | **вербатим-экстракт** сигнального пути из legacy `server-autobot.mjs`, keyless (67 KB) | движок shadow |

### 3.3 Скрипты (`scripts/`) — entrypoints
Все `#!/usr/bin/env node`, ESM (`.mjs`), запуск `node scripts/<name>.mjs`. Node **v20.20.2**.

| Скрипт | Назначение | Категория |
|---|---|---|
| `fetch_universe.mjs` | вселенная: ликвидные perp ∩ spot (public, keyless) | data-fetch |
| `fetch_bars.mjs` | снапшот OHLCV → `data/bars/` + manifest | data-fetch |
| `fetch_bars_trades.mjs` | бары по 107 активам сделок (диагностика MFE/MAE) | data-fetch |
| `block1_holdout.mjs` | holdout-сплит + хэш-манифест (неподглядывание) | funnel |
| `block2_scan.mjs` | БЛОК 2 exit-осевой скан на TRAIN (sha-guard) | scan/factory |
| `block6_axis1_scan.mjs` | Ось 1 funding-экстремумы (mean-rev), TRAIN | scan/factory |
| `block6_axis2_scan.mjs` | Ось 2 межбиржевая дисперсия (cross-venue carry), TRAIN | scan/factory |
| `backfill_dispersion.mjs` | бэкфилл межбиржевого funding+цен (public) | data-fetch |
| `build_configs.mjs` | реестр shadow-конфигов из systemd-юнитов (keyless env) | shadow |
| `extract_engine.mjs` | экстрактор `signals_engine.mjs` из `server-autobot.mjs` | tooling |
| `shadow_runner.mjs` | forward event-sim (TASK-71 costs, floorToStep), keyless | shadow (LIVE) |
| `shadow_stats.mjs` | Bonferroni-вердикты (day-clustered) | shadow (timer) |
| `funding_shadow.mjs` | companion funding-лидов Оси 1 | shadow (timer) |
| `ob_recorder.mjs` | forward-рекордер orderbook/tick | recorder (LIVE) |
| `okx_recorder.mjs` | OKX funding+price (3-й venue), forward | recorder (timer) |
| `matcher_mfe.mjs` | req4 MFE/MAE матчер (вход vs выход по пререг-критерию) | diagnostics |
| `smoke_engine.mjs` | smoke-тест движка по всем kind (27 конфигов) | **test** |
| `coverage.py` | покрытие по таймфреймам (единственный Python) | tooling |

### 3.4 Тесты (`tests/`)
| Файл | Что | Команда |
|---|---|---|
| `tests/test_floortostep.mjs` | юнит-тесты `floorToStep` (float-фикс `+1e-9`, регресс к багу серии) | `node tests/test_floortostep.mjs` |
| `scripts/smoke_engine.mjs` | smoke движка по 9 kind (ожид. 27/27) | `node scripts/smoke_engine.mjs` |

> Для TASK-001 торговых/live-тестов запускать НЕ требуется (см. §8).

### 3.5 Данные (`data/`) — первичные и производные
- Трекается в git: `data/universe.json`, `data/trades_history.jsonl`, `data/*_manifest.json`,
  `data/block2_stage2a.json`, `data/block6_axis1.json`, `data/block6_axis2.json`,
  `data/dispersion/*.json`, `data/shadow_configs.json`, `data/shadow_verdicts.json`,
  `data/holdout_manifest.json`, `data/trade_symbols.json`, `data/audit_trades.jsonl`.
- **НЕ в git** (`.gitignore`): `data/bars/`, `data/bars_trades/`, `data/ob/`, `data/ticks/`, `data/_meta/` —
  снапшоты и forward-рекордеры (растут на диске).

### 3.6 Логи (`logs/`) — runtime, botalin-owned
`shadow_state.json`, `shadow_trades.jsonl`, `funding_shadow_state.json`, `okx_recorder_state.json`,
`shadow.out/.err`, `block2_scan.out/.err` и др. `.gitignore` исключает `logs/*.log` и `logs/*.jsonl`.

---

## 4. Dashboard / API / раннеры (вне этого репозитория)

Эти сервисы работают на сервере как systemd-юниты, но их код НЕ в `/opt/botalin-edge` (отдельный деплой/легаси):

- **Dashboard / BFF / API:** `botalin-bff.service`, `botalin-admin-api.service`, `botalin-postgrest.service`
  (PostgREST backend), Vercel `botalin-dashboard.vercel.app`.
- **Раннеры (legacy live/paper, вне форка):** `botalin-runner-breakout`, `-v29`, `-v30`, `-v42`, `-v48`, `-v54`.
- **Forward-рекордеры/сервисы форка:** `botalin-shadow.service` (LIVE, K=27, keyless),
  `botalin-shadow-stats.timer`, `botalin-funding-shadow.timer`, `botalin-okx-recorder.timer`,
  `botalin-liq-collector.service`, `botalin-ob-recorder.service`, `botalin-m1-series.timer` (armed),
  `botalin-funding-scanner.timer`.
- **Masked (выключены):** `botalin-health`, `botalin-labeler`, `botalin-optimizer`.

> Полный `systemctl list-unit-files | grep botalin` даёт ~40 юнитов (раннеры, пинги, таймеры). Для TASK-001
> важно лишь: раннер-код и dashboard-код — вне инвентаризируемого форка.

---

## 5. Env-контракт (ИМЕНА переменных, без значений секретов)

Секрет-файлы (значения НЕ читались):
```
/etc/botalin.env         -rw-r----- root:botalin   (биржевые ключи — для legacy/live, НЕ для форка)
/etc/botalin-shadow.env  -rw-r----- root:botalin   (ТОЛЬКО TG-токен + капы, БЕЗ биржевых ключей)
```

Переменные, используемые кодом форка (`process.env.*`, значений здесь нет):

**Shadow / runtime:** `SHADOW_CAP_USD`, `SHADOW_MAX_HOLD_BARS`, `SHADOW_MAX_SYMBOLS`, `SHADOW_POLL_MS`,
`SHADOW_QTY_STEP`, `SHADOW_TG_HOUR`, `SHADOW_TRADES_LOG`, `DEBUG`.

**Telegram-уведомления:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` *(секреты — только в `/etc/botalin-shadow.env`)*.

**Сигнальные BOTALIN_\* (конфиги стратегий, не секреты):** `BOTALIN_ACTIVE_HOURS`, `BOTALIN_ACTIVE_MAX_SLOPE`,
`BOTALIN_ACTIVE_MIN_SLOPE`, `BOTALIN_ADX_MIN/MAX`, `BOTALIN_BLOCK_BTC_NEUTRAL`, `BOTALIN_DEPOSIT_USDT`,
`BOTALIN_DIST_EMA_MIN`, `BOTALIN_EVENT_BLACKOUT`, `BOTALIN_FORCE_SIDE`, `BOTALIN_MAX_DIRECTIONAL_PCT`,
`BOTALIN_MAX_TRADE_PCT`, `BOTALIN_MIN_NOTIONAL_USDT`, `BOTALIN_MIN_VOLUME_RATIO`, `BOTALIN_MTF15_MAX`,
`BOTALIN_NO_CRASH_ENTRY`, `BOTALIN_PULLBACK_*` (≈18 параметров), `BOTALIN_RSI_MIN/MAX`,
`BOTALIN_SERVER_PROFILE`, `BOTALIN_SKIP_PULLBACK_GATE`, `BOTALIN_USER_LOGIN`.

> Правило CHARTER #5: секреты только в `/etc/*.env`, никогда в git и не на Vercel. Shadow-контур **keyless**
> (проверяется через `/proc/PID/environ`).

---

## 6. Current vs Legacy (разделение источников правды)

| Слой | Путь / место | Статус |
|---|---|---|
| **CURRENT (research-форк)** | `/opt/botalin-edge` @ `167.233.205.87` | ✅ актуальный источник правды по коду воронки/сканов/shadow |
| **CURRENT (operational)** | `botalin-dashboard.vercel.app` + BFF/admin-api/PostgREST | ✅ актуальный operational cockpit (код вне форка) |
| **LEGACY (live/paper бот)** | `/opt/botalin` @ `167.233.205.87` (`server-autobot.mjs`, `microstructure.db`, `liquidations.db`) | ⚠️ legacy live/paper; раннеры v29/v30/v42/v48/v54 ещё running |
| **LEGACY (workspace)** | `New project KAM/share/strategy-lab-7q4m2v/`, `New project KAM/crypto-strategy-bot/` | ⚠️ историко-обучающий слой; НЕ production |
| **PRODUCTION-извлечённое** | `lib/signals_engine.mjs` (вербатим из legacy autobot, keyless) | ✅ используется форком, регенерируется `extract_engine.mjs` |

**Deprecated / изолировать:** legacy RLS open-политики (`using (true)`) не переносить в prod; legacy
optimizer/param-search требуют локальный PostgREST и не самодостаточны; ручное дублирование констант
fees/slippage/RR/ATR между JS и Python.

---

## 7. Команды

### 7.1 Безопасные (read-only диагностика)
```bash
ssh 167.233.205.87 'ls -la /opt/botalin-edge'
ssh 167.233.205.87 'find /opt/botalin-edge -maxdepth 3 -type f -not -path "*/.git/*" | sort'
ssh 167.233.205.87 'cd /opt/botalin-edge && git status --short'
ssh 167.233.205.87 'cd /opt/botalin-edge && git rev-parse --abbrev-ref HEAD'
ssh 167.233.205.87 'cd /opt/botalin-edge && git rev-parse HEAD'
ssh 167.233.205.87 'cd /opt/botalin-edge && git log --oneline -10'
ssh 167.233.205.87 'cd /opt/botalin-edge && node tests/test_floortostep.mjs'      # юнит-тест
ssh 167.233.205.87 'cd /opt/botalin-edge && node scripts/smoke_engine.mjs'        # smoke движка
ssh 167.233.205.87 'systemctl list-unit-files | grep botalin'                     # статусы юнитов
ssh 167.233.205.87 'systemctl status botalin-shadow.service'                      # без изменений состояния
```

### 7.2 Запрещённые без отдельного разрешения
- Любая запись/правка внутри `/opt/botalin-edge` (задача read-only).
- Запуск/остановка/enable/disable/mask любых `botalin-*` сервисов и таймеров (`systemctl start/stop/restart/enable/disable/mask`).
- Запуск сканов, меняющих данные: `block*_scan.mjs`, `backfill_*`, `fetch_*`, `build_configs.mjs`, `shadow_runner.mjs`.
- Любые действия с `holdout` (sha-guard; holdout запечатан, не израсходован).
- Live/paper ордера, любой запуск legacy `server-autobot.mjs`, любой `BOTALIN_REAL_TRADING=true`.
- Чтение/печать значений `/etc/botalin.env`, `/etc/botalin-shadow.env`, любых ключей/токенов.
- `git push` / `force-push` в `/opt/botalin-edge` без аппрува (gitleaks pre-push активен).
- DB migrations, правки dashboard auth, RLS-политик.

---

## 8. Тесты, которые должны пройти для TASK-001

Торговые/live/paper тесты для этой задачи НЕ требуются. Достаточно read-only-проверок (запускаются в
рабочем репозитории `New project KAM`):
```bash
test -f docs/CURRENT_SOURCE_INVENTORY.md
git diff -- docs/CURRENT_SOURCE_INVENTORY.md
git status --short
```
Плюс инвариант «код `/opt/botalin-edge` не изменён» — подтверждён: git status форка = только runtime
`logs/shadow_state.json` (изменён рекордером до начала задачи, не Claude Code), новых правок кода нет.

---

## 9. Оставшиеся риски источника правды

- **Отчёт снят через SSH к `167.233.205.87`.** Если Codex/CI не имеют этого SSH-доступа, они снова не увидят
  `/opt/botalin-edge` → нужен либо доступ CI к серверу, либо зеркало через `origin` GitHub
  (`git@github.com:Kammsk87/botalin-edge.git`), который отстаёт от локального `main` (на момент прошлого состояния
  `main` был ahead на 16 коммитов относительно удалённого `origin`).
- **Dashboard-метрики не связаны с commit id** актуального кода (см. CODEX_AUDIT §«исправить»): нельзя строго
  сопоставить цифры dashboard с версией расчёта PnL/fees/funding.
- **Legacy-слой сосуществует** на том же сервере (`/opt/botalin`) и в workspace — риск принять legacy за
  production сохраняется, пока изоляция не формализована.
- `origin` мог отставать от серверного `main` — перед любым CI-аудитом сверять `git rev-parse HEAD` сервера с
  удалённым `origin`.

---

## 10. Подтверждение безопасности

- ✅ `/opt/botalin-edge` найден (сервер `167.233.205.87`), прочитаны `WORKORDER`, `HANDOFF`, `PROJECT_PLAN`.
- ✅ Зафиксированы branch `main`, HEAD `07189b6…`, status (1 runtime-файл).
- ✅ Перечислены entrypoints (scripts/lib), тесты, dashboard/API/раннеры (вне форка), env-контракт.
- ✅ Значения секретов НЕ читались и НЕ печатались.
- ✅ **Торговая логика и live/paper trading НЕ запускались.** Ни один `botalin-*` сервис не менялся.
- ✅ Код `/opt/botalin-edge` НЕ изменён.
