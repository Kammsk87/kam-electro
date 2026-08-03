#!/usr/bin/env python3
"""Audit collected MOEX ISS futures history, especially SWAPRATE."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    glob = str(paths.moex_iss_history_root / "security=*" / "history.parquet").replace("'", "''")
    con = duckdb.connect(str(paths.research_db))
    con.execute(
        f"""
        CREATE OR REPLACE VIEW moex_iss_futures_history AS
        SELECT *
        FROM read_parquet('{glob}', hive_partitioning=false)
        """
    )
    rows = con.execute(
        """
        SELECT
            secid,
            count(*) AS rows,
            min(tradedate) AS first_date,
            max(tradedate) AS last_date,
            sum(CASE WHEN open <= 0 OR high <= 0 OR low <= 0 OR close <= 0 THEN 1 ELSE 0 END) AS nonpositive_ohlc,
            sum(CASE WHEN high < greatest(open, close, low) OR low > least(open, close, high) THEN 1 ELSE 0 END) AS invalid_range,
            sum(CASE WHEN volume <= 0 THEN 1 ELSE 0 END) AS nonpositive_volume,
            sum(CASE WHEN swaprate != 0 THEN 1 ELSE 0 END) AS nonzero_swaprate_rows,
            min(swaprate) AS min_swaprate,
            max(swaprate) AS max_swaprate,
            avg(swaprate) AS avg_swaprate,
            avg(volume) AS avg_volume,
            median(volume) AS median_volume
        FROM moex_iss_futures_history
        GROUP BY secid
        ORDER BY secid
        """
    ).fetchall()
    columns = [item[0] for item in con.description]
    records = [dict(zip(columns, row)) for row in rows]
    report = _markdown(records)
    report_path = paths.reports_root / f"moex_iss_history_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    report_path.write_text(report, encoding="utf-8")
    if args.format == "json":
        import json

        print(json.dumps({"report": str(report_path), "records": records}, ensure_ascii=False, default=str, indent=2))
    else:
        print(report)
        print(f"\nReport: {report_path}")
    return 0


def _markdown(records: list[dict[str, object]]) -> str:
    lines = ["# MOEX ISS Futures History Audit", ""]
    lines.append("| secid | rows | first | last | bad OHLC | bad range | zero volume | nonzero swaprate | min swap | max swap | avg swap | avg volume | median volume |")
    lines.append("|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for row in records:
        lines.append(
            "| {secid} | {rows} | {first_date} | {last_date} | {nonpositive_ohlc} | {invalid_range} | {nonpositive_volume} | {nonzero_swaprate_rows} | {min_swaprate:.5f} | {max_swaprate:.5f} | {avg_swaprate:.5f} | {avg_volume:.2f} | {median_volume:.2f} |".format(
                **row
            )
        )
    lines.append("")
    lines.append("Notes:")
    lines.append("- `SWAPRATE` is the key field for GLDRUBF funding research.")
    lines.append("- Ordinary dated futures are expected to have zero `SWAPRATE`.")
    lines.append("- This audit does not yet translate `SWAPRATE` into position PnL.")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
