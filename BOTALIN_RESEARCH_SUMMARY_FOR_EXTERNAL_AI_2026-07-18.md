# Botalin Research Summary for External AI — 2026-07-18

Цель документа: дать внешней ИИ-модели полный, но безопасный обзор того,
что уже проверялось в Botalin, что не сработало, где видим перспективы,
что ждет данных, и какие вопросы стоит исследовать дальше.

Документ намеренно не содержит IP, ключей, кошельков, приватных URL,
секретов, реальных API credentials или операционных команд.

## 1. Главный контекст

Botalin — исследовательская система для поиска торговых стратегий на
крипто-деривативах. Счет сейчас используется как тестовый стенд, а идеи
оцениваются с прицелом на капитал порядка $200 / $1k / $5k.

Главная цель: найти воспроизводимый способ зарабатывать деньги после
реальных издержек, с контролируемым риском и исполнимостью.

Текущая философия:

- нас интересуют деньги, а не красивые стратегии;
- PnL важен, но интерпретируется только вместе с издержками, day-clustered N,
  capacity, исполнением и хвостовыми рисками;
- promising только после forward verdict;
- in-sample находка = кандидат, не доказательство;
- если идея улучшается, это новая модель с новым RESET_TS;
- live/capital/orders только по явному человеческому "go";
- paper/research можно автоматизировать, но live нельзя.

## 2. Ключевой итог на 2026-07-18

Новый широкий поиск дал много отрицательных результатов.

Суммарно за последние дни:

- 66+ идей сгенерированы или разобраны через factory/search conveyor;
- около 20 реальных kill-tests прогнаны на существующих данных;
- 0 новых near-term cash-candidates из широкого поиска;
- большинство directional price-prediction гипотез не переживают costs;
- часть сигналов оказалась полезной только как guard/regime filter, не как
  самостоятельная стратегия.

Текущий cash-path держится на двух главных направлениях:

1. **FADE trend/vwap** — ближайший trading verdict 2026-07-25.
2. **HL_CARRY** — главный carry/cashflow-кандидат, review 2026-07-30.

Также есть условные ветки:

- **EXIT_TP_50BPS** — exit-overlay для FADE, только если FADE survives.
- **HURST_GATED_FADE_TREND** — regime filter для FADE trend, только после
  survival FADE trend.
- **BYBIT_CARRY_SNX/GRT** — вторичный carry-watch, пока NEEDS_DATA.
- **FADE uncovered OB expansion** — потенциально важнейший lead: 50%+
  uncovered FADE PnL требует проверки стаканом.

## 3. Методология проверки

Используются правила:

- payer-first: кто платит и почему не может избежать оплаты;
- обе cost-колонки: maker/taker или conservative/realistic;
- day-clustered N важнее числа сделок;
- missing != zero;
- weak-N != kill;
- UNKNOWN != DEAD;
- no pocket mining: один asset/timeframe не считается edge;
- no parameter tuning после просмотра PnL;
- no live promotion без prereg + go;
- kill certificate: стратегия не убивается только плохим PnL; надо понять,
  умер вход, выход, costs, capacity, execution, data coverage или режим.

Важные методологические документы/концепции:

- Paper Strategy Factory v2;
- Factory false-hope rules;
- Strategy Exhaustion Protocol;
- Kill Certificate;
- Distribution-first / PnL-with-context подход;
- Autonomous Paper Research Loop design.

## 4. Что уже проверяли и что не сработало

### 4.1 Старые directional / price-prediction оси

Проверялись разные варианты directional alpha:

- свечные сигналы;
- классические price patterns;
- funding-extreme в лонг/шорт без устойчивого payer;
- price differences between venues без исполнимого netting;
- listings/alt lag на барах;
- BTC/alt lead-lag;
- простые momentum/reversal схемы;
- микро-скальпинг без fee/rebate/queue edge.

Итог:

- 13 старых осей фактически убиты как price-prediction alpha;
- после издержек и честной поправки большинство эффектов обнуляется;
- проблема была не только в fees: COST_SENSITIVITY показывал, что даже при
  низких комиссиях у многих old axes edge отсутствует по существу;
- главный диагноз: искали "куда пойдет цена", не задавая вопрос "кто платит".

### 4.2 Literature-driven price prediction hunt

Проверены 8 классов из литературы:

1. INTRADAY_MOM_REV
2. ABNORMAL_RETURN_CONTINUATION
3. CROSS_SECTIONAL_MOMENTUM
4. SELECTED_CANDLESTICK_PATTERNS
5. ORDER_FLOW / OFI direction
6. HURST_REGIME
7. SENTIMENT / ATTENTION
8. ETF_FLOW

Результаты:

- intraday reversal/momentum: signal too small vs costs -> REJECT;
- abnormal return mean-reversion: gross не покрывает costs -> REJECT;
- cross-sectional momentum: negative/too costly -> REJECT;
- candlestick patterns: anti-predictive/weak -> REJECT;
- order-flow direction: winrate есть, но edge bps слишком мал vs costs;
  дублирует MICRO-OFI -> REJECT;
- sentiment/ETF: данных нет -> NEEDS_DATA;
- HURST_REGIME: единственная не пустая находка, но это regime filter,
  не standalone strategy.

Вывод: literature-based directional price prediction подтверждает прежний
диагноз: на наших данных и costs прямое угадывание цены не дает денег.

### 4.3 MICRO-OFI / passive market-making

Проверялся order-flow / maker-style edge.

Результат:

- passive maker не имеет положительного ожидания при наших fee/latency/data;
- adverse selection съедает spread;
- spread меньше maker fee на большинстве ликвидных символов;
- wide-spread микрокапы после fee тоже не дают net+;
- без rebate/queue/latency advantage это HFT/rebate game, не наш cash-path.

Вердикт: FAIL / REJECT.

### 4.4 SOL-only causal map

Проверялась идея взять SOL как один актив и найти причинные связи.

Результат:

- funding у SOL почти нулевой, crowding-payer нет;
- forced-flow событий мало/нет;
- microstructure уже провален через MICRO-OFI;
- BTC->SOL lead-lag без payer запрещен как old-axis-style;
- single-asset causal mapping недомощен для редких payer-событий.

Вердикт: ничего SOL-tradeable; редкие события надо искать пулом активов.

### 4.5 Price Move Attribution Lab

Проверялись pre-move факторы на пуле активов:

- BTC shock;
- funding extremes;
- OI growth/reset;
- forced-flow;
- stable/oracle/event stress;
- OB/spread/depth imbalance.

Результат:

- BTC shock дает lift по вероятности движения, но direction coinflip;
  это risk context/guard, не directional strategy.
- OB thinning/imbalance слабые предвестники, не edge.
- funding/OI mostly weak/marginal.
- forced-flow/stress/event требуют больше данных.

Вердикт: directional payer-candidate не выделился; полезно как guard/context.

### 4.6 ORACLE_SNAP_REVERT

Изначально kill-test показал, что oracle/perp divergence схлопывается чаще
случайного.

Tradeability test:

- 761 торгуемых событий, 4 дня;
- gross около нуля;
- net_maker/net_taker отрицательны на всех горизонтах;
- winrate < 50%;
- divergence схлопывается через движение spot/index к perp, а не perp к index;
- многие события живут на неликвидных символах без цены/стакана.

Вердикт: REJECT as directional strategy. Остаток: GUARD_CANDIDATE как
volatility/danger marker.

### 4.7 Borrow-rate / loan-rate cash mini-wave

Проверялись Bybit borrow/carry/collateral идеи.

Результат:

- Bybit borrow rates near-static/admin-like;
- USDT borrow около 3.7% ann;
- Bybit BTC/ETH funding примерно 2-4%, часто не превосходит borrow enough;
- leveraged cash-and-carry на Bybit BTC/ETH не дает нужной доходности;
- HL borrow data как отдельная ставка фактически отсутствует.

Вердикт: borrow-source closed for cash. Подтверждает, что самый сильный carry
сейчас — HL_CARRY, а не borrow-based Bybit.

### 4.8 Rule-change / news

NEWS-LAB historical archive:

- 1251 official announcement records за 6 месяцев;
- leverage/risk_limit/margin events около 253 событий / 6.2 месяцев
  (~40/месяц);
- это показало, что rule-change источник часто встречается в announcements,
  а не в rule-meta snapshots.

Запущен forward observer:

- RULE_CHANGE_DELEVERAGE observer, RESET 2026-07-16T11:59:17Z;
- first_seen_at strict;
- пока ждет N>=30 day-clustered.

Вердикт сейчас: OBSERVING / NEEDS_DATA. Потенциально forced-flow event class,
но не cash-ready.

### 4.9 LIQ / CONTAGION

Сначала liquidation pool дал promising-looking signal:

- LIQ_SPIKE continuation около 73%;
- CONTAGION подрежим выглядел как 93% continuation.

Затем topology/leader-follower reconciliation:

- 93% не воспроизвелись;
- topology не разрешается при текущем N;
- leader/follower edge не найден;
- SECOND_WAVE_CONTAGION не выделился;
- ABSORPTION подтвержден как no-trade guard;
- CONTAGION downgraded to UNCONFIRMED.

Вердикт: NEEDS_RECONCILIATION / 2026-08-02. Не cash-ready.

## 5. Что сейчас перспективно

### 5.1 FADE trend/vwap

Суть:

- старые minus directional runners были инвертированы;
- FADE trend/vwap на forward paper показывают положительный net;
- scalping taker-negative;
- pullback weak/less significant.

Статус:

- PAPER_ACTIVE;
- verdict date: 2026-07-25;
- heartbeat active, zero-slack 14-day window;
- day count на 2026-07-18 примерно 7/14.

Важные находки:

- Entry у FADE, похоже, не главная проблема.
- 84% losers с известным путем = EXIT_BAD: сделка была в плюсе выше costs,
  затем отдала прибыль.
- No-trade guards почти все rejected: они режут winners и edge.
- Лучший exit candidate: EXIT_TP_50BPS.
- Fee-tier reality check усилил FADE: conservative taker model 0.250 RT была
  жестче реального Bybit VIP0 около 0.160 RT. Covered vwap flips from negative
  to positive under VIP0 context.

Главный риск:

- 60% сделок / 71% FADE PnL находятся на uncovered symbols без OB/tick path.
- Нужно понять: это реальный неликвидный edge или cost/execution artifact.

Cash relevance:

- FADE = cash-path #2.
- Если trend/vwap survive 2026-07-25, следующий шаг: micro-live/probe package,
  covered/capacity check, then possible forward exit evaluator.

### 5.2 EXIT_TP_50BPS

Суть:

- take-profit at gross +0.5%;
- не standalone strategy;
- overlay для FADE, если FADE survives.

Что проверено:

- TP +0.5% улучшает total net во всех 4 FADE families on tested sample;
- volume-through fill rule выдержал проверку;
- более поздние TP хуже;
- time exits / tight stops rejected;
- wider stop невозможно проверить задним числом -> NEEDS_DATA.

Статус:

- EXIT_CANDIDATE / NEEDS_FORWARD;
- prereg draft exists;
- RESET_TS not assigned;
- не должен спасать current FADE verdict задним числом.

### 5.3 HURST_GATED_FADE_TREND

Суть:

- Hurst regime как фильтр для FADE trend:
  - high-Hurst/trending regime -> FADE loses;
  - low-Hurst/mean-reverting regime -> FADE wins.

Результат:

- directional alive for trend, but weak-N;
- vwap inconsistent;
- covered-only limitation;
- uncovered unknown.

Статус:

- REGIME_FILTER_CANDIDATE / NEEDS_DATA;
- only if FADE trend survives 2026-07-25;
- future model with new RESET_TS.

### 5.4 HL_CARRY

Суть:

- Hyperliquid internal carry:
  - long uBTC spot;
  - short BTC perp;
  - collect funding from perp longs.

Почему интересно:

- payer понятен: leveraged BTC perp longs;
- intra-venue hedge avoids cross-venue unnetted margin killer;
- uBTC/BTC peg checked;
- depth checked to $5k;
- market risk safe to L2/L3 under historical basis/funding scenarios;
- main risk = Unit/HL custody/protocol tail.

Статус:

- PAPER_ACTIVE;
- 3/4 blockers passed;
- #4 forward funding-persistence observation pending;
- first review 2026-07-30.

Economics:

- safe L<=2 APR roughly 13-27% depending funding regime;
- 50%+ APR would require L4-L5, rejected due custody wipeout tail;
- this is reliable base cashflow candidate, not high-octane alpha.

Cash relevance:

- cash-path #1 to first real dollar if 2026-07-30 review passes.

### 5.5 BYBIT_CARRY_SNX/GRT

Суть:

- Bybit intra-venue carry:
  - long spot SNX/GRT;
  - short perp same venue;
  - collect funding.

Результат:

- SNX around 9-11% ann, neg-hours around 3%;
- GRT around 8-9%, neg-hours around 7-10%;
- only 6-7 days data;
- spot-depth not measured.

Статус:

- passive carry-watch / NEEDS_DATA;
- no new recorder needed;
- promotion rule frozen:
  - funding_ann >= 8%;
  - >=14 distinct days;
  - neg-hours <10%;
  - spot-depth $1k PASS;
  - carry after costs >=5%, L2 >=10%.

Cash relevance:

- secondary carry track;
- no active attention until persistence and spot-depth confirmed.

### 5.6 FADE/AMBUSH exotic OB expansion

Important cash lead:

- uncovered FADE total net about +1071%;
- 71% of FADE paper PnL lives on uncovered symbols;
- Tier-1 list of 6 symbols covers exactly about 50% uncovered PnL:
  - SOXL
  - LAB
  - DEXE
  - SNDK
  - SKHY
  - MU

Purpose:

- add OB/tick coverage to determine whether the uncovered FADE edge is real
  or execution/cost artifact.

Status:

- candidate list prepared docs-only;
- recorder not launched yet;
- recommended launch only after preflight recorder headroom + explicit go.

Cash relevance:

- potentially high leverage on FADE cash path.
- If edge is artifact, kills false hope quickly.
- If real, strongly improves FADE path.

## 6. Passive / waiting items

### AMBUSH

Sуть:

- funding ambush / funding spike opportunity.

Current findings:

- split A/B shows key tension:
  - liquid symbols have low funding opportunity;
  - high-funding symbols have weak liquidity/capacity.
- OB readiness shows some tradeable symbols up to ~$1k:
  - ID, AERGO, SLX
  - some probe-only or exotic names.

Next:

- 2026-07-22 AMBUSH OB-report with mechanical cash decision:
  - KEEP_ACTIVE if >=2 symbols have both frequency and executability;
  - PASSIVE_OBSERVE if only probe/exotic;
  - PARK if frequency but untradeable.

### RULE_CHANGE_DELEVERAGE

- Observer running.
- Good event count in historical announcements.
- Needs forward first_seen events.
- Potential event/forced-flow strategy, but not ready.

### CASCADE / LIQ

- CASCADE K=6 scan expected 2026-08-02.
- LIQ_CONTAGION reconciliation same date.
- Current status: NEEDS_DATA / UNCONFIRMED.

### Deribit / options

- Deribit recorder started, but data immature.
- Possible future uses:
  - IV/RV premium;
  - skew;
  - term structure inversion;
  - crash-risk guard.
- Currently WAIT_UNTIL_MATURES.

### Listing/delisting

- NEWS-LAB exists.
- Historical archive only hypothesis generation, not trade evidence.
- Need forward first_seen + exact tradable timing + orderbook.

## 7. New data-source gap audit

Evaluated new data sources:

- ETF flows;
- stablecoin issuance/redemption;
- exchange reserves/whale flows;
- on-chain borrow/lending;
- broader venue funding/carry;
- Deribit options surface;
- listing/delisting timing;
- HL/Unit custody/reserve;
- fee/rebate/tier;
- richer positioning/OI.

Gate result:

- START_NOW_RECORDER = empty.
- No new data source passed recorder gate without prior one-off check.

High-value one-offs completed:

1. **Fee-tier reality check**:
   - found conservative cost model;
   - strengthens FADE cash path.

2. **Broader venue funding/carry map**:
   - confirmed HL_CARRY best;
   - identified Bybit SNX/GRT as secondary watch.

Potential future one-off:

- HL/Unit custody observable risk monitor;
- ETF/stablecoin/whale are likely regime/guard, not direct cash yet.

## 8. Current cash priority ranking

Tier A — Cash path now:

1. **FADE trend/vwap**
   - next date: 2026-07-25;
   - decision: family verdict + covered/uncovered + capacity + exhaustion protocol;
   - if survives: micro-live/probe and exit evaluator path.

2. **HL_CARRY**
   - next date: 2026-07-30;
   - decision: funding persistence review;
   - if passes: pilot prereg/go-no-go/custody acceptance.

Tier B — Cash path after verdict:

3. **EXIT_TP_50BPS**
   - only if FADE survives.

4. **HURST_GATED_FADE_TREND**
   - only if FADE trend survives.

5. **FUND_EXTREME_FADE**
   - incubator model, review 2026-07-30.

Tier C — Passive observe:

- AMBUSH (2026-07-22);
- RULE_CHANGE;
- LIQ/CASCADE;
- BYBIT_CARRY_SNX/GRT;
- Deribit/options;
- stable/oracle/insurance.

Tier D — Park/Reject:

- broad directional price prediction;
- borrow-based carry;
- MICRO-OFI/passive MM without rebate/latency edge;
- ORACLE_SNAP_REVERT as strategy;
- most pure chart/candlestick/momentum ideas.

## 9. What has not yet been fully tried

The following are not fully tested and could be future branches:

1. **FADE uncovered OB expansion**
   - most important near-term unanswered question;
   - requires OB/tick recorder expansion for 6 Tier-1 symbols.

2. **HURST-gated FADE forward**
   - only if FADE trend survives;
   - new model, new RESET_TS.

3. **EXIT_TP_50BPS forward evaluator**
   - only if FADE survives;
   - covered-only, volume-through fill rule.

4. **HL/Unit custody observable monitor**
   - protects HL_CARRY.

5. **Bybit SNX/GRT spot-depth check**
   - only if funding persists 14+ days.

6. **Rule-change forward event strategy**
   - once N>=30 day-clustered from first_seen observer.

7. **Options surface regime guard**
   - once Deribit data matures 2-4 weeks.

8. **Listing/delisting tradable timing**
   - requires forward first_seen + orderbook at tradable start.

9. **Autonomous Paper Research Loop**
   - code/design prepared;
   - dry-run would launch only guard/watch evaluators now;
   - not yet activated because no directional/paper-ready cash models in backlog.

## 10. Questions for external AI

Please analyze the project from a cash-first perspective:

1. Are we over-discounting any rejected class where a transformation could make
   it cash-relevant?
2. Is FADE trend/vwap more likely a real counter-signal or execution artifact?
3. How should we prioritize verifying uncovered FADE PnL?
4. Is HL_CARRY a reasonable base cashflow despite APR below 50%?
5. Are Bybit SNX/GRT carry watches worth promoting if they persist?
6. Are we missing a major payer class in crypto that is retail-executable?
7. Which future data source is most likely to unlock a second cash path?
8. Should autonomous paper research be activated now for guard/watch models,
   or only after a strategy candidate appears?
9. What is the fastest safe path from paper evidence to first real dollars?
10. Where are we still confusing "interesting research" with "money"?

## 11. Bottom line

As of 2026-07-18, broad search has not found new near-term cash strategies.
Most price-prediction ideas fail after costs. The live cash path is concentrated:

- **FADE trend/vwap**: near-term trading verdict 2026-07-25.
- **HL_CARRY**: near-term carry review 2026-07-30.
- **FADE uncovered OB verification**: key next unlock for whether FADE edge is
  real or execution artifact.

Everything else is passive observe, needs data, guard-only, or parked.

