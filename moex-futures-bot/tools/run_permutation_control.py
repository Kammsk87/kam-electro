#!/usr/bin/env python3
"""Calibrate idea screening passes against block-shuffled return paths."""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(PROJECT_ROOT / "tools"))
sys.path.insert(0, str(SRC_ROOT))

from generate_strategy_ideas import generate_ideas
from moex_futures_bot.backtest import Bar
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol
from run_idea_autopilot import _args, _run_idea
from run_walk_forward import _aggregate, _apply_research_filters, _bars, _buy_hold_oos_return_pct, _ensure_view, _verdict


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--family", action="append")
    parser.add_argument("--profile", choices=("smoke", "daily", "nightly"), default="smoke")
    parser.add_argument("--window", action="append", help="Run only matching window name; can be repeated.")
    parser.add_argument("--max-ideas", type=int, default=0)
    parser.add_argument("--limit-combos", type=int, default=0)
    parser.add_argument("--permutations", type=int, default=20)
    parser.add_argument("--block-size", type=int, default=20)
    parser.add_argument("--seed", type=int, default=20260722)
    return parser.parse_args()


def main() -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    _apply_profile(args)
    rng = random.Random(args.seed)
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    config_path = _resolve(args.config)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    ideas = generate_ideas(config, families=args.family, max_ideas=args.max_ideas)
    run_id = f"{safe_symbol(config['name'])}_permutation_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    out_dir = paths.reports_root / "permutation_control" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    _ensure_view(duckdb, paths, config["dataset"], config["continuous_method"])
    con = duckdb.connect(str(paths.research_db))
    observed_rows: list[dict[str, Any]] = []
    null_runs: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    combo_count = 0
    try:
        for broker_fee in config["broker_fees_rub_per_contract"]:
            base_args = _args(config, broker_fee, cost_bps=0, roll_window=0, window=config["windows"][0])
            base_bars = _bars(con, config["symbol"], config["timeframe"], paths, base_args)
            for window in config["windows"]:
                if args.window and str(window["name"]) not in set(args.window):
                    continue
                for cost_bps in config["cost_bps"]:
                    for roll_window in config["roll_windows"]:
                        combo_count += 1
                        if args.limit_combos and combo_count > args.limit_combos:
                            continue
                        combo_args = _args(config, broker_fee, cost_bps, roll_window, window)
                        bars, filters = _apply_research_filters(base_bars, combo_args)
                        if len(bars) < int(window["min_bars"]):
                            failures.append({"window": window["name"], "broker_fee": broker_fee, "cost_bps": cost_bps, "roll_window": roll_window, "error": "short history"})
                            continue
                        for idea in ideas:
                            observed_rows.append(_walk_fixed_idea(config, idea, bars, combo_args, filters))
                        for permutation_index in range(1, args.permutations + 1):
                            shuffled = _block_shuffle_bars(bars, args.block_size, rng)
                            perm_rows = [_walk_fixed_idea(config, idea, shuffled, combo_args, filters) for idea in ideas]
                            null_runs.append(_summarize_rows(perm_rows, permutation_index, str(window["name"])))
    finally:
        con.close()

    observed = _summarize_rows(observed_rows, permutation_index=0, window_name="all")
    summary = {
        "run_id": run_id,
        "config": str(config_path),
        "profile": args.profile,
        "ideas": len(ideas),
        "observed_rows": len(observed_rows),
        "failures": len(failures),
        "permutations": args.permutations,
        "block_size": args.block_size,
        "seed": args.seed,
        "observed": observed,
        "null": _null_summary(null_runs, observed),
        "window_null": _window_null_summary(null_runs, observed_rows),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_jsonl(out_dir / "observed_results.jsonl", observed_rows)
    _write_jsonl(out_dir / "null_runs.jsonl", null_runs)
    _write_jsonl(out_dir / "failures.jsonl", failures)
    report_path = out_dir / "report.md"
    report_path.write_text(_markdown(config, summary), encoding="utf-8")
    print(json.dumps({**summary, "report": str(report_path), "out_dir": str(out_dir)}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


def _walk_fixed_idea(config: dict[str, Any], idea: dict[str, Any], bars: list[Bar], args: SimpleNamespace, filters: dict[str, Any]) -> dict[str, Any]:
    window_rows: list[dict[str, Any]] = []
    cursor = args.train_bars
    fold = 1
    while cursor + args.test_bars <= len(bars):
        train = bars[cursor - args.train_bars : cursor]
        combined = bars[cursor - args.train_bars : cursor + args.test_bars]
        result = _run_idea(idea, config["symbol"], config["timeframe"], combined, args.cost_bps, eval_start_index=args.train_bars)
        benchmark_return = _buy_hold_oos_return_pct(combined, args.train_bars, args.cost_bps)
        window_rows.append(
            {
                "symbol": config["symbol"],
                "timeframe": config["timeframe"],
                "strategy": idea["id"],
                "fold": fold,
                "train_start": train[0].ts.isoformat(),
                "train_end": train[-1].ts.isoformat(),
                "test_start": bars[cursor].ts.isoformat(),
                "test_end": bars[cursor + args.test_bars - 1].ts.isoformat(),
                "selected_params": {**idea["params"], "family": idea["family"]},
                "train_return_pct": 0.0,
                "train_sharpe": 0.0,
                "test_return_pct": result.metrics["total_return_pct"],
                "benchmark_return_pct": benchmark_return,
                "excess_return_pct": float(result.metrics["total_return_pct"]) - benchmark_return,
                "test_sharpe": result.metrics["sharpe_daily_annualized"],
                "test_max_drawdown_pct": result.metrics["max_drawdown_pct"],
                "test_trades": result.metrics["trades"],
                "test_exposure_pct": result.metrics["exposure_pct"],
            }
        )
        cursor += args.test_bars
        fold += 1
    aggregate = _aggregate(config["symbol"], config["timeframe"], idea["id"], window_rows, args)
    aggregate.update(filters)
    aggregate.update(
        {
            "idea_id": idea["id"],
            "family": idea["family"],
            "idea_params": idea["params"],
            "window": args.window_name,
            "broker_fee": args.broker_fee_rub_per_contract,
            "roll_window": args.exclude_roll_window_bars,
            "verdict": _verdict(aggregate),
        }
    )
    aggregate.pop("fold_rows", None)
    return aggregate


def _block_shuffle_bars(bars: list[Bar], block_size: int, rng: random.Random) -> list[Bar]:
    if len(bars) < 3:
        return list(bars)
    returns = [bars[index].close / bars[index - 1].close - 1 for index in range(1, len(bars))]
    blocks = [returns[index : index + block_size] for index in range(0, len(returns), block_size)]
    rng.shuffle(blocks)
    shuffled_returns = [value for block in blocks for value in block][: len(returns)]
    synthetic: list[Bar] = [bars[0]]
    close = bars[0].close
    for index, raw_return in enumerate(shuffled_returns, start=1):
        source = bars[index]
        close = max(0.01, close * (1 + raw_return))
        open_price = synthetic[-1].close
        high_ratio = max(source.high / source.close, 1.0) if source.close > 0 else 1.0
        low_ratio = min(source.low / source.close, 1.0) if source.close > 0 else 1.0
        high = max(open_price, close, close * high_ratio)
        low = min(open_price, close, close * low_ratio)
        synthetic.append(
            Bar(
                ts=source.ts,
                open=open_price,
                high=high,
                low=max(0.01, low),
                close=close,
                volume=source.volume,
                funding_long_rub=source.funding_long_rub,
                exchange_fee_rub=source.exchange_fee_rub,
                broker_fee_rub=source.broker_fee_rub,
                minstep=source.minstep,
                stepprice=source.stepprice,
                source_symbol=source.source_symbol,
                roll_flag=source.roll_flag,
            )
        )
    return synthetic


def _summarize_rows(rows: list[dict[str, Any]], permutation_index: int, window_name: str) -> dict[str, Any]:
    passes = [row for row in rows if row["verdict"] == "screening_pass"]
    return {
        "permutation_index": permutation_index,
        "window": window_name,
        "rows": len(rows),
        "screening_passes": len(passes),
        "pass_rate_pct": len(passes) / len(rows) * 100 if rows else 0.0,
        "passes_by_window": dict(Counter(row["window"] for row in passes)),
        "passes_by_family": dict(Counter(row["family"] for row in passes)),
    }


def _null_summary(null_runs: list[dict[str, Any]], observed: dict[str, Any]) -> dict[str, Any]:
    grouped = _group_null_runs(null_runs)
    counts = [int(row["screening_passes"]) for row in grouped]
    rates = [float(row["pass_rate_pct"]) for row in grouped]
    if not counts:
        return {}
    observed_count = int(observed["screening_passes"])
    return {
        "mean_screening_passes": statistics.fmean(counts),
        "median_screening_passes": statistics.median(counts),
        "max_screening_passes": max(counts),
        "mean_pass_rate_pct": statistics.fmean(rates),
        "p_value_ge_observed": (sum(1 for value in counts if value >= observed_count) + 1) / (len(counts) + 1),
    }


def _window_null_summary(null_runs: list[dict[str, Any]], observed_rows: list[dict[str, Any]]) -> dict[str, Any]:
    observed_by_window: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observed_rows:
        observed_by_window[str(row["window"])].append(row)
    null_by_window: dict[str, dict[int, dict[str, int]]] = defaultdict(lambda: defaultdict(lambda: {"rows": 0, "screening_passes": 0}))
    for row in null_runs:
        bucket = null_by_window[str(row["window"])][int(row["permutation_index"])]
        bucket["rows"] += int(row["rows"])
        bucket["screening_passes"] += int(row["screening_passes"])
    summary: dict[str, Any] = {}
    for window, rows in observed_by_window.items():
        observed_passes = sum(1 for row in rows if row["verdict"] == "screening_pass")
        counts = [int(row["screening_passes"]) for row in null_by_window.get(window, {}).values()]
        if not counts:
            continue
        summary[window] = {
            "observed_screening_passes": observed_passes,
            "null_mean_screening_passes": statistics.fmean(counts),
            "null_max_screening_passes": max(counts),
            "p_value_ge_observed": (sum(1 for value in counts if value >= observed_passes) + 1) / (len(counts) + 1),
        }
    return summary


def _group_null_runs(null_runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[int, dict[str, int]] = defaultdict(lambda: {"rows": 0, "screening_passes": 0})
    for row in null_runs:
        bucket = grouped[int(row["permutation_index"])]
        bucket["rows"] += int(row["rows"])
        bucket["screening_passes"] += int(row["screening_passes"])
    return [
        {
            "permutation_index": permutation_index,
            "rows": values["rows"],
            "screening_passes": values["screening_passes"],
            "pass_rate_pct": values["screening_passes"] / values["rows"] * 100 if values["rows"] else 0.0,
        }
        for permutation_index, values in sorted(grouped.items())
    ]


def _markdown(config: dict[str, Any], summary: dict[str, Any]) -> str:
    null = summary["null"]
    lines = [
        "# Permutation Control Report",
        "",
        f"- Run ID: `{summary['run_id']}`",
        f"- Symbol: `{config['symbol']}`",
        f"- Profile: `{summary['profile']}`",
        f"- Ideas: `{summary['ideas']}`",
        f"- Observed rows: `{summary['observed_rows']}`",
        f"- Permutations: `{summary['permutations']}`",
        f"- Block size: `{summary['block_size']}` bars",
        f"- Failures: `{summary['failures']}`",
        "",
        "## Observed vs Null",
        "",
        f"- Observed screening passes: `{summary['observed']['screening_passes']}` (`{summary['observed']['pass_rate_pct']:.2f}%`)",
        f"- Null mean screening passes: `{null.get('mean_screening_passes', 0):.2f}` (`{null.get('mean_pass_rate_pct', 0):.2f}%`)",
        f"- Null median screening passes: `{null.get('median_screening_passes', 0):.2f}`",
        f"- Null max screening passes: `{null.get('max_screening_passes', 0)}`",
        f"- Empirical p(null >= observed): `{null.get('p_value_ge_observed', 1):.3f}`",
        "",
        "## Window Calibration",
        "",
        "| window | observed passes | null mean | null max | p(null >= observed) |",
        "|---|---:|---:|---:|---:|",
    ]
    for window, item in sorted(summary["window_null"].items()):
        lines.append(
            f"| {window} | {item['observed_screening_passes']} | {item['null_mean_screening_passes']:.2f} | "
            f"{item['null_max_screening_passes']} | {item['p_value_ge_observed']:.3f} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- If observed passes are close to the block-shuffled null, routing thresholds are probably generating noise leads.",
            "- `short_80_20` should be treated as suspect if its observed pass count is not clearly above its own null baseline.",
            "- This is a research-only calibration run; it cannot promote a strategy to paper or live.",
        ]
    )
    return "\n".join(lines)


def _apply_profile(args: argparse.Namespace) -> None:
    if args.profile == "smoke":
        args.max_ideas = args.max_ideas or 20
        args.limit_combos = args.limit_combos or 4
        args.permutations = args.permutations or 5
    elif args.profile == "daily":
        args.max_ideas = args.max_ideas or 60
        args.limit_combos = args.limit_combos or 24
    elif args.profile == "nightly":
        args.max_ideas = args.max_ideas or 0
        args.limit_combos = args.limit_combos or 0


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _resolve(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


if __name__ == "__main__":
    raise SystemExit(main())
