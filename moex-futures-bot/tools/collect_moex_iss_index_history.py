#!/usr/bin/env python3
"""Collect public MOEX ISS index history, e.g. RUSFAR."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


BASE_URL = "https://iss.moex.com/iss"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--security", default="RUSFAR")
    parser.add_argument("--board", default="MMIX")
    parser.add_argument("--from-date", default="2024-01-01")
    parser.add_argument("--till-date", default=date.today().isoformat())
    parser.add_argument("--limit", type=int, default=100)
    return parser.parse_args()


def main() -> int:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise SystemExit("Missing pyarrow. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    rows = collect_history(args.security, args.board, args.from_date, args.till_date, args.limit)
    if not rows:
        print(json.dumps({"security": args.security, "rows": 0, "status": "empty"}, ensure_ascii=False))
        return 1

    normalized = [_normalize(row) for row in rows]
    out_path = paths.moex_iss_root / "index_history" / f"security={safe_symbol(args.security)}" / "history.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(normalized, schema=_schema(pa)), out_path, compression="zstd")

    conn = connect_state_db(paths.state_db)
    try:
        record_data_inventory(
            conn,
            source="moex_iss",
            dataset="index_history",
            symbol=args.security,
            timeframe="TIME_FRAME_D",
            start_ts=str(normalized[0]["tradedate"]),
            end_ts=str(normalized[-1]["tradedate"]),
            row_count=len(normalized),
            storage_path=out_path,
            content_format="parquet",
        )
        conn.commit()
    finally:
        conn.close()

    print(
        json.dumps(
            {
                "security": args.security,
                "board": args.board,
                "rows": len(normalized),
                "start": str(normalized[0]["tradedate"]),
                "end": str(normalized[-1]["tradedate"]),
                "path": str(out_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def collect_history(security: str, board: str, from_date: str, till_date: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        payload = _request_history(security, board, from_date, till_date, start, limit)
        block = payload.get("history", {})
        columns = block.get("columns", [])
        data = block.get("data", [])
        if not data:
            break
        rows.extend(dict(zip(columns, item)) for item in data)
        cursor = payload.get("history.cursor", {}).get("data", [])
        if not cursor:
            break
        index, total, page_size = cursor[0]
        start = int(index) + int(page_size)
        if start >= int(total):
            break
    rows.sort(key=lambda item: item["TRADEDATE"])
    return rows


def _request_history(security: str, board: str, from_date: str, till_date: str, start: int, limit: int) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "from": from_date,
            "till": till_date,
            "start": start,
            "limit": limit,
            "iss.meta": "off",
        }
    )
    url = f"{BASE_URL}/history/engines/stock/markets/index/boards/{urllib.parse.quote(board)}/securities/{urllib.parse.quote(security)}.json?{query}"
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _normalize(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "boardid": str(row.get("BOARDID") or ""),
        "secid": str(row.get("SECID") or ""),
        "tradedate": date.fromisoformat(str(row["TRADEDATE"])),
        "shortname": str(row.get("SHORTNAME") or ""),
        "name": str(row.get("NAME") or ""),
        "open": float(row.get("OPEN") or 0),
        "high": float(row.get("HIGH") or 0),
        "low": float(row.get("LOW") or 0),
        "close": float(row.get("CLOSE") or 0),
        "value": float(row.get("VALUE") or 0),
        "trading_session": str(row.get("TRADINGSESSION") or ""),
        "trade_session_date": str(row.get("TRADE_SESSION_DATE") or ""),
    }


def _schema(pa):
    return pa.schema(
        [
            ("boardid", pa.string()),
            ("secid", pa.string()),
            ("tradedate", pa.date32()),
            ("shortname", pa.string()),
            ("name", pa.string()),
            ("open", pa.float64()),
            ("high", pa.float64()),
            ("low", pa.float64()),
            ("close", pa.float64()),
            ("value", pa.float64()),
            ("trading_session", pa.string()),
            ("trade_session_date", pa.string()),
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
