#!/usr/bin/env python3
"""Run walk-forward out-of-sample checks for baseline strategies."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.backtest import (
    Bar,
    BacktestResult,
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
    parser.add_argument("--cost-bps", type=float, default=25.0, help="One-way trade cost in basis points")
    parser.add_argument("--use-moex-iss-costs", action="store_true", help="Use MOEX ISS SWAPRATE and current BUYSELLFEE fields")
    parser.add_argument("--broker-fee-rub-per-contract", type=float, default=0.0)
    parser.add_argument("--train-bars", type=int, default=252)
    parser.add_argument("--test-bars", type=int, default=63)
    parser.add_argument("--min-bars", type=int, default=180)
    parser.add_argument("--exclude-last-bars", type=int, default=0, help="Reserve last N bars as untouched holdout")
    parser.add_argument("--exclude-roll-window-bars", type=int, default=0, help="Drop +/- N bars around roll_flag rows before testing")
    parser.add_argument(
        "--strategy",
        action="append",
        choices=("momentum_sma", "breakout_high_low", "mean_reversion_sma", "atr_breakout", "trend_volatility", "roll_aware_breakout"),
        help="Run only this strategy family. Can be repeated.",
    )
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

    duck = duckdb.connect(str(paths.research_db))
    sqlite_conn = connect_state_db(paths.state_db)
    rows: list[dict[str, object]] = []
    try:
        symbols = _symbols(duck, args.timeframe, args.symbol)
        for symbol in symbols:
            bars = _bars(duck, symbol, args.timeframe, paths, args)
            bars, filters = _apply_research_filters(bars, args)
            if len(bars) < args.min_bars:
                print(json.dumps({"status": "skipped_short_history", "symbol": symbol, "bars": len(bars)}, ensure_ascii=False), flush=True)
                continue
            rows.extend(_walk_symbol(symbol, args.timeframe, bars, args, sqlite_conn, filters))
        sqlite_conn.commit()
    finally:
        sqlite_conn.close()
        duck.close()

    if not rows:
        print("No walk-forward rows produced.", file=sys.stderr)
        return 1

    report_path = _write_report(paths.backtest_reports_root, rows, args)
    print(_markdown(rows, args))
    print(f"\nReport: {report_path}")
    return 0


def _walk_symbol(
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    args: argparse.Namespace,
    sqlite_conn,
    filters: dict[str, object],
) -> list[dict[str, object]]:
    produced: list[dict[str, object]] = []
    strategies = _strategy_grid(args.cost_bps, args.strategy)
    for strategy_name, candidates in strategies.items():
        window_rows: list[dict[str, object]] = []
        cursor = args.train_bars
        fold = 1
        while cursor + args.test_bars <= len(bars):
            train = bars[cursor - args.train_bars : cursor]
            combined = bars[cursor - args.train_bars : cursor + args.test_bars]
            best_train = max((runner(symbol, timeframe, train) for _, runner in candidates), key=_score)
            best_params = dict(best_train.params)
            test_result = _run_with_params(strategy_name, symbol, timeframe, combined, best_params, args.cost_bps, eval_start_index=args.train_bars)
            benchmark_return = _buy_hold_oos_return_pct(combined, args.train_bars, args.cost_bps)
            row = {
                "symbol": symbol,
                "timeframe": timeframe,
                "strategy": strategy_name,
                "fold": fold,
                "train_start": train[0].ts.isoformat(),
                "train_end": train[-1].ts.isoformat(),
                "test_start": bars[cursor].ts.isoformat(),
                "test_end": bars[cursor + args.test_bars - 1].ts.isoformat(),
                "selected_params": best_params,
                "train_return_pct": best_train.metrics["total_return_pct"],
                "train_sharpe": best_train.metrics["sharpe_daily_annualized"],
                "test_return_pct": test_result.metrics["total_return_pct"],
                "benchmark_return_pct": benchmark_return,
                "excess_return_pct": float(test_result.metrics["total_return_pct"]) - benchmark_return,
                "test_sharpe": test_result.metrics["sharpe_daily_annualized"],
                "test_max_drawdown_pct": test_result.metrics["max_drawdown_pct"],
                "test_trades": test_result.metrics["trades"],
                "test_exposure_pct": test_result.metrics["exposure_pct"],
            }
            window_rows.append(row)
            cursor += args.test_bars
            fold += 1

        if not window_rows:
            produced.append({"symbol": symbol, "strategy": strategy_name, "status": "no_full_oos_fold", "bars": len(bars)})
            continue

        aggregate = _aggregate(symbol, timeframe, strategy_name, window_rows, args)
        aggregate.update(filters)
        run_id = f"wf-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
        aggregate["run_id"] = run_id
        record_strategy_run(
            sqlite_conn,
            run_id=run_id,
            strategy_name=f"walk_forward_{strategy_name}",
            status="completed",
            symbols=[symbol],
            timeframe=timeframe,
            start_ts=str(aggregate["test_start"]),
            end_ts=str(aggregate["test_end"]),
            params={
                "dataset": args.dataset,
                "cost_bps": args.cost_bps,
                "train_bars": args.train_bars,
                "test_bars": args.test_bars,
                "exclude_last_bars": args.exclude_last_bars,
                "exclude_roll_window_bars": args.exclude_roll_window_bars,
                "candidate_count": len(candidates),
            },
            metrics=aggregate,
            verdict=_verdict(aggregate),
        )
        produced.append(aggregate)
    return produced


def _strategy_grid(cost_bps: float, requested: list[str] | None = None):
    strategies = {
        "momentum_sma": [
            ("m_3_10", lambda s, t, b: run_momentum(s, t, b, fast=3, slow=10, cost_bps=cost_bps)),
            ("m_5_20", lambda s, t, b: run_momentum(s, t, b, fast=5, slow=20, cost_bps=cost_bps)),
            ("m_10_50", lambda s, t, b: run_momentum(s, t, b, fast=10, slow=50, cost_bps=cost_bps)),
        ],
        "breakout_high_low": [
            ("b_10", lambda s, t, b: run_breakout(s, t, b, lookback=10, cost_bps=cost_bps)),
            ("b_20", lambda s, t, b: run_breakout(s, t, b, lookback=20, cost_bps=cost_bps)),
            ("b_40", lambda s, t, b: run_breakout(s, t, b, lookback=40, cost_bps=cost_bps)),
        ],
        "mean_reversion_sma": [
            ("r_5_1", lambda s, t, b: run_mean_reversion(s, t, b, lookback=5, threshold_pct=1.0, cost_bps=cost_bps)),
            ("r_10_1", lambda s, t, b: run_mean_reversion(s, t, b, lookback=10, threshold_pct=1.0, cost_bps=cost_bps)),
            ("r_20_2", lambda s, t, b: run_mean_reversion(s, t, b, lookback=20, threshold_pct=2.0, cost_bps=cost_bps)),
        ],
        "atr_breakout": [
            ("atr_10_10_05", lambda s, t, b: run_atr_breakout(s, t, b, lookback=10, atr_period=10, atr_mult=0.5, cost_bps=cost_bps)),
            ("atr_20_14_05", lambda s, t, b: run_atr_breakout(s, t, b, lookback=20, atr_period=14, atr_mult=0.5, cost_bps=cost_bps)),
            ("atr_20_14_10", lambda s, t, b: run_atr_breakout(s, t, b, lookback=20, atr_period=14, atr_mult=1.0, cost_bps=cost_bps)),
            ("atr_40_20_05", lambda s, t, b: run_atr_breakout(s, t, b, lookback=40, atr_period=20, atr_mult=0.5, cost_bps=cost_bps)),
        ],
        "trend_volatility": [
            ("tv_5_20_20_45", lambda s, t, b: run_trend_volatility(s, t, b, fast=5, slow=20, vol_period=20, max_vol_pct=45.0, cost_bps=cost_bps)),
            ("tv_5_20_20_65", lambda s, t, b: run_trend_volatility(s, t, b, fast=5, slow=20, vol_period=20, max_vol_pct=65.0, cost_bps=cost_bps)),
            ("tv_10_50_20_45", lambda s, t, b: run_trend_volatility(s, t, b, fast=10, slow=50, vol_period=20, max_vol_pct=45.0, cost_bps=cost_bps)),
            ("tv_10_50_40_65", lambda s, t, b: run_trend_volatility(s, t, b, fast=10, slow=50, vol_period=40, max_vol_pct=65.0, cost_bps=cost_bps)),
        ],
        "roll_aware_breakout": [
            ("rab_10_1", lambda s, t, b: run_roll_aware_breakout(s, t, b, lookback=10, roll_cooldown=1, cost_bps=cost_bps)),
            ("rab_10_3", lambda s, t, b: run_roll_aware_breakout(s, t, b, lookback=10, roll_cooldown=3, cost_bps=cost_bps)),
            ("rab_20_1", lambda s, t, b: run_roll_aware_breakout(s, t, b, lookback=20, roll_cooldown=1, cost_bps=cost_bps)),
            ("rab_20_3", lambda s, t, b: run_roll_aware_breakout(s, t, b, lookback=20, roll_cooldown=3, cost_bps=cost_bps)),
        ],
    }
    if requested:
        return {name: strategies[name] for name in requested}
    return strategies


def _run_with_params(
    strategy_name: str,
    symbol: str,
    timeframe: str,
    bars: list[Bar],
    params: dict[str, object],
    cost_bps: float,
    eval_start_index: int,
) -> BacktestResult:
    if strategy_name == "momentum_sma":
        return run_momentum(symbol, timeframe, bars, fast=int(params["fast"]), slow=int(params["slow"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if strategy_name == "breakout_high_low":
        return run_breakout(symbol, timeframe, bars, lookback=int(params["lookback"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if strategy_name == "mean_reversion_sma":
        return run_mean_reversion(
            symbol,
            timeframe,
            bars,
            lookback=int(params["lookback"]),
            threshold_pct=float(params["threshold_pct"]),
            cost_bps=cost_bps,
            eval_start_index=eval_start_index,
        )
    if strategy_name == "atr_breakout":
        return run_atr_breakout(
            symbol,
            timeframe,
            bars,
            lookback=int(params["lookback"]),
            atr_period=int(params["atr_period"]),
            atr_mult=float(params["atr_mult"]),
            cost_bps=cost_bps,
            eval_start_index=eval_start_index,
        )
    if strategy_name == "trend_volatility":
        return run_trend_volatility(
            symbol,
            timeframe,
            bars,
            fast=int(params["fast"]),
            slow=int(params["slow"]),
            vol_period=int(params["vol_period"]),
            max_vol_pct=float(params["max_vol_pct"]),
            cost_bps=cost_bps,
            eval_start_index=eval_start_index,
        )
    if strategy_name == "roll_aware_breakout":
        return run_roll_aware_breakout(
            symbol,
            timeframe,
            bars,
            lookback=int(params["lookback"]),
            roll_cooldown=int(params["roll_cooldown"]),
            cost_bps=cost_bps,
            eval_start_index=eval_start_index,
        )
    raise ValueError(f"Unknown strategy: {strategy_name}")


def _aggregate(symbol: str, timeframe: str, strategy: str, rows: list[dict[str, object]], args: argparse.Namespace) -> dict[str, object]:
    test_returns = [float(row["test_return_pct"]) for row in rows]
    excess_returns = [float(row["excess_return_pct"]) for row in rows]
    positive = sum(1 for value in test_returns if value > 0)
    positive_excess = sum(1 for value in excess_returns if value > 0)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "strategy": strategy,
        "folds": len(rows),
        "test_start": rows[0]["test_start"],
        "test_end": rows[-1]["test_end"],
        "avg_train_return_pct": sum(float(row["train_return_pct"]) for row in rows) / len(rows),
        "avg_test_return_pct": sum(test_returns) / len(test_returns),
        "sum_test_return_pct": sum(test_returns),
        "avg_benchmark_return_pct": sum(float(row["benchmark_return_pct"]) for row in rows) / len(rows),
        "sum_benchmark_return_pct": sum(float(row["benchmark_return_pct"]) for row in rows),
        "avg_excess_return_pct": sum(excess_returns) / len(excess_returns),
        "sum_excess_return_pct": sum(excess_returns),
        "worst_test_fold_pct": min(test_returns),
        "worst_excess_fold_pct": min(excess_returns),
        "positive_test_folds": positive,
        "positive_test_fold_pct": positive / len(rows) * 100,
        "positive_excess_folds": positive_excess,
        "positive_excess_fold_pct": positive_excess / len(rows) * 100,
        "excess_sign_test_p_value": _one_sided_sign_test_p_value(positive_excess, len(rows)),
        "avg_test_sharpe": sum(float(row["test_sharpe"]) for row in rows) / len(rows),
        "max_test_drawdown_pct": max(float(row["test_max_drawdown_pct"]) for row in rows),
        "total_test_trades": sum(int(row["test_trades"]) for row in rows),
        "avg_test_exposure_pct": sum(float(row["test_exposure_pct"]) for row in rows) / len(rows),
        "cost_bps": args.cost_bps,
        "train_bars": args.train_bars,
        "test_bars": args.test_bars,
        "fold_rows": rows,
    }


def _score(result: BacktestResult) -> float:
    trades = int(result.metrics["trades"])
    if trades < 2:
        return -999.0
    return float(result.metrics["sharpe_daily_annualized"]) + float(result.metrics["total_return_pct"]) / 100


def _buy_hold_oos_return_pct(bars: list[Bar], eval_start_index: int, cost_bps: float) -> float:
    start_index = max(1, eval_start_index)
    if len(bars) <= start_index:
        return 0.0
    equity = 1.0
    for index in range(start_index, len(bars)):
        prev = bars[index - 1]
        current = bars[index]
        if prev.close <= 0:
            continue
        raw_return = current.close / prev.close - 1
        funding = _rub_to_price_units(current.funding_long_rub, current) / prev.close
        equity *= 1 + raw_return - funding
    entry_cost = cost_bps / 10_000 + _fee_return(bars[start_index], bars[start_index - 1].close)
    exit_cost = cost_bps / 10_000 + _fee_return(bars[-1], bars[-2].close if len(bars) > 1 else bars[-1].close)
    return (equity * (1 - entry_cost) * (1 - exit_cost) - 1) * 100


def _one_sided_sign_test_p_value(successes: int, trials: int) -> float:
    if trials <= 0:
        return 1.0
    return sum(math.comb(trials, k) for k in range(successes, trials + 1)) / (2**trials)


def _verdict(metrics: dict[str, object]) -> str:
    if int(metrics["folds"]) < 8 or int(metrics["total_test_trades"]) < 2:
        return "insufficient_evidence"
    if (
        float(metrics["avg_test_return_pct"]) > 0
        and float(metrics["avg_excess_return_pct"]) > 0
        and float(metrics["positive_excess_fold_pct"]) >= 60
        and float(metrics["excess_sign_test_p_value"]) <= 0.25
    ):
        return "screening_pass"
    return "oos_negative"


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
    rows = con.execute("SELECT DISTINCT symbol FROM finam_bars WHERE timeframe = ? ORDER BY symbol", [timeframe]).fetchall()
    return [row[0] for row in rows]


def _bars(con, symbol: str, timeframe: str, paths, args: argparse.Namespace) -> list[Bar]:
    columns = _view_columns(con)
    source_expr = "source_symbol" if "source_symbol" in columns else "'' AS source_symbol"
    roll_expr = "roll_flag" if "roll_flag" in columns else "false AS roll_flag"
    rows = con.execute(
        f"""
        SELECT ts, open, high, low, close, volume, {source_expr}, {roll_expr}
        FROM finam_bars
        WHERE symbol = ? AND timeframe = ?
        ORDER BY ts
        """,
        [symbol, timeframe],
    ).fetchall()
    if not args.use_moex_iss_costs:
        return [
            Bar(ts=row[0], open=row[1], high=row[2], low=row[3], close=row[4], volume=row[5], source_symbol=str(row[6] or ""), roll_flag=bool(row[7]))
            for row in rows
        ]
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
            source_symbol=str(row[6] or ""),
            roll_flag=bool(row[7]),
        )
        for row in rows
    ]


def _view_columns(con) -> set[str]:
    rows = con.execute("DESCRIBE SELECT * FROM finam_bars").fetchall()
    return {str(row[0]).lower() for row in rows}


def _apply_research_filters(bars: list[Bar], args: argparse.Namespace) -> tuple[list[Bar], dict[str, object]]:
    filtered = list(bars)
    holdout_bars = max(args.exclude_last_bars, 0)
    holdout_start_ts = ""
    holdout_end_ts = ""
    if holdout_bars and len(filtered) > holdout_bars:
        holdout = filtered[-holdout_bars:]
        holdout_start_ts = holdout[0].ts.isoformat()
        holdout_end_ts = holdout[-1].ts.isoformat()
        filtered = filtered[:-holdout_bars]

    roll_window = max(args.exclude_roll_window_bars, 0)
    roll_excluded_bars = 0
    if roll_window:
        roll_indices = [index for index, bar in enumerate(filtered) if bar.roll_flag]
        excluded = set()
        for index in roll_indices:
            for candidate in range(index - roll_window, index + roll_window + 1):
                if 0 <= candidate < len(filtered):
                    excluded.add(candidate)
        if excluded:
            roll_excluded_bars = len(excluded)
            filtered = [bar for index, bar in enumerate(filtered) if index not in excluded]

    return filtered, {
        "original_bars": len(bars),
        "filtered_bars": len(filtered),
        "holdout_bars": holdout_bars,
        "holdout_start_ts": holdout_start_ts,
        "holdout_end_ts": holdout_end_ts,
        "exclude_roll_window_bars": roll_window,
        "roll_excluded_bars": roll_excluded_bars,
    }


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


def _rub_to_price_units(value_rub: float, bar: Bar) -> float:
    if value_rub == 0:
        return 0.0
    if bar.minstep > 0 and bar.stepprice > 0:
        return value_rub * bar.minstep / bar.stepprice
    return value_rub


def _fee_return(bar: Bar, reference_price: float) -> float:
    if reference_price <= 0:
        return 0.0
    return _rub_to_price_units(bar.exchange_fee_rub + bar.broker_fee_rub, bar) / reference_price


def _write_report(root: Path, rows: list[dict[str, object]], args: argparse.Namespace) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"walk_forward_{args.dataset}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.md"
    path.write_text(_markdown(rows, args), encoding="utf-8")
    return path


def _markdown(rows: list[dict[str, object]], args: argparse.Namespace) -> str:
    lines = ["# Walk-Forward Baseline Check", ""]
    lines.append(f"Dataset: `{args.dataset}`, cost: `{args.cost_bps}` bps, train bars: `{args.train_bars}`, test bars: `{args.test_bars}`.")
    lines.append(f"MOEX ISS costs/funding: `{args.use_moex_iss_costs}`, broker fee: `{args.broker_fee_rub_per_contract}` RUB/contract.")
    if args.exclude_last_bars or args.exclude_roll_window_bars:
        lines.append(f"Filters: exclude last `{args.exclude_last_bars}` bars as holdout; exclude +/- `{args.exclude_roll_window_bars}` bars around rolls.")
    lines.append("")
    lines.append("| symbol | strategy | folds | test period | avg test % | avg B&H % | avg excess % | positive excess % | sign p | worst excess % | max DD % | trades | verdict hint |")
    lines.append("|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|")
    for row in sorted(rows, key=lambda item: (str(item.get("symbol")), str(item.get("strategy")))):
        if row.get("status") == "no_full_oos_fold":
            lines.append(f"| {row['symbol']} | {row['strategy']} | 0 | - | - | - | - | - | - | - | - | - | no_full_oos_fold |")
            continue
        lines.append(
            "| {symbol} | {strategy} | {folds} | {test_start} - {test_end} | {avg_test_return_pct:.2f} | {avg_benchmark_return_pct:.2f} | {avg_excess_return_pct:.2f} | {positive_excess_fold_pct:.2f} | {excess_sign_test_p_value:.3f} | {worst_excess_fold_pct:.2f} | {max_test_drawdown_pct:.2f} | {total_test_trades} | {verdict} |".format(
                **{**row, "verdict": _verdict(row)}
            )
        )
    stability = _parameter_stability(rows)
    if stability:
        lines.append("")
        lines.append("## Selected Parameter Stability")
        lines.append("")
        lines.append("| symbol | strategy | selected params | folds |")
        lines.append("|---|---|---|---:|")
        for item in stability:
            lines.append(f"| {item['symbol']} | {item['strategy']} | `{item['params']}` | {item['folds']} |")
    lines.append("")
    lines.append("Assumptions:")
    lines.append("- Parameters are selected on each train window only.")
    lines.append("- The selected parameter set is applied to the following out-of-sample window.")
    lines.append("- Benchmark is buy-and-hold over the same OOS window with entry and exit costs.")
    lines.append("- Optional holdout bars are removed before any train/test windows are formed.")
    lines.append("- Optional roll-window exclusion removes rows around `roll_flag` before testing.")
    lines.append("- `screening_pass` requires at least 8 folds, positive average test return, positive average excess return, at least 60% positive excess folds, and one-sided sign-test p <= 0.25.")
    lines.append("- This remains a research check, not a paper/live permission.")
    return "\n".join(lines)


def _parameter_stability(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    counts: dict[tuple[str, str, str], int] = {}
    for row in rows:
        for fold in row.get("fold_rows", []):
            key = (
                str(row.get("symbol")),
                str(row.get("strategy")),
                json.dumps(fold.get("selected_params", {}), sort_keys=True, ensure_ascii=False),
            )
            counts[key] = counts.get(key, 0) + 1
    return [
        {"symbol": symbol, "strategy": strategy, "params": params, "folds": folds}
        for (symbol, strategy, params), folds in sorted(counts.items(), key=lambda item: (item[0][0], item[0][1], -item[1], item[0][2]))
    ]


if __name__ == "__main__":
    raise SystemExit(main())
