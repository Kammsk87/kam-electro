# Botalin / Claude Code Context — 2026-07-18

Вставить первым сообщением в новую ветку Claude Code. Это не замена всем
докам репозитория, а короткий актуальный контекст последних дней: что уже
сделано, какие статусы истинны сейчас, что нельзя повторно "открывать", и
какая следующая работа разрешена.

## Главная дисциплина

- Live/orders/holdout/K=6/floor/shadow-configs не трогать без явного "го".
- Promising только после forward verdict. До verdict: PAPER_ACTIVE,
  NEEDS_DATA, UNCONFIRMED, GUARD_CANDIDATE, EXIT_CANDIDATE.
- Любое улучшение модели = новая модель с новым RESET_TS, а не правка
  старой истории.
- In-sample находка = кандидат, не доказательство.
- Обе cost-колонки обязательны, но для exit-overlay delta может быть
  одинаковой по построению; тогда смотреть абсолютный total_net_after в
  taker.
- first_seen_at, не published_at, для новостей/rule-change.
- Missing != zero. Weak-N != kill. UNKNOWN != DEAD.
- KILL возможен только после exhaustion-протокола: original, mirror/fade,
  entry, exit, stops, guard economics, regimes, execution, capacity,
  coverage, costs, forward feasibility.

## Репозитории и доступ

- Серверные репо:
  - `/opt/botalin-edge` -> приватный origin `git@github.com:Kammsk87/botalin-edge.git`.
    Push работает, gitleaks pre-push clean.
  - `/opt/botalin` -> origin `botalin-server`.
- Dashboard repo не жил на сервере; найден через Vercel/GitHub:
  `Kammsk87/botalin-dashboard`.
- Dashboard production уже обновлен до v2.
- GitHub PAT, который давался для dashboard, нужно явно отозвать в GitHub UI,
  если еще не отозван.
- На сервере было только два git-репо. Поиск `staff2026` по всему серверу
  когда-то оборвался, это не доказательство отсутствия, но код dashboard
  подтвердил: пароль берется из Vercel env `AUTH_PASSWORDS`, не с сервера.

## Dashboard v2

Статус: DONE / production.

- Production: `https://botalin-dashboard.vercel.app/`, gate `staff2026`.
- Russian-first UI: Главная / Кандидаты / Даты / Наблюдатели / Деньги / Архив.
- Factory v2 taxonomy в production:
  - "Перспективно" может быть пустой.
  - Anti-false-hope banner: много бумажных тестов — это НЕ портфель;
    promising только после verdict.
  - HL_CARRY в бумажном тесте / PAPER_ACTIVE, не promising.
  - LIQ без 93%, переведен в NEEDS_DATA/UNCONFIRMED.
- Dashboard currently uses bundled snapshot. Это означает, что prod snapshot
  стареет до следующего коммита/деплоя. Не превращать это в ручной ритуал.
  Отдельная будущая задача: автообновление snapshot через безопасный канал.
- BFF наружу не открывали.

## Factory v2

Статус: docs + scanner + readiness package. Runner НЕ запущен.

Сделано:
- Paper Strategy Factory v2 docs:
  - `PAPER_STRATEGY_FACTORY_V2.md`
  - `FACTORY_STATUS_TAXONOMY.md`
  - `FACTORY_FALSE_HOPE_RULES.md`
  - `FACTORY_V2_RUNNER_PLAN.md`
  - `FACTORY_SCORECARD.md`
- Daily scan:
  - 2026-07-16 = day 1.
  - 2026-07-17 = day 2; meaningful delta:
    funding neg-extremes disappeared, insurance flipped stress-off,
    LIQ_CONTAGION day-clustered moved 5 -> 6, stable depeg persisted
    sub-depeg.
  - promising=0.
- Readiness package exists:
  - `scripts/factory_v2/costs.mjs`
  - `scripts/factory_v2/schema.mjs`
  - `scripts/factory_v2/registry.mjs`
  - `scripts/factory_v2/multiplicity.mjs`
  - `scripts/factory_v2/selftest.mjs`
  - `reference/FACTORY_V2_IMPLEMENTATION_READINESS.md`
  - Selftest: 42 passed / 0 failed.
  - No systemd unit, no timer, no live logs.

Следующее:
- True day-3 scan на 2026-07-18, только если:
  - `date -u >= 2026-07-18`
  - есть реальные данные 07-18 минимум в `oi_forward` и
    `liquidations` или `hl_cascade`.
- Если gate не выполнен: писать "day-3 not started", не создавать отчеты.
- Если gate выполнен:
  - создать `reference/FACTORY_DAILY_2026-07-18.md`
  - создать `data/factory_daily_candidates_2026-07-18.csv`
  - обновить `reference/FACTORY_SCORECARD.md`
  - добавить runner decision section.
- Runner обсуждать только после day-3. Не запускать runner/timer/service
  без отдельного "go implement".

## FADE-8

Статус: PAPER_ACTIVE, verdict 2026-07-25, окно охраняется.

- FADE-8 heartbeat развернут:
  - `scripts/fade8_heartbeat.mjs`
  - `botalin-fade8-heartbeat.timer`
  - daily 18:00 UTC, Persistent.
  - Green молчит, anomaly -> TG alert.
  - Auto-fix/restart нет.
- Цель heartbeat: не улучшать FADE-8, а не потерять 14 day-clustered дней.
- На 2026-07-17 было 6/14 expected distinct days, окно цело.
- Реальные pass-looking семьи:
  - trend
  - vwap
- Pullback слабый/незначимый.
- Scalping taker-negative.
- До 07-25 не менять shadow configs, пороги, exits, families.

Важная новая находка:
- Trade Outcome Anatomy + Guard Economics:
  - Entry не главная проблема.
  - ENTRY_BAD около 1%.
  - EXIT_BAD около 84% losers с известным путем: сделка была в плюсе
    выше costs и отдала прибыль.
  - Все 28 no-trade guard ячеек rejected: фильтры режут winners и edge.
  - Крупные liquidation/deep book часто маркеры прибыльного входа для FADE,
    а не опасности.
- EXIT_TP_50BPS:
  - Живой EXIT_CANDIDATE / NEEDS_FORWARD.
  - TP = +0.5% gross.
  - Volume-through fill rule выдержал проверку: эффект не развалился после
    отказа от "touch MFE = fill".
  - Новый prereg есть: `reference/EXIT_TP_50BPS_PREREG.md`.
  - RESET_TS не присвоен; старт только будущим forward evaluator.
  - Вторичен к FADE-8: если FADE-8 07-25 окажется шумом, exit-кандидат
    умирает вместе с ним.
- Exit Surface Map:
  - +0.5% остался единственным общим уровнем.
  - "Дать сделке идти" не окупается.
  - Tight stop/time-exit rejected.
  - Wider stop = NEEDS_DATA, потому что задним числом ослабить стоп нельзя.
- Verdict 07-25 не должен быть "казнь одной цифрой net":
  - использовать Strategy Exhaustion Protocol.
  - KILL невозможен, если entry/exit/coverage/capacity/stop ветки не закрыты.

## HL_CARRY

Статус: PAPER_ACTIVE, verdict/review 2026-07-30.

- Это лучший текущий paper candidate, но НЕ promising до verdict.
- Суть: Hyperliquid internal carry: long uBTC spot + short BTC perp.
- Payer: HL BTC perp longs через persistent funding.
- Закрыты 3/4 blocker:
  - funding-negative-regime PASS
  - safe-leverage PASS
  - unit-peg PASS
- #4 pending:
  - forward funding-persistence observation
  - RESET_TS 2026-07-16T06:58:48Z
  - минимум 14 дней, целевое 28 дней
  - first review 2026-07-30.
- Риск: custody/Unit/HL tail, а не обычный market risk до L2-L3.
- No capital до review + prereg + explicit go.

## LIQ / CASCADE / CONTAGION

Статус: LIQ_CONTAGION downgraded to UNCONFIRMED / NEEDS_RECONCILIATION.

- Ранний результат "CONTAGION 93%, net_tk +0.38" не воспроизвелся.
- Topology/leader-follower drill:
  - topology не разрешается при текущем N;
  - leader/follower edge не найден;
  - SECOND_WAVE_CONTAGION rejected/no candidate;
  - ABSORPTION подтвержден как no-trade guard sibling;
  - CONTAGION = UNCONFIRMED до 08-02 reconciliation.
- Dashboard и registry обновлены: LIQ не в "Перспективно", 93% убран.
- CASCADE K=6 не тронут.
- Next trigger: 2026-08-02:
  - CASCADE K=6 scan
  - LIQ_CONTAGION reconciliation with N >= 30 day-clustered if available.
- Combined liquidation factor cap <= 25%.

## AMBUSH

Статус: WAIT / OB report 2026-07-22.

- A/B split вскрыл проблему:
  - A: ликвидно, но funding-vol почти нет.
  - B: funding frequent, но weak liquidity/capacity.
- OB расширение на high-funding small-caps активно и пишет.
- Следующий реальный отчет: 2026-07-22 AMBUSH OB-report:
  - появились ли монеты, где есть и частота, и исполнение;
  - не обещать promote без чисел spread/depth/capacity.

## Incubator W30

Статус: PAPER_ACTIVE / partial launch.

- Запущена только одна модель:
  - `FUND_EXTREME_FADE`
  - service: `botalin-incubator`
  - verdict 2026-07-30
- Pending implementation:
  - `FADE_RSI_MOM_DON`
  - `GUARD_TOXICBOOK`
- Donor-blocked:
  - `EXIT_GIVEBACK`
- Do not add models to current cohort without prereg/RESET_TS/isolation.

## RULE_CHANGE_DELEVERAGE / NEWS-LAB

Статус: observer running, no trade.

- NEWS historical archive showed leverage/risk/margin announcements are frequent.
- Rule-change observer launched:
  - RESET_TS 2026-07-16T11:59:17Z
  - uses NEWS-LAB forward events by first_seen_at
  - N >= 30 day-clustered expected around early August if events arrive
- Dashboard status: observing / waiting data.
- No live/paper trade runner.

## Research methodology / exhaustion protocol

Сделано:
- Strategy research methodology review:
  - Root Cause / 5 Whys / FMEA
  - TRIZ / inversion
  - Morphological analysis
  - Ablation
  - Sensitivity / uncertainty
  - Counterfactual reasoning
  - Multiple-testing / Reality Check
  - Red-team / pre-mortem
- Strategy Exhaustion Protocol:
  - strategy cannot be killed by bad PnL alone.
  - KILL certificate requires all major branches DEAD.
  - UNKNOWN != DEAD.
  - weak-N -> NEEDS_DATA.
  - infra blocker -> LIVE_BLOCKED.
  - non-reproducible -> UNCONFIRMED.
- Transformation matrix:
  - map of questions, not parameter grid.
  - Full cube is huge and would create false winners; do not enumerate.

Motivating case:
- Axis 2 was killed early as "basis neutralizes funding spread".
- Later found weak-N, not dead edge.
- Pivot to single-venue HL internal carry produced HL_CARRY.
- Therefore: topics do not die; specific model id + params hash + RESET_TS can die.

## Active calendar

- 2026-07-18: Factory v2 true day-3 scan if gate satisfied.
- 2026-07-22: AMBUSH OB-report.
- 2026-07-25: FADE-8 verdict using exhaustion protocol.
- 2026-07-30: HL_CARRY review + Incubator W30 review.
- 2026-08-02: CASCADE K=6 + LIQ_CONTAGION reconciliation.
- ~2026-08-06: RULE_CHANGE_DELEVERAGE possible N>=30 check.
- 2026-08-10: gate.

## Recommended first action in new Claude Code branch

1. Read this file.
2. Read `reference/SESSION_HANDOFF_2026-07-17.md` if present.
3. Run read-only health checkpoint:
   - fade8 heartbeat / shadow
   - incubator
   - rule-change observer
   - dashboard snapshot
   - hl_cascade / ob / liq / oi / insurance / oracle / stablecoin
4. Check Factory day-3 gate:
   - if 2026-07-18 data exists, run true day-3 scan;
   - otherwise write "day-3 not started".
5. Do not launch runner/service/timer or change live/trading/configs unless
   newest user message explicitly says "go implement".

