# Botalin — Хендовер (рев. 6, 2026-07-13)

_Вставь первым сообщением в новую ветку. Заменяет рев. 5. Роли Claude: квант / трейдер / аудитор / инженер → ревью + paste-блоки для Codex (Claude Code на сервере, /opt/botalin-edge; серверная операционка — в CLAUDE.md репо). Оператор Aleksandr вставляет отчёты, даёт «го». Доки: CHARTER, OVERVIEW (честный счёт, 13 осей, полон), RESEARCH_MAP_W3 (3 слоя идей), DECISIONS, CAPITAL_DEPLOYMENT_PLAN, STOP_DOING_RULES, GATE_2026-08-10, reference/*._

## Суть

Bybit, счёт $20.7 = ТЕСТОВЫЙ СТЕНД (гипотезы оценивать на целевой капитал $1-5k; «$20» — аргумент только против идей, требующих капитала на этапе проверки). Итерация-1: 5080 сделок, -0.34%/сделку → похоронена. Построена фабрика стратегий. Цель: портфель источников 15-30% годовых суммарно (idle/HLP 5-10% + засада 10-20% + каскады 5-15% + execution alpha 3-8%), maxDD<10%. Собственный alpha на Bybit закрыт честными нулями исчерпывающе (13 осей, cost-sensitivity: edge отсутствует по существу) — все нули в «затоптанных полях».

## Живые ставки

1. **КАСКАДЫ — скан 08-02, двухъярусный (пререг):** confirmatory K=6, α/K=0.00833, t≈2.9 при ~30 днях-кластерах: H1 CASCADE-FADE θ{p90,p97}×H{1ч,4ч} (E-лид t=2.03) + H4 FAILED-CASCADE p97×{5м,10м} (N_min=30 forward-feature-complete событий, не набран → «перенос в окно-2», holdout НЕ расходуется). Exploratory ~20 (H2/H3/PANIC-GRID/прочее — не вердикт). PANIC-GRID = УСЛОВНАЯ сетка (ур.1 подтв. каскад / ур.2 OI↓ / ур.3 восстановление стакана; лимиты $/каскад). Пайплайн проверен DRY (709 событий/23 актива, 0.2с), funding по 8ч-метке, OI-forward пишется (5мин, 30 активов, с 07-13!), curated-пул фичей (stress-scorer, impact skew, OI-reset, round-number, time-since-shock, funding-confirmation, venue disagreement; рост пула только пререг-коммитом). Дни с usability<98% автоисключаются из скана.
2. **ЗАСАДА funding — механика готова, CAPITAL-GATED до $200.** Floor-семантика зафиксирована: 0.4025% = кумулятив на событие (4 maker-ноги 0.272% + slip ×1.25); R_MIN=0.0671%/метка (hurdle ~73.5%/год). На $20.7: majors min-lot-blocked, абсолют ничтожен → аллокация 0% до ступени $200, инструмент дежурит. Fire-drill: детект→план 278мс, legging 4.7bps. Guards LIVE в m1_dn+сканере: spread-cap, ADL (private adlRankIndicator), OI-cap, venue disagreement, exchange-status (DEGRADED>3000мс→SKIP) — все с counterfactual-логом причин. Спеки готовы: candidate-score 0-100 (floor остаётся жёстким гейтом, score ранжирует/сайзит выше floor), exhaustion 3 режима. Вселенная засады = small-caps с funding-vol (opp_ambush score), НЕ майоры.
3. **HLP — НЕ hedge, а тот же риск-фактор, что каскады.** Corr HLP-PnL: с total-liq 0.56, с каскад-днями 0.50, с BTC 0.01 (N=10, индикативно) → «продажа ликвидности в хаос» через другой инструмент → на гейте общий кап на фактор {каскады+HLP}. Бэкфилл vaultDetails до 2023 — в работе, пересчёт на полной истории до гейта.

## EXECUTION

19/30 чистых (07-10 аннулирован честно), 30/30 ~07-14 → отчёт Execution Trust (+секция экстраполяции на $1-5k). Форензика 29 валидных RT: maker slip -1.1bps (improvement), taker +4.46bps, spread 1.1bps, adverse<2bps, сверка до цента. Dual-PnL: выгода исполнения +0.078%/оборот; правило: taker только при expected edge >0.13%/RT. PnL attribution: net = издержки (fees+taker-фолбэки -$0.35 из -$0.46), направление ~0. Кап M1-DN приведён к $20.7. Probe-orders спека — старт после 30/30 по «го».

## Риск/безопасность

Security-аудит: withdrawal ОТКЛЮЧЁН, IP-whitelist стоит; дефекты: master-акк (sub = условие ступени $200), бессрочный ключ (оператор: поставить срок в Bybit UI — НЕ сделано). emergency_flatten.mjs есть (DRY-тест пройден; живой вызов: `node /opt/botalin/emergency_flatten.mjs --live`). Edge-cases матрица: дыры cancel-reject (ВЫС), reduceOnly-reject (СРЕД), идемпотентность retry — ПАКЕТ live-фиксов (+атомарные записи live) одним «го» ПОСЛЕ 30/30. CAPITAL_PLAN: лесенка $200(sub-акк+гейт)→$500(capacity)→$1-2k(≥2 источника)→$3-5k(stress-report); корзины execution 30/yield 15/carry 20/research 10/reserve 25; utilization-цель 45-60% (idle в низкий режим — норма). STOP_DOING_RULES: DD>15%, edge<backtest−50%, slip×2, 30д без кандидатов, концентрация>60% и пр.; финал порогов на гейте. Расхождения план↔CHARTER (ступень $500, $3-5k) — выписаны, решение оператора на гейте.

## Данные/инфраструктура

Volume 100G (запас на годы), backups на корне (разделение носителей). Рекордеры: OB+тики (18 пар, usable 92.5%; ENOSPC-гэп 07-12 — класс закрыт), liq Bybit (30), HL-cascade (+mid/impact/premium), OKX funding, OI-forward (5мин/30 активов), oi-cap, borrow-спот, HLP-journal, делистинги, rule-change (+oracle-reject, paused; +post-event журнал +1ч/6ч/24ч), latency во всех (HL~350мс, Bybit~170мс med). Data-quality daily + watchdog >15мин + per-day usability. Scorecard v2 weekly: execution_score + opp_ambush + opp_cascade + strategy_universes (стейблы/RWA исключены). Shadow: 27 конфигов, RESET_TS 07-11 (рестарты вердикт-окно НЕ сбрасывают), 2989 сделок, counterfactual активен, 6 мёртвых-по-частоте; ВЕРДИКТЫ ~07-25. Атомарные записи в edge внедрены; funding-scanner устойчив (retry+health+TG). git: edge origin/main актуален; /opt/botalin push ЗАБЛОКИРОВАН до триажа gitleaks (коммиты локальные).

## Ближайшая очередь

1. ~07-14: 30/30 → отчёт Execution Trust → «го» на пакет live-фиксов (cancel-reject, reduceOnly, атомарные live).
2. Подтвердить shadow_counterfactual.jsonl (первый TTL-expiry). HLP-бэкфилл отчёт.
3. ~07-25: shadow-вердикты (N≥200 & ≥14 дней & α/K).
4. 08-02: СКАН КАСКАДОВ (двухъярусный, confirmatory K=6 на ревью перед сканом).
5. 08-10: ГЕЙТ — портфель {каскады?, засада(capital-gated), HLP с общим капом фактора, points-опцион}; решения: ступень $200, лесенка/CHARTER, волна 3/4.

## Закрыто/парк (не перепроверять)

Закрыто: свечной directional, funding LONG, дисперсии Bybit-Binance/HL-Bybit, quarterly (~12% полка), листинги, lead-lag на барах, A/B/C/D/E (фантом A пойман). Парк: MEV, опционы-как-стратегия, treasury carry (→ повестка гейта при $1k+), проп, FOREX навсегда.

## Правила (неизменны)

Живые ордера/правки live-кода только по «го». Holdout один прогон по «го» (НЕ израсходован). K до скана; кластеризация по дням; обе cost-колонки; декомпозиция PnL; пре-holdout аудит; curated-пул только пререг-коммитом; недостаток N ≠ фальсификация (пререг N_min); закрытие оси = scorecard тем же коммитом; небэкфиллируемое пишется с дня идеи; расхождение сервера с доками — сообщить, не чинить; вердикты только на чистых данных (usability-флаги); gitleaks; force-push по аппруву.
