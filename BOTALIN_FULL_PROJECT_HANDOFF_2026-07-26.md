# Botalin Edge Project — Full AI Handoff

Дата фиксации: 2026-07-26  
Локальный workspace: `/Users/aleksandr/Documents/New project KAM`  
Основной серверный проект: `/opt/botalin-edge` на `root@167.233.205.87`  
Назначение файла: передать другому ИИ полную рабочую картину проекта, уже проверенные гипотезы, результаты live/paper/research, текущие инварианты и ближайшие решения.

Этот документ не является торговым сигналом. Это проектный handoff.

---

## 0. Главная рамка проекта

Проект Botalin Edge сейчас находится в режиме **research-first systematic trading**.

Ключевая логика пользователя:

- маленький live-баланс — это **reality sensor**, а не база для доходности;
- цель live micro-тестов — проверить переносимость paper/backtest-эджа в реальный рынок: fill, slippage, latency, stale, side semantics, flat safety;
- пользователь хочет одновременно **“заработать и купить правду дешево”**: сохранять upside, но жёстко ограничивать стоимость информации;
- нельзя делать auto-rerun, auto-scale, averaging/scaling;
- каждый live batch требует отдельного явного `go`;
- никакая стратегия не называется прибыльной/live-ready до достаточного N и прохождения заранее заданных evidence gates.

Главный процесс:

`GO -> RUN BOUNDED BATCH -> REPORT -> DECISION -> NEXT GO`

---

## 1. Жёсткие инварианты

Другой ИИ должен соблюдать эти правила без исключений:

- не запускать live без свежего явного `go`;
- не печатать секреты и не дампить `/etc/botalin.env`;
- не трогать FADE-8 / holdout-когорты;
- не ослаблять кэпы без новой версии, prereg и отдельного `go`;
- не называть стратегию прибыльной по 1-5 сделкам;
- не смешивать paper PnL и live PnL;
- не смешивать разные model_id и RESET_TS;
- не создавать новых FADE-детей для спасения родителя без структурной причины;
- не трогать coordinator / KILL / approvals / live runners без прямого задания;
- сохранять `promising_count=0`, пока реальные evidence bars не пройдены;
- для любых денежных/live вопросов проверять состояние сервера read-only, а не полагаться на старый handoff.

---

## 2. Verified snapshot на момент подготовки файла

Read-only проверка сервера была выполнена перед созданием файла.

Сервер:

- path: `/opt/botalin-edge`
- branch: `main`
- HEAD: `21aaa01`
- coordinator status:
  - `enabled:false`
  - `go:false`
  - `active_profile: current_small_balance`
  - `halt:false`
  - `active_leases: []`
  - `orders: NONE`

Активные процессы на момент проверки:

- `active_market_event_logger.mjs`:
  - PID `2751105`
  - run_id `amel-1785062109514`
  - старт: `2026-07-26T10:35:10Z`
  - duration: 24h
  - keyless public data only
- 2 процесса `fade_tokenized_trend_edge_series_runner.mjs`:
  - PID `2753491`
  - PID `2753518`
  - они появились после задачи запуска live DC runners в wait-until-US-hours mode;
  - coordinator при этом read-only показал `enabled:false`, 0 лизов.

Важно: это snapshot, не гарантия текущего состояния на будущий момент. Перед любым действием снова делать read-only preflight.

Active Market Event Logger counts на момент snapshot:

- `events_amel-1785062109514.jsonl`: 57
- `orderbook_amel-1785062109514.jsonl`: 57
- `outcomes_amel-1785062109514.jsonl`: 0
- `regime_amel-1785062109514.jsonl`: 2

FADE DC summary на момент snapshot:

- trend:
  - model: `FADE_TOKENIZED_TREND_US_HOURS_v2_DC`
  - sessions_run: 3
  - clean_fills: 3/20
  - exits: stop x2, timeout x1, target x0
  - net PnL: `-$0.1124`
  - status: `COLLECTING`
- pullback:
  - model: `FADE_TOKENIZED_PULLBACK_US_HOURS_v0_DC`
  - sessions_run: 2
  - clean_fills: 0/20
  - net PnL: `$0`
  - status: `COLLECTING`

---

## 3. Архитектура, которую уже построили

### 3.1 Live execution

Было построено и проверено:

- Bybit private WS fill-feed:
  - auth HMAC;
  - execution/order/position subscribe;
  - FillTracker с идемпотентностью по `execId`;
  - partial/out-of-order fills;
  - no order endpoints in WS module.
- WS-driven executor:
  - WS-ready до entry;
  - marketable/market entry;
  - fill detection from WS;
  - hold-to-exit;
  - reduceOnly close actual qty;
  - terminal flat;
  - independent dual-method flat verification;
  - emergency close path if needed.
- Side resolver:
  - economic side inferred from geometry:
    - LONG if `stop < entry < t1 <= t2`;
    - SHORT if `stop > entry > t1 >= t2`;
  - raw side can be remapped;
  - bad geometry blocked.
- Coordinator:
  - lease-based gate before live orders;
  - deny-all by default;
  - symbol lock;
  - global max positions/notional/loss;
  - stale lease handling;
  - HALT on anomaly/safety.
- FADE decision trace:
  - `FADE_DECISION_TRACE=1`;
  - decision trace JSONL;
  - event-time OB snapshots;
  - counterfactual policy matrix;
  - post-session counterfactual report.

### 3.2 Paper/research factory

Построено:

- Autonomous Paper Factory Conveyor:
  - INTAKE -> CHEAP-KILL-TEST -> PAPER-LAUNCH -> DAILY-EVAL -> PROMOTION-CONTROL;
  - protected cohorts;
  - immutable `RESET_TS`;
  - `promising_count=0` hard invariant;
  - sandbox-only writes.
- Candidate Miner / Idea Factory:
  - many hypotheses checked net-of-cost;
  - null/permutation/matched controls where appropriate;
  - duplicate/overlap classification;
  - no paper candidate unless evidence and payer thesis survive.
- Graphify architecture map:
  - repo graph created and stored in `reference/graphify/2026-07-22/`;
  - graph artifacts mostly server-side, light index committed.

---

## 4. Major engineering lessons already learned

### 4.1 REST fill detection was not acceptable

REST fill detection lag was observed around 9-63 seconds. It caused false `NO_FILL` / delayed hold-start risk.

Decision:

- REST fill detection retired from primary;
- WS private execution feed became required;
- REST remains only fallback/reconciliation/flat verify.

### 4.2 Live execution found issues paper could not reveal

Live micro tests revealed:

- REST lag;
- false negative reconcile;
- orderLinkId/fill aggregation issues;
- qty undefined in reduceOnly close path;
- side-label mismatch;
- limit IOC no-fill issues;
- stale signal / low emission frequency;
- off-hours tokenized-stock drift.

This validates the role of micro-live as a reality sensor.

### 4.3 Execution is mostly solved; signal edge remains unconfirmed

Current best interpretation:

- WS fill, market entry, terminal flat, coordinator, slippage handling are working;
- recent FADE losses are more about signal/regime than execution;
- edge retention from paper to live is still unproven.

---

## 5. FADE family: full status

### 5.1 Early FADE one-trade / micro-series

Outcomes:

- end-to-end mechanics proved:
  - WS fill -> hold -> close -> flat;
  - orphan issue fixed;
  - no emergency close needed in clean path.
- small PnL around zero or noise.

Important interpretation:

- mechanics proved;
- edge not proved.

### 5.2 v2 retry / raw-long wrong-config series

Observed:

- 3 SOXL LONG fills:
  - 2 target wins;
  - 1 breakeven;
  - series net around `+$0.191`.

But:

- it traded wrong/weaker config / raw-long style rather than true alpha fade-short;
- result was useful for mechanics, not a true alpha proof.

Interpretation:

- do not attribute this PnL to FADE true alpha;
- raw-long positive result likely overlapped with SOXL drift/regime.

### 5.3 True-alpha side-remap series

Important fix:

- raw `Buy` from fade trend could actually represent economic SHORT by geometry;
- side-remap fixed this:
  - `Buy + short geometry -> economic SHORT -> order Sell`.

Live findings:

- first true economic SHORT executed correctly;
- one timeout/profit-ish trade showed mechanics;
- later true-alpha SHORTs in off-hours lost repeatedly.

Interpretation:

- side-remap mechanics proved;
- off-hours SOXL drift made fade-short structurally bad in that regime;
- not a clean death of the strategy, but a regime-confounded failure.

### 5.4 US-hours market-entry FADE

Why US-hours:

- off-hours tokenized SOXL perp can drift with crypto/risk-on while the underlying stock is closed;
- US-hours keeps perp more anchored.

Live US-hours observations:

- one pre-v2 SOXL LONG target:
  - entry 156.89;
  - target;
  - PnL about `+$0.2257`;
  - real fill, but pre-v2 accounting/old slippage stop made summary awkward.
- v2 clean observations:
  - two SOXL LONG stops;
  - net about `-$0.142`;
  - execution worked; signal did not survive in those two cases.
- later DC:
  - trend cumulative 3/20 clean fills;
  - stop x2, timeout x1;
  - net `-$0.1124`.

Interpretation:

- current trend signal looks low-WR/fat-tail;
- 2 stops in a row are not impossible if WR is low;
- N is too small;
- continue only as data collection, not as working strategy.

### 5.5 Pullback scope

Built:

- `EDGE_CONFIG_SCOPE=fade-pullback`;
- refactor-shadow guard confirmed trend/default behavior unchanged;
- pullback economic-side uses same geometry resolver.

Live:

- pullback DC currently 0/20 clean fills;
- earlier 0 filled was due to lack of fresh pullback signals, not ineligible/scope bug.

Interpretation:

- pullback not evaluated live yet;
- issue is frequency/freshness, not execution.

### 5.6 Stale signal diagnosis

Root cause:

- rare signal emission, not polling lag.

Findings:

- polling 75s is much less than 30m TTL;
- WS signal push would not materially increase fills;
- trend has roughly 10-12 unique tradable emissions per US session;
- pullback has 0-6, sometimes 0;
- goal 20 fills/session is unrealistic;
- goal changed to 20 clean fills across sessions.

Operational clarification:

- `FADE_FILLABLE_MAX_AGE_MS=1800000` makes runtime match 30m freshness spec;
- not a new strategy version if only enforcing already-preregistered 30m age.

---

## 6. FADE decision trace / counterfactual ledger

Instrumentation completed:

- `FADE_DECISION_TRACE=1`;
- trace file per run;
- OB snapshot per evaluated setup;
- counterfactual policy matrix:
  - current;
  - age 45m;
  - age 60m;
  - RR 0.8;
  - no OB filter;
  - spread 12bps;
  - combined relaxed soft filters.

Hard filters:

- bad levels;
- no lease;
- KILL;
- non-flat;
- safety/halt;
- caps;
- auth/order safety;
- these must never be overridden counterfactually.

Soft/research filters:

- freshness;
- OB;
- spread;
- RR;
- time-window;
- allowlist/scope.

Purpose:

- next FADE sessions should produce not only actual trades, but a full funnel:
  - seen signals;
  - rejected signals;
  - why rejected;
  - whether rejected signals would have made/lost money post-hoc;
  - which filters save us;
  - which filters may be too narrow.

---

## 7. Active Market Event Reality Logger

Status:

- run_id `amel-1785062109514`;
- launched 2026-07-26T10:35Z;
- 24h keyless public discovery logger;
- no live orders;
- no paper;
- no RESET_TS;
- no promising.

Universe:

- BTCUSDT
- ETHUSDT
- SOLUSDT
- HYPEUSDT
- AVAXUSDT
- DOGEUSDT
- SHIB1000USDT
- 1000PEPEUSDT
- ZECUSDT
- BANKUSDT
- EULUSDT
- DEXEUSDT
- ESPORTSUSDT
- XRPUSDT

Timeframes:

- 1m
- 5m
- 15m
- 1h
- 4h

Event families:

- momentum impulse;
- failed breakout;
- volatility expansion;
- wick rejection;
- liquidity/spread shock;
- volume burst;
- cross-market/risk-on context;
- cascade candidate.

Data written:

- events JSONL;
- orderbook JSONL;
- outcomes JSONL;
- regime JSONL;
- manifest.

Design:

- not limited to 15m;
- event-based OB snapshots;
- top-of-book / top levels;
- executable slippage for $7 / $200 / $1k;
- multi-timeframe context;
- matched controls and outcome grid expected in report;
- anti-overfit / overlap / payer-thesis checks required.

Next action:

- after 24h, run:
  - `sudo -u botalin node scripts/analysis/active_market_event_logger_report.mjs --run amel-1785062109514`
- classify result as:
  - `PREREG_BACKTEST_CANDIDATE`;
  - `NEEDS_MORE_LOGGING`;
  - `DUPLICATE_OR_OVERLAP`;
  - `REJECT`;
  - `DATA_BAD`.

Important:

- This logger is discovery, not proof.
- A good-looking 24h event family must still pass prereg/backtest and slippage realism before paper/live.

---

## 8. Paper factory and current paper candidates

Paper factory is designed as a conveyor, not a promotion machine.

General invariant:

- `promising_count=0`;
- no candidate is live-ready;
- paper evidence must be forward, day-clustered, net-of-cost, and not a single-symbol artifact.

Known paper/factory candidates and status:

### FADE_TOKENIZED_PULLBACK

Status:

- paper-active;
- positive early forward in prior snapshots;
- flags:
  - one-symbol pocket;
  - low N early;
  - SOXL concentration.

Interpretation:

- interesting but not proof;
- live pullback DC has 0/20 fills so far.

### FADE_TOKENIZED_VWAP

Status:

- paper-active;
- positive headline in prior snapshots;
- flags:
  - SOXL-heavy;
  - off-hours;
  - slippage risk.

Interpretation:

- do not promote from headline PnL.

### SLIPCAP children

Status:

- downgraded to paper-observational only;
- promotion blocked.

Reason:

- shadow slippage is synthetic/zero, so SLIPCAP paper cannot prove live execution.

### SOXL_OFFHOURS_DRIFT_LONG_v1

Status:

- paper observer;
- BTC-gated off-hours drift hypothesis.

Concern:

- may just be crypto beta / risk-on exposure;
- must beat passive BTC benchmark, beta-adjusted.

### HTF_MA_DISTANCE_REVERSION_US_HOURS_v0

Status:

- paper observer;
- initial sanity was weak/negative in recent liquid universe;
- still gathering, not promising.

---

## 9. HL_CARRY

HL_CARRY remains the nearest “cash-path” candidate, but it is not approved for capital.

Status:

- decision review around 2026-07-30;
- historical payer looked persistent;
- forward funding had softened in prior analysis.

Required gates before any capital:

- funding recovery to predefined bar;
- custody monitor green;
- spot/depth sanity;
- peg sanity;
- explicit custody-tail acceptance;
- size rule:
  - satellite size;
  - L <= 2;
  - no L >= 3;
- separate operator `go`.

Interpretation:

- closest to cash path;
- but boring governance/depth/custody work matters more than exciting FADE variants.

---

## 10. AMBUSH / OB reports

AMBUSH OB report was completed.

Findings:

- orderbook data existed and was fresh enough;
- execution feasibility was not the main blocker;
- carry cohort was not profitable in the checked window;
- funding below floor / data gaps made verdict WAIT.

Status:

- AMBUSH_B remains passive / WAIT;
- do not launch;
- next step only if a new non-carry payable hypothesis appears.

---

## 11. Failed Breakout / US-hours failed breakout

Earlier candidate:

- failed-breakout reversal US-hours had initial structural appeal;
- slippage/spread looked manageable in some analysis.

Later research:

- broader idea-factory / mechanism checks put failed-breakout family into reject/quarantine or not enough proof;
- do not resurrect without new causal mechanism.

Status:

- not a current paper/live candidate.

---

## 12. HTF Vol-Compression -> Expansion 4h alt candidate

This is one of the best genuinely new research candidates, but not paper-active.

Findings:

- 4h vol compression -> expansion on alts showed structural robustness:
  - broad enough across alts;
  - positive in grid;
  - walk-forward stable;
  - matched-null survived;
  - majors negative, alts positive.

Key caveat:

- edge around +0.38% can be killed by one-way slippage around ~19 bps;
- at-event slippage must be measured.

At-event OB/slippage work:

- initial historical bars and OB were temporally disjoint;
- expanded OB universe improved coverage but still only a few usable events;
- observed slippage looked cheap/favorable, but N too low.

Status:

- `HTF_VOL_COMPRESSION_EXPANSION_4H_ALT_v0`
- registry status: waiting / WAITING_FOR_DATA;
- no paper;
- no RESET_TS;
- no promising.

Recheck:

- on/after 2026-08-21;
- gate:
  - >=30 usable events;
  - >=8 symbols;
  - net > 0 after p75 $200 slippage;
  - no one-symbol domination;
  - p90 $7 not catastrophic.

---

## 13. Event Mechanism Atlas / Idea Factory

Several broad hypothesis sweeps were run.

Main conclusions:

- many positive pockets are duplicates/overlap with FADE or existing families;
- raw directional signals are generally negative net-of-cost;
- BTC lead-lag did not survive as useful lag signal;
- many indicator/regime variants are guard-only, not standalone alphas;
- OI/liquidation forced-flow is genuinely interesting but current data is too coarse;
- HTF mechanisms are more promising than low-timeframe indicator tweaks.

Important status:

- no new paper candidates created directly from those sweeps except continuing already-known tracks;
- `promising_count=0`.

---

## 14. What has been rejected or downgraded

Rejected/downgraded:

- REST primary fill detection;
- raw directional trend/momentum in broad form;
- BTC lead-lag as standalone;
- failed-breakout family without new evidence;
- FADE child proliferation as rescue mechanism;
- SLIPCAP paper as decision-grade evidence;
- raw-long SOXL win as FADE proof;
- off-hours fade-short SOXL as unqualified live path;
- 20 fills per US session expectation.

Quarantined or waiting:

- HTF vol compression 4h alt: waiting for data;
- OI/liquidation forced-flow: needs finer data;
- AMBUSH: WAIT / passive;
- HL_CARRY: review 2026-07-30, no capital yet.

---

## 15. What we learned from recent negative/zero live tests

Recent live tests in FADE were mostly small negative or zero.

Interpretation:

- execution did not look like the main problem;
- slippage was often favorable;
- WS fill and flat safety worked;
- actual signal edge is unconfirmed.

Per-trade FADE US-hours trend observations:

- 2026-07-22:
  - SOXL LONG;
  - target;
  - about `+$0.2257`;
  - real win, but pre-v2 accounting and small N.
- 2026-07-23:
  - SOXL LONG;
  - stop;
  - about `-$0.0434`;
  - entered after strong move, market reversed.
- 2026-07-24:
  - SOXL LONG;
  - stop;
  - about `-$0.0688`;
  - price first moved up but failed to reach target, then reversed.
- 2026-07-24:
  - SOXL LONG;
  - max-hold;
  - near zero;
  - late-session chop.

Lesson:

- trend FADE currently appears low-WR / fat-tail;
- target wins may need more attempts;
- N=3 clean DC fills is not enough;
- do not conclude profitability or failure yet;
- continue only as bounded data collection if user explicitly approves.

---

## 16. Current roadmap

### 2026-07-26

Main lane:

- Active Market Event Reality Logger running for 24h.

Sanity check:

- process alive;
- events/orderbooks growing;
- outcomes eventually appearing;
- disk safe;
- no API/rate-limit issues;
- no order/key/coordinator changes.

### 2026-07-27

After logger finishes:

- run active market logger report;
- decide if a new mechanism becomes prereg/backtest candidate;
- if yes:
  - write prereg;
  - run backtest;
  - do not paper/live yet.

### Any US-hours window 13:30-20:00 UTC

Optional only by fresh go:

- FADE trend and pullback DC with `FADE_DECISION_TRACE=1`;
- goal: accumulate 20 clean fills across sessions;
- not a profitability run.

### 2026-07-30

HL_CARRY review:

- funding/custody/depth/peg;
- no capital unless all gates pass and explicit go.

### 2026-08-03/04 approximate

Paper factory 14-day checks:

- FADE/Pullback/VWAP/SOXL drift/HTF observers;
- do not promote from flagged small N.

### On/after 2026-08-21

HTF vol compression OB/slippage recheck.

---

## 17. Commands useful for next AI

Read-only status:

```bash
cd /opt/botalin-edge
git rev-parse --short HEAD
node scripts/live_runner_coordinator.mjs --status
node scripts/analysis/fade_dc_state_summary.mjs --json
pgrep -af 'active_market_event_logger|fade_tokenized_trend_edge_series_runner'
```

Active market logger report after 24h:

```bash
cd /opt/botalin-edge
sudo -u botalin node scripts/analysis/active_market_event_logger_report.mjs --run amel-1785062109514
```

FADE DC state update after sessions:

```bash
cd /opt/botalin-edge
sudo -u botalin node scripts/analysis/fade_dc_state_summary.mjs --write
```

FADE trace counterfactual report:

```bash
cd /opt/botalin-edge
sudo -u botalin node scripts/analysis/fade_decision_trace_counterfactual_report.mjs --run <run_id>
```

HTF vol compression recheck:

```bash
cd /opt/botalin-edge
sudo -u botalin node scripts/analysis/vol_compression_expansion_ob_universe_slippage.mjs
sudo -u botalin node scripts/analysis/vol_compression_expansion_watch_status.mjs
```

Never run live commands without fresh user `go`.

---

## 18. How to interpret future evidence

### Good evidence

- live fill with correct side;
- terminal flat;
- known slippage;
- strategy-resolved exit;
- trace of all rejected opportunities;
- matched controls;
- at-event orderbook execution;
- payer thesis;
- survives costs/slippage;
- not one-symbol/one-hour artifact;
- day-clustered forward evidence.

### Bad evidence

- paper PnL from synthetic fills;
- one target win;
- one-symbol pocket without payer;
- post-hoc best parameter;
- edge only before slippage;
- no matched controls;
- hidden overlap with existing family;
- changing filters after seeing losses without new RESET_TS.

---

## 19. Recommended next decisions

Immediate:

1. Do not interrupt `amel-1785062109514` unless it is failing or disk is unsafe.
2. Do a read-only logger sanity check.
3. After 24h, run report and classify new mechanisms.

Near-term:

1. Use FADE DC only as trace-rich data collection.
2. Keep HL_CARRY review on calendar.
3. Avoid creating more FADE variants until current DC evidence and active-market logger report are understood.
4. If active-market logger finds a new mechanism, write prereg/backtest before paper.

---

## 20. Final handoff warning

This project has many tempting green numbers. Most are not decision-grade.

The strongest discipline so far:

- live micro-tests tell truth cheaply;
- paper is hypothesis, not proof;
- every new child/version must have a structural reason;
- execution fixes are not alpha;
- small live PnL is not proof;
- the next AI should preserve the process, not chase the last green row.

