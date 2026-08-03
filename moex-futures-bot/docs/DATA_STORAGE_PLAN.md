# Local Data Storage Plan

The first storage target is this laptop:

`/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/`

## Retention

- Bars: collect three years or the maximum Finam returns for each futures chain.
- Order book snapshots: start with 14 days, then decide whether to extend to 30-60 days.
- Paper events, strategy runs, and verdicts: keep indefinitely.
- Raw API secrets and JWTs: never store in market data or journals.

## Datasets

Bars should be partitioned by source, timeframe, symbol, and date:

```text
data/market/finam/bars/timeframe=TIME_FRAME_D/symbol=BRQ6__RTSX/date=2026-07-19.jsonl
```

Order book snapshots should be partitioned by source, depth, symbol, and date:

```text
data/market/finam/orderbook/depth=5/symbol=BRQ6__RTSX/date=2026-07-19.parquet
```

## State

`data/bot_state.sqlite` stores:

- instrument registry;
- collected data inventory;
- strategy run metadata and verdicts;
- compact paper events.

`data/paper_journal.jsonl` remains the append-only audit trail.

## Analytics

`tools/export_bars_parquet.py` exports JSONL bars into compact per-symbol Parquet:

```text
data/market/finam/bars_parquet/timeframe=TIME_FRAME_D/symbol=BRQ6__RTSX/bars.parquet
```

`tools/audit_bars.py` creates `data/research.duckdb`, a `finam_bars` view, and
Markdown reports under `data/reports/`.

Continuous research chains are written here:

```text
data/market/finam/continuous_bars/method=volume_leader/timeframe=TIME_FRAME_D/family=brent/bars.parquet
```

These chains are not back-adjusted yet. Roll gaps must be measured before using
them for stronger strategy verdicts.

MOEX ISS futures history is stored separately from Finam data:

```text
data/market/moex_iss/history/security=GLDRUBF/history.parquet
data/market/moex_iss/history/security=BRQ6/history.parquet
```

For GLDRUBF this dataset includes the MOEX `SWAPRATE` field, which is required
before funding-adjusted returns can be trusted.

Current MOEX ISS contract params are stored here:

```text
data/market/moex_iss/params/security=GLDRUBF/params.parquet
data/market/moex_iss/params/security=BRQ6/params.parquet
```

The params collector stores fields used by the cost model, including
`BUYSELLFEE`, `SCALPERFEE`, `MINSTEP`, and `STEPPRICE`.

MOEX ISS index history is stored here:

```text
data/market/moex_iss/index_history/security=RUSFAR/history.parquet
```

MOEX ISS intraday candles are stored here:

```text
data/market/moex_iss/candles/interval=60/security=GLDRUBF/candles.parquet
```

MOEX ISS continuous chains are stored here:

```text
data/market/moex_iss/continuous_bars/method=sticky_volume_leader/assetcode=BR/price=settleprice/bars.parquet
data/market/moex_iss/continuous_bars/method=sticky_volume_leader_return_stitched/assetcode=BR/price=settleprice/bars.parquet
```

The current Brent chain uses public ISS daily history and starts at 2021-09-01.
The raw chain is not back-adjusted. The return-stitched chain removes direct
old-contract/new-contract price jumps and must be preferred for strategy
falsification.

Funding reports are written under:

```text
data/reports/moex_iss_history_audit_*.md
data/reports/gldrubf_funding_impact_*.md
data/reports/moex_iss_continuous_*.md
data/reports/moex_iss_roll_gaps_*.md
data/reports/moex_iss_return_stitched_*.md
data/reports/gldrubf_swaprate_vs_rusfar_*.md
data/reports/finam_vs_moex_iss_*.md
data/reports/finam_vs_moex_iss_candles_*.md
data/reports/data_decision_*.md
data/reports/brent_research_matrix_*.md
data/reports/candidate_review_*.md
```

Backtest reports can be run with three distinct cost layers:

- `cost_bps`: generic reserve for spread/slippage or stress testing;
- MOEX ISS `BUYSELLFEE`: exchange fee in RUB per contract on position changes;
- `--broker-fee-rub-per-contract`: broker fee assumption in RUB per contract.

The current broker-fee assumption used for research is `0.45` RUB/contract and
must be replaced with the actual account tariff before any paper/live decision.

Execution research remains gated. The current orderbook plan is documented in:

```text
docs/ORDERBOOK_EXECUTION_PLAN.md
```

## Next Step

Install `requirements.txt` when we are ready to write and query Parquet/DuckDB:

```bash
python3 -m pip install -r requirements.txt
```

Until then, `tools/collect_bars.py` writes partitioned JSONL using only the
Python standard library.
