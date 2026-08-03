#!/usr/bin/env python3
"""Run a Brent return-stitched robustness matrix."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage


ROW_RE = re.compile(r"^\| (?P<symbol>[^|]+) \| (?P<strategy>[^|]+) \| (?P<folds>\d+) \| (?P<period>[^|]+) \| (?P<avg_test>[-0-9.]+) \| (?P<avg_bh>[-0-9.]+) \| (?P<avg_excess>[-0-9.]+) \| (?P<pos_excess>[-0-9.]+) \| (?P<sign_p>[-0-9.]+) \| (?P<worst_excess>[-0-9.]+) \| (?P<max_dd>[-0-9.]+) \| (?P<trades>\d+) \| (?P<verdict>[^|]+) \|$")
REPORT_RE = re.compile(r"^Report: (?P<path>.+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbol", default="BR_return_stitched@MOEX_ISS")
    parser.add_argument("--continuous-method", default="sticky_volume_leader_return_stitched")
    parser.add_argument("--broker-fees", default="0.45,1.0,2.0")
    parser.add_argument("--cost-bps", default="0,10,25,50")
    parser.add_argument("--roll-windows", default="0,1,2")
    parser.add_argument("--exclude-last-bars", type=int, default=252)
    parser.add_argument(
        "--strategy",
        action="append",
        choices=("momentum_sma", "breakout_high_low", "mean_reversion_sma", "atr_breakout", "trend_volatility", "roll_aware_breakout"),
        help="Run only this strategy family. Can be repeated.",
    )
    parser.add_argument(
        "--windows",
        default="strict_252_63:252:63:360,short_80_20:80:20:180",
        help="Comma-separated name:train:test:min windows.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)

    windows = _window_list(args.windows)
    broker_fees = _float_list(args.broker_fees)
    cost_bps_values = _float_list(args.cost_bps)
    roll_windows = _int_list(args.roll_windows)

    rows: list[dict[str, object]] = []
    failures: list[dict[str, object]] = []
    for window in windows:
        for broker_fee in broker_fees:
            for cost_bps in cost_bps_values:
                for roll_window in roll_windows:
                    command = _command(args, window, broker_fee, cost_bps, roll_window)
                    proc = subprocess.run(command, cwd=PROJECT_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    if proc.returncode != 0:
                        failures.append(
                            {
                                "window": window["name"],
                                "broker_fee": broker_fee,
                                "cost_bps": cost_bps,
                                "roll_window": roll_window,
                                "stderr": proc.stderr.strip(),
                            }
                        )
                        continue
                    rows.extend(_parse_stdout(proc.stdout, window["name"], broker_fee, cost_bps, roll_window, command))

    report_path = _write_report(paths.reports_root, rows, failures, args)
    print(json.dumps({"rows": len(rows), "failures": len(failures), "report": str(report_path)}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


def _command(args: argparse.Namespace, window: dict[str, object], broker_fee: float, cost_bps: float, roll_window: int) -> list[str]:
    command = [
        str(PROJECT_ROOT / ".venv" / "bin" / "python"),
        "tools/run_walk_forward.py",
        "--dataset",
        "moex_iss_continuous",
        "--continuous-method",
        args.continuous_method,
        "--symbol",
        args.symbol,
        "--train-bars",
        str(window["train"]),
        "--test-bars",
        str(window["test"]),
        "--min-bars",
        str(window["min"]),
        "--cost-bps",
        str(cost_bps),
        "--use-moex-iss-costs",
        "--broker-fee-rub-per-contract",
        str(broker_fee),
        "--exclude-last-bars",
        str(args.exclude_last_bars),
        "--exclude-roll-window-bars",
        str(roll_window),
    ]
    for strategy in args.strategy or []:
        command.extend(["--strategy", strategy])
    return command


def _parse_stdout(stdout: str, window: str, broker_fee: float, cost_bps: float, roll_window: int, command: list[str]) -> list[dict[str, object]]:
    report_path = ""
    parsed: list[dict[str, object]] = []
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
                "report": report_path,
                "command": " ".join(command),
            }
        )
    for row in parsed:
        row["report"] = report_path
    return parsed


def _write_report(root: Path, rows: list[dict[str, object]], failures: list[dict[str, object]], args: argparse.Namespace) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"brent_research_matrix_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    path.write_text(_markdown(rows, failures, args), encoding="utf-8")
    return path


def _markdown(rows: list[dict[str, object]], failures: list[dict[str, object]], args: argparse.Namespace) -> str:
    screening = [row for row in rows if row["verdict"] == "screening_pass"]
    lines = [
        "# Brent Research Matrix",
        "",
        f"- Symbol: `{args.symbol}`",
        f"- Continuous method: `{args.continuous_method}`",
        f"- Holdout bars excluded: `{args.exclude_last_bars}`",
        f"- Matrix rows: `{len(rows)}`",
        f"- Failures: `{len(failures)}`",
        f"- Screening passes: `{len(screening)}`",
        "",
        "## Screening Passes",
        "",
        "| window | strategy | broker fee | cost bps | roll window | avg test % | avg B&H % | avg excess % | positive excess % | sign p | worst excess % | max DD % | trades | report |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in screening:
        lines.append(_row(row))
    if not screening:
        lines.append("| - | - | - | - | - | - | - | - | - | - | - | - | - | - |")
    lines.extend(
        [
            "",
            "## All Rows",
            "",
            "| window | strategy | broker fee | cost bps | roll window | avg test % | avg B&H % | avg excess % | positive excess % | sign p | worst excess % | max DD % | trades | verdict | report |",
            "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
        ]
    )
    for row in sorted(rows, key=lambda item: (str(item["strategy"]), str(item["window"]), float(item["broker_fee"]), float(item["cost_bps"]), int(item["roll_window"]))):
        lines.append(_row(row, include_verdict=True))
    if failures:
        lines.extend(["", "## Failures", ""])
        for failure in failures:
            lines.append(f"- `{failure['window']}` broker `{failure['broker_fee']}` cost `{failure['cost_bps']}` roll `{failure['roll_window']}`: {failure['stderr']}")
    lines.extend(
        [
            "",
            "Notes:",
            "- Holdout bars are excluded before train/test windows are formed.",
            "- `roll_window` removes +/- N rows around raw chain roll dates.",
            "- `screening_pass` is a research screen only, not paper-mode permission.",
        ]
    )
    return "\n".join(lines)


def _row(row: dict[str, object], include_verdict: bool = False) -> str:
    common = (
        f"| {row['window']} | {row['strategy']} | {row['broker_fee']:.2f} | {row['cost_bps']:.1f} | {row['roll_window']} | "
        f"{row['avg_test_pct']:.2f} | {row['avg_benchmark_pct']:.2f} | {row['avg_excess_pct']:.2f} | "
        f"{row['positive_excess_pct']:.2f} | {row['sign_p']:.3f} | {row['worst_excess_pct']:.2f} | {row['max_dd_pct']:.2f} | {row['trades']} | "
    )
    if include_verdict:
        return common + f"{row['verdict']} | `{row['report']}` |"
    return common + f"`{row['report']}` |"


def _float_list(value: str) -> list[float]:
    return [float(item.strip()) for item in value.split(",") if item.strip()]


def _int_list(value: str) -> list[int]:
    return [int(item.strip()) for item in value.split(",") if item.strip()]


def _window_list(value: str) -> list[dict[str, object]]:
    windows: list[dict[str, object]] = []
    for item in value.split(","):
        if not item.strip():
            continue
        parts = item.strip().split(":")
        if len(parts) != 4:
            raise ValueError(f"Window must be name:train:test:min, got: {item}")
        windows.append({"name": parts[0], "train": int(parts[1]), "test": int(parts[2]), "min": int(parts[3])})
    if not windows:
        raise ValueError("At least one window is required")
    return windows


if __name__ == "__main__":
    raise SystemExit(main())
