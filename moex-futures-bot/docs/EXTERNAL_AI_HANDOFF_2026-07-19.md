# MOEX Futures Bot Research Handoff For External AI

Generated: 2026-07-19

This document summarizes the local MOEX/Finam futures bot research project for
an external AI reviewer. It intentionally does not contain secrets, tokens, JWTs,
passwords, or account credentials.

## Objective

Build a safe research pipeline for MOEX futures trading ideas before any paper or
live trading:

- discover available commodity futures through Finam API;
- store local market data on the laptop;
- audit data quality;
- run baseline and walk-forward tests;
- keep live order code out of the project until a separate explicit go.

The current project is research/backtest only. No live order placement methods
exist.

## Project Location

```text
/Users/aleksandr/Documents/New project KAM/moex-futures-bot
```

Primary local data directory:

```text
/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data
```

The `data/`, `.env`, and `.venv/` contents are local and ignored by git.

## Safety Constraints

Hard constraints for future work:

- Do not print, read aloud, export, or include `.env` contents.
- Do not add live order placement methods until the user gives a separate,
  explicit go.
- Do not infer broker REST account id from the Finam UI demo id.
- Treat all positive backtest results as research evidence only.
- Require data audit, cost assumptions, walk-forward checks, liquidity review,
  and paper-mode validation before any strategy status can move forward.

Known account/API issue:

- Finam UI demo account shown earlier: `951464`.
- REST endpoint `/v1/accounts/951464` returned not found.
- Therefore API account id remains unresolved for any future order work.

## Environment

Python is used directly with a local virtual environment.

```bash
cd "/Users/aleksandr/Documents/New project KAM/moex-futures-bot"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Installed analytics dependencies:

- `duckdb`
- `pyarrow`
- `pytz`

## Source Structure

```text
src/moex_futures_bot/
  config.py               # .env loading and required env checks
  finam_client.py         # read-only Finam client: auth, assets, bars, orderbook, params
  instrument_registry.py  # commodity futures discovery and family classification
  storage.py              # local storage paths and safe partition names
  state_db.py             # SQLite schema and write helpers
  bars_store.py           # Finam bars normalization and JSONL partition writing
  backtest.py             # long/flat baseline backtest engine
  paper_engine.py         # paper fill simulation from order book snapshots
  risk_gate.py            # paper risk checks
  journal.py              # JSONL append-only event journal

tools/
  finam_probe.py               # read-only API probe
  init_storage.py              # creates local data directories and SQLite
  collect_bars.py              # reads Finam Bars API into JSONL partitions
  export_bars_parquet.py       # JSONL bars -> Parquet
  audit_bars.py                # DuckDB data audit report
  build_continuous_chains.py   # continuous family chains
  run_baselines.py             # baseline strategy tests
  run_walk_forward.py          # out-of-sample walk-forward checks
  paper_probe.py               # read-only orderbook + paper fill smoke test
  collect_moex_iss_history.py       # public MOEX ISS history for explicit SECID
  collect_moex_iss_params.py        # current MOEX ISS fees/tick params
  audit_moex_iss_history.py         # public ISS history audit
  audit_gldrubf_funding_impact.py   # provisional GLDRUBF SWAPRATE impact audit
  collect_moex_iss_asset_history.py # public ISS asset backfill, e.g. BR contracts
  build_moex_iss_continuous.py      # public ISS continuous futures chain
  audit_moex_iss_roll_gaps.py       # public ISS continuous roll-gap audit
  build_moex_iss_return_stitched.py # return-stitched chain without direct roll jumps
  collect_moex_iss_index_history.py # public ISS index history, e.g. RUSFAR
  audit_gldrubf_swaprate_vs_rusfar.py # GLDRUBF funding vs RUSFAR cross-check
  audit_finam_vs_moex_iss.py        # source cross-check: Finam daily bars vs ISS
  collect_moex_iss_candles.py       # public ISS futures intraday candles
  audit_finam_vs_moex_iss_candles.py # Finam daily close vs ISS last intraday candle
  run_brent_research_matrix.py      # return-stitched Brent cost/roll/holdout matrix
  write_candidate_review.py         # consolidated current candidate gate report
  check_paper_gate.py               # exits open only when candidate review says paper_candidate

docs/
  DATA_STORAGE_PLAN.md
  STRATEGY_RESEARCH_ADAPTATION.md
  EXTERNAL_AI_HANDOFF_2026-07-19.md
  ORDERBOOK_EXECUTION_PLAN.md
```

## Local Storage Layout

```text
data/
  market/
    finam/
      bars/              # raw JSONL daily partitions
      bars_parquet/      # compact per-symbol Parquet
      continuous_bars/   # family chains, Parquet
      orderbook/         # reserved for future order book snapshots
    moex_iss/
      history/           # public MOEX ISS futures history per security
      params/            # current ISS contract params and fees
      index_history/     # public ISS index history, e.g. RUSFAR
      continuous_bars/   # public ISS continuous futures chains
  bot_state.sqlite       # instruments, inventory, strategy runs, paper events
  research.duckdb        # DuckDB file with views for analysis
  paper_journal.jsonl    # append-only paper probe events
  reports/
    bars_audit_*.md
    continuous_chains_*.md
    backtests/*.md
```

Current inventory in SQLite:

```text
bars            jsonl    1609 rows/files
bars_parquet    parquet     5 files, 1609 rows
continuous_bars parquet     4 files, 2058 rows
moex_iss futures_history    51 files, includes 49 BR contracts plus GLDRUBF/GDU6
moex_iss continuous_bars     1 BR chain, 1233 rows
moex_iss return_stitched     1 BR chain, 1233 rows
moex_iss index_history       RUSFAR, 620 rows
candidate_review             latest report blocks paper mode
strategy_runs              updated by baseline and walk-forward runs
```

## Finam / Instrument Findings

Read-only discovery found these MOEX/RTSX commodity futures:

```text
Brent:
  BRQ6@RTSX  BR-8.26
  BRU6@RTSX  BR-9.26
  BRV6@RTSX  BR-10.26

Gold:
  GLDRUBF@RTSX
  GDU6@RTSX  GOLD-9.26
```

MOEX gas futures were not found in the current Finam demo asset list. NYMEX gas
symbols were visible, but they are outside the current MOEX research focus.

## Collected Daily Bars

Timeframe: `TIME_FRAME_D`

Latest audited dataset:

| symbol | rows | first | last | bad OHLC | bad range | zero volume | avg volume | median volume |
|---|---:|---|---|---:|---:|---:|---:|---:|
| BRQ6@RTSX | 189 | 2025-12-23 | 2026-07-19 | 0 | 0 | 0 | 63535.02 | 826.00 |
| BRU6@RTSX | 164 | 2026-01-27 | 2026-07-19 | 0 | 0 | 0 | 7179.85 | 574.00 |
| BRV6@RTSX | 142 | 2026-02-20 | 2026-07-19 | 0 | 0 | 0 | 732.54 | 378.50 |
| GDU6@RTSX | 274 | 2025-09-16 | 2026-07-19 | 0 | 0 | 0 | 15229.18 | 418.00 |
| GLDRUBF@RTSX | 840 | 2023-07-20 | 2026-07-19 | 0 | 0 | 0 | 268002.83 | 209496.50 |

Main interpretation:

- `GLDRUBF@RTSX` is currently the strongest single research object by history
  length and liquidity.
- Brent contracts are too short individually for strong conclusions.
- No broken OHLC ranges or zero-volume rows were detected in the current daily
  dataset.

Audit report:

```text
data/reports/bars_audit_20260719_200139.md
```

## Continuous Chains

Two chain methods exist:

- `volume_leader`: choose highest-volume contract per date.
- `sticky_volume_leader`: choose current source until a new contract has
  sustained volume leadership.

Current preferred method: `sticky_volume_leader`.

Current sticky chains:

| family | rows | period | rolls | source days |
|---|---:|---|---:|---|
| brent | 189 | 2025-12-23 to 2026-07-19 | 0 | BRQ6@RTSX: 189 |
| gold | 840 | 2023-07-20 to 2026-07-19 | 0 | GLDRUBF@RTSX: 840 |

Interpretation:

- Brent continuous chain is currently not a true long historical chain. It is
  effectively `BRQ6@RTSX` because available local history is short.
- Gold continuous chain is effectively `GLDRUBF@RTSX`.
- Chains are not back-adjusted. Roll gaps still need auditing before stronger
  strategy conclusions.

Latest chain report:

```text
data/reports/continuous_chains_20260719_203154.md
```

MOEX ISS Brent continuous chain, built from public ISS contract history:

```text
data/market/moex_iss/continuous_bars/method=sticky_volume_leader/assetcode=BR/price=settleprice/bars.parquet
```

Latest MOEX ISS chain report:

```text
data/reports/moex_iss_continuous_BR_20260719_211444.md
```

Latest MOEX ISS roll-gap audit:

```text
data/reports/moex_iss_roll_gaps_BR_20260719_211855.md
```

Return-stitched MOEX ISS chain:

```text
data/market/moex_iss/continuous_bars/method=sticky_volume_leader_return_stitched/assetcode=BR/price=settleprice/bars.parquet
```

Latest return-stitched chain report:

```text
data/reports/moex_iss_return_stitched_BR_20260719_212548.md
```

Current MOEX ISS Brent chain:

| symbol | rows | period | rolls | method | price |
|---|---:|---|---:|---|---|
| BR_continuous@MOEX_ISS | 1233 | 2021-09-01 to 2026-07-17 | 48 | sticky_volume_leader | settleprice |
| BR_return_stitched@MOEX_ISS | 1233 | 2021-09-01 to 2026-07-17 | 48 | sticky_volume_leader_return_stitched | settleprice |

The attempted public ISS backfill requested 2018-01-01 through 2026-07-19, but
the current liquidity/filter criteria produced the first usable BR chain date
as 2021-09-01. The chain is not back-adjusted. Roll-gap audit found 21 of 48
rolls above 3% absolute chain gap, with max absolute gap 16.33%.

The return-stitched chain calculates each daily return from the selected source
contract against the same source contract on the previous chain date when
available. It had 1 fallback day and should be used to falsify raw-chain
strategy candidates.

## Backtest Logic

The backtest engine is deliberately simple and conservative:

- daily bars only;
- long/flat only;
- no leverage;
- no shorting;
- signal is known after close;
- position exposure is applied to next close-to-close return;
- `cost_bps` is charged on every position change;
- results are research controls, not trade recommendations.

Baseline strategies:

```text
momentum_sma:
  long when fast SMA is above slow SMA

breakout_high_low:
  long after close breaks prior lookback high;
  exit after close breaks prior lookback low

mean_reversion_sma:
  long when close is below SMA by threshold percent
```

Baseline command:

```bash
.venv/bin/python tools/run_baselines.py --cost-bps 25
```

Continuous baseline command:

```bash
.venv/bin/python tools/run_baselines.py --dataset continuous --cost-bps 25
```

MOEX ISS continuous baseline with explicit exchange/broker fees:

```bash
.venv/bin/python tools/run_baselines.py \
  --dataset moex_iss_continuous \
  --cost-bps 0 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

In this mode, `cost_bps` is a separate spread/slippage reserve. The MOEX ISS
`BUYSELLFEE` and broker RUB fee are applied independently on position changes.

## Walk-Forward Logic

Walk-forward is required before any strategy can be considered for paper mode.

Process:

1. Split each symbol history into train/test windows.
2. Select parameters only on the train window.
3. Apply selected parameters to the following out-of-sample test window.
4. Record aggregate OOS metrics and verdict in SQLite.

Default strict walk-forward:

```bash
.venv/bin/python tools/run_walk_forward.py
```

Defaults:

```text
dataset: raw
cost_bps: 25
train_bars: 252
test_bars: 63
```

Continuous strict walk-forward:

```bash
.venv/bin/python tools/run_walk_forward.py --dataset continuous
```

Short contract walk-forward:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset continuous \
  --train-bars 80 \
  --test-bars 20 \
  --min-bars 120 \
  --cost-bps 25
```

MOEX ISS continuous walk-forward with explicit exchange/broker fees:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset moex_iss_continuous \
  --cost-bps 0 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

Use `--cost-bps 25` in addition to MOEX/broker fees as a pessimistic
spread/slippage stress test.

## Finam Strategy Findings

Baseline tests looked attractive for some Brent contracts and for gold, but
post-review walk-forward with buy-and-hold benchmark removed all positive
strategy verdicts.

Strict continuous OOS report:

```text
data/reports/backtests/walk_forward_continuous_20260719_203928.md
```

Strict continuous OOS results:

| symbol | strategy | folds | avg test % | avg B&H % | avg excess % | positive excess % | sign p | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| brent_continuous@FINAM | all baselines | 0 | - | - | - | - | - | no_full_oos_fold |
| gold_continuous@FINAM | breakout_high_low | 9 | 3.49 | 4.56 | -1.08 | 33.33 | 0.910 | oos_negative |
| gold_continuous@FINAM | mean_reversion_sma | 9 | 1.27 | 4.56 | -3.29 | 44.44 | 0.746 | oos_negative |
| gold_continuous@FINAM | momentum_sma | 9 | 3.32 | 4.56 | -1.24 | 33.33 | 0.910 | oos_negative |

Short continuous OOS report:

```text
data/reports/backtests/walk_forward_continuous_20260719_203932.md
```

Short continuous OOS results:

| symbol | strategy | folds | avg test % | avg B&H % | avg excess % | positive excess % | sign p | verdict |
|---|---|---:|---:|---:|---:|---:|---:|---|
| brent_continuous@FINAM | breakout_high_low | 5 | -2.20 | -5.07 | 2.87 | 100.00 | 0.031 | insufficient_evidence |
| brent_continuous@FINAM | mean_reversion_sma | 5 | -2.26 | -5.07 | 2.81 | 60.00 | 0.500 | insufficient_evidence |
| brent_continuous@FINAM | momentum_sma | 5 | -2.11 | -5.07 | 2.96 | 80.00 | 0.188 | insufficient_evidence |
| gold_continuous@FINAM | breakout_high_low | 38 | 0.65 | 1.14 | -0.49 | 52.63 | 0.436 | oos_negative |
| gold_continuous@FINAM | mean_reversion_sma | 38 | 0.14 | 1.14 | -1.00 | 42.11 | 0.872 | oos_negative |
| gold_continuous@FINAM | momentum_sma | 38 | 0.42 | 1.14 | -0.72 | 47.37 | 0.686 | oos_negative |

Interpretation:

- Gold has the only meaningful long-history OOS checks so far, but all tested
  strategies underperform buy-and-hold on average after the benchmark control.
- Brent has some positive excess-return hints in short windows, but only 5
  folds; this is insufficient evidence.
- No current strategy has a valid positive OOS verdict.
- No strategy should be promoted to paper mode yet without roll-gap audit,
  expanded data, GLDRUBF funding treatment, and execution realism checks.

## Important Commands

Initialize storage:

```bash
python3 tools/init_storage.py
```

Collect daily bars:

```bash
python3 tools/collect_bars.py
```

Export Parquet:

```bash
.venv/bin/python tools/export_bars_parquet.py
```

Audit bars:

```bash
.venv/bin/python tools/audit_bars.py
```

Build continuous chains:

```bash
.venv/bin/python tools/build_continuous_chains.py
```

Collect public MOEX ISS Brent history and build public continuous BR chain:

```bash
.venv/bin/python tools/collect_moex_iss_asset_history.py \
  --assetcode BR \
  --from-date 2018-01-01 \
  --till-date 2026-07-19 \
  --from-year 2018 \
  --limit 500 \
  --min-rows 20

.venv/bin/python tools/build_moex_iss_continuous.py \
  --assetcode BR \
  --method sticky_volume_leader \
  --price-field settleprice

.venv/bin/python tools/audit_moex_iss_roll_gaps.py \
  --assetcode BR \
  --method sticky_volume_leader \
  --price-field settleprice

.venv/bin/python tools/build_moex_iss_return_stitched.py \
  --assetcode BR \
  --source-method sticky_volume_leader \
  --output-method sticky_volume_leader_return_stitched \
  --price-field settleprice
```

Run raw baseline:

```bash
.venv/bin/python tools/run_baselines.py --cost-bps 25
```

Run continuous baseline:

```bash
.venv/bin/python tools/run_baselines.py --dataset continuous --cost-bps 25
```

Run strict continuous OOS:

```bash
.venv/bin/python tools/run_walk_forward.py --dataset continuous
```

Run short continuous OOS:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset continuous \
  --train-bars 80 \
  --test-bars 20 \
  --min-bars 120 \
  --cost-bps 25
```

Run MOEX ISS Brent commission-only OOS:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset moex_iss_continuous \
  --cost-bps 0 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

Run return-stitched MOEX ISS Brent commission-only OOS:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset moex_iss_continuous \
  --continuous-method sticky_volume_leader_return_stitched \
  --symbol BR_return_stitched@MOEX_ISS \
  --cost-bps 0 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

Run holdout-reserving Brent robustness matrix and write current candidate
review:

```bash
.venv/bin/python tools/run_brent_research_matrix.py
.venv/bin/python tools/write_candidate_review.py
.venv/bin/python tools/check_paper_gate.py
```

Run source and funding cross-checks:

```bash
.venv/bin/python tools/audit_finam_vs_moex_iss.py
.venv/bin/python tools/collect_moex_iss_candles.py \
  --from-date 2023-07-20 \
  --till-date 2026-07-19 \
  --interval 60
.venv/bin/python tools/audit_finam_vs_moex_iss_candles.py \
  --interval 60
.venv/bin/python tools/collect_moex_iss_index_history.py \
  --security RUSFAR \
  --board MMIX \
  --from-date 2024-01-01 \
  --till-date 2026-07-19
.venv/bin/python tools/audit_gldrubf_swaprate_vs_rusfar.py
```

Run MOEX ISS Brent OOS with extra 25 bps spread/slippage reserve:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset moex_iss_continuous \
  --cost-bps 25 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

Run paper probe:

```bash
python3 tools/paper_probe.py
```

Paper probe only reads order books and simulates paper fills. It has no live
order placement code.

## Known Limitations

- Current data is daily only.
- Finam Brent history is short; public MOEX ISS Brent chain currently starts at
  2021-09-01.
- Continuous chains are not back-adjusted.
- Finam `sticky_volume_leader` currently produces no rolls because local Finam
  data does not yet cover a real completed roll cycle.
- MOEX ISS Brent `sticky_volume_leader` produces 48 rolls; roll-gap audit found
  21 gaps above 3% absolute chain gap and max absolute gap 16.33%.
- Return-stitched Brent chain exists and removes direct roll jumps, but remains
  a research return series rather than a directly tradable price series.
- Finam vs MOEX ISS daily close convention is now mostly resolved: Finam daily
  close matches the last intraday MOEX ISS candle close, not ISS history
  `close`.
- Existing MOEX ISS `settleprice` continuous chains remain settlement-style
  research chains, not broker-close chains.
- GLDRUBF SWAPRATE vs RUSFAR cross-check does not confirm a simple one-to-one
  funding-rate interpretation yet.
- Execution modeling is still primitive: explicit exchange/broker fees exist,
  but intraday spread/slippage is not measured yet.
- No order book history has been collected yet.
- No formal contract multiplier / tick value / margin model has been wired into
  PnL.
- No live or broker-account order path exists.

## External Review Addendum

An external review flagged the following P0 methodology issues:

- GLDRUBF appears to have perpetual-futures funding/swap mechanics that are not
  modeled in the current returns.
- Gold strategy verdicts are therefore preliminary until funding is sourced and
  included.
- Walk-forward results must be compared with buy-and-hold on the same fold, not
  only against zero.
- More folds with weak results should dominate a smaller strict-window positive
  result.
- Finam daily bar session definition and close timestamp still need explicit
  verification.

Immediate code response:

- `tools/run_walk_forward.py` now calculates buy-and-hold benchmark return for
  each fold.
- Aggregate reports include average benchmark return, average excess return,
  positive excess fold percentage, worst excess fold, and one-sided sign-test
  p-value.
- `screening_pass` now requires at least 8 folds, positive average test return,
  positive average excess return, at least 60% positive excess folds, and
  sign-test p <= 0.25.
- `tools/run_walk_forward.py` now reports selected-parameter stability by
  strategy so fold-to-fold parameter churn is visible in the Markdown report.

Updated interpretation:

- No strategy is ready for paper mode.
- Any previous `oos_positive` should be read as stale/pre-benchmark evidence
  unless reproduced by the new report format.

Official references to verify GLDRUBF funding mechanics:

- MOEX GLDRUBF contract page:
  `https://www.moex.com/ru/contract.aspx?code=gldrubf`
- MOEX press release on GLDRUBF K1/K2 parameters for SwapRate funding:
  `https://www.moex.com/n73058`
- MOEX Plaza II/Spectra documentation: daily futures with automatic
  prolongation have a funding component published as `swap_rate`:
  `https://ftp.moex.com/pub/ClientsAPI/Spectra/Docs/p2gate_en.html`

MOEX ISS collection response:

- `tools/collect_moex_iss_history.py` collected public ISS history with
  `SWAPRATE`.
- Current file:
  `data/market/moex_iss/history/security=GLDRUBF/history.parquet`
- Current audit:
  `data/reports/moex_iss_history_audit_20260719_204405.md`
- GLDRUBF rows: 763 from 2023-07-20 to 2026-07-17.
- Nonzero `SWAPRATE` rows: 748 in the data audit.

Provisional funding-impact audit:

- Report:
  `data/reports/gldrubf_funding_impact_20260719_204436.md`
- Assumption: positive `SWAPRATE` is treated as a RUB-per-contract charge paid
  by a long GLDRUBF position.
- Close raw return over 2023-07-20 to 2026-07-17: 78.86%.
- Close funding-adjusted return under the provisional assumption: 0.60%.
- Settle raw return: 79.25%.
- Settle funding-adjusted return under the provisional assumption: 0.76%.
- Interpretation: GLDRUBF raw close-to-close strategy tests are not valid until
  funding-adjusted returns are integrated.

RUSFAR cross-check:

- RUSFAR collected from public MOEX ISS index history:
  `data/market/moex_iss/index_history/security=RUSFAR/history.parquet`
- RUSFAR rows: 620 from 2024-01-09 to 2026-07-17.
- Report:
  `data/reports/gldrubf_swaprate_vs_rusfar_20260719_213114.md`
- Matched GLDRUBF/RUSFAR days: 613 from 2024-01-09 to 2026-07-17.
- Average raw implied SWAPRATE annualized rate:
  28.67%.
- Average calendar-adjusted implied SWAPRATE annualized rate:
  24.85%.
- Average RUSFAR:
  17.37%.
- 5-day smoothed correlation:
  0.466.
- Interpretation: SWAPRATE behaves like an economically meaningful funding
  charge, but a simple `SWAPRATE / SETTLEPRICE` one-to-one RUSFAR interpretation
  is not confirmed. Exact contract-spec semantics remain unresolved.

Finam vs MOEX ISS source cross-check:

- Tool:
  `tools/audit_finam_vs_moex_iss.py`
- Report:
  `data/reports/finam_vs_moex_iss_20260719_212740.md`
- Joined by calendar date between local Finam daily bars and public ISS history.

| symbol | matched days | avg close diff % | max close diff % | close corr |
|---|---:|---:|---:|---:|
| GLDRUBF@RTSX | 763 | 0.2928 | 4.0305 | 0.999735 |
| BRQ6@RTSX | 140 | 0.3840 | 8.0347 | 0.997989 |
| BRU6@RTSX | 121 | 0.3712 | 8.7541 | 0.996199 |
| BRV6@RTSX | 103 | 0.3144 | 8.6957 | 0.992443 |
| GDU6@RTSX | 212 | 0.3109 | 5.5837 | 0.996586 |

First-pass interpretation: sources are highly correlated, but ISS history
`close` alone differs too much from Finam close to use as a broker-close
substitute.

Finam vs MOEX ISS intraday candle decision:

- Candle collector:
  `tools/collect_moex_iss_candles.py`
- Candle audit:
  `tools/audit_finam_vs_moex_iss_candles.py`
- Report:
  `data/reports/finam_vs_moex_iss_candles_20260719_225300.md`
- Data decision:
  `data/reports/data_decision_20260719_225300.md`

| symbol | matched days | avg Finam-vs-history close diff % | max history diff % | avg Finam-vs-last-candle diff % | max last-candle diff % | last-candle corr |
|---|---:|---:|---:|---:|---:|---:|
| GLDRUBF@RTSX | 763 | 0.2928 | 4.0305 | 0.001288 | 0.982981 | 0.999999 |
| BRQ6@RTSX | 140 | 0.3840 | 8.0347 | 0.000000 | 0.000000 | 1.000000 |
| BRU6@RTSX | 121 | 0.3712 | 8.7541 | 0.000000 | 0.000000 | 1.000000 |
| BRV6@RTSX | 103 | 0.3144 | 8.6957 | 0.000000 | 0.000000 | 1.000000 |
| GDU6@RTSX | 212 | 0.3109 | 5.5837 | 0.000000 | 0.000000 | 1.000000 |

Updated interpretation:

- Finam daily close is broker-facing last-trade close including late/evening
  trading.
- MOEX ISS history `close` / interval-24 candle `close` should not be mixed with
  Finam close-to-close strategy returns without explicit conversion.
- For broker-close strategy research, use Finam bars or aggregate ISS intraday
  candles to last candle close.
- For settlement/funding research, use ISS `settleprice`, `SWAPRATE`, and
  contract params.
- Next engineering implication: build a MOEX ISS last-trade continuous chain
  from intraday candles and re-run Brent checks there.

Commission model update:

- `tools/collect_moex_iss_params.py` collects current MOEX ISS contract
  parameters including `BUYSELLFEE`, `SCALPERFEE`, `MINSTEP`, and `STEPPRICE`.
- Current collected params:
  - GLDRUBF: `BUYSELLFEE=1.34`, `MINSTEP=0.1`, `STEPPRICE=0.1`
  - BRQ6: `BUYSELLFEE=8.99`, `MINSTEP=0.01`, `STEPPRICE=7.83987`
  - BRU6: `BUYSELLFEE=8.87`, `MINSTEP=0.01`, `STEPPRICE=7.83987`
  - BRV6: `BUYSELLFEE=8.75`, `MINSTEP=0.01`, `STEPPRICE=7.83987`
  - GDU6: `BUYSELLFEE=41.79`, `MINSTEP=0.1`, `STEPPRICE=7.83987`
- `tools/run_walk_forward.py --use-moex-iss-costs` now applies:
  - MOEX ISS `SWAPRATE` as provisional long-position funding;
  - MOEX ISS current `BUYSELLFEE` as exchange fee per position change;
  - configurable broker fee via `--broker-fee-rub-per-contract`.
- Current Finam broker-fee research assumption used in reports: `0.45`
  RUB/contract. This must be replaced with the actual account tariff before
  any paper/live decision.

Post-cost walk-forward reports:

- Strict:
  `data/reports/backtests/walk_forward_continuous_20260719_204907.md`
- Short:
  `data/reports/backtests/walk_forward_continuous_20260719_204911.md`

Post-cost interpretation:

- Strict `gold_continuous@FINAM`: all three baselines are `oos_negative`.
- Short `gold_continuous@FINAM`: all three baselines are `oos_negative`
  because average test return is negative even when excess over benchmark is
  positive.
- Brent has short-window excess-return hints, but only 5 folds and negative
  average test returns; verdict remains `insufficient_evidence`.
- No current strategy is eligible for paper mode.

## MOEX ISS Brent Backfill And Fee-Aware Findings

Public MOEX ISS backfill result:

- Asset: `BR`
- Requested period: 2018-01-01 through 2026-07-19.
- Usable collected BR contracts: 49.
- Usable BR daily rows: 9873 across individual contracts.
- Continuous chain rows: 1233.
- Continuous chain period: 2021-09-01 through 2026-07-17.
- Continuous chain rolls: 48.
- Latest chain report:
  `data/reports/moex_iss_continuous_BR_20260719_211444.md`
- Latest roll-gap audit:
  `data/reports/moex_iss_roll_gaps_BR_20260719_211855.md`
- Roll-gap audit result: 21 of 48 rolls exceed 3% absolute chain gap; max
  absolute chain gap is 16.33%.

Commission model now exists in both baseline and walk-forward runners:

- `--use-moex-iss-costs` reads current MOEX ISS params and applies
  `BUYSELLFEE` as exchange fee per position change.
- `--broker-fee-rub-per-contract` applies a configurable broker fee per
  position change.
- `cost_bps` remains a separate spread/slippage reserve.
- Current research broker-fee assumption: `0.45` RUB/contract.
- For `BR_continuous@MOEX_ISS`, the current fee lookup maps to `BRQ6` as a
  current-contract approximation. Historical BR fees may differ.

MOEX ISS Brent baseline, commission-only:

- Command:
  `.venv/bin/python tools/run_baselines.py --dataset moex_iss_continuous --cost-bps 0 --use-moex-iss-costs --broker-fee-rub-per-contract 0.45`
- Report:
  `data/reports/backtests/baseline_backtest_moex_iss_continuous_20260719_211603.md`

| symbol | strategy | bars | return % | max DD % | sharpe | trades |
|---|---|---:|---:|---:|---:|---:|
| BR_continuous@MOEX_ISS | breakout_high_low | 1233 | -26.22 | 53.67 | -0.08 | 29 |
| BR_continuous@MOEX_ISS | mean_reversion_sma | 1233 | 43.99 | 22.86 | 0.47 | 202 |
| BR_continuous@MOEX_ISS | momentum_sma | 1233 | 12.84 | 57.60 | 0.23 | 81 |

MOEX ISS Brent strict walk-forward, commission-only:

- Command:
  `.venv/bin/python tools/run_walk_forward.py --dataset moex_iss_continuous --cost-bps 0 --use-moex-iss-costs --broker-fee-rub-per-contract 0.45`
- Report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_212627.md`

| strategy | folds | avg test % | avg B&H % | avg excess % | positive excess % | sign p | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| breakout_high_low | 15 | -0.16 | 0.68 | -0.84 | 33.33 | 0.941 | oos_negative |
| mean_reversion_sma | 15 | 1.62 | 0.68 | 0.94 | 73.33 | 0.059 | screening_pass |
| momentum_sma | 15 | 0.66 | 0.68 | -0.02 | 46.67 | 0.696 | oos_negative |

MOEX ISS Brent short walk-forward, commission-only:

- Command:
  `.venv/bin/python tools/run_walk_forward.py --dataset moex_iss_continuous --train-bars 80 --test-bars 20 --min-bars 120 --cost-bps 0 --use-moex-iss-costs --broker-fee-rub-per-contract 0.45`
- Report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_211613.md`

| strategy | folds | avg test % | avg B&H % | avg excess % | positive excess % | sign p | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| breakout_high_low | 57 | 0.87 | 0.37 | 0.51 | 59.65 | 0.092 | oos_negative |
| mean_reversion_sma | 57 | 0.02 | 0.37 | -0.34 | 59.65 | 0.092 | oos_negative |
| momentum_sma | 57 | 0.23 | 0.37 | -0.14 | 54.39 | 0.298 | oos_negative |

MOEX ISS Brent stress test with 25 bps spread/slippage reserve plus exchange and
broker fees:

- Strict report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_211450.md`
- Short report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_211506.md`
- Strict 252/63: all three baselines are `oos_negative`.
- Short 80/20: `breakout_high_low` is `screening_pass`, but this conflicts with
  the commission-only short test and still lacks an order-book spread/slippage
  audit.

Return-stitched MOEX ISS Brent checks:

- Return-stitched chain report:
  `data/reports/moex_iss_return_stitched_BR_20260719_212548.md`
- Strict commission-only report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_212634.md`
- Short commission-only report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_212639.md`
- Strict 25 bps stress report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_212644.md`
- Short 25 bps stress report:
  `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_212648.md`

Return-stitched strict commission-only results:

| strategy | folds | avg test % | avg B&H % | avg excess % | positive excess % | sign p | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| breakout_high_low | 15 | 3.15 | 1.56 | 1.59 | 60.00 | 0.304 | oos_negative |
| mean_reversion_sma | 15 | 0.52 | 1.56 | -1.04 | 66.67 | 0.151 | oos_negative |
| momentum_sma | 15 | 2.82 | 1.56 | 1.26 | 53.33 | 0.500 | oos_negative |

Return-stitched short commission-only results:

| strategy | folds | avg test % | avg B&H % | avg excess % | positive excess % | sign p | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| breakout_high_low | 57 | 0.91 | 0.47 | 0.44 | 57.89 | 0.145 | oos_negative |
| mean_reversion_sma | 57 | 0.52 | 0.47 | 0.05 | 59.65 | 0.092 | oos_negative |
| momentum_sma | 57 | 0.17 | 0.47 | -0.29 | 49.12 | 0.604 | oos_negative |

Return-stitched 25 bps stress:

- Strict 252/63: all three baselines are `oos_negative`.
- Short 80/20: `breakout_high_low` is `screening_pass`, but strict window does
  not confirm it and the same cost-sensitivity warning remains.

Interpretation:

- The raw-chain `mean_reversion_sma` `screening_pass` did not survive
  return-stitched validation. Its avg excess changed from +0.94% to -1.04% in
  the strict commission-only test.
- This matches the falsifiable prediction that the raw mean-reversion signal was
  a roll-gap artifact.
- No Brent strategy is currently eligible for paper mode.
- The remaining short-window breakout `screening_pass` under 25 bps stress is
  unstable and contradicted by strict windows; treat it as a diagnostic oddity,
  not as a candidate.

Holdout-reserving robustness matrix:

- Matrix report:
  `data/reports/brent_research_matrix_20260719_215827.md`
- Candidate review:
  `data/reports/candidate_review_20260719_225454.md`
- Matrix setup:
  - `BR_return_stitched@MOEX_ISS`;
  - latest 252 bars excluded as untouched holdout;
  - broker fees: 0.45, 1.0, 2.0 RUB/contract;
  - cost reserves: 0, 10, 25, 50 bps;
  - roll-window exclusions: 0, 1, 2 bars;
  - strict 252/63 and short 80/20 windows.
- Matrix rows: 216.
- Failures: 0.
- Screening passes: 21.

Matrix interpretation:

- Strict mean-reversion passes only with roll-window 1/2 and low cost reserves
  0/10 bps; it fails at 25/50 bps.
- Short breakout passes only with roll-window 0; it disappears when roll windows
  are excluded.
- No strategy survives strict/short windows, cost stress, and roll-window
  exclusion together.
- Candidate review verdict: `no_paper_candidate`.
- Orderbook/execution research remains gated by
  `docs/ORDERBOOK_EXECUTION_PLAN.md`.

## Recommended Next Plan

Priority 0: GLDRUBF funding and benchmark controls

- Confirm exact GLDRUBF PnL formula and whether MOEX ISS `SWAPRATE` can be used
  directly as the per-contract funding charge.
- Treat the current SWAPRATE/RUSFAR result as non-confirming for the simple
  one-to-one formula; contract-spec verification is required before GLDRUBF
  backtests are trusted.
- Confirm the actual Finam tariff for the connected account and replace the
  provisional broker-fee assumption.
- Keep buy-and-hold excess-return benchmarks in every walk-forward report.
- Mark all GLDRUBF OOS results as preliminary until funding is modeled.

Priority 1: MOEX ISS backfill and roll/chain quality

- Roll-gap audit exists for MOEX ISS BR; expand it to all continuous chains.
- Use the existing close-to-close jump measurements to decide whether raw chain
  returns are usable.
- Implement optional back-adjusted returns chain.
- Keep raw and adjusted chain outputs separate.
- Treat the current Brent chain as 2021-09-01 onward, not a full 2018 chain,
  unless a looser/manual contract-discovery process finds older usable rows.
- Validate whether `sticky_volume_leader` creates realistic BR roll timing.

Priority 1A: Brent candidate falsification

- Treat `BR_continuous@MOEX_ISS` / `mean_reversion_sma` from the raw strict
  commission-only report as falsified by return-stitched validation.
- Robustness matrix exists and currently blocks all candidates.
- Require any future candidate to pass on return-stitched/back-adjusted data
  before treating raw-chain results as meaningful.
- Require any future candidate to survive pessimistic cost assumptions before
  paper mode is considered.

Priority 2: contract metadata

- Pull and store contract params from Finam where possible.
- Add tick size, lot size, price step, multiplier, expiration notes.
- Convert percent returns into realistic RUB/contract PnL.

Priority 3: execution realism

- Do not start orderbook snapshot collection while candidate review says
  `no_paper_candidate`.
- Use `docs/ORDERBOOK_EXECUTION_PLAN.md` once a frozen `paper_candidate` exists.
- Planned scope after gate opens: candidate symbol only, Finam read-only
  orderbook, top 5 or top 10 depth, no faster than every 5 seconds.
- Estimate spread, slippage, top-of-book depth, and no-trade constraints.

Priority 4: stronger research gates

- Add trade-level logs for backtests.
- Add train/test per-fold detail exports.
- Add robustness sweeps across cost assumptions.
- Add no-trade filters for low volume / high spread / roll windows.
- Add preregistered strategy-family definitions and reserve the last ~12 months
  as a one-shot holdout for any final candidate.
- Rename any future positive OOS-style label to `screening_pass`; paper mode
  requires a separate final gate.

Priority 5: paper mode only after evidence improves

- Pick one candidate only if it passes:
  - clean data audit;
  - roll audit;
  - positive OOS with enough folds;
  - pessimistic cost assumptions;
  - order book liquidity review;
  - explicit paper-mode acceptance.

Live trading remains out of scope until the user separately authorizes it and
the REST account id is verified.
