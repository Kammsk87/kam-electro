#!/usr/bin/env python3
"""Summarize a saved experiment factory run."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", help="Factory run directory under data/reports/factory.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_dir = Path(args.run_dir)
    summary = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
    rows = []
    with (run_dir / "results.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    passes = [row for row in rows if row["verdict"] == "screening_pass"]
    print(f"run_id: {summary['run_id']}")
    print(f"rows: {summary['rows']}, failures: {summary['failures']}, screening_passes: {summary['screening_passes']}")
    print(f"holdout_eligible: {summary['holdout_eligible']}, paper_candidate: {summary['paper_candidate']}")
    print("statuses:")
    for strategy, status in summary["strategy_statuses"].items():
        print(f"- {strategy}: {status['status']} ({status['screening_passes']} passes)")
    print("passes by strategy:")
    for strategy, count in sorted(Counter(row["strategy"] for row in passes).items()):
        print(f"- {strategy}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
