# Botalin Edge — context transfer / branch handoff

Дата среза: 2026-07-23.  
Цель: сохранить контекст текущей ветки/линии работы перед переездом в другую ветку или передачей другому ИИ.  
Репозиторий на сервере: `/opt/botalin-edge`, текущая ветка на момент среза: `main`.

## 0. Executive Summary

1. **Live сейчас не крутится.**
   - `fade_tokenized_trend_edge_series_runner.mjs` процессов нет.
   - Coordinator: `enabled:false`.
   - `LIVE_COORDINATOR_GO` в `/etc/botalin.env` отсутствует.
   - Последние live-серии завершены, аккаунт был подтвержден FLAT в post-series проверках.

2. **FADE execution-задача закрыта, alpha не подтверждена.**
   - Market entry, WS fill, directional slippage, R:R floor, coordinator lease, terminal flat работают.
   - FADE US-hours v2 дал 2 clean fills, оба stop, net около `-$0.142`.
   - v1+v2 live LONG: 3 наблюдения = 1 target / 2 stop, net около `+$0.084`, это статистический шум.
   - Signal diagnosis показал: FADE tokenized trend = low-WR / fat-tail профиль, v3 trend-gate НЕ оправдан.

3. **Если продолжать FADE live, это только data-collection, не “рабочая стратегия”.**
   - Нужны примерно 20-30 clean fills, чтобы проверить fat-tail.
   - Цель оператора сформулирована так: “заработать и купить правду дешево”, то есть микросайз должен позволять заработать, если edge есть, но ограничить цену ошибки.

4. **Paper factory работает и никого не промоутит.**
   - Последний статус: `2026-07-23T15:18:29.584Z`.
   - `promising_count=0`.
   - `candidate_miner`: `enabled:true`, `mode:draft_only`, `draft_count=0`.

5. **Failed Breakout downgraded.**
   - At-event slippage оказался не убийцей.
   - Но свежий recompute на 2026-07-15..22 дал отрицательный gross/net.
   - Paper launch НЕ делать на текущем evidence.

6. **HL_CARRY остается cash-path #1, но требует readiness.**
   - 07-30 review остается важным.
   - Funding должен восстановиться.
   - Custody monitor обязателен до pilot capital.
   - Custody-tail keyless полностью не мониторится, только прокси.

## 1. Жесткие правила, которые нельзя потерять при переезде

### Live

- Без свежего явного go от оператора нельзя запускать live.
- Нельзя создавать approval-файлы заранее.
- Нельзя включать coordinator без отдельного go.
- Нельзя трогать KILL без аварийной причины.
- Нельзя менять caps “по ходу”.
- Нельзя автоматический второй batch.
- Нельзя назвать стратегию прибыльной по малому N.
- Любой live runner должен быть bounded и иметь terminal flat + independent flat verify.

### Research / paper

- Любое изменение правил = новый `model_id` + новый `RESET_TS`.
- Parent-модели не спасаются детьми задним числом.
- In-sample = гипотеза, не доказательство.
- `promising_count` должен оставаться 0 до evidence-bar.
- SLIPCAP paper-children не decision-grade, потому что shadow slippage synthetic/zero.
- Candidate miner только draft-only.

### Методология

- Live balance = reality sensor, not capital sizing.
- Главная метрика live-tests: edge retention paper -> live, а не абсолютный PnL на тестовом балансе.
- После первой реально подтвержденной live-money стратегии нужен отдельный Live Strategy Lifecycle Controller:
  - GO -> bounded run -> report -> decision -> next GO;
  - no silent auto-scale;
  - daily/weekly review;
  - pause/restart protocol.

## 2. Текущий серверный срез

Последняя read-only проверка перед созданием файла:

- Branch: `main`.
- HEAD: `6b7a07f docs: FADE tokenized-trend signal diagnosis — v3 NOT justified (read-only)`.
- Coordinator config: `enabled:false`.
- Live edge runner PIDs: none.
- `/etc/botalin.env`: `LIVE_COORDINATOR_GO` отсутствует.
- Paper factory:
  - `ts`: `2026-07-23T15:18:29.584Z`
  - tally: `generated=13`, `paper_active=7`, `needs_data=2`, `guard=2`, `rejected=1`, `killed=1`
  - `promising_count=0`

## 3. Последние важные коммиты этой линии

- `6b7a07f` — FADE signal diagnosis, v3 NOT justified, read-only.
- `322be16` — FADE v2 post-series, execution solved, alpha NOT confirmed.
- `0cd128a` — FADE v2 runner code for (a/b/c/d), env-gated, launch deploy.
- `b30da60` — graphify refresh report + manifest to HEAD.
- `75e5c8d` — graphify refresh graph artifacts to HEAD.
- `8b33e2e` — HL_CARRY custody monitor, keyless/read-only/fail-closed.
- `5e954ac` — Failed Breakout at-event slippage + fresh recompute -> downgrade.
- `5400be8` — micro-series real-path live-code review/gate, NO-GO.
- `2f1b887` — gitignore runtime state + drop `.bak` backups.
- `ab48404` — park micro-series real-path off main in branch `micro-series-real-path`.
- `4d5648c` — private WS fill-feed keepalive 20s ping.
- `bd7482f` — FADE v2 prereg add R:R floor.
- `a1da54d` — FADE US-hours v2 prereg.
- `27f6bcd` — FADE US-hours v1 market-entry post-series review.
- `0a372ad` — HTF MA-distance paper observer launched paper-only.
- `ea1e70f` — graphify repo map + architecture index.
- `ffc7f8a` — Failed Breakout v0 prereg/backtest/go-nogo.
- `0ea318c` — EDGE_ATLAS_v2 universe-wide discovery.

## 4. FADE live saga: what happened

### 4.1 Execution bugs found and fixed

1. `Qty invalid` on Bybit:
   - cause: fixed 6 decimals, no `qtyStep`;
   - fix: fetch instrument filter, align qty/price to step/tick, minNotional/cap checks.

2. IOC fill hidden from `/order/realtime`:
   - cause: filled IOC leaves active orders, executor thought no-fill;
   - fix: position-based detection and terminal flat guard.

3. REST readback lag:
   - observed lag 9-63 sec on position/execution endpoints;
   - conclusion: REST cannot be primary fill source;
   - fix: private WS execution feed.

4. Position orphan risk:
   - external delayed flat verify saved several times;
   - terminalFlat + external flat verify remain mandatory.

5. Side/geometry mismatch:
   - raw `Buy` could mean economic SHORT in FADE;
   - fix: resolve economic side from levels geometry.

6. Limit IOC no-fill:
   - marketable/market entry added behind config.

7. v1 slippage safety wrong:
   - magnitude-based cap stopped on favorable fill;
   - v2 changed to directional adverse-only slippage.

### 4.2 FADE US-hours v1 market-entry

Document: `reference/FADE_US_HOURS_MARKET_ENTRY_POST_SERIES_2026-07-23.md`.

Result:

- run_id: `edge-1784707827605`.
- One fill only.
- SOXL LONG, market entry, WS fill.
- Exit: `strategy_exit:target`.
- Net PnL: `+$0.2257`.
- Slippage vs marketable: `-12.1 bps` favorable.
- Series stopped early because old slippage rule counted favorable magnitude as safety breach.
- Verdict: mechanics promising, not alpha proof.

Important correction:

- It did NOT end by normal 20:00 wall-clock.
- It ended immediately after first trade because of `slippage_exceeds_threshold`.

### 4.3 FADE US-hours v2

Documents:

- `reference/FADE_TOKENIZED_TREND_US_HOURS_V2_PREREG.md`
- `reference/FADE_US_HOURS_V2_POST_SERIES_2026-07-23.md`

v2 changes:

- (a) directional slippage safety: stop only on adverse slippage.
- (b) cap 18 bps.
- (c) explicit signal freshness measurement, max age 30 min.
- (d) remaining R:R floor >= 1.0 before entry.

Result:

- run_id: `edge-1784812318873`.
- decision: `EDGE_NOT_SURVIVING_EXECUTION`.
- stopped_reason: `two_filled_losses`.
- 2/5 filled.
- series PnL: about `-$0.1422`.
- final flat true.

Trades:

| # | Side | Entry | R:R | Slippage vs signal | Slippage vs marketable | Exit | PnL |
|---|---|---:|---:|---:|---:|---|---:|
| 0 | LONG | 161.32 | 2.61 | -38.29 bps | -29.67 bps favorable | stop | -$0.0715 |
| 1 | LONG | 160.17 | 2.97 | -53.41 bps | -1.25 bps favorable | stop | -$0.0707 |

Read:

- Execution solved: market fill 2/2, directional slippage works, R:R floor active, flat clean.
- Alpha not confirmed: both LONGs stopped in ~94 sec even with favorable fills and healthy R:R.
- Problem moved from execution to signal/profile.

### 4.4 FADE signal diagnosis

Document: `reference/FADE_TREND_SIGNAL_DIAGNOSIS_2026-07-23.md`.

Question:

- Should we build v3 trend/regime gate, e.g. do not fade LONG when 1h SOXL trend is down?

Data:

- 638 `fade:*:trend` rows on SOXL/LAB.
- US-hours sample: 106 rows.

Findings:

- US-hours all: net about `+0.79%/trade`, WR about `18.9%`.
- HTF trend split:
  - UP: n=38, net `+0.66`, WR `26.3%`.
  - DOWN: n=30, net `+0.90`, WR `20.0%`.
- Trend-gate hypothesis refuted: DOWN pocket is not worse; it is slightly better in shadow.
- No v3 prereg written.

Conclusion:

- FADE trend is likely low-WR / fat-tail.
- Two v2 stops are expected variance, not sufficient proof of failure.
- To test honestly needs about 20-30 clean live fills.
- Or deprioritize as slow/capital-inefficient relative to HL_CARRY / other paths.

## 5. Proposed FADE continuation: data collection, not deployment

The operator corrected the framing:

> Not just “buy truth cheaply”, but “earn and buy truth cheaply”.

Therefore the correct framing for future FADE is:

- It can try to earn.
- But position size and stops must make the main risk “cost of information”, not capital damage.
- This is not a production bot.

Potential next doc/task already formulated:

- `FADE_V2_LIVE_DATA_COLLECTION_CASH_AWARE_PLAN_2026-07-23.md`
- target: 20 clean fills.
- checkpoints every 5 fills.
- still micro-size.
- no auto-scale.
- if positive after 20, review, not automatic live bot.

Clean fill definition:

- market/WS fill;
- no anomaly;
- adverse slippage <= 18 bps;
- R:R >= 1.0;
- strategy exit;
- terminal flat confirmed.

Before any launch:

- write/commit plan;
- explicit operator go;
- clean tree;
- coordinator one-shot approval preferred;
- account flat;
- TG enabled.

## 6. Paper factory state

Current paper candidates:

| Candidate | Status | Current evidence | Notes |
|---|---|---|---|
| `FADE_TOKENIZED_PULLBACK` | paper_active | N=44, days=4, net_taker +0.4205 | flags: one-symbol pocket, side inconsistent |
| `FADE_TOKENIZED_PULLBACK_US_HOURS_v1` | paper_active | N=2, days=1, net_taker +1.3073 | too early, LOW_N |
| `FADE_TOKENIZED_VWAP` | paper_active | N=314, days=4, net_taker +0.3012 | flags: side inconsistent, slippage risk |
| `FADE_TOKENIZED_VWAP_SLIPCAP_v1` | paper_active | N=1, days=1, blocked=true | paper slippage synthetic; not decision-grade |
| `FADE_TOKENIZED_TREND_SLIPCAP_v1` | killed | - | blocked/slippage issue |
| `SOXL_OFFHOURS_DRIFT_LONG_v1` | paper_active | N=49, days=3, net_taker -0.1343, WR 53.1 | promotion blocked; must beat BTC/passive benchmark |
| `HTF_MA_DISTANCE_REVERSION_US_HOURS_v0` | paper_active | N=27, days=1 | promotion blocked, needs 14d/N>=300/benchmark |
| `BYBIT_CARRY_SNX_GRT_WATCH` | paper_active | days=12 | funding watch, not live |
| `AMBUSH_B_OB_GATED` | needs_data | - | OB ok, payoff weak/gaps |
| `HURST_GATED_FADE_TREND_v1` | needs_data | - | waits FADE-8 |
| `FUND_EXTREME_FADE` | rejected | - | duplicate/protected overlap |
| `ORACLE_VOL_GUARD` | guard | - | overlay only |
| `OI_PRICE_DIVERGENCE_VOL_GUARD` | guard | - | overlay only |

No candidate is promising. `promising_count=0`.

## 7. Failed Breakout

Documents:

- `reference/FAILED_BREAKOUT_REVERSAL_US_HOURS_V0_PREREG.md`
- `reference/FAILED_BREAKOUT_REVERSAL_US_HOURS_V0_BACKTEST_REVIEW.md`
- `reference/FAILED_BREAKOUT_REVERSAL_US_HOURS_V0_GO_NOGO.md`
- `reference/FAILED_BREAKOUT_AT_EVENT_SLIPPAGE_2026-07-23.md`

Original idea:

- US-hours failed breakout reversal.
- 15m bar makes new 20-bar high, closes back below prior high.
- SHORT at close.
- 18 liquid symbols.

At-event slippage study:

- Fresh keyless 15m klines recomputed for 2026-07-15..22.
- 104 US-hours events, 87 matched to OB snapshots.
- At-event spread benign:
  - median 1.16 bps;
  - p75 1.39;
  - p90 5.63.

But fresh performance:

- gross mean `-0.082%`;
- after costs net about `-0.20%` to `-0.30%`.

Conclusion:

- Slippage is not the killer.
- Edge does not survive fresh data.
- Downgrade: suspicious overfit / NEEDS_DATA-negative.
- Do not launch paper observer on current evidence.

## 8. HTF MA Distance

Documents:

- `reference/HTF_EDGE_ATLAS_V1_REPORT_2026-07-22.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_PREREG.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_BACKTEST_REVIEW.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_GO_NOGO.md`
- `reference/HTF_MA_DISTANCE_REVERSION_US_HOURS_V0_PAPER_EVALUATOR_REVIEW_2026-07-22.md`
- `reference/HTF_LAUNCH_SUMMARY_2026-07-22.md`

Backtest/discovery:

- 1h MA-distance reversion.
- US-hours.
- Large universe, 30d.
- Looked strong in discovery: about `+0.876%` average net after cost, WR about 66%.

Paper observer:

- Launched paper-only via keyless public 1h klines.
- First fresh sanity on liquid current universe was negative.
- Current paper status: N=27, days=1, NEEDS_DATA.

Conclusion:

- Keep observing.
- Do not promote.
- Needs 14 day-clustered days, N>=300, benchmark pass.

## 9. HL_CARRY

Documents:

- `reference/HL_CARRY_2026-07-30_DECISION_PACK.md`
- `reference/HL_CARRY_2026-07-30_READINESS_RUNBOOK.md`
- `reference/HL_CARRY_CUSTODY_MONITOR_SPEC_2026-07-22.md`
- `reference/HL_CARRY_CUSTODY_MONITOR_LAUNCH_PLAN.md`
- `reference/HL_CARRY_SIZING_RULE_2026-07-22.md`
- `reference/HL_CARRY_NEAR_TERM_ACTIONS_2026-07-22.md`

Status:

- Main cash-path.
- 07-30 review target.
- WAIT-leaning until funding recovers and custody/depth gates pass.

Important:

- Custody-tail cannot be fully monitored keyless.
- Custody monitor can only provide proxies:
  - peg deviation;
  - supply drop;
  - oracle/mark divergence;
  - uBTC depth/spread;
  - HL API degradation.
- GREEN means “no adverse proxy signal”, not “custody is safe”.

Sizing rule:

- Satellite size about `$200`.
- `L <= 2`.
- No `L >= 3`.
- Operator must explicitly accept custody-tail before capital.

## 10. AMBUSH / scalping / other parked work

### AMBUSH_B

Document: `reference/AMBUSH_OB_REPORT_2026-07-22.md`.

- OB data sufficient.
- Execution capacity not main blocker.
- Carry/funding cohort not paying.
- Status: WAIT / PASSIVE, no paper/live promotion.

### FADE_SCALPING_ADAPTIVE_GUARD_v1

Documents:

- `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_PREREG.md`
- `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_BACKTEST_REVIEW.md`
- `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_GO_NOGO.md`

Status:

- Draft only.
- Thin lift, likely slippage-sensitive.
- Not launched, no RESET_TS.

### Micro-series real-path

- Branch: `micro-series-real-path`.
- Commit: `062b569`.
- Not on main.
- Live-capable code; needs own review/prereg before any use.
- Main has `QUEUE.md` note.

## 11. Graphify / architecture map

Artifacts:

- `/opt/botalin-edge/reference/graphify/2026-07-22/graph.html`
- `/opt/botalin-edge/reference/graphify/2026-07-22/graph.json`
- `reference/graphify/2026-07-22/GRAPH_REPORT.md`
- `reference/graphify/2026-07-22/ARCHITECTURE_INDEX_2026-07-22.md`

Purpose:

- onboarding map for another AI;
- identify live-critical blast radius;
- separate paper factory / live execution / coordinator / signals.

Core subsystems:

1. signals/shadow;
2. live executor;
3. coordinator/leases;
4. paper factory;
5. shared atomic/RESET_TS infra.

## 12. What to do next

### Best immediate tasks

1. **Create FADE v2 cash-aware live data-collection plan.**
   - No launch.
   - 20 clean fills target.
   - Explicit goal: earn if edge exists, but buy truth cheaply if not.
   - Need rolling risk design that is compatible with low-WR/fat-tail.

2. **Keep paper factory running.**
   - Watch HTF and FADE paper candidates.
   - No promotion before evidence-bar.

3. **HL_CARRY readiness.**
   - Implement/launch custody monitor only by explicit go.
   - Prepare 07-30 decision.

4. **Do not pursue Failed Breakout paper right now.**
   - Fresh data negative.
   - Only revisit if new fresh window shows edge reappear.

5. **Do not build FADE v3 trend filter.**
   - Diagnosis refuted that gate.
   - Future signal change needs a new causal hypothesis, not reaction to 2 losses.

### If operator says “go live FADE data collection”

Before launch:

- ensure code tree clean or staged only intended files;
- confirm account FLAT;
- confirm no live runner;
- coordinator `enabled:false` before start;
- create one-shot approval or consume approval file;
- set `LIVE_COORDINATOR_GO=OPERATOR_APPROVED` only for launch;
- start only in US-hours if that is part of the plan;
- after run, restore coordinator disabled;
- post-series report.

## 13. Files to copy/read first in a new branch

Start here:

- `reference/FADE_US_HOURS_V2_POST_SERIES_2026-07-23.md`
- `reference/FADE_TREND_SIGNAL_DIAGNOSIS_2026-07-23.md`
- `reference/FADE_TOKENIZED_TREND_US_HOURS_V2_PREREG.md`
- `reference/FAILED_BREAKOUT_AT_EVENT_SLIPPAGE_2026-07-23.md`
- `reference/HTF_LAUNCH_SUMMARY_2026-07-22.md`
- `reference/HL_CARRY_CUSTODY_MONITOR_LAUNCH_PLAN.md`
- `reference/PROCESS_GOVERNANCE_REPAIR_SUMMARY_2026-07-22.md`
- `reference/graphify/2026-07-22/ARCHITECTURE_INDEX_2026-07-22.md`
- `QUEUE.md`

## 14. Final state label

Current project label:

**Execution factory mature; FADE execution solved; FADE alpha unresolved; paper factory active; HL_CARRY still cash-path #1; no live process currently active; promising_count=0.**

