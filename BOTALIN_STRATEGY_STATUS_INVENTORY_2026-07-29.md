# Botalin Strategy Status Inventory

Дата среза: 2026-07-29  
Назначение: единая рабочая таблица по всем стратегиям/гипотезам, которые уже тестировались или находятся в ожидании.  
Статус доказательности: research summary, не promotion-документ.

## Главный Вывод

За время проекта проверено не несколько отдельных стратегий, а большая лаборатория гипотез:

- крупных семейств: примерно 30-35;
- отдельных механизмов/гипотез: примерно 100-150+;
- параметрических/режимных комбинаций: 1000+.

Пока ни одна направленная стратегия не получила честный статус live-ready/profitable. Самые полезные результаты:

1. Paper часто врал про исполнение или режим.
2. Micro-live дал больше правды, чем paper, но не доказал edge.
3. FADE tokenized оказался плохим сигналом даже при ideal-fill.
4. HTF mean-reversion не выдержал OOS/robustness.
5. AMEL directional events пока дают больше guard-слой, чем входы.
6. Carry/funding остается самым близким cash-path, но требует отдельного вердикта.
7. Следующая большая идея: не одиночная стратегия, а multi-strategy router по режимам рынка.

## Статусы

| Статус | Значение |
|---|---|
| ACTIVE / RUNNING | процесс или наблюдатель сейчас собирает данные |
| PAPER_ACTIVE | бумажный/forward наблюдатель копит данные |
| WAIT / NEEDS_MORE_LOGGING | данных мало, решение отложено |
| GUARD_ONLY | полезно как запрет/фильтр, не как вход |
| DEPRIORITIZE | не убито навсегда, но не тратить ближайший фокус |
| REJECT | гипотеза не выдержала тест |
| DUPLICATE_OR_OVERLAP | переименованная версия уже известной семьи |
| CASH_PATH | потенциальный путь к деньгам, но не доказательство |
| DISCOVERY_NOT_PROOF | исследовательский сигнал, не кандидат |

## Сводная Таблица Стратегий

| # | Семейство / стратегия | Что проверяли | Лучшее наблюдение | Что сломалось | Текущий статус | Что еще можно выжать | Следующий шаг |
|---:|---|---|---|---|---|---|---|
| 1 | FADE_TOKENIZED_TREND_US_HOURS | Live/DC на SOXL/LAB, market-entry, coordinator, trace | Исполнение стало чистым: market-fill, WS, flat, slippage нормальный | Сигнал плох даже при ideal-fill; live сделки в минус/ноль; низкий WR/fat-tail не подтвердился | DEPRIORITIZE | Не чинить execution; можно изучить только как источник anti-pattern/guard | Не запускать новый live без нового структурного тезиса |
| 2 | FADE_TOKENIZED_PULLBACK_US_HOURS | Scope подготовлен, live DC запущен, 0 fills в одной сессии | Код/route/scope валиден, ineligible=0 | Сигналов почти нет, 0 fills; данных для edge нет | WAIT_LOW_FREQUENCY / DATA_COLLECTION_ONLY | Может остаться как редкий observer, но не live-cash | Только если multi-session сбор по отдельному GO |
| 3 | FADE_TOKENIZED_VWAP | Paper показывал положительный headline | Возможный режимный карман | 86% off-hours, SOXL-only, slippage fragile, execution risk | HIGH_FALSE_HOPE / DEPRIORITIZE | Может стать guard/diagnostic, не entry | Не промоутить без live/executable replay |
| 4 | FADE_SCALPING_ADAPTIVE_GUARD_v1 | Regime/cooldown overlay поверх FADE | In-sample lift до WR около 72% | Edge тонкий, почти наверняка съедается slippage; governance freeze | NO-GO / PAPER_READY_DRAFT only | Как guard-идея, не самостоятельный сигнал | Не запускать без нового prereg и причины |
| 5 | FADE off-hours short | Live 5-fill серия, correct remap | Механика чистая | Off-hours SOXL перп дрейфовал вверх; 4/4 shorts минус/ноль | EDGE_NOT_SURVIVING_EXECUTION in that window | Урок: off-hours short запрещать без regime gate | Не возобновлять как есть |
| 6 | Raw-long tokenized first live set | Первые сделки были прибыльны, но конфиг был "неправильный" | Выигрывал off-hours drift | Это не доказало raw momentum edge, а поймало режимный дрейф | DISCOVERY_INSIGHT | Вынесено в отдельный SOXL_OFFHOURS_DRIFT_LONG | Не смешивать с FADE |
| 7 | SOXL_OFFHOURS_DRIFT_LONG | Paper/research BTC-gated off-hours long | BTC-up gate дал сильный paper-forward старт | Безусловный drift не работает; стратегия = beta/risk-on, должна бить BTC benchmark | PAPER_ACTIVE / NEEDS_DATA | Проверить vs passive BTC hold, no overnight | Ждать 14d/N; не промоутить |
| 8 | FADE_TOKENIZED_TREND_US_HOURS_v2_DC | Multi-session data collection до 20 clean fills | Execution solved, directional slippage fixed | Alpha not confirmed; few fills, минусовые сделки | PAUSED / DATA_COLLECTION_ONLY | Может дать статистику, но не рабочая стратегия | Только по отдельному GO, если цель именно купить данные |
| 9 | FADE_DECISION_TRACE / counterfactual ledger | Логи решений: какие фильтры мешают, что было бы без них | Видно, почему входов мало и какие фильтры режут | Не стратегия | TOOLING / ACTIVE_INFRA | Использовать при каждом live/DC run | Включать trace в micro-live |
| 10 | HTF_MA_DISTANCE_REVERSION | 1h/4h z=(close-SMA20)/ATR, OOS/robustness/L2 | 1h holdout слегка плюс | Плюс только BTC/июнь; remove-best-symbol/day ломает; 4h OOS минус | DEPRIORITIZE | Может стать компонентом router только если новый режим объясняет почему | Не распарковывать как standalone |
| 11 | HTF_MEAN_REVERSION rediscovery | Non-AMEL factory повторно нашел mean-reversion | Net median +8.56 bps in recent sample | Дубликат HTF_MA_DISTANCE; OOS потом провалился | DUPLICATE / DEPRIORITIZE | Урок: independent rediscovery полезен, но OOS решает | Закрыто после OOS fail |
| 12 | HTF_VOL_COMPRESSION_EXPANSION_4H_ALT | 4h vol compression -> expansion на альтах | Robustness сильный: many params positive, null p low | Execution coverage мало; WAIT_EVENT_RECORDER, всего 4 usable OB events позже | WAIT_MORE_DATA | Один из немногих структурных не-FADE механизмов | Recheck после накопления OB events, около 2026-08-21 |
| 13 | HTF_VOL_COMPRESSION 1h | Atlas на 1h | Были отдельные плюсы | На 1h family умер/неустойчив | REJECT / DUPLICATE_CONTEXT | Может работать только 4h alt-scoped | Не тестировать 1h как отдельный sleeve |
| 14 | HTF_TREND_CONTINUATION | 1h/4h/1d continuation | Нет сильного плюса | Умер на ideal-fill, net negative | SIGNAL_BAD_EVEN_AT_IDEAL_FILL | Только если новый режим/новый payer, иначе не трогать | Не продолжать как standalone |
| 15 | FAILED_BREAKOUT_REVERSAL_US_HOURS | Failed breakout, US-hours, 15m | Первичный atlas показал MFE/MAE 1.4-1.5 | Fresh/replay/atlas показал signal bad/median issue; family quarantine | QUARANTINE / REJECT | Можно вернуться только с новым causal reason, не cherry-pick | Не оживлять |
| 16 | WICK_RECLAIM_SWEEP / fade | AMEL joint atlas | Единственный mean-плюсовой после $200 cost: около +0.126% | Median около 0, payoff trap, мало дней | NEEDS_MORE_LOGGING | Самый интересный AMEL-directional leftover | Перегнать после 7d AMEL, особенно median/remove-best-day |
| 17 | AMEL MOMENTUM_IMPULSE_5M | Active-event baseline | Широкий event baseline | Overlap with FADE/negative/rejected | REJECT / DUPLICATE | Может использоваться как feature в router, не entry | Не оживлять как standalone |
| 18 | AMEL VOLUME_BURST_1H | High-risk candidate из AMEL | Иногда давал красивые маленькие карманы | N tiny, one-symbol/cherry-pick, rejected family | REJECT | Может быть feature для NEWS/session, не entry | Не делать paper |
| 19 | AMEL second-order combinations | 930 event/regime/liquidity combos | Некоторые pockets красивые | 745 duplicate, positives tiny-N/one-symbol/overlap | NO_PREREG / GUARD_ONLY | Полезно для guard/liquidity filters | Повторить на 7d AMEL |
| 20 | AMEL liquidity/spread guard | Replay liquidity no-trade guard | Срезает часть плохих условий | Улучшение маленькое, good/bad почти 1:1 | RESEARCH_ONLY_GUARD | Hard no-trade для абсурдного spread/depth; soft только research | Не делать глобальным live guard пока |
| 21 | AMEL 7d discovery logger | 23 crypto symbols, events/orderbook/outcomes | Дает больше N и день-кластеры | Еще не завершен | RUNNING / DISCOVERY | Главный источник для повторного atlas | Checkpoint около 2026-08-04 |
| 22 | NEWS_DELAYED_REACTION | NEWS first_seen_at + delayed market reaction | Отличается от техпаттернов; может иметь payer через информационный лаг | Tagger v1 шумный, мало событий, future-dated published_at | NEEDS_MORE_LOGGING | Потенциально следующий non-AMEL механизм | NEWS x AMEL x wallet study около 2026-08-06 |
| 23 | RULE_CHANGE_DELEVERAGE / LEV_CAP | NEWS-LAB event-watch | События биржевых правил могут двигать плечевые позиции | Пока intelligence only; нужен tagger v2 и join | EVENT_WATCH | Может стать guard или event-strategy | Decision около 2026-08-06 |
| 24 | Wallet/crowd divergence | Hyperliquid wallets + Binance top ratio | Киты против толпы как regime intelligence | 3-wallet run skewed all-short; directional variants negative | GUARD_ONLY / NEEDS_MORE_LOGGING | 7-wallet balanced watchlist уже подготовлен | Запустить/анализировать 7-wallet run по GO/после данных |
| 25 | Whale-follow / copy-trading | Публичные HL wallets | Wallet positions/fills доступны | Нельзя copy-trading; sample not enough; wallets can be wrong | INTELLIGENCE_ONLY | Использовать как feature/guard, не сигнал | Расширять wallet universe осторожно |
| 26 | Historical Bybit trader forensics | 1238 closed trades, own account history | Показал как разгоняли баланс | Итог -$8.63k; 18 liquidations -$10.87k; risk-of-ruin | ANTI_RISK / REJECT_AS_ALPHA | Уроки risk behavior: no high leverage, no hold losers to bust | Использовать только anti-risk guard |
| 27 | Low-leverage safe subset from Bybit history | Liquid, <3x, no liquidation subset | Хвосты срезаны | N=19, net negative, no stop/target grid positive | DATA_INSUFFICIENT / REJECT_POSITIVE_ALPHA | Может помочь risk framework, не entry | Закрыть как source of alpha |
| 28 | HL_CARRY | Funding/carry path | История 208d +13.5% ann, persistence good | Forward funding softened below 10-12%; custody monitor/spec blocker | CASH_PATH / WAIT_LEANING | Самый близкий денежный путь, но custody/funding gates | Verdict 2026-07-30 |
| 29 | FUND_EXTREME_FADE | Funding extreme paper | Decision aligned with 2026-07-30 | Нужен N/day-clustered, проверить без false hope | PAPER_ACTIVE / WAIT | Может быть carry-adjacent alpha | Verdict 2026-07-30 |
| 30 | BYBIT_CARRY SNX/GRT | Funding watch | SNX выглядел лучше, GRT fail | Еще не полноценный cash path | PAPER WATCH / WAIT | Может стать отдельной funding sleeve | Проверить funding persistence/depth |
| 31 | AMBUSH OB / AMBUSH_B | Orderbook/carry cohort | Исполнимость была нормальной для ряда монет | Carry cohort убыточна, funding gaps/no payer | WAIT / PASSIVE | Только если новая payable-гипотеза, не recorder | Не запускать новый recorder |
| 32 | Crowded funding/OI unwind | OI/funding atlas | Новое forced-player пространство | 5m OI granularity too coarse; tested variants net negative | NEEDS_NEW_DATA / WAIT | Нужен finer OI/liquidation event recorder | Спека bounded keyless recorder |
| 33 | Liquidation cascade fade/continuation | Event mechanism atlas | Чистый payer: forced liquidations | Текущая гранулярность теряет cascade внутри 5m | NEEDS_NEW_DATA | Высокий potential, но data blocker | Собирать finer liquidation/OI events |
| 34 | BTC lead-lag / cross-asset beta residual | Edge Atlas v2 / HTF atlas | Contemp corr high | Lag+1 ~= 0; residual re-anchor net negative | REJECT | Только как regime context, не edge | Не продолжать |
| 35 | Raw directional + regime filters | Multiple atlases | Проверялось across regimes | Raw net negative everywhere | REJECT | Только как null/benchmark | Не делать новые raw variants без new payer |
| 36 | Tokenized open reanchor | EDGE_ATLAS shortlist | Potential anchor-to-stock-open logic | Needs data, overlap with SOXL drift | NEEDS_DATA | Может быть non-FADE tokenized mechanism | Проверять после данных, без off-hours leakage |
| 37 | Multi-layer crowd/whale/event strategy | V1 guard/directional/fade-crowd | Formal joined replay done | Best variant negative; crowd side beat whales in sample | NEEDS_MORE_LOGGING | Retest on 7-wallet balanced watcher | After 7-wallet data |
| 38 | Multi-strategy regime router | Strategy variability atlas | Сформирована карта режимов/sleeves | live ALLOW=0%; NO_TRADE 100% на 24h replay | WATCH / ROUTER_FRAMEWORK | Главная будущая логика: sleeve only in its market | Следующая задача: Overfit Router Lab |
| 39 | Overfit Lab single strategies | 116 fitted variants | 15 train-positive, beautiful in-sample | 0 survived all attacks; no paper draft | OVERFIT_SANDBOX_NOT_PROOF | Учебная демонстрация ловушек | Переход к router-overfit, не standalone |
| 40 | Non-AMEL candidate factory | Klines/trades + other sources без AMEL | Rediscovered HTF mean-reversion | После OOS провалилось; no PREREG | DISCOVERY_DONE | Дал pipeline без AMEL | Следующая ось: NEWS/funding/OI/router |

## Что Считать Живым Как Возможность

| Приоритет | Направление | Почему еще живо | Риск |
|---:|---|---|---|
| 1 | HL_CARRY | Единственный cash-path с payer через funding | Custody-tail, funding softened, нужен монитор |
| 2 | FUND_EXTREME_FADE | Funding/OI payer может быть реальным | Нужен day-clustered N и execution realism |
| 3 | HTF_VOL_COMPRESSION_EXPANSION_4H_ALT | Прошел robust check лучше многих, не FADE | Нужны OB events и execution coverage |
| 4 | NEWS_DELAYED_REACTION | Новый источник edge: информационный лаг | Нужен tagger v2, first_seen, больше N |
| 5 | WICK_RECLAIM_SWEEP/fade | Единственный AMEL leftover с плюсовым mean after cost | Median около 0, вероятна payoff trap |
| 6 | Wallet/crowd guard | Может защищать от плохого рынка | Не copy-trading, directional пока не работает |
| 7 | Multi-strategy router | Может включать рукава только в нужном режиме | Пока live ALLOW=0, нужна router lab |

## Что Уже Нельзя Тащить Как Есть

| Семейство | Почему нельзя |
|---|---|
| FADE_TOKENIZED trend/short/long как alpha | Сигнал плох даже при ideal-fill, live не подтвердил |
| HTF mean-reversion majors | OOS/robustness fail, держится на BTC/периоде |
| Standalone momentum/trend continuation | Signal bad at ideal-fill |
| Failed breakout standalone | Quarantine/rejected, median/null issues |
| Raw directional signals | Net-negative across regimes |
| Historical Bybit high-winrate style | Risk-of-ruin: high winrate, terrible payoff, liquidations |
| Overfit single-strategy winners | Train-positive only, all died on attacks |

## Что Еще Можно Выжать Из Провалов

| Провал | Не выбрасываем сразу, а используем так |
|---|---|
| FADE | Как anti-pattern: не фейдить без regime/payer; trace framework полезен |
| HTF mean-reversion | Как доказательство необходимости OOS/remove-best; возможно только узкий router sleeve при новом regime proof |
| Failed breakout | Может быть feature/guard, но не resurrected entry |
| AMEL momentum/volume | Event features для router, не standalone entries |
| Whale-follow | Guard/intelligence, не copy trade |
| Bybit historical account | Anti-risk layer: no high leverage, no hold-to-bust |
| Thin L2 replay | Size representativeness check before scaling |

## Текущая Агентская Сеть

| Роль | Назначение | Статус в штабе |
|---|---|---|
| Codex Orchestrator | Сводит решения, держит roadmap и GO/NO-GO | Active |
| Alpha Hunter | Упрямо ищет multi-format alpha, не защищает провалы | Running |
| Skeptic / Robustness | Ломает стратегии OOS/null/remove-best/cost | Protocol accepted |
| Execution Realism | Проверяет L2/slippage/latency/micro-live trace | Protocol accepted |
| Data Scout | Ищет данные и покрытие | Running |
| Governance Auditor | Следит за правилами и lessons | Protocol accepted |
| Data Truth Auditor | Проверяет, можно ли верить данным | Running |
| Roadmap Controller | Следит, что не сбились с плана | Running |

## Ближайший План

| Дата UTC | Событие | Действие |
|---|---|---|
| 2026-07-30 | HL_CARRY verdict | Проверить funding >= 10-12%, custody monitor, depth, sizing |
| 2026-07-30 | FUND_EXTREME_FADE verdict | Проверить N/day-clustered/payer/execution |
| 2026-08-04 | AMEL 7d stop | Re-run joint pocket/entry/exit atlas и second-order miner |
| 2026-08-06 | NEWS/RULE_CHANGE/LEV_CAP | NEWS x AMEL x wallet study |
| 2026-08-21 | HTF vol-compression recheck | Проверить OB event count и execution gates |

## Рекомендованная Следующая Задача

Следующая большая задача после завершения текущего Overfit Lab:

`TASK-OVERFIT-ROUTER-LAB-MULTI-STRATEGY-V0`

Цель: искать не одиночную стратегию, а мультиформатный роутер:

`market regime -> sleeve -> entry -> exit -> guard -> NO_TRADE if conflict`.

Главная проверка: отдельная стратегия может быть плохой "в среднем", но полезной только в своем режиме. Проверять надо contribution/ablation каждого рукава, а не только общий PnL.

## Инварианты

- Ничего из этого не является заявлением profitable/live-ready.
- `promising_count` должен оставаться 0 до прохождения evidence gates.
- Micro-live не доказывает edge.
- Paper не доказывает execution.
- Любой новый вариант после провала получает новый label и доказывается с нуля.
- Live/paper/coordinator/approval/KILL/keys только по отдельному явному GO.

