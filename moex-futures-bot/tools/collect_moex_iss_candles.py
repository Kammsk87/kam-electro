#!/usr/bin/env python3
"""Collect public MOEX ISS futures candles."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


BASE_URL = "https://iss.moex.com/iss"
DEFAULT_SECURITIES = ["GLDRUBF", "BRQ6", "BRU6", "BRV6", "GDU6"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--security", action="append", help="MOEX SECID. Can be repeated.")
    parser.add_argument("--from-date", default="2023-01-01")
    parser.add_argument("--till-date", default=date.today().isoformat())
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--limit", type=int, default=500)
    return parser.parse_args()


def main() -> int:
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise SystemExit("Missing pyarrow. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    securities = args.security or DEFAULT_SECURITIES
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    conn = connect_state_db(paths.state_db)
    try:
        for security in securities:
            rows = collect_candles(security, args.from_date, args.till_date, args.interval, args.limit)
            if not rows:
                print(json.dumps({"security": security, "rows": 0, "status": "empty"}, ensure_ascii=False), flush=True)
                continue
            normalized = [_normalize(security, args.interval, row) for row in rows]
            out_path = paths.moex_iss_root / "candles" / f"interval={args.interval}" / f"security={safe_symbol(security)}" / "candles.parquet"
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
            print(
                json.dumps(
                    {
                        "security": security,
                        "interval": args.interval,
                        "rows": len(normalized),
                        "start": normalized[0]["begin"].isoformat(),
                        "end": normalized[-1]["end"].isoformat(),
                        "path": str(out_path),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    finally:
        conn.close()
    return 0


def collect_candles(security: str, from_date: str, till_date: str, interval: int, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        payload = _request_candles(security, from_date, till_date, interval, start, limit)
        block = payload.get("candles", {})
        columns = block.get("columns", [])
        data = block.get("data", [])
        if not data:
            break
        rows.extend(dict(zip(columns, item)) for item in data)
        cursor = payload.get("candles.cursor", {}).get("data", [])
        if not cursor:
            if len(data) < limit:
                break
            start += len(data)
            continue
        index, total, page_size = cursor[0]
        start = int(index) + int(page_size)
        if start >= int(total):
            break
    rows.sort(key=lambda item: item["begin"])
    return rows


def _request_candles(security: str, from_date: str, till_date: str, interval: int, start: int, limit: int) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "from": from_date,
            "till": till_date,
            "interval": interval,
            "start": start,
            "limit": limit,
            "iss.meta": "off",
        }
    )
    url = f"{BASE_URL}/engines/futures/markets/forts/securities/{urllib.parse.quote(security)}/candles.json?{query}"
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _normalize(security: str, interval: int, row: dict[str, Any]) -> dict[str, Any]:
    return {
        "secid": security,
        "interval": interval,
        "open": float(row.get("open") or 0),
        "close": float(row.get("close") or 0),
        "high": float(row.get("high") or 0),
        "low": float(row.get("low") or 0),
        "value": float(row.get("value") or 0),
        "volume": float(row.get("volume") or 0),
        "begin": datetime.fromisoformat(str(row["begin"])),
        "end": datetime.fromisoformat(str(row["end"])),
    }


def _schema(pa):
    return pa.schema(
        [
            ("secid", pa.string()),
            ("interval", pa.int32()),
            ("open", pa.float64()),
            ("close", pa.float64()),
            ("high", pa.float64()),
            ("low", pa.float64()),
            ("value", pa.float64()),
            ("volume", pa.float64()),
            ("begin", pa.timestamp("us")),
            ("end", pa.timestamp("us")),
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
