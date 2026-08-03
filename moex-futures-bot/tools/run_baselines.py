#!/usr/bin/env python3
"""Run simple baseline backtests on local Parquet bars."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.backtest import (
    Bar,
    run_atr_breakout,
    run_breakout,
    run_mean_reversion,
    run_momentum,
    run_roll_aware_breakout,
    run_trend_volatility,
)
from moex_futures_bot.state_db import connect_state_db, init_state_db, record_strategy_run
from moex_futures_bot.storage import default_storage_paths, init_storage


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeframe", default="TIME_FRAME_D")
    parser.add_argument("--symbol", action="append", help="Exact symbol filter; can be repeated")
    parser.add_argument("--dataset", choices=("raw", "continuous", "moex_iss_continuous"), default="raw")
    parser.add_argument("--continuous-method", default="sticky_volume_leader")
    parser.add_argument("--cost-bps", type=float, default=10.0, help="One-way trade cost in basis points")
    parser.add_argument("--use-moex-iss-costs", action="store_true", help="Use MOEX ISS SWAPRATE and current BUYSELLFEE fields")
    parser.add_argument("--broker-fee-rub-per-contract", type=float, default=0.0)
    parser.add_argument("--min-bars", type=int, default=80, help="Skip shorter series")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)
    _ensure_view(duckdb, paths, args.dataset, args.continuous_method)

    con = duckdb.connect(str(paths.research_db))
    symbols = _symbols(con, args.timeframe, args.symbol)
    if not symbols:
        print("No symbols found for baseline backtests.", file=sys.stderr)
        return 1

    results = []
    sqlite_conn = connect_state_db(paths.state_db)
    try:
        for symbol in symbols:
            bars = _bars(con, symbol, args.timeframe, paths, args)
            if len(bars) < args.min_bars:
                print(json.dumps({"status": "skipped_short_history", "symbol": symbol, "bars": len(bars)}, ensure_ascii=False), flush=True)
                continue
            result_set = [
                run_momentum(symbol, args.timeframe, bars, fast=5, slow=20, cost_bps=args.cost_bps),
                run_breakout(symbol, args.timeframe, bars, lookback=20, cost_bps=args.cost_bps),
                run_mean_reversion(symbol, args.timeframe, bars, lookback=10, threshold_pct=1.0, cost_bps=args.cost_bps),
                run_atr_breakout(symbol, args.timeframe, bars, lookback=20, atr_period=14, atr_mult=0.5, cost_bps=args.cost_bps),
                run_trend_volatility(symbol, args.timeframe, bars, fast=5, slow=20, vol_period=20, max_vol_pct=65.0, cost_bps=args.cost_bps),
                run_roll_aware_breakout(symbol, args.timeframe, bars, lookback=20, roll_cooldown=3, cost_bps=args.cost_bps),
            ]
            for result in result_set:
                run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
                metrics = dict(result.metrics)
                metrics["run_id"] = run_id
                record_strategy_run(
                    sqlite_conn,
                    run_id=run_id,
                    strategy_name=result.strategy_name,
                    status="completed",
                    symbols=[result.symbol],
                    timeframe=args.timeframe,
                    start_ts=str(metrics["start_ts"]),
                    end_ts=str(metrics["end_ts"]),
                    params=result.params,
                    metrics=metrics,
                    verdict=_verdict(metrics),
                )
                row = {
                    "run_id": run_id,
                    "strategy": result.strategy_name,
                    "symbol": result.symbol,
                    "dataset": args.dataset,
                    "timeframe": args.timeframe,
                    **result.params,
                    **metrics,
                }
                results.append(row)
        sqlite_conn.commit()
    finally:
        sqlite_conn.close()
        con.close()

    if not results:
        print("No baseline results produced.", file=sys.stderr)
        return 1

    report_path = _write_report(paths.backtest_reports_root, results, args)
    print(_markdown(results, args))
    print(f"\nReport: {report_path}")
    return 0


def _ensure_view(duckdb, paths, dataset: str, continuous_method: str) -> None:
    if dataset == "raw":
        parquet_glob = str(paths.bars_parquet_root / "timeframe=*" / "*" / "bars.parquet")
    elif dataset == "continuous":
        parquet_glob = str(paths.continuous_bars_root / f"method={continuous_method}" / "timeframe=*" / "*" / "bars.parquet")
    else:
        parquet_glob = str(paths.moex_iss_continuous_root / f"method={continuous_method}" / "assetcode=*" / "price=*" / "bars.parquet")
    parquet_glob = parquet_glob.replace("'", "''")
    con = duckdb.connect(str(paths.research_db))
    try:
        con.execute(
            f"""
            CREATE OR REPLACE VIEW finam_bars AS
            SELECT *
            FROM read_parquet('{parquet_glob}', hive_partitioning=false)
            """
        )
    finally:
        con.close()


def _symbols(con, timeframe: str, requested: list[str] | None) -> list[str]:
    if requested:
        return sorted(requested)
    rows = con.execute(
        "SELECT DISTINCT symbol FROM finam_bars WHERE timeframe = ? ORDER BY symbol",
        [timeframe],
    ).fetchall()
    return [row[0] for row in rows]


def _bars(con, symbol: str, timeframe: str, paths, args: argparse.Namespace) -> list[Bar]:
    rows = con.execute(
        """
        SELECT ts, open, high, low, close, volume
        FROM finam_bars
        WHERE symbol = ? AND timeframe = ?
        ORDER BY ts
        """,
        [symbol, timeframe],
    ).fetchall()
    if not args.use_moex_iss_costs:
        return [Bar(ts=row[0], open=row[1], high=row[2], low=row[3], close=row[4], volume=row[5]) for row in rows]
    secid = _symbol_to_moex_secid(symbol)
    funding_by_date = _funding_by_date(con, paths, secid)
    params = _params(con, paths, secid)
    return [
        Bar(
            ts=row[0],
            open=row[1],
            high=row[2],
            low=row[3],
            close=row[4],
            volume=row[5],
            funding_long_rub=funding_by_date.get(row[0].date().isoformat(), 0.0),
            exchange_fee_rub=params["buysellfee"],
            broker_fee_rub=args.broker_fee_rub_per_contract,
            minstep=params["minstep"],
            stepprice=params["stepprice"],
        )
        for row in rows
    ]


def _symbol_to_moex_secid(symbol: str) -> str:
    if symbol == "gold_continuous@FINAM":
        return "GLDRUBF"
    if symbol == "brent_continuous@FINAM":
        return "BRQ6"
    if symbol == "BR_continuous@MOEX_ISS":
        return "BRQ6"
    if symbol == "BR_return_stitched@MOEX_ISS":
        return "BRQ6"
    if symbol == "BR_last_trade@MOEX_ISS":
        return "BRQ6"
    if symbol == "BR_last_trade_return_stitched@MOEX_ISS":
        return "BRQ6"
    return symbol.replace("@RTSX", "")


def _funding_by_date(con, paths, secid: str) -> dict[str, float]:
    glob = str(paths.moex_iss_history_root / f"security={secid}" / "history.parquet").replace("'", "''")
    try:
        rows = con.execute(
            f"SELECT tradedate, swaprate FROM read_parquet('{glob}', hive_partitioning=false) ORDER BY tradedate"
        ).fetchall()
    except Exception:
        return {}
    return {str(row[0]): float(row[1] or 0) for row in rows}


def _params(con, paths, secid: str) -> dict[str, float]:
    glob = str(paths.moex_iss_params_root / f"security={secid}" / "params.parquet").replace("'", "''")
    try:
        row = con.execute(
            f"SELECT minstep, stepprice, buysellfee FROM read_parquet('{glob}', hive_partitioning=false) LIMIT 1"
        ).fetchone()
    except Exception:
        row = None
    if not row:
        return {"minstep": 0.0, "stepprice": 0.0, "buysellfee": 0.0}
    return {"minstep": float(row[0] or 0), "stepprice": float(row[1] or 0), "buysellfee": float(row[2] or 0)}


def _verdict(metrics: dict[str, object]) -> str:
    bars = int(metrics["bars"])
    trades = int(metrics["trades"])
    if bars < 120 or trades < 3:
        return "insufficient_evidence"
    if float(metrics["total_return_pct"]) > 0 and float(metrics["sharpe_daily_annualized"]) > 0:
        return "baseline_positive"
    return "baseline_negative"


def _write_report(root: Path, results: list[dict[str, object]], args: argparse.Namespace) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"baseline_backtest_{args.dataset}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    path.write_text(_markdown(results, args), encoding="utf-8")
    return path


def _markdown(results: list[dict[str, object]], args: argparse.Namespace) -> str:
    lines = ["# Baseline Backtest", ""]
    lines.append(f"Dataset: `{args.dataset}`, cost: `{args.cost_bps}` bps.")
    lines.append(f"MOEX ISS costs/funding: `{args.use_moex_iss_costs}`, broker fee: `{args.broker_fee_rub_per_contract}` RUB/contract.")
    lines.append("")
    lines.append("| symbol | strategy | bars | return % | max DD % | sharpe | trades | exposure % | win active days % |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|---:|")
    for row in sorted(results, key=lambda item: (str(item["symbol"]), str(item["strategy"]))):
        lines.append(
            "| {symbol} | {strategy} | {bars} | {total_return_pct:.2f} | {max_drawdown_pct:.2f} | {sharpe_daily_annualized:.2f} | {trades} | {exposure_pct:.2f} | {win_rate_active_days_pct:.2f} |".format(
                **row
            )
        )
    lines.append("")
    lines.append("Assumptions:")
    lines.append("- Daily long/flat only, no leverage and no shorting.")
    lines.append("- Signal is known after close; exposure is applied to the next close-to-close return.")
    lines.append("- `cost_bps` is charged on every position change as a separate spread/slippage reserve.")
    lines.append("- With `--use-moex-iss-costs`, current MOEX ISS `BUYSELLFEE` plus broker RUB fee are charged on position changes.")
    lines.append("- With `--use-moex-iss-costs`, MOEX ISS `SWAPRATE` is applied as provisional long-position funding where available.")
    lines.append("- These are baselines, not trade recommendations.")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
