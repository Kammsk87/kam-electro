#!/usr/bin/env python3
"""Check whether paper/execution research gate is open."""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths


def main() -> int:
    paths = default_storage_paths(PROJECT_ROOT)
    reports = sorted(paths.reports_root.glob("candidate_review_*.md"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not reports:
        print("blocked: no candidate_review report found")
        return 1
    latest = reports[0]
    text = latest.read_text(encoding="utf-8")
    if "Current gate verdict: `paper_candidate`" in text:
        print(f"open: {latest}")
        return 0
    print(f"blocked: {latest}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
