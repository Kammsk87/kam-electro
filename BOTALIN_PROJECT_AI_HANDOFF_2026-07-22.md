# Botalin / botalin-edge: единый handoff для анализа другим ИИ

Дата среза: 2026-07-22.  
Основной сервер: `/opt/botalin-edge` на `root@167.233.205.87`.  
Назначение документа: дать другому ИИ полную картину, что уже сделано, что доказано, что заблокировано, где живые риски, и какие правила нельзя нарушать.

## 0. Самое важное сейчас

1. **Активная live-сессия есть и ее нельзя трогать.**
   - Раннер: `scripts/fade_tokenized_trend_edge_series_runner.mjs`
   - PID на момент проверки: `2037104`
   - Coordinator: `enabled=true`, `halt=false`
   - Активный lease: `FADE_TOKENIZED_TREND_US_HOURS_v1`, `SOXLUSDT`, side `Buy`, run `exec-1784729777774`
   - Это ожидаемая управляемая сделка/сессия, не orphan. Любая правка live-кода, KILL, approval, coordinator config или restart запрещены до естественного завершения, если оператор явно не попросит аварийное действие.

2. **Paper factory работает автономно.**
   - Последний статус: `2026-07-22T14:42:21.565Z`
   - `promising_count=0`
   - Candidate miner: `enabled=true`, `mode=draft_only`, `draft_count=0`
   - Tally: `generated=13`, `paper_active=6`, `needs_data=2`, `guard=2`, `rejected=1`, `killed=2`

3. **Ни одна стратегия пока не доказана как прибыльная.**
   - Есть рабочая механика исполнения.
   - Есть реальные live-наблюдения.
   - Есть несколько paper-кандидатов.
   - Но нет достаточного live/paper evidence по правилам `N`, day-clustered, regime, slippage, benchmark.

4. **Главный урок проекта:** маленький live-баланс используется не как капитал, а как сенсор реальности. Цель - проверить, совпадает ли paper-логика с live-исполнением: fill, slippage, latency, exits, flat.

## 1. Жесткие правила управления проектом

### 1.1 Live-деньги

- Без отдельного свежего `go` нельзя запускать live.
- Без отдельного свежего `go` нельзя перезапускать batch.
- Нельзя ослаблять caps между запусками.
- Нельзя усредняться, масштабироваться или открывать вторую позицию без отдельного дизайна.
- Любой live-раннер должен быть bounded: цель, stop/safety, flat-verify, terminal report.
- После каждой live-сделки обязателен independent flat-verify.
- Любая anomaly, non-flat, WS disconnect while in position - сначала safety, потом анализ.

### 1.2 Research / paper

- Не мутировать родительскую модель in-place.
- Любой новый фильтр или идея = новый `model_id` и новый `RESET_TS`.
- `RESET_TS` immutable.
- In-sample = гипотеза, не доказательство.
- `promising_count` должен оставаться 0, пока нет реального evidence.
- SLIPCAP-наблюдатели на synthetic shadow-slippage не decision-grade.
- FADE-8 verdict 2026-07-25 должен приниматься только по prereg-когорте, без спасения детьми.

### 1.3 Governance

- Сейчас принят гибридный режим:
  - live-сессию не трогать;
  - параллельно закрывать paper/governance/carry задачи;
  - новые FADE-children не плодить без явной структурной причины;
  - HL_CARRY держать как cash-path #1;
  - первый подтвержденный live-money edge позже должен перейти в циклический Live Strategy Lifecycle Controller.

## 2. Архитектура системы

### 2.1 Основные подсистемы

1. **Signals / shadow**
   - `signals_engine.evaluateCandidate()`
   - `shadow_runner`
   - `shadow_trades.jsonl`
   - Здесь рождаются paper/shadow-сигналы и forward evidence.

2. **Live execution**
   - `scripts/fade_tokenized_tiny_smoke_executor.mjs`
   - Ключевые узлы: `buildOrderPlan`, `runHoldFlowWS`, `sendOrder`, `/v5/order/create`
   - Это единственный критичный путь live-ордеров.

3. **Coordinator / leases**
   - `lib/live_runner_lease_store.mjs`
   - `scripts/live_runner_coordinator.mjs`
   - Любой coordinated live runner должен получить `GRANT` до ордера.
   - Symbol lock и caps защищают от параллельного пересечения.

4. **Paper factory**
   - `scripts/autonomous_paper_factory_conveyor.mjs`
   - `lib/auto_paper_registry.mjs`
   - Запускает paper-only observers, пишет sandbox-status, не торгует.

5. **Shared infra**
   - `writeJsonAtomic()`
   - `RESET_TS`
   - status/log artifacts

### 2.2 Graphify карта

Постоянные артефакты:

- `/opt/botalin-edge/reference/graphify/2026-07-22/graph.html`
- `/opt/botalin-edge/reference/graphify/2026-07-22/graph.json`
- `/opt/botalin-edge/reference/graphify/2026-07-22/GRAPH_REPORT.md`
- `/opt/botalin-edge/reference/graphify/2026-07-22/ARCHITECTURE_INDEX_2026-07-22.md`

`graph.html` и `graph.json` лежат на сервере как артефакты и не закоммичены, чтобы не раздувать git. Lightweight report/index закоммичены.

## 3. История live execution: что уже доказано

### 3.1 Tiny smoke и bugs, которые нашли только live

1. **Qty invalid**
   - Причина: qty считался через `.toFixed(6)`, без `qtyStep`.
   - Fix: `qtyStep`, `minOrderQty`, `minNotional`, `tickSize`, cap-check по фактическому notional.

2. **Orphan из-за `orderStatus=null`**
   - IOC fill ушел из active orders, executor решил `NO_FILL`.
   - Fix: fill-detect по позиции, terminal-flat invariant.

3. **REST read-back lag**
   - `position/list` и `execution/list` лагали 9-63 секунды.
   - Это ломало fill-detect и hold-start.
   - Вывод: REST нельзя использовать как primary fill source.

4. **WS private fill-feed**
   - Built + dry-run auth PASS.
   - WS fill events sub-second.
   - WS-driven hold-to-exit proof прошел end-to-end.

5. **Side/geometry issue**
   - Raw `Buy` у FADE мог означать экономический SHORT.
   - Fix: economic-side resolver по геометрии уровней:
     - Long: `stop < entry < t1 <= t2`
     - Short: `stop > entry > t1 >= t2`
   - Literal side больше не считается истиной без geometry.

### 3.2 Что доказано механически

- Market/marketable entry исполняется.
- WS fill-feed нужен и работает.
- Hold executor может стартовать от WS fill.
- ReduceOnly close работает.
- Terminal flat и external flat verify работают.
- Coordinator lease gate построен и интегрирован за флагом.
- Server-side detached runners переживают закрытие ноутбука.

### 3.3 Что НЕ доказано

- Прибыльность FADE.
- Прибыльность SOXL drift.
- Прибыльность HTF.
- Прибыльность failed-breakout.
- Перенос paper edge в live после fees/slippage/regime.

## 4. Текущая live-линия: FADE_TOKENIZED_TREND_US_HOURS_v1

### 4.1 Зачем она запущена

Предыдущие live-серии показали, что off-hours для SOXL сильно конфаундят результат:

- Raw long выигрывал в off-hours.
- Fade short проигрывал в off-hours.
- Это больше похоже на drift перпа, пока базовая акция закрыта, чем на настоящий FADE edge.

Поэтому текущая версия торгует только US stock-hours:

- окно: `13:30-20:00 UTC`
- scope: `fade-trend`
- economic-side resolver: enabled
- coordinator required
- symbols: `SOXL/LAB`
- target: 5 filled unique economic setups
- max notional: `$7`
- max loss per trade: `$5`
- series loss cap: `$8`
- slippage stop: `8 bps`
- hold cap: `90m`
- max concurrent: `1`
- no averaging/scaling

### 4.2 Текущий статус

На момент handoff:

- live runner active: yes
- coordinator active: yes
- halt: false
- active leases: 1
- lease strategy: `FADE_TOKENIZED_TREND_US_HOURS_v1`
- lease symbol: `SOXLUSDT`
- lease side: `Buy`

Не вмешиваться, пока не завершится сам или пока оператор явно не попросит safety action.

### 4.3 Как читать результат

- Target/stop/breakeven exits = настоящие strategy-resolved observations.
- Timeout/max_hold = plumbing/hold observation, не edge proof.
- `n=5` не делает стратегию прибыльной; максимум `EDGE_PROMISING_NEEDS_MORE` или warning.
- Если safety stop / non-flat / coordinator HALT - сначала safety report, потом postmortem.

## 5. Paper factory: текущие кандидаты

Последний статус: `2026-07-22T14:42:21.565Z`.

| Кандидат | Статус | Forward | Комментарий |
|---|---:|---:|---|
| `FADE_TOKENIZED_PULLBACK` | paper_active | N=22, days=3, NEEDS_DATA | Позитивные ранние числа, но LOW_N и SOXL concentration. |
| `FADE_TOKENIZED_PULLBACK_US_HOURS_v1` | paper_active | N=0, days=0, NEEDS_DATA | Child для US-hours, свежий RESET, evidence еще нет. |
| `FADE_TOKENIZED_VWAP` | paper_active | N=228, days=3, NEEDS_DATA | Заголовок неплохой, но flags: SOXL/offhours/slippage. |
| `FADE_TOKENIZED_VWAP_SLIPCAP_v1` | killed | promotion_blocked | Paper slippage synthetic, не decision-grade. |
| `FADE_TOKENIZED_TREND_SLIPCAP_v1` | killed | promotion_blocked | Paper slippage synthetic, не decision-grade. |
| `SOXL_OFFHOURS_DRIFT_LONG_v1` | paper_active | N=32, days=2, NEEDS_DATA | Promotion blocked до BTC/passive benchmark. |
| `HTF_MA_DISTANCE_REVERSION_US_HOURS_v0` | paper_active | N=0, days=0, NEEDS_DATA | Новый HTF observer; первый sanity на свежих данных отрицательный. |
| `BYBIT_CARRY_SNX_GRT_WATCH` | paper_active | days=11, NEEDS_DATA | SNX near-miss, GRT weak; verdict около 14 дней. |
| `AMBUSH_B_OB_GATED` | needs_data | - | OB есть, но carry cohort weak/no_data. |
| `ORACLE_VOL_GUARD` | guard | - | Overlay/no-trade guard, не alpha. |
| `OI_PRICE_DIVERGENCE_VOL_GUARD` | guard | - | Overlay/no-trade guard, не alpha. |
| `HURST_GATED_FADE_TREND_v1` | needs_data | - | Ждет FADE-8 verdict 2026-07-25. |
| `FUND_EXTREME_FADE` | rejected | - | Duplicate/protected cohort overlap. |

## 6. Стратегии и гипотезы по статусам

### 6.1 HL_CARRY

Статус: cash-path #1, но WAIT-leaning.

Что известно:

- Historical payer: около `+13.5% ann`.
- Forward около `+9.5% APR`, last-24h около `+4.6%`, funding мягче требуемого.
- Persistence/peg выглядят приемлемо.
- Главный blocker: funding должен восстановиться до `10-12%+`, нужен custody monitor, spot/depth sanity, acceptance custody-tail.

Правила:

- Review date: `2026-07-30`.
- До 07-30 capital NO-GO.
- Даже при PASS: satellite `$200`, `L<=2`, no `L>=3`.
- Нужен отдельный operator go.

Основные документы:

- `reference/HL_CARRY_2026-07-30_READINESS_RUNBOOK.md`
- `reference/HL_CARRY_CUSTODY_MONITOR_SPEC_2026-07-22.md`
- `reference/HL_CARRY_SIZING_RULE_2026-07-22.md`
- `reference/HL_CARRY_NEAR_TERM_ACTIONS_2026-07-22.md`

### 6.2 AMBUSH_B

Статус: WAIT / PASSIVE.

Что выяснено:

- OB data есть и хватает.
- Исполнимость на части имен нормальная.
- Но carry cohort убыточен: funding below floor, мало profitable triggers, есть no_data gap.
- Новый рекордер не нужен.

Документ:

- `reference/AMBUSH_OB_REPORT_2026-07-22.md`

### 6.3 FADE_SCALPING_ADAPTIVE_GUARD_v1

Статус: draft only / NO-GO.

Идея:

- Не спасать старую scalping model напрямую.
- Добавить causal regime gate + local cooldown.
- Не использовать symbol kill-list.

Результат:

- In-sample lift тонкий.
- Вероятно съедается live slippage.
- Не добавлен в factory, RESET_TS не создан.

Документы:

- `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_PREREG.md`
- `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_BACKTEST_REVIEW.md`
- `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_GO_NOGO.md`

### 6.4 SOXL_OFFHOURS_DRIFT_LONG_v1

Статус: paper_active, promotion_blocked.

Идея:

- Off-hours SOXL perp дрейфует за crypto risk-on, пока базовая акция закрыта.
- Long only при BTC-up gate.

Ограничение:

- Это не FADE и не payer edge.
- Это направленный beta-risk.
- Должен бить passive BTC/beta benchmark, иначе WAIT/REJECT.

Документ:

- `reference/SOXL_OFFHOURS_DRIFT_BTC_BENCHMARK_REQUIREMENT_2026-07-22.md`

### 6.5 FAILED_BREAKOUT_REVERSAL_US_HOURS_v0

Статус: STRUCTURAL_CANDIDATE / NEEDS_DATA / NO-GO.

Правило:

- 15m бар делает новый 20-bar high.
- Но закрывается обратно ниже прежнего high.
- Вход SHORT по close.
- Только US-hours.
- Universe: 18 liquid majors/large-alt/high-beta.
- Exit: 60m best, 30m alt, stop около 1.3%, timeout <=90m.

Backtest/discovery:

- MFE/MAE ratio около `1.52/1.39` на 30/60m.
- Net after taker около `+0.11/+0.14%` в US-hours.
- Off-hours отрицателен.
- Median spread около `1.12 bps`, но at-event slippage remains blocker.

Следующий шаг:

- At-event slippage study по таймстемпам событий.
- Только потом paper launch.

Документы:

- `reference/FAILED_BREAKOUT_REVERSAL_US_HOURS_V0_PREREG.md`
- `reference/FAILED_BREAKOUT_REVERSAL_US_HOURS_V0_BACKTEST_REVIEW.md`
- `reference/FAILED_BREAKOUT_REVERSAL_US_HOURS_V0_GO_NOGO.md`

### 6.6 HTF_MA_DISTANCE_REVERSION_US_HOURS_v0

Статус: paper_active / NEEDS_DATA.

Идея:

- 1h higher-timeframe mean reversion.
- MA20 + ATR14 distance.
- US-hours only.
- Forward 8h MFE/MAE.
- Keyless public 1h kline feed.

Discovery/backtest:

- 30d / 98 symbols in discovery showed strong result:
  - N about 4845
  - avg net about `+0.876%` after 0.16% cost
  - WR about 66%
  - MFE median about 2.16%
  - MAE median about 1.20%
- But first fresh sanity on liquid current universe was negative:
  - net about `-0.27%`
  - WR about 37.7%
  - MFE/MAE about 0.76

Conclusion:

- Observer is useful.
- Do not promote.
- Need >=14 day-clustered days, N>=300, benchmark pass.

Files:

- `lib/htf_ma_distance_eval.mjs`
- `scripts/test_htf_ma_distance_eval.mjs`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_PREREG.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_BACKTEST_REVIEW.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_GO_NOGO.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_PAPER_EVALUATOR_REVIEW_2026-07-22.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_LAUNCH_SUMMARY_2026-07-22.md`

## 7. EDGE_ATLAS / rejected strategies forensics

### 7.1 EDGE_ATLAS_v1

Цель: пересмотреть старые забракованные стратегии и понять, можно ли удалить плохие сделки умным правилом.

Вывод:

- Большинство raw-стратегий не спасается устойчиво.
- Многие “улучшения” являются data-mining.
- Единственный аккуратный salvage draft: `FADE_SCALPING_ADAPTIVE_GUARD_v1`, но edge тонкий и вероятно slippage-sensitive.

Документ:

- `reference/EDGE_ATLAS_V1_REJECTED_STRATEGY_FORENSICS_2026-07-22.md`

### 7.2 EDGE_ATLAS_v2

Цель: universe-wide mining по всем символам/семействам, не только SOXL.

Данные:

- `shadow_trades.jsonl`
- около 60k сделок
- 91 символ
- 12 дней
- 8 event families
- bars / OB / OI where available

Выводы:

- Raw-сигналы net-негативны почти везде.
- Позитив чаще сидит на FADE-стороне или thin/fat-tail артефактах.
- BTC lead-lag rejected: contemporaneous corr есть, lag+1 почти нет.
- Funding extremes тонкие и пересекаются с carry.
- Самый интересный новый structural pocket: `FAILED_BREAKOUT_REVERSAL_US_HOURS_v0`.

Документы:

- `reference/EDGE_ATLAS_V2_UNIVERSE_WIDE_REPORT_2026-07-22.md`
- `reference/EDGE_ATLAS_V2_SHORTLIST_2026-07-22.md`
- `data/edge_atlas_v2_event_summary_2026-07-22.csv`
- `data/edge_atlas_v2_candidate_matrix_2026-07-22.csv`
- `data/edge_atlas_v2_rejects_2026-07-22.csv`

## 8. Process-governance repair pack

Причина: внешний анализ указал, что система честная, но подгонка может просачиваться структурно через:

1. Garden of forking paths: слишком много FADE-children из увиденных провалов.
2. SLIPCAP paper tests cannot fail because shadow slippage synthetic/zero.
3. SOXL drift long may be inversion of inversion and beta-risk.
4. Attention drift from HL_CARRY cash-path to intellectually interesting FADE-family.

Что сделано:

- FADE family freeze / family-wise governance.
- SLIPCAP downgrade.
- BTC benchmark requirement for SOXL drift.
- HL_CARRY near-term actions.
- AMBUSH deadline status.
- One-shot coordinator approval design.
- `promotion_blocked` guard in paper factory.

Документы:

- `reference/FADE_FAMILY_GOVERNANCE_2026-07-22.md`
- `reference/FADE_SLIPCAP_EVIDENCE_WARNING_2026-07-22.md`
- `reference/SOXL_OFFHOURS_DRIFT_BTC_BENCHMARK_REQUIREMENT_2026-07-22.md`
- `reference/HL_CARRY_NEAR_TERM_ACTIONS_2026-07-22.md`
- `reference/AMBUSH_OB_DEADLINE_STATUS_2026-07-22.md`
- `reference/LIVE_COORDINATOR_ONESHOT_APPROVAL_DESIGN_2026-07-22.md`
- `reference/PROCESS_GOVERNANCE_REPAIR_SUMMARY_2026-07-22.md`

## 9. Что забраковано или ограничено

| Гипотеза | Статус | Почему |
|---|---|---|
| BTC lead-lag | rejected | lag+1 edge отсутствует; движение синхронное. |
| Raw+regime simple rescue | rejected | raw-сигналы net-negative across regimes. |
| Fade microcaps | rejected/parked | thin/fat-tail/data-quality, costs unknown. |
| Momentum tokenized fat-tail | rejected | pocket looks like drift/regime, not stable payer. |
| SLIPCAP paper children | killed/downgraded | shadow slippage synthetic, test not decision-grade. |
| FUND_EXTREME_FADE | rejected | duplicate/protected cohort overlap. |
| AMBUSH_B live/paper promotion | WAIT | OB ok, but funding/carry cohort not paying. |

## 10. Ближайшие задачи

### 10.1 Не трогать активную live-сессию

Дождаться естественного результата текущего `FADE_TOKENIZED_TREND_US_HOURS_v1`:

- full trade report
- raw side vs economic side
- entry/exit/slippage/PnL
- exit reason
- edge retention
- flat verified
- coordinator release/final state

### 10.2 После live-сессии

Если серия завершилась safety:

- safety postmortem first
- no rerun until root cause fixed

Если серия завершилась clean:

- по фреймворку решить: NEEDS_DATA / EDGE_NOT_SURVIVING_EXECUTION / EDGE_PROMISING_NEEDS_MORE
- не называть прибыльной по 5 сделкам

### 10.3 Paper/research

1. HTF observer - ждать forward, не промоутить.
2. Failed Breakout - сделать at-event slippage study до paper launch.
3. HL_CARRY - готовить 07-30 review:
   - custody monitor
   - uBTC/spot depth sanity
   - final funding persistence
   - sizing/custody-tail acceptance
4. Candidate miner - draft-only, не авто-запускать.
5. Family-wise governance - не плодить FADE children.

### 10.4 Infrastructure

1. Реализовать one-shot coordinator approval token.
2. После первой live-money подтвержденной стратегии - строить Live Strategy Lifecycle Controller:
   - strategy passport
   - bounded run batch
   - daily/weekly review
   - drift guard
   - pause/restart protocol
   - no silent auto-scale

## 11. Как другому ИИ безопасно продолжать

### Перед любым действием

1. Проверить активные live-процессы.
2. Проверить coordinator state.
3. Проверить account flat/non-flat.
4. Если есть managed live trade - только read-only.
5. Не использовать `pgrep -af` с env, чтобы не вывести секреты.
6. Не печатать `/etc/botalin.env`.
7. Не трогать KILL/approval/coordinator config без явного go.

### Разрешено без отдельного live go

- Читать logs/reference/data.
- Писать docs/reference reports.
- Писать paper-only evaluators при sandbox/keyless/no-order.
- Запускать unit tests.
- Запускать dry-run.
- Анализировать existing shadow/OB/OI/bars.

### Запрещено без отдельного live go

- Любой `/v5/order/create`.
- Любой live runner launch/relaunch.
- Любое изменение caps.
- Любой restart активного runner.
- Любой KILL активной сессии.
- Любой promotion to live.
- Любой auto second batch.

## 12. Последние важные коммиты

- `0a372ad` - HTF paper observer, keyless 1h feed, paper-only launch.
- `ea1e70f` - graphify repo map + architecture index.
- `ffc7f8a` - FAILED_BREAKOUT_REVERSAL_US_HOURS_v0 package.
- `0ea318c` - EDGE_ATLAS_v2 universe-wide discovery.
- `c282598` - AMBUSH OB + HL_CARRY readiness + scalping draft.
- `1bad73a` - EDGE_ATLAS_v1 rejected strategy forensics.
- `73d0444` - Process-Governance Repair Pack.
- `a16bbbb` - Previous AI handoff summary.
- `8c1deda` - slippage instrumentation and trend child.
- `17101fd` - VWAP SLIPCAP child observer.
- `f155923` - candidate miner drafts.
- `a3eed1a` - pullback US-hours child observer.
- `f8c58ae` - pullback and SOXL drift child candidates.
- `d2a1b49` - market entry mode fix for IOC no-fill, config-gated.

## 13. Bottom line

Система стала профессиональной исследовательской и execution-фабрикой, но ее главный риск теперь не технический, а методологический:

- не перепутать discovery с proof;
- не спасать parent-модель через детей задним числом;
- не считать synthetic paper-slippage проверкой live-slippage;
- не увлечься FADE-family в ущерб cash-path HL_CARRY;
- не назвать прибыльной стратегию до достаточного live/paper evidence.

Текущий лучший порядок:

1. Дождаться текущей live US-hours FADE-серии, не трогая ее.
2. Сделать строгий postmortem/result report.
3. Параллельно вести paper factory и HTF observer.
4. Провести at-event slippage study для Failed Breakout.
5. Довести HL_CARRY readiness к 2026-07-30.
6. После первой действительно подтвержденной live-money стратегии - строить циклический Live Strategy Lifecycle Controller.

