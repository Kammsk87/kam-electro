#!/usr/bin/env python3
"""Collect current MOEX ISS futures params including fee fields."""

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
            row = collect_params(security)
            if not row:
                print(json.dumps({"security": security, "status": "empty"}, ensure_ascii=False), flush=True)
                continue
            normalized = _normalize(row)
            out_path = paths.moex_iss_params_root / f"security={safe_symbol(security)}" / "params.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            table = pa.Table.from_pylist([normalized], schema=_schema(pa))
            pq.write_table(table, out_path, compression="zstd")
            record_data_inventory(
                conn,
                source="moex_iss",
                dataset="futures_params",
                symbol=security,
                timeframe=None,
                start_ts=date.today().isoformat(),
                end_ts=date.today().isoformat(),
                row_count=1,
                storage_path=out_path,
                content_format="parquet",
            )
            conn.commit()
            print(json.dumps({"security": security, **normalized, "path": str(out_path)}, ensure_ascii=False, default=str), flush=True)
    finally:
        conn.close()
    return 0


def collect_params(security: str) -> dict[str, Any] | None:
    url = f"{BASE_URL}/engines/futures/markets/forts/securities/{urllib.parse.quote(security)}.json?iss.meta=off"
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = json.load(response)
    block = payload.get("securities", {})
    columns = block.get("columns", [])
    rows = block.get("data", [])
    if not rows:
        return None
    return dict(zip(columns, rows[0]))


def _normalize(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "secid": str(row.get("SECID") or ""),
        "boardid": str(row.get("BOARDID") or ""),
        "shortname": str(row.get("SHORTNAME") or ""),
        "assetcode": str(row.get("ASSETCODE") or ""),
        "minstep": _float(row.get("MINSTEP")),
        "stepprice": _float(row.get("STEPPRICE")),
        "lotvolume": _float(row.get("LOTVOLUME")),
        "buysellfee": _float(row.get("BUYSELLFEE")),
        "scalperfee": _float(row.get("SCALPERFEE")),
        "negotiatedfee": _float(row.get("NEGOTIATEDFEE")),
        "exercisefee": _float(row.get("EXERCISEFEE")),
        "initialmargin": _float(row.get("INITIALMARGIN")),
        "lasttradedate": str(row.get("LASTTRADEDATE") or ""),
    }


def _schema(pa):
    return pa.schema(
        [
            ("secid", pa.string()),
            ("boardid", pa.string()),
            ("shortname", pa.string()),
            ("assetcode", pa.string()),
            ("minstep", pa.float64()),
            ("stepprice", pa.float64()),
            ("lotvolume", pa.float64()),
            ("buysellfee", pa.float64()),
            ("scalperfee", pa.float64()),
            ("negotiatedfee", pa.float64()),
            ("exercisefee", pa.float64()),
            ("initialmargin", pa.float64()),
            ("lasttradedate", pa.string()),
        ]
    )


def _float(raw: Any) -> float:
    return float(raw or 0)


if __name__ == "__main__":
    raise SystemExit(main())
