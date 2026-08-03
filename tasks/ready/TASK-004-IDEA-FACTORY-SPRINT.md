# TASK-004-IDEA-FACTORY-SPRINT - Parallel strategy idea sprint

## Идентификатор

TASK-004-IDEA-FACTORY-SPRINT

## Цель

За 24-48 часов расширить воронку стратегий: сгенерировать и быстро проверить 30-50 независимых торговых гипотез, чтобы на выходе получить 0-5 честных кандидатов для дальнейшего paper-only наблюдения.

Это research/paper-design задача. Она не разрешает live trading, paper runner launch, coordinator changes или работу с реальными ключами.

## Контекст

Текущая ситуация:

- `FADE_TOKENIZED_TREND_US_HOURS_v2_DC` уже запущен отдельно как live data-collection reality sensor. Не трогать.
- FADE execution считается решенным, но alpha не подтверждена.
- Failed Breakout закрыт как `REJECT`: slippage не проблема, fresh edge отрицательный.
- `promising_count=0`.
- Время является главным ресурсом, поэтому нельзя ждать только один многодневный FADE DC; нужно параллельно расширить research-фабрику.
- Основной cash-path #1: `HL_CARRY` к ревью 2026-07-30, но до funding/custody/depth gates не live-ready.

Рабочий принцип:

`1 live reality sensor + 30-50 paper/research ideas + strict rejection`.

## Где работать

Основной репозиторий Botalin на сервере:

`/opt/botalin-edge`

Если Claude Code запускается не на сервере и `/opt/botalin-edge` недоступен, остановиться и написать это в result report. Не пытаться заменить серверный репозиторий локальными handoff-файлами.

## Обязательные входные документы

Перед работой прочитать:

- `CLAUDE.md`
- `docs/PROJECT_CONSTITUTION.md`
- `reference/FADE_V2_LIVE_DATA_COLLECTION_CASH_AWARE_PLAN_2026-07-23.md`
- `reference/FADE_TREND_SIGNAL_DIAGNOSIS_2026-07-23.md`
- `reference/FAILED_BREAKOUT_AT_EVENT_SLIPPAGE_2026-07-23.md`
- `reference/HTF_LAUNCH_SUMMARY_2026-07-22.md`
- `reference/HL_CARRY_2026-07-30_DECISION_PACK.md`
- `reference/HL_CARRY_CUSTODY_MONITOR_LAUNCH_PLAN.md`
- `reference/graphify/2026-07-22/ARCHITECTURE_INDEX_2026-07-22.md`
- `QUEUE.md`

Если часть документов отсутствует, зафиксировать missing inputs в result report и продолжать только с доступными read-only источниками.

## Разрешенные файлы

Разрешено создавать или менять только:

- `scripts/analysis/idea_factory_sprint_2026_07_23.mjs`
- `reference/IDEA_FACTORY_SPRINT_2026-07-23.md`
- `data/idea_factory_sprint_2026-07-23.csv`
- `data/idea_factory_sprint_2026-07-23.json`
- `tasks/results/TASK-004-IDEA-FACTORY-SPRINT-RESULT.md`
- `logs/tests/TASK-004-IDEA-FACTORY-SPRINT.log`

Если существующая архитектура требует другого имени файла для analysis script, сначала создать краткую note в result report и использовать только один дополнительный файл под `scripts/analysis/`.

## Запрещенные файлы и действия

Запрещено:

- запускать live trading;
- запускать paper runners или менять их состояние;
- включать/выключать coordinator;
- создавать approval-файлы;
- читать `.env`, secrets, private keys, exchange keys, tokens;
- печатать любые секреты;
- менять runners, execution, coordinator, leases, risk limits, PnL/cost model, funding model, dashboard auth;
- менять текущий FADE DC runner/session;
- менять hidden datasets;
- тратить holdout для семейства без явной фиксации в отчете;
- ослаблять fees/spread/slippage/funding assumptions;
- запускать deploy/systemd/sudo/destructive git commands;
- объявлять стратегию прибыльной или live-ready.

## Что конкретно сделать

### 1. Карта текущей фабрики

Собрать read-only snapshot:

- текущий git branch и HEAD;
- есть ли активный live runner, coordinator state и leases, но без изменения состояния;
- текущий `promising_count`;
- список paper/draft/rejected/guard candidates;
- какие семьи уже потратили holdout или близки к quarantine.

Если для проверки live runner/coordinator нужны команды с доступом к процессам или state-файлам, использовать только read-only команды. Не читать secrets.

### 2. Сгенерировать 30-50 гипотез

Гипотезы должны покрывать разные семейства, а не быть 50 близнецами FADE:

- funding/carry;
- mean reversion;
- momentum/breakout;
- volatility compression/expansion;
- liquidity/orderbook imbalance;
- session/time-of-day;
- cross-asset lead-lag;
- regime guards/overlays;
- HTF distance/reversion variants;
- VWAP/pullback cleanup variants.

Для каждой гипотезы указать:

- `family_id`;
- `model_id` draft;
- causal hypothesis;
- symbols/universe;
- timeframe/session;
- entry rule;
- exit rule;
- cost assumptions;
- data sources;
- why this is not just a parameter tweak of a rejected parent.

### 3. Быстрый fresh-window screening

Для каждой гипотезы, где хватает данных, посчитать минимум:

- sample size `N`;
- fresh gross and net expectancy;
- fees/spread/slippage/funding assumptions;
- win rate;
- average win/loss;
- max drawdown or worst streak proxy;
- benchmark comparison;
- cost sensitivity;
- stability by day cluster;
- symbol concentration;
- side concentration;
- session/regime split where applicable.

Если orderbook/depth нужен, использовать только уже доступные snapshots или keyless public data. Не использовать private exchange keys.

### 4. Null/shuffle controls

Для top candidates и для любых результатов, которые выглядят хорошо:

- выполнить shuffled/null control или другой доступный sanity check;
- указать empirical p-value или понятный proxy;
- если permutations мало, прямо написать `NOT_DECISION_GRADE`.

Минимум: не продвигать кандидата, если он не отличим от shuffled/null.

### 5. Семейная дисциплина

В отчете явно разделить:

- independent family;
- child variant;
- parent strategy;
- already rejected/quarantined family;
- holdout spent or unspent.

Нельзя спасать Failed Breakout или FADE простыми post-hoc правками. Новый child допускается только при новой причинной гипотезе.

### 6. Вердикты

Каждой гипотезе присвоить один из verdict:

- `REJECT`;
- `NEEDS_DATA`;
- `PAPER_DRAFT_ONLY`;
- `PAPER_CANDIDATE_REVIEW`;
- `GUARD_ONLY`;
- `NOT_DECISION_GRADE`;
- `DUPLICATE_OR_OVERLAP`;
- `QUARANTINE_FAMILY`.

`PAPER_CANDIDATE_REVIEW` не означает запуск paper runner. Это означает: Codex/operator должны отдельно рассмотреть запуск paper-only наблюдателя.

## Минимальные promotion gates для PAPER_CANDIDATE_REVIEW

Кандидат может получить `PAPER_CANDIDATE_REVIEW` только если:

- fresh net expectancy положительный после costs;
- N не микроскопический или clearly marked `NEEDS_DATA`;
- результат не держится на одном символе/одной стороне/одном дне без объяснения;
- cost sensitivity не убивает edge;
- slippage/funding assumptions реалистичны;
- benchmark пройден или причина неприменимости benchmark объяснена;
- null/shuffle sanity не опровергает сигнал;
- нет overlap с rejected/quarantined parent family.

Если эти условия не выполнены, verdict должен быть строже.

## Deliverables

Создать:

1. `reference/IDEA_FACTORY_SPRINT_2026-07-23.md`
   - executive summary;
   - current factory snapshot;
   - methodology;
   - ranked table of all 30-50 hypotheses;
   - top 0-5 candidates for Codex review;
   - rejects and why;
   - family/quarantine ledger;
   - recommended next tasks.

2. `data/idea_factory_sprint_2026-07-23.csv`
   - one row per hypothesis;
   - columns for family, model_id, N, net, costs, slippage, benchmark, null result, verdict.

3. `data/idea_factory_sprint_2026-07-23.json`
   - structured version of the same results.

4. `tasks/results/TASK-004-IDEA-FACTORY-SPRINT-RESULT.md`
   - files read;
   - files changed;
   - commands run;
   - tests/smokes run;
   - top candidates count;
   - explicit confirmation: no live trading, no paper launch, no coordinator changes, no secrets read.

## Тесты и проверки

Минимально запустить:

```bash
node --check scripts/analysis/idea_factory_sprint_2026_07_23.mjs
node scripts/analysis/idea_factory_sprint_2026_07_23.mjs --smoke
test -f reference/IDEA_FACTORY_SPRINT_2026-07-23.md
test -f data/idea_factory_sprint_2026-07-23.csv
test -f data/idea_factory_sprint_2026-07-23.json
test -f tasks/results/TASK-004-IDEA-FACTORY-SPRINT-RESULT.md
git status --short
```

Если full sprint команда занимает долго, разрешено запускать ее с bounded runtime и писать partial result, но smoke должен пройти.

## Критерии готовности

- Проверено 30-50 гипотез или явно объяснено, почему доступные данные ограничили число.
- Все результаты net-of-cost.
- Есть null/shuffle sanity для top candidates.
- Есть family/quarantine ledger.
- Не запущено ни одного live/paper runner.
- Coordinator, leases, approval files и FADE DC session не изменялись.
- Секреты не читались и не печатались.
- Result report создан.
- Commit создан с сообщением `TASK-004-IDEA-FACTORY-SPRINT completed`.

## Ожидаемый итог Claude Code

Claude Code должен завершить работу кратким отчетом:

- сколько гипотез проверено;
- сколько `PAPER_CANDIDATE_REVIEW`;
- какие 3-5 направлений выглядят наиболее перспективными;
- какие семейства закрыты или отправлены в quarantine;
- какие команды запускались;
- commit hash;
- подтверждение отсутствия live/paper действий.
