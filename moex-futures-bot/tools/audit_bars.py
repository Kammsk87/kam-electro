#!/usr/bin/env python3
"""Audit local bars for coverage, invalid OHLCV, and basic liquidity."""

from __future__ import annotations

import argparse
import json
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
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)

    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    parquet_glob = str(paths.bars_parquet_root / "timeframe=*" / "symbol=*" / "bars.parquet")
    conn = duckdb.connect(str(paths.research_db))
    escaped_glob = parquet_glob.replace("'", "''")
    conn.execute(
        f"""
        CREATE OR REPLACE VIEW finam_bars AS
        SELECT *
        FROM read_parquet('{escaped_glob}', hive_partitioning=false)
        """
    )
    summary = conn.execute(
        """
        WITH ordered AS (
            SELECT
                symbol,
                timeframe,
                ts,
                open,
                high,
                low,
                close,
                volume,
                lag(ts) OVER (PARTITION BY symbol, timeframe ORDER BY ts) AS prev_ts
            FROM finam_bars
        )
        SELECT
            symbol,
            timeframe,
            count(*) AS rows,
            min(ts) AS first_ts,
            max(ts) AS last_ts,
            sum(CASE WHEN open <= 0 OR high <= 0 OR low <= 0 OR close <= 0 THEN 1 ELSE 0 END) AS nonpositive_ohlc,
            sum(CASE WHEN high < greatest(open, close, low) OR low > least(open, close, high) THEN 1 ELSE 0 END) AS invalid_range,
            sum(CASE WHEN volume <= 0 THEN 1 ELSE 0 END) AS nonpositive_volume,
            avg(volume) AS avg_volume,
            median(volume) AS median_volume,
            max(date_diff('day', prev_ts, ts)) AS max_calendar_gap_days
        FROM ordered
        GROUP BY symbol, timeframe
        ORDER BY symbol, timeframe
        """
    ).fetchall()
    columns = [item[0] for item in conn.description]
    records = [dict(zip(columns, row)) for row in summary]

    report_path = paths.reports_root / f"bars_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = _markdown(records)
    report_path.write_text(report, encoding="utf-8")

    if args.format == "json":
        print(json.dumps({"report": str(report_path), "records": records}, ensure_ascii=False, default=str, indent=2))
    else:
        print(report)
        print(f"\nReport: {report_path}")
    return 0


def _markdown(records: list[dict[str, object]]) -> str:
    lines = ["# Bars Audit", ""]
    lines.append("| symbol | timeframe | rows | first | last | bad OHLC | bad range | zero volume | avg volume | median volume | max gap days |")
    lines.append("|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|")
    for row in records:
        lines.append(
            "| {symbol} | {timeframe} | {rows} | {first_ts} | {last_ts} | {nonpositive_ohlc} | {invalid_range} | {nonpositive_volume} | {avg_volume:.2f} | {median_volume:.2f} | {max_calendar_gap_days} |".format(
                **row
            )
        )
    lines.append("")
    lines.append("Notes:")
    lines.append("- Max gap is calendar days, so weekends and exchange holidays are expected in daily data.")
    lines.append("- Zero/low volume rows are not automatically bad, but they are a liquidity warning for backtests.")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
