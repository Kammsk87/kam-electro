#!/usr/bin/env python3
"""Run a configured strategy research factory."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


ROW_RE = re.compile(r"^\| (?P<symbol>[^|]+) \| (?P<strategy>[^|]+) \| (?P<folds>\d+) \| (?P<period>[^|]+) \| (?P<avg_test>[-0-9.]+) \| (?P<avg_bh>[-0-9.]+) \| (?P<avg_excess>[-0-9.]+) \| (?P<pos_excess>[-0-9.]+) \| (?P<sign_p>[-0-9.]+) \| (?P<worst_excess>[-0-9.]+) \| (?P<max_dd>[-0-9.]+) \| (?P<trades>\d+) \| (?P<verdict>[^|]+) \|$")
REPORT_RE = re.compile(r"^Report: (?P<path>.+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Path to experiment JSON config.")
    parser.add_argument("--limit-combos", type=int, default=0, help="Optional smoke limit for window/cost/roll/broker combinations.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)

    config_path = Path(args.config)
    if not config_path.is_absolute():
        config_path = PROJECT_ROOT / config_path
    config = json.loads(config_path.read_text(encoding="utf-8"))
    _validate_config(config)

    run_id = f"{safe_symbol(config['name'])}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    out_dir = paths.reports_root / "factory" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    rows: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    combo_count = 0
    for window in config["windows"]:
        for broker_fee in config["broker_fees_rub_per_contract"]:
            for cost_bps in config["cost_bps"]:
                for roll_window in config["roll_windows"]:
                    combo_count += 1
                    if args.limit_combos and combo_count > args.limit_combos:
                        continue
                    command = _command(config, window, broker_fee, cost_bps, roll_window)
                    proc = subprocess.run(command, cwd=PROJECT_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    if proc.returncode != 0:
                        failures.append(
                            {
                                "window": window["name"],
                                "broker_fee": broker_fee,
                                "cost_bps": cost_bps,
                                "roll_window": roll_window,
                                "command": " ".join(command),
                                "stderr": proc.stderr.strip(),
                            }
                        )
                        continue
                    rows.extend(_parse_stdout(proc.stdout, window["name"], broker_fee, cost_bps, roll_window, command))

    statuses = _strategy_statuses(rows, config)
    summary = {
        "run_id": run_id,
        "config": str(config_path),
        "rows": len(rows),
        "failures": len(failures),
        "screening_passes": sum(1 for row in rows if row["verdict"] == "screening_pass"),
        "strategy_statuses": statuses,
        "paper_candidate": any(status["status"] == "paper_candidate" for status in statuses.values()),
        "holdout_eligible": any(status["status"] == config["gates"]["holdout_allowed_status"] for status in statuses.values()),
    }

    _write_jsonl(out_dir / "results.jsonl", rows)
    _write_jsonl(out_dir / "failures.jsonl", failures)
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path = out_dir / "report.md"
    report_path.write_text(_markdown(config, summary, rows, failures), encoding="utf-8")
    print(json.dumps({**summary, "report": str(report_path), "out_dir": str(out_dir)}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


def _validate_config(config: dict[str, Any]) -> None:
    required = [
        "name",
        "dataset",
        "continuous_method",
        "symbol",
        "timeframe",
        "strategies",
        "windows",
        "broker_fees_rub_per_contract",
        "cost_bps",
        "roll_windows",
        "gates",
        "safety",
    ]
    missing = [key for key in required if key not in config]
    if missing:
        raise ValueError(f"Missing config keys: {missing}")
    if config["safety"].get("paper_allowed") or config["safety"].get("live_allowed"):
        raise ValueError("Factory configs must remain research-only.")


def _command(config: dict[str, Any], window: dict[str, Any], broker_fee: float, cost_bps: float, roll_window: int) -> list[str]:
    command = [
        str(PROJECT_ROOT / ".venv" / "bin" / "python"),
        "tools/run_walk_forward.py",
        "--dataset",
        str(config["dataset"]),
        "--continuous-method",
        str(config["continuous_method"]),
        "--symbol",
        str(config["symbol"]),
        "--timeframe",
        str(config["timeframe"]),
        "--train-bars",
        str(window["train_bars"]),
        "--test-bars",
        str(window["test_bars"]),
        "--min-bars",
        str(window["min_bars"]),
        "--cost-bps",
        str(cost_bps),
        "--broker-fee-rub-per-contract",
        str(broker_fee),
        "--exclude-last-bars",
        str(config["exclude_last_bars"]),
        "--exclude-roll-window-bars",
        str(roll_window),
    ]
    if config.get("use_moex_iss_costs"):
        command.append("--use-moex-iss-costs")
    for strategy in config["strategies"]:
        command.extend(["--strategy", strategy])
    return command


def _parse_stdout(stdout: str, window: str, broker_fee: float, cost_bps: float, roll_window: int, command: list[str]) -> list[dict[str, Any]]:
    report_path = ""
    parsed: list[dict[str, Any]] = []
    for line in stdout.splitlines():
        report_match = REPORT_RE.match(line)
        if report_match:
            report_path = report_match.group("path")
            continue
        row_match = ROW_RE.match(line)
        if not row_match:
            continue
        data = row_match.groupdict()
        parsed.append(
            {
                "window": window,
                "broker_fee": broker_fee,
                "cost_bps": cost_bps,
                "roll_window": roll_window,
                "symbol": data["symbol"].strip(),
                "strategy": data["strategy"].strip(),
                "folds": int(data["folds"]),
                "avg_test_pct": float(data["avg_test"]),
                "avg_benchmark_pct": float(data["avg_bh"]),
                "avg_excess_pct": float(data["avg_excess"]),
                "positive_excess_pct": float(data["pos_excess"]),
                "sign_p": float(data["sign_p"]),
                "worst_excess_pct": float(data["worst_excess"]),
                "max_dd_pct": float(data["max_dd"]),
                "trades": int(data["trades"]),
                "verdict": data["verdict"].strip(),
                "walk_forward_report": report_path,
                "command": " ".join(command),
            }
        )
    for row in parsed:
        row["walk_forward_report"] = report_path
    return parsed


def _strategy_statuses(rows: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    gates = config["gates"]
    strict_prefix = str(gates["strict_window_prefix"])
    short_prefix = str(gates["short_window_prefix"])
    robust_min_cost = float(gates["robust_min_cost_bps"])
    robust_min_broker = float(gates["robust_min_broker_fee_rub"])
    robust_min_roll = int(gates["robust_min_roll_window"])
    statuses: dict[str, dict[str, Any]] = {}
    for strategy in config["strategies"]:
        strategy_rows = [row for row in rows if row["strategy"] == strategy]
        passes = [row for row in strategy_rows if row["verdict"] == "screening_pass"]
        strict_passes = [row for row in passes if str(row["window"]).startswith(strict_prefix)]
        short_passes = [row for row in passes if str(row["window"]).startswith(short_prefix)]
        robust_passes = [
            row
            for row in passes
            if float(row["cost_bps"]) >= robust_min_cost
            and float(row["broker_fee"]) >= robust_min_broker
            and int(row["roll_window"]) >= robust_min_roll
        ]
        robust_strict_passes = [row for row in robust_passes if str(row["window"]).startswith(strict_prefix)]
        if robust_strict_passes and short_passes:
            status = "holdout_eligible"
        elif strict_passes or robust_passes:
            status = "research_lead"
        elif short_passes:
            status = "research_lead_short_only"
        else:
            status = "rejected"
        statuses[strategy] = {
            "status": status,
            "rows": len(strategy_rows),
            "screening_passes": len(passes),
            "strict_passes": len(strict_passes),
            "short_passes": len(short_passes),
            "robust_passes": len(robust_passes),
            "robust_strict_passes": len(robust_strict_passes),
            "best_avg_excess_pct": max((float(row["avg_excess_pct"]) for row in strategy_rows), default=0.0),
            "best_avg_test_pct": max((float(row["avg_test_pct"]) for row in strategy_rows), default=0.0),
            "worst_max_dd_pct": max((float(row["max_dd_pct"]) for row in strategy_rows), default=0.0),
        }
    return statuses


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _markdown(config: dict[str, Any], summary: dict[str, Any], rows: list[dict[str, Any]], failures: list[dict[str, Any]]) -> str:
    pass_counts = Counter(row["strategy"] for row in rows if row["verdict"] == "screening_pass")
    window_pass_counts = Counter((row["window"], row["strategy"]) for row in rows if row["verdict"] == "screening_pass")
    robust_counts = Counter(
        row["strategy"]
        for row in rows
        if row["verdict"] == "screening_pass"
        and float(row["cost_bps"]) >= float(config["gates"]["robust_min_cost_bps"])
        and float(row["broker_fee"]) >= float(config["gates"]["robust_min_broker_fee_rub"])
        and int(row["roll_window"]) >= int(config["gates"]["robust_min_roll_window"])
    )
    lines = [
        "# Experiment Factory Report",
        "",
        f"- Run ID: `{summary['run_id']}`",
        f"- Config: `{summary['config']}`",
        f"- Symbol: `{config['symbol']}`",
        f"- Continuous method: `{config['continuous_method']}`",
        f"- Mode: `{config['safety']['mode']}`",
        f"- Holdout excluded: `{config['exclude_last_bars']}` bars",
        f"- Rows: `{summary['rows']}`",
        f"- Failures: `{summary['failures']}`",
        f"- Screening passes: `{summary['screening_passes']}`",
        f"- Holdout eligible exists: `{summary['holdout_eligible']}`",
        f"- Paper candidate exists: `{summary['paper_candidate']}`",
        "",
        "## Strategy Status",
        "",
        "| strategy | status | rows | passes | strict passes | short passes | robust passes | robust strict | best excess % | best test % | worst max DD % |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for strategy, status in summary["strategy_statuses"].items():
        lines.append(
            f"| {strategy} | {status['status']} | {status['rows']} | {status['screening_passes']} | "
            f"{status['strict_passes']} | {status['short_passes']} | {status['robust_passes']} | {status['robust_strict_passes']} | "
            f"{status['best_avg_excess_pct']:.2f} | {status['best_avg_test_pct']:.2f} | {status['worst_max_dd_pct']:.2f} |"
        )
    lines.extend(["", "## Pass Counts", ""])
    for strategy in config["strategies"]:
        lines.append(f"- `{strategy}`: `{pass_counts[strategy]}` screening passes; robust `{robust_counts[strategy]}`.")
    lines.extend(["", "## Window Pass Counts", ""])
    for (window, strategy), count in sorted(window_pass_counts.items()):
        lines.append(f"- `{window}` / `{strategy}`: `{count}`")
    if failures:
        lines.extend(["", "## Failures", ""])
        for failure in failures:
            lines.append(f"- `{failure['window']}` broker `{failure['broker_fee']}` cost `{failure['cost_bps']}` roll `{failure['roll_window']}`: {failure['stderr']}")
    lines.extend(
        [
            "",
            "## Gate Notes",
            "",
            "- `holdout_eligible` requires at least one robust strict-window pass plus at least one short-window pass.",
            "- Factory output does not open paper mode.",
            "- Holdout remains excluded unless a candidate is frozen in writing.",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
