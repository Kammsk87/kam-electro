#!/usr/bin/env python3
"""Generate, test, and route fixed strategy ideas without paper/live execution."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(PROJECT_ROOT / "tools"))
sys.path.insert(0, str(SRC_ROOT))

from generate_strategy_ideas import generate_ideas
from moex_futures_bot.backtest import (
    Bar,
    run_atr_breakout,
    run_breakout,
    run_mean_reversion,
    run_momentum,
    run_roll_aware_breakout,
    run_trend_volatility,
)
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol
from run_walk_forward import (
    _aggregate,
    _apply_research_filters,
    _bars,
    _buy_hold_oos_return_pct,
    _ensure_view,
    _verdict,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--family", action="append")
    parser.add_argument("--profile", choices=("smoke", "daily", "nightly"), default="", help="Convenience limits for interactive or overnight runs.")
    parser.add_argument("--max-ideas", type=int, default=0)
    parser.add_argument("--limit-combos", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    config_path = _resolve(args.config)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    _validate_safety(config)
    _apply_profile(args)

    ideas = generate_ideas(config, families=args.family, max_ideas=args.max_ideas)
    run_id = f"{safe_symbol(config['name'])}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    out_dir = paths.reports_root / "idea_autopilot" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_jsonl(out_dir / "ideas.jsonl", ideas)
    holdout_ledger = _load_holdout_ledger(config)
    if holdout_ledger:
        (out_dir / "holdout_ledger.json").write_text(json.dumps(holdout_ledger, ensure_ascii=False, indent=2), encoding="utf-8")

    _ensure_view(duckdb, paths, config["dataset"], config["continuous_method"])
    con = duckdb.connect(str(paths.research_db))
    rows: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    combo_count = 0
    try:
        for broker_fee in config["broker_fees_rub_per_contract"]:
            base_args = _args(config, broker_fee, cost_bps=0, roll_window=0, window=config["windows"][0])
            base_bars = _bars(con, config["symbol"], config["timeframe"], paths, base_args)
            for window in config["windows"]:
                for cost_bps in config["cost_bps"]:
                    for roll_window in config["roll_windows"]:
                        combo_count += 1
                        if args.limit_combos and combo_count > args.limit_combos:
                            continue
                        combo_args = _args(config, broker_fee, cost_bps, roll_window, window)
                        bars, filters = _apply_research_filters(base_bars, combo_args)
                        if len(bars) < int(window["min_bars"]):
                            failures.append(
                                {
                                    "window": window["name"],
                                    "broker_fee": broker_fee,
                                    "cost_bps": cost_bps,
                                    "roll_window": roll_window,
                                    "error": f"short history after filters: {len(bars)}",
                                }
                            )
                            continue
                        for idea in ideas:
                            try:
                                row = _walk_fixed_idea(config, idea, bars, combo_args, filters)
                            except Exception as exc:  # noqa: BLE001 - keep batch running and record the failure.
                                failures.append(
                                    {
                                        "idea_id": idea["id"],
                                        "family": idea["family"],
                                        "window": window["name"],
                                        "broker_fee": broker_fee,
                                        "cost_bps": cost_bps,
                                        "roll_window": roll_window,
                                        "error": str(exc),
                                    }
                                )
                                continue
                            rows.append(row)
    finally:
        con.close()

    idea_statuses = _idea_statuses(ideas, rows, config, holdout_ledger)
    summary = {
        "run_id": run_id,
        "config": str(config_path),
        "ideas": len(ideas),
        "rows": len(rows),
        "failures": len(failures),
        "screening_passes": sum(1 for row in rows if row["verdict"] == "screening_pass"),
        "holdout_eligible": any(item["status"] == "holdout_eligible" for item in idea_statuses.values()),
        "paper_candidate": False,
        "live_candidate": False,
        "status_counts": dict(Counter(item["status"] for item in idea_statuses.values())),
        "routes": dict(Counter(item["route"] for item in idea_statuses.values())),
        "holdout_ledger": str(_resolve(config["holdout_policy"]["ledger"])) if holdout_ledger else "",
        "quarantined_ideas": sum(1 for item in idea_statuses.values() if item["status"] == "quarantined_after_holdout_fail"),
    }
    _write_jsonl(out_dir / "results.jsonl", rows)
    _write_jsonl(out_dir / "failures.jsonl", failures)
    _write_jsonl(out_dir / "idea_statuses.jsonl", list(idea_statuses.values()))
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path = out_dir / "report.md"
    report_path.write_text(_markdown(config, summary, idea_statuses, rows, failures), encoding="utf-8")
    print(json.dumps({**summary, "report": str(report_path), "out_dir": str(out_dir)}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


def _walk_fixed_idea(
    config: dict[str, Any],
    idea: dict[str, Any],
    bars: list[Bar],
    args: SimpleNamespace,
    filters: dict[str, Any],
) -> dict[str, Any]:
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


def _run_idea(idea: dict[str, Any], symbol: str, timeframe: str, bars: list[Bar], cost_bps: float, eval_start_index: int):
    family = idea["family"]
    params = idea["params"]
    if family == "momentum_sma":
        return run_momentum(symbol, timeframe, bars, fast=int(params["fast"]), slow=int(params["slow"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if family == "breakout_high_low":
        return run_breakout(symbol, timeframe, bars, lookback=int(params["lookback"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if family == "mean_reversion_sma":
        return run_mean_reversion(symbol, timeframe, bars, lookback=int(params["lookback"]), threshold_pct=float(params["threshold_pct"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if family == "atr_breakout":
        return run_atr_breakout(symbol, timeframe, bars, lookback=int(params["lookback"]), atr_period=int(params["atr_period"]), atr_mult=float(params["atr_mult"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if family == "trend_volatility":
        return run_trend_volatility(symbol, timeframe, bars, fast=int(params["fast"]), slow=int(params["slow"]), vol_period=int(params["vol_period"]), max_vol_pct=float(params["max_vol_pct"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    if family == "roll_aware_breakout":
        return run_roll_aware_breakout(symbol, timeframe, bars, lookback=int(params["lookback"]), roll_cooldown=int(params["roll_cooldown"]), cost_bps=cost_bps, eval_start_index=eval_start_index)
    raise ValueError(f"Unknown idea family: {family}")


def _idea_statuses(
    ideas: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    config: dict[str, Any],
    holdout_ledger: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    gates = config["gates"]
    quarantined = _quarantined_families(config, holdout_ledger)
    statuses: dict[str, dict[str, Any]] = {}
    for idea in ideas:
        idea_rows = [row for row in rows if row["idea_id"] == idea["id"]]
        passes = [row for row in idea_rows if row["verdict"] == "screening_pass"]
        strict_passes = [row for row in passes if str(row["window"]).startswith(str(gates["strict_window_prefix"]))]
        short_passes = [row for row in passes if str(row["window"]).startswith(str(gates["short_window_prefix"]))]
        robust_passes = [
            row
            for row in passes
            if float(row["cost_bps"]) >= float(gates["robust_min_cost_bps"])
            and float(row["broker_fee"]) >= float(gates["robust_min_broker_fee_rub"])
            and int(row["roll_window"]) >= int(gates["robust_min_roll_window"])
        ]
        robust_strict_passes = [row for row in robust_passes if str(row["window"]).startswith(str(gates["strict_window_prefix"]))]
        quarantine_reason = ""
        if idea["family"] in quarantined:
            status = "quarantined_after_holdout_fail"
            route = "archive_same_family_holdout_spent"
            quarantine_reason = _quarantine_reason(idea["family"], holdout_ledger)
        elif robust_strict_passes and short_passes:
            status = "holdout_eligible"
            route = "freeze_candidate_for_manual_holdout_review"
        elif strict_passes or robust_passes:
            status = "research_lead"
            route = "focused_pack"
        elif short_passes:
            status = "research_lead_short_only"
            route = "needs_rework_or_strict_confirmation"
        else:
            status = "rejected"
            route = "archive"
        statuses[idea["id"]] = {
            "idea_id": idea["id"],
            "family": idea["family"],
            "params": idea["params"],
            "status": status,
            "route": route,
            "rows": len(idea_rows),
            "screening_passes": len(passes),
            "strict_passes": len(strict_passes),
            "short_passes": len(short_passes),
            "robust_passes": len(robust_passes),
            "robust_strict_passes": len(robust_strict_passes),
            "best_avg_excess_pct": max((float(row["avg_excess_return_pct"]) for row in idea_rows), default=0.0),
            "best_avg_test_pct": max((float(row["avg_test_return_pct"]) for row in idea_rows), default=0.0),
            "worst_max_dd_pct": max((float(row["max_test_drawdown_pct"]) for row in idea_rows), default=0.0),
            "quarantine_reason": quarantine_reason,
        }
    return statuses


def _load_holdout_ledger(config: dict[str, Any]) -> dict[str, Any] | None:
    policy = config.get("holdout_policy", {})
    ledger_path = policy.get("ledger")
    if not ledger_path:
        return None
    path = _resolve(str(ledger_path))
    if not path.exists():
        raise FileNotFoundError(f"Holdout ledger not found: {path}")
    ledger = json.loads(path.read_text(encoding="utf-8"))
    if ledger.get("symbol") != config.get("symbol"):
        raise ValueError(f"Holdout ledger symbol mismatch: {ledger.get('symbol')} != {config.get('symbol')}")
    return ledger


def _quarantined_families(config: dict[str, Any], holdout_ledger: dict[str, Any] | None) -> set[str]:
    policy = config.get("holdout_policy", {})
    if not holdout_ledger or not policy.get("quarantine_spent_families", False):
        return set()
    families = {str(item) for item in holdout_ledger.get("quarantined_families", [])}
    for check in holdout_ledger.get("spent_checks", []):
        if check.get("verdict") == "holdout_fail" and check.get("reject_family_neighborhood"):
            families.add(str(check["family"]))
    return families


def _quarantine_reason(family: str, holdout_ledger: dict[str, Any] | None) -> str:
    if not holdout_ledger:
        return ""
    holdout = f"{holdout_ledger.get('holdout_start_ts', '')}..{holdout_ledger.get('holdout_end_ts', '')}"
    return f"{family} already failed spent holdout period {holdout}; same-family neighbors are blocked from focused/holdout routing."


def _args(config: dict[str, Any], broker_fee: float, cost_bps: float, roll_window: int, window: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(
        dataset=config["dataset"],
        continuous_method=config["continuous_method"],
        timeframe=config["timeframe"],
        symbol=[config["symbol"]],
        use_moex_iss_costs=bool(config["use_moex_iss_costs"]),
        broker_fee_rub_per_contract=float(broker_fee),
        cost_bps=float(cost_bps),
        train_bars=int(window["train_bars"]),
        test_bars=int(window["test_bars"]),
        min_bars=int(window["min_bars"]),
        exclude_last_bars=int(config["exclude_last_bars"]),
        exclude_roll_window_bars=int(roll_window),
        window_name=str(window["name"]),
    )


def _validate_safety(config: dict[str, Any]) -> None:
    safety = config.get("safety", {})
    routing = config.get("routing", {})
    if safety.get("paper_allowed") or safety.get("live_allowed") or safety.get("real_orders_allowed"):
        raise ValueError("Idea autopilot must remain research-only.")
    if routing.get("auto_live_allowed") or routing.get("auto_paper_allowed"):
        raise ValueError("Auto paper/live routing is not allowed.")


def _apply_profile(args: argparse.Namespace) -> None:
    if args.profile == "smoke":
        args.max_ideas = args.max_ideas or 12
        args.limit_combos = args.limit_combos or 4
    elif args.profile == "daily":
        args.max_ideas = args.max_ideas or 60
        args.limit_combos = args.limit_combos or 24
    elif args.profile == "nightly":
        args.max_ideas = args.max_ideas or 0
        args.limit_combos = args.limit_combos or 0


def _markdown(
    config: dict[str, Any],
    summary: dict[str, Any],
    idea_statuses: dict[str, dict[str, Any]],
    rows: list[dict[str, Any]],
    failures: list[dict[str, Any]],
) -> str:
    status_counts = Counter(item["status"] for item in idea_statuses.values())
    family_counts = Counter(item["family"] for item in idea_statuses.values())
    pass_counts = Counter(row["family"] for row in rows if row["verdict"] == "screening_pass")
    top = sorted(idea_statuses.values(), key=lambda item: (item["status"] != "holdout_eligible", item["status"] != "research_lead", -item["screening_passes"], -item["best_avg_excess_pct"]))[:20]
    lines = [
        "# Idea Autopilot Report",
        "",
        f"- Run ID: `{summary['run_id']}`",
        f"- Symbol: `{config['symbol']}`",
        f"- Mode: `{config['safety']['mode']}`",
        f"- Ideas: `{summary['ideas']}`",
        f"- Rows: `{summary['rows']}`",
        f"- Failures: `{summary['failures']}`",
        f"- Screening passes: `{summary['screening_passes']}`",
        f"- Holdout ledger: `{summary.get('holdout_ledger', '')}`",
        f"- Quarantined ideas: `{summary.get('quarantined_ideas', 0)}`",
        f"- Holdout eligible: `{summary['holdout_eligible']}`",
        f"- Paper candidate: `{summary['paper_candidate']}`",
        f"- Live candidate: `{summary['live_candidate']}`",
        "",
        "## Status Counts",
        "",
    ]
    for status, count in sorted(status_counts.items()):
        lines.append(f"- `{status}`: `{count}`")
    lines.extend(["", "## Family Counts", ""])
    for family, count in sorted(family_counts.items()):
        lines.append(f"- `{family}`: `{count}` ideas, `{pass_counts[family]}` screening passes")
    quarantined = [item for item in idea_statuses.values() if item["status"] == "quarantined_after_holdout_fail"]
    if quarantined:
        lines.extend(["", "## Holdout Quarantine", ""])
        lines.append("- Same-family neighbors of a failed holdout are blocked from `focused_pack` and holdout routing on the same spent period.")
        for item in quarantined[:20]:
            lines.append(f"- `{item['idea_id']}`: `{item['quarantine_reason']}`")
    lines.extend(
        [
            "",
            "## Top Routed Ideas",
            "",
            "| idea | family | status | route | passes | strict | short | robust | robust strict | best excess % | best test % | worst DD % | params |",
            "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
        ]
    )
    for item in top:
        params = json.dumps(item["params"], sort_keys=True)
        lines.append(
            f"| {item['idea_id']} | {item['family']} | {item['status']} | {item['route']} | "
            f"{item['screening_passes']} | {item['strict_passes']} | {item['short_passes']} | {item['robust_passes']} | {item['robust_strict_passes']} | "
            f"{item['best_avg_excess_pct']:.2f} | {item['best_avg_test_pct']:.2f} | {item['worst_max_dd_pct']:.2f} | `{params}` |"
        )
    if failures:
        lines.extend(["", "## Failures", ""])
        for failure in failures[:50]:
            lines.append(f"- `{failure}`")
    lines.extend(
        [
            "",
            "## Safety",
            "",
            "- This autopilot only generates, tests, and routes ideas.",
            "- It never opens paper mode or live trading.",
            "- `holdout_eligible` means freeze for manual review, not automatic holdout execution.",
            "- A spent holdout rejects the configured family neighborhood, not just one parameter point.",
            "- Live remains manual-only after paper evidence and explicit user approval.",
        ]
    )
    return "\n".join(lines)


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _resolve(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


if __name__ == "__main__":
    raise SystemExit(main())
