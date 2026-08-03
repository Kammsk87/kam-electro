#!/usr/bin/env python3
"""Run a single preregistered holdout check for one strategy family."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(PROJECT_ROOT / "tools"))
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.backtest import Bar, run_mean_reversion
from moex_futures_bot.storage import default_storage_paths, init_storage
from run_walk_forward import _bars, _buy_hold_oos_return_pct, _ensure_view, _score


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeframe", default="TIME_FRAME_D")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--dataset", choices=("raw", "continuous", "moex_iss_continuous"), default="moex_iss_continuous")
    parser.add_argument("--continuous-method", required=True)
    parser.add_argument("--strategy", choices=("mean_reversion_sma",), default="mean_reversion_sma")
    parser.add_argument("--cost-bps", type=float, required=True)
    parser.add_argument("--use-moex-iss-costs", action="store_true")
    parser.add_argument("--broker-fee-rub-per-contract", type=float, default=0.0)
    parser.add_argument("--holdout-bars", type=int, default=252)
    parser.add_argument("--exclude-roll-window-bars", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    _ensure_view(duckdb, paths, args.dataset, args.continuous_method)

    duck = duckdb.connect(str(paths.research_db))
    try:
        bars = _bars(duck, args.symbol, args.timeframe, paths, args)
    finally:
        duck.close()

    if len(bars) <= args.holdout_bars + 100:
        print("Not enough bars for holdout.", file=sys.stderr)
        return 1

    raw_train = bars[:-args.holdout_bars]
    raw_holdout = bars[-args.holdout_bars:]
    train = _exclude_roll_window(raw_train, args.exclude_roll_window_bars)
    holdout = _exclude_roll_window(raw_holdout, args.exclude_roll_window_bars)
    if len(train) < 180 or len(holdout) < 20:
        print("Not enough bars after roll-window exclusion.", file=sys.stderr)
        return 1

    candidates = _mean_reversion_candidates(args.cost_bps)
    train_results = [runner(args.symbol, args.timeframe, train) for _, runner in candidates]
    best_train = max(train_results, key=_score)
    params = dict(best_train.params)
    combined = train[-1:] + holdout
    holdout_result = run_mean_reversion(
        args.symbol,
        args.timeframe,
        combined,
        lookback=int(params["lookback"]),
        threshold_pct=float(params["threshold_pct"]),
        cost_bps=args.cost_bps,
        eval_start_index=1,
    )
    benchmark_return = _buy_hold_oos_return_pct(combined, 1, args.cost_bps)
    metrics = {
        "symbol": args.symbol,
        "strategy": args.strategy,
        "selected_params": params,
        "cost_bps": args.cost_bps,
        "broker_fee_rub_per_contract": args.broker_fee_rub_per_contract,
        "exclude_roll_window_bars": args.exclude_roll_window_bars,
        "raw_train_bars": len(raw_train),
        "raw_holdout_bars": len(raw_holdout),
        "filtered_train_bars": len(train),
        "filtered_holdout_bars": len(holdout),
        "train_start": train[0].ts.isoformat(),
        "train_end": train[-1].ts.isoformat(),
        "holdout_start": holdout[0].ts.isoformat(),
        "holdout_end": holdout[-1].ts.isoformat(),
        "train_return_pct": float(best_train.metrics["total_return_pct"]),
        "train_sharpe": float(best_train.metrics["sharpe_daily_annualized"]),
        "holdout_return_pct": float(holdout_result.metrics["total_return_pct"]),
        "holdout_benchmark_return_pct": benchmark_return,
        "holdout_excess_return_pct": float(holdout_result.metrics["total_return_pct"]) - benchmark_return,
        "holdout_max_drawdown_pct": float(holdout_result.metrics["max_drawdown_pct"]),
        "holdout_trades": int(holdout_result.metrics["trades"]),
        "holdout_exposure_pct": float(holdout_result.metrics["exposure_pct"]),
    }
    metrics["verdict"] = _verdict(metrics)
    report_path = _write_report(paths.reports_root, metrics)
    print(json.dumps({**metrics, "report": str(report_path)}, ensure_ascii=False, indent=2))
    return 0


def _mean_reversion_candidates(cost_bps: float):
    return [
        ("r_5_1", lambda s, t, b: run_mean_reversion(s, t, b, lookback=5, threshold_pct=1.0, cost_bps=cost_bps)),
        ("r_10_1", lambda s, t, b: run_mean_reversion(s, t, b, lookback=10, threshold_pct=1.0, cost_bps=cost_bps)),
        ("r_20_2", lambda s, t, b: run_mean_reversion(s, t, b, lookback=20, threshold_pct=2.0, cost_bps=cost_bps)),
    ]


def _exclude_roll_window(bars: list[Bar], window: int) -> list[Bar]:
    if window <= 0:
        return list(bars)
    roll_indices = [index for index, bar in enumerate(bars) if bar.roll_flag]
    excluded = set()
    for index in roll_indices:
        for candidate in range(index - window, index + window + 1):
            if 0 <= candidate < len(bars):
                excluded.add(candidate)
    return [bar for index, bar in enumerate(bars) if index not in excluded]


def _verdict(metrics: dict[str, object]) -> str:
    if int(metrics["holdout_trades"]) < 2:
        return "holdout_insufficient_trades"
    if float(metrics["holdout_return_pct"]) > 0 and float(metrics["holdout_excess_return_pct"]) > 0:
        return "holdout_pass"
    return "holdout_fail"


def _write_report(root: Path, metrics: dict[str, object]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"holdout_candidate_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    lines = [
        "# Holdout Candidate Check",
        "",
        f"- Symbol: `{metrics['symbol']}`",
        f"- Strategy: `{metrics['strategy']}`",
        f"- Selected params from pre-holdout train only: `{json.dumps(metrics['selected_params'], sort_keys=True)}`",
        f"- Cost bps: `{metrics['cost_bps']}`",
        f"- Broker fee RUB/contract: `{metrics['broker_fee_rub_per_contract']}`",
        f"- Roll-window exclusion: `+/-{metrics['exclude_roll_window_bars']}` bars",
        f"- Train: `{metrics['train_start']} - {metrics['train_end']}` (`{metrics['filtered_train_bars']}` filtered bars)",
        f"- Holdout: `{metrics['holdout_start']} - {metrics['holdout_end']}` (`{metrics['filtered_holdout_bars']}` filtered bars)",
        "",
        "| metric | value |",
        "|---|---:|",
        f"| train return % | {metrics['train_return_pct']:.2f} |",
        f"| train sharpe | {metrics['train_sharpe']:.2f} |",
        f"| holdout return % | {metrics['holdout_return_pct']:.2f} |",
        f"| holdout B&H % | {metrics['holdout_benchmark_return_pct']:.2f} |",
        f"| holdout excess % | {metrics['holdout_excess_return_pct']:.2f} |",
        f"| holdout max DD % | {metrics['holdout_max_drawdown_pct']:.2f} |",
        f"| holdout trades | {metrics['holdout_trades']} |",
        f"| holdout exposure % | {metrics['holdout_exposure_pct']:.2f} |",
        "",
        f"Verdict: `{metrics['verdict']}`",
        "",
        "Notes:",
        "- The last holdout bars were not used for parameter selection.",
        "- This is a research validation check, not paper/live permission.",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


if __name__ == "__main__":
    raise SystemExit(main())
