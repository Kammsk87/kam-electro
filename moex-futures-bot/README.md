# MOEX Futures Bot Probe

Safe local probe for the Finam Trade API demo account.

It does not place orders. It only:

- exchanges your Finam secret token for a temporary JWT;
- checks the configured account;
- loads available assets;
- searches for commodity futures candidates: `BR`, `BRM`, `GL`, `GLDRUBF`, `GOLD`, `NG`, `NGM`, `TTF`.

## Setup

```bash
cd "/Users/aleksandr/Documents/New project KAM/moex-futures-bot"
cp .env.example .env
```

Open `.env` locally and paste the token you saved from Finam:

```text
FINAM_SECRET_TOKEN=...
FINAM_ACCOUNT_ID=951464
```

## Run

```bash
python3 tools/finam_probe.py
```

The script redacts token-like values from output.

The Finam UI demo id can differ from the REST account id. Keep order work disabled
until the API account id is verified separately.

## Local Storage

Initialize local storage on this laptop:

```bash
python3 tools/init_storage.py
```

The default storage root is:

```text
/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/
```

Layout:

- `data/market/finam/bars/` - historical bars, planned Parquet partitions;
- `data/market/finam/orderbook/` - order book snapshots, planned Parquet partitions;
- `data/bot_state.sqlite` - local SQLite state for instruments, datasets, strategy runs, and paper events;
- `data/research.duckdb` - planned DuckDB analytics file after installing `requirements.txt`;
- `data/paper_journal.jsonl` - append-only paper decision/fill journal.

The `data/` contents stay local and are ignored by git.

## Historical Bars

Collect daily bars for discovered Brent and gold futures:

```bash
python3 tools/collect_bars.py
```

Useful smoke test:

```bash
python3 tools/collect_bars.py --days 30 --limit-symbols 1
```

The collector:

- authenticates with Finam;
- discovers MOEX/RTSX Brent and gold futures;
- calls the read-only `Bars` market-data endpoint;
- writes partitioned JSONL files under `data/market/finam/bars/`;
- records collected spans in `data/bot_state.sqlite`.

Default lookback is 3 calendar years with `TIME_FRAME_D`. Minute data should be
collected deliberately with a smaller window first. Long ranges are split into
30-day Finam API request chunks by default.

## Parquet And Audit

Create a local virtual environment and install analytics dependencies:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Export collected JSONL bars to compact Parquet:

```bash
.venv/bin/python tools/export_bars_parquet.py
```

Build/query `data/research.duckdb` and generate a data-quality report:

```bash
.venv/bin/python tools/audit_bars.py
```

The audit checks coverage, invalid OHLC ranges, non-positive prices, zero volume,
and rough liquidity by volume. Reports are written under `data/reports/`.

Build continuous research chains by family:

```bash
.venv/bin/python tools/build_continuous_chains.py
```

Current method is `volume_leader`: for each date, pick the highest-volume source
contract inside the family. The output is not back-adjusted, so roll jumps must
be reviewed before serious strategy verdicts.

Backfill public MOEX ISS Brent futures history and build a longer MOEX ISS
continuous chain:

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

.venv/bin/python tools/run_brent_research_matrix.py
.venv/bin/python tools/write_candidate_review.py
.venv/bin/python tools/check_paper_gate.py
```

The current local MOEX ISS Brent chain starts on 2021-09-01. The 2018 request
did not produce older liquid BR rows under the current filter. The current
roll-gap audit found large discontinuities, so strategy results on this raw
chain must be treated as preliminary until a roll-adjusted chain exists.

Collect public MOEX ISS futures history, including `SWAPRATE` where MOEX
publishes it:

```bash
.venv/bin/python tools/collect_moex_iss_history.py --security GLDRUBF
```

This is the preferred starting point for GLDRUBF funding research.

Audit provisional GLDRUBF funding impact:

```bash
.venv/bin/python tools/audit_moex_iss_history.py
.venv/bin/python tools/audit_gldrubf_funding_impact.py
.venv/bin/python tools/collect_moex_iss_index_history.py \
  --security RUSFAR \
  --board MMIX \
  --from-date 2024-01-01 \
  --till-date 2026-07-19
.venv/bin/python tools/audit_gldrubf_swaprate_vs_rusfar.py
.venv/bin/python tools/audit_finam_vs_moex_iss.py
.venv/bin/python tools/collect_moex_iss_candles.py \
  --from-date 2023-07-20 \
  --till-date 2026-07-19 \
  --interval 60
.venv/bin/python tools/audit_finam_vs_moex_iss_candles.py \
  --interval 60
```

The funding-impact audit is deliberately marked provisional until contract PnL
formula details are verified.

Current data decision:

- Finam daily close matches MOEX ISS last intraday candle close, not ISS history
  `close`.
- Use Finam bars or ISS intraday-last bars for broker-close strategy tests.
- Use ISS `settleprice` and `SWAPRATE` for settlement/funding research.

Collect current MOEX ISS contract params, including `BUYSELLFEE`, `MINSTEP`, and
`STEPPRICE`:

```bash
.venv/bin/python tools/collect_moex_iss_params.py
```

## Baseline Backtests

Run simple daily baseline strategies:

```bash
.venv/bin/python tools/run_baselines.py
```

For continuous family chains:

```bash
.venv/bin/python tools/run_baselines.py --dataset continuous
```

For the MOEX ISS Brent continuous chain with explicit exchange and broker fees:

```bash
.venv/bin/python tools/run_baselines.py \
  --dataset moex_iss_continuous \
  --cost-bps 0 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

Included baselines:

- `momentum_sma`: long when SMA 5 is above SMA 20;
- `breakout_high_low`: long after a 20-day close breakout, exit on 20-day low break;
- `mean_reversion_sma`: long when close is at least 1% below SMA 10.

The runner is long/flat only, applies signal on the next daily close-to-close
return, charges `--cost-bps` on every position change, optionally applies MOEX
ISS `BUYSELLFEE` plus broker RUB fee on position changes, writes reports to
`data/reports/backtests/`, and records runs in `data/bot_state.sqlite`.

Use holdout and roll-window filters during robustness checks:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset moex_iss_continuous \
  --continuous-method sticky_volume_leader_return_stitched \
  --symbol BR_return_stitched@MOEX_ISS \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45 \
  --exclude-last-bars 252 \
  --exclude-roll-window-bars 1
```

`screening_pass` is not paper-mode permission. The current candidate review
blocks paper mode because no strategy survives strict/short windows, cost
stress, and roll-window exclusion together.

Run walk-forward out-of-sample checks:

```bash
.venv/bin/python tools/run_walk_forward.py
```

For continuous family chains:

```bash
.venv/bin/python tools/run_walk_forward.py --dataset continuous
```

The walk-forward runner selects baseline parameters on each train window and
then applies them to the following test window. Defaults are conservative for
the current daily dataset: `--cost-bps 25 --train-bars 252 --test-bars 63`.

With MOEX ISS funding/fees and an explicit broker-fee assumption:

```bash
.venv/bin/python tools/run_walk_forward.py \
  --dataset moex_iss_continuous \
  --cost-bps 0 \
  --use-moex-iss-costs \
  --broker-fee-rub-per-contract 0.45
```

The `0.45` RUB broker fee is only a public Finam-tariff research assumption.
Change it to match the actual connected tariff before trusting any result.
Use `--cost-bps 25` in addition to these fees as a conservative reserve for
spread/slippage stress tests.

## Paper Probe

After the read-only API probe works, run a paper smoke test:

```bash
python3 tools/paper_probe.py
```

This script:

- authenticates with Finam;
- discovers MOEX/RTSX Brent and gold futures;
- reads order books;
- simulates a one-contract market buy in paper mode;
- applies a basic risk gate;
- writes events to `data/paper_journal.jsonl`.

It has no live order placement code.
