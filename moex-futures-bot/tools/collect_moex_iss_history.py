#!/usr/bin/env python3
"""Collect public MOEX ISS futures history with SETTLEPRICE and SWAPRATE."""

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
    parser.add_argument("--security", action="append", help="MOEX SECID, e.g. GLDRUBF or BRQ6. Can be repeated.")
    parser.add_argument("--from-date", default="2023-01-01")
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
    securities = args.security or ["GLDRUBF", "BRQ6", "BRU6", "BRV6", "GDU6"]
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    conn = connect_state_db(paths.state_db)
    try:
        for security in securities:
            rows = collect_history(security, args.from_date, args.till_date, args.limit)
            if not rows:
                print(json.dumps({"security": security, "rows": 0, "status": "empty"}, ensure_ascii=False), flush=True)
                continue
            out_path = paths.moex_iss_history_root / f"security={safe_symbol(security)}" / "history.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            normalized = [_normalize(row) for row in rows]
            table = pa.Table.from_pylist(normalized, schema=_schema(pa))
            pq.write_table(table, out_path, compression="zstd")
            record_data_inventory(
                conn,
                source="moex_iss",
                dataset="futures_history",
                symbol=security,
                timeframe="TIME_FRAME_D",
                start_ts=str(normalized[0]["tradedate"]),
                end_ts=str(normalized[-1]["tradedate"]),
                row_count=len(normalized),
                storage_path=out_path,
                content_format="parquet",
            )
            conn.commit()
            print(
                json.dumps(
                    {
                        "security": security,
                        "rows": len(normalized),
                        "start": str(normalized[0]["tradedate"]),
                        "end": str(normalized[-1]["tradedate"]),
                        "nonzero_swaprate_rows": sum(1 for row in normalized if row["swaprate"] != 0),
                        "path": str(out_path),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    finally:
        conn.close()
    return 0


def collect_history(security: str, from_date: str, till_date: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        payload = _request_history(security, from_date, till_date, start, limit)
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


def _request_history(security: str, from_date: str, till_date: str, start: int, limit: int) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "from": from_date,
            "till": till_date,
            "start": start,
            "limit": limit,
            "iss.meta": "off",
        }
    )
    url = f"{BASE_URL}/history/engines/futures/markets/forts/securities/{urllib.parse.quote(security)}.json?{query}"
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def _normalize(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "boardid": str(row.get("BOARDID") or ""),
        "tradedate": date.fromisoformat(str(row["TRADEDATE"])),
        "secid": str(row.get("SECID") or ""),
        "shortname": str(row.get("SHORTNAME") or ""),
        "assetcode": str(row.get("ASSETCODE") or ""),
        "open": _float(row.get("OPEN")),
        "low": _float(row.get("LOW")),
        "high": _float(row.get("HIGH")),
        "close": _float(row.get("CLOSE")),
        "settleprice": _float(row.get("SETTLEPRICE")),
        "swaprate": _float(row.get("SWAPRATE")),
        "waprice": _float(row.get("WAPRICE")),
        "value": _float(row.get("VALUE")),
        "volume": _int(row.get("VOLUME")),
        "openposition": _int(row.get("OPENPOSITION")),
        "numtrades": _int(row.get("NUMTRADES")),
    }


def _schema(pa):
    return pa.schema(
        [
            ("boardid", pa.string()),
            ("tradedate", pa.date32()),
            ("secid", pa.string()),
            ("shortname", pa.string()),
            ("assetcode", pa.string()),
            ("open", pa.float64()),
            ("low", pa.float64()),
            ("high", pa.float64()),
            ("close", pa.float64()),
            ("settleprice", pa.float64()),
            ("swaprate", pa.float64()),
            ("waprice", pa.float64()),
            ("value", pa.float64()),
            ("volume", pa.int64()),
            ("openposition", pa.int64()),
            ("numtrades", pa.int64()),
        ]
    )


def _float(raw: Any) -> float:
    return float(raw or 0)


def _int(raw: Any) -> int:
    return int(raw or 0)


if __name__ == "__main__":
    raise SystemExit(main())
