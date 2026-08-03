#!/usr/bin/env python3
"""Collect public MOEX ISS futures history for an ASSETCODE, e.g. BR."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
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
    parser.add_argument("--assetcode", default="BR")
    parser.add_argument("--from-date", default="2018-01-01")
    parser.add_argument("--till-date", default=date.today().isoformat())
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--min-rows", type=int, default=20)
    parser.add_argument("--from-year", type=int, default=2018)
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

    securities = discover_asset_securities(args.assetcode, args.from_year, args.limit)
    print(json.dumps({"status": "discovered", "assetcode": args.assetcode, "securities": len(securities)}, ensure_ascii=False), flush=True)
    by_security: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for security in securities:
        rows = collect_security_history(security, args.from_date, args.till_date, args.limit)
        normalized = [_normalize(row) for row in rows if str(row.get("ASSETCODE") or "") == args.assetcode]
        normalized = [row for row in normalized if row["volume"] > 0 and row["close"] > 0 and row["settleprice"] > 0]
        for row in normalized:
            by_security[str(row["secid"])].append(row)

    conn = connect_state_db(paths.state_db)
    written = 0
    total_rows = 0
    try:
        for security, security_rows in sorted(by_security.items()):
            security_rows = sorted(security_rows, key=lambda item: item["tradedate"])
            if len(security_rows) < args.min_rows:
                continue
            out_path = paths.moex_iss_history_root / f"security={safe_symbol(security)}" / "history.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            table = pa.Table.from_pylist(security_rows, schema=_schema(pa))
            pq.write_table(table, out_path, compression="zstd")
            record_data_inventory(
                conn,
                source="moex_iss",
                dataset="futures_history",
                symbol=security,
                timeframe="TIME_FRAME_D",
                start_ts=str(security_rows[0]["tradedate"]),
                end_ts=str(security_rows[-1]["tradedate"]),
                row_count=len(security_rows),
                storage_path=out_path,
                content_format="parquet",
            )
            conn.commit()
            written += 1
            total_rows += len(security_rows)
            print(
                json.dumps(
                    {
                        "security": security,
                        "assetcode": args.assetcode,
                        "rows": len(security_rows),
                        "start": str(security_rows[0]["tradedate"]),
                        "end": str(security_rows[-1]["tradedate"]),
                        "path": str(out_path),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    finally:
        conn.close()

    print(json.dumps({"status": "ok", "assetcode": args.assetcode, "securities": written, "rows": total_rows}, ensure_ascii=False, indent=2))
    return 0


def discover_asset_securities(assetcode: str, from_year: int, limit: int) -> list[str]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "q": assetcode,
                "engine": "futures",
                "market": "forts",
                "start": start,
                "limit": limit,
                "iss.meta": "off",
            }
        )
        url = f"{BASE_URL}/securities.json?{query}"
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = json.load(response)
        block = payload.get("securities", {})
        columns = block.get("columns", [])
        data = block.get("data", [])
        if not data:
            break
        rows.extend(dict(zip(columns, item)) for item in data)
        if len(data) < limit:
            break
        start += limit

    securities = []
    for row in rows:
        secid = str(row.get("secid") or "")
        shortname = str(row.get("shortname") or "")
        if str(row.get("type") or "") != "futures":
            continue
        if not secid.startswith(assetcode):
            continue
        if secid.startswith(assetcode + "M"):
            continue
        match = re.fullmatch(rf"{re.escape(assetcode)}-(\d{{1,2}})\.(\d{{2}})", shortname)
        if not match:
            continue
        year = 2000 + int(match.group(2))
        if year < from_year:
            continue
        securities.append(secid)
    return sorted(set(securities))


def collect_security_history(security: str, from_date: str, till_date: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        payload = _request_security_history(security, from_date, till_date, start, limit)
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
        print(json.dumps({"status": "page", "start": start, "total": int(total)}, ensure_ascii=False), flush=True)
        if start >= int(total):
            break
    return rows


def _request_security_history(security: str, from_date: str, till_date: str, start: int, limit: int) -> dict[str, Any]:
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
    with urllib.request.urlopen(url, timeout=60) as response:
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
