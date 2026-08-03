#!/usr/bin/env python3
"""Collect MOEX ISS candles for all locally known futures of an assetcode."""

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

from collect_moex_iss_candles import _normalize, _schema, collect_candles
from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assetcode", default="BR")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--min-rows", type=int, default=20)
    parser.add_argument("--force", action="store_true", help="Refetch securities that already have candle files.")
    return parser.parse_args()


def main() -> int:
    try:
        import duckdb
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise SystemExit("Missing duckdb/pyarrow. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    con = duckdb.connect(str(paths.research_db))
    try:
        securities = _discover_asset_securities(con, paths, args.assetcode, args.min_rows)
    finally:
        con.close()

    if not securities:
        print(f"No local MOEX ISS history securities found for assetcode={args.assetcode}", file=sys.stderr)
        return 1

    conn = connect_state_db(paths.state_db)
    results: list[dict[str, object]] = []
    try:
        for item in securities:
            security = item["secid"]
            out_path = paths.moex_iss_root / "candles" / f"interval={args.interval}" / f"security={safe_symbol(security)}" / "candles.parquet"
            if out_path.exists() and not args.force:
                status = {"security": security, "status": "exists", "path": str(out_path)}
                results.append(status)
                print(json.dumps(status, ensure_ascii=False), flush=True)
                continue

            rows = collect_candles(security, item["from_date"], item["till_date"], args.interval, args.limit)
            if not rows:
                status = {"security": security, "status": "empty", "rows": 0}
                results.append(status)
                print(json.dumps(status, ensure_ascii=False), flush=True)
                continue

            normalized = [_normalize(security, args.interval, row) for row in rows]
            out_path.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(pa.Table.from_pylist(normalized, schema=_schema(pa)), out_path, compression="zstd")
            record_data_inventory(
                conn,
                source="moex_iss",
                dataset=f"candles_{args.interval}",
                symbol=security,
                timeframe=f"INTERVAL_{args.interval}",
                start_ts=normalized[0]["begin"].isoformat(),
                end_ts=normalized[-1]["end"].isoformat(),
                row_count=len(normalized),
                storage_path=out_path,
                content_format="parquet",
            )
            conn.commit()
            status = {
                "security": security,
                "status": "collected",
                "interval": args.interval,
                "rows": len(normalized),
                "start": normalized[0]["begin"].isoformat(),
                "end": normalized[-1]["end"].isoformat(),
                "path": str(out_path),
            }
            results.append(status)
            print(json.dumps(status, ensure_ascii=False), flush=True)
    finally:
        conn.close()

    summary = _summary(args, results)
    report_path = _write_report(paths.reports_root, summary)
    print(json.dumps({**summary, "report": str(report_path)}, ensure_ascii=False, indent=2))
    return 0


def _discover_asset_securities(con, paths, assetcode: str, min_rows: int) -> list[dict[str, str]]:
    glob = str(paths.moex_iss_history_root / "security=*" / "history.parquet")
    rows = con.execute(
        """
        SELECT secid, min(tradedate) AS from_date, max(tradedate) AS till_date, count(*) AS rows
        FROM read_parquet(?, hive_partitioning=false)
        WHERE assetcode = ?
        GROUP BY secid
        HAVING count(*) >= ?
        ORDER BY min(tradedate), secid
        """,
        [glob, assetcode, min_rows],
    ).fetchall()
    return [
        {
            "secid": str(row[0]),
            "from_date": row[1].isoformat(),
            "till_date": row[2].isoformat(),
            "history_rows": int(row[3]),
        }
        for row in rows
    ]


def _summary(args: argparse.Namespace, results: list[dict[str, object]]) -> dict[str, object]:
    collected = [item for item in results if item["status"] == "collected"]
    existing = [item for item in results if item["status"] == "exists"]
    empty = [item for item in results if item["status"] == "empty"]
    return {
        "assetcode": args.assetcode,
        "interval": args.interval,
        "securities": len(results),
        "collected": len(collected),
        "existing": len(existing),
        "empty": len(empty),
        "rows_collected": sum(int(item.get("rows", 0)) for item in collected),
    }


def _write_report(root: Path, summary: dict[str, object]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"moex_iss_asset_candles_{summary['assetcode']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    lines = [
        "# MOEX ISS Asset Candles Collection",
        "",
        f"- Assetcode: `{summary['assetcode']}`",
        f"- Interval: `{summary['interval']}`",
        f"- Securities: `{summary['securities']}`",
        f"- Collected: `{summary['collected']}`",
        f"- Existing: `{summary['existing']}`",
        f"- Empty: `{summary['empty']}`",
        f"- Rows collected: `{summary['rows_collected']}`",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


if __name__ == "__main__":
    raise SystemExit(main())
