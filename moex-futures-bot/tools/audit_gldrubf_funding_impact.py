#!/usr/bin/env python3
"""Estimate provisional GLDRUBF funding impact from MOEX ISS SWAPRATE."""

from __future__ import annotations

import argparse
import math
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--security", default="GLDRUBF")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    glob = str(paths.moex_iss_history_root / f"security={args.security}" / "history.parquet").replace("'", "''")
    con = duckdb.connect(str(paths.research_db))
    rows = con.execute(
        f"""
        SELECT tradedate, close, settleprice, swaprate
        FROM read_parquet('{glob}', hive_partitioning=false)
        WHERE secid = ?
        ORDER BY tradedate
        """,
        [args.security],
    ).fetchall()
    if len(rows) < 2:
        print(f"Not enough rows for {args.security}", file=sys.stderr)
        return 1

    close_raw = 1.0
    close_adjusted = 1.0
    settle_raw = 1.0
    settle_adjusted = 1.0
    swap_sum = 0.0
    nonzero_swap = 0

    previous = rows[0]
    for current in rows[1:]:
        prev_close = float(previous[1] or 0)
        prev_settle = float(previous[2] or 0)
        close = float(current[1] or 0)
        settle = float(current[2] or 0)
        swaprate = float(current[3] or 0)
        if swaprate:
            nonzero_swap += 1
            swap_sum += swaprate
        if prev_close > 0 and close > 0:
            close_raw *= close / prev_close
            close_adjusted *= 1 + (close - prev_close - swaprate) / prev_close
        if prev_settle > 0 and settle > 0:
            settle_raw *= settle / prev_settle
            settle_adjusted *= 1 + (settle - prev_settle - swaprate) / prev_settle
        previous = current

    report = _markdown(
        security=args.security,
        first=str(rows[0][0]),
        last=str(rows[-1][0]),
        rows=len(rows),
        nonzero_swap=nonzero_swap,
        swap_sum=swap_sum,
        close_raw=close_raw,
        close_adjusted=close_adjusted,
        settle_raw=settle_raw,
        settle_adjusted=settle_adjusted,
    )
    report_path = paths.reports_root / f"gldrubf_funding_impact_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    report_path.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nReport: {report_path}")
    return 0


def _markdown(
    *,
    security: str,
    first: str,
    last: str,
    rows: int,
    nonzero_swap: int,
    swap_sum: float,
    close_raw: float,
    close_adjusted: float,
    settle_raw: float,
    settle_adjusted: float,
) -> str:
    lines = [f"# {security} Funding Impact Audit", ""]
    lines.append("This is a provisional estimate, not final PnL accounting.")
    lines.append("")
    lines.append("| metric | value |")
    lines.append("|---|---:|")
    lines.append(f"| period | {first} - {last} |")
    lines.append(f"| rows | {rows} |")
    lines.append(f"| nonzero swaprate rows | {nonzero_swap} |")
    lines.append(f"| sum swaprate | {swap_sum:.5f} |")
    lines.append(f"| close raw return % | {(close_raw - 1) * 100:.2f} |")
    lines.append(f"| close funding-adjusted return % | {(close_adjusted - 1) * 100:.2f} |")
    lines.append(f"| close funding drag % points | {(close_raw - close_adjusted) * 100:.2f} |")
    lines.append(f"| settle raw return % | {(settle_raw - 1) * 100:.2f} |")
    lines.append(f"| settle funding-adjusted return % | {(settle_adjusted - 1) * 100:.2f} |")
    lines.append(f"| settle funding drag % points | {(settle_raw - settle_adjusted) * 100:.2f} |")
    lines.append("")
    lines.append("Assumption:")
    lines.append("- Positive `SWAPRATE` is treated as a RUB-per-contract funding charge paid by a long position.")
    lines.append("- This assumption follows MOEX perpetual-futures documentation directionally, but exact contract PnL still needs specification-level verification.")
    lines.append("- Strategy verdicts must remain blocked until this funding model is confirmed and integrated into backtests.")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
