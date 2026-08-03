#!/usr/bin/env python3
"""Export collected JSONL bars into per-symbol Parquet files."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeframe", default=None, help="Optional timeframe filter, e.g. TIME_FRAME_D")
    parser.add_argument("--symbol", action="append", help="Optional exact symbol filter; can be repeated")
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

    groups: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for path in sorted(paths.bars_root.glob("timeframe=*/symbol=*/*.jsonl")):
        for row in _read_jsonl(path):
            if args.timeframe and row["timeframe"] != args.timeframe:
                continue
            if args.symbol and row["symbol"] not in set(args.symbol):
                continue
            groups[(str(row["symbol"]), str(row["timeframe"]))].append(_normalize_row(row))

    if not groups:
        print("No JSONL bars matched export filters.", file=sys.stderr)
        return 1

    conn = connect_state_db(paths.state_db)
    try:
        for (symbol, timeframe), rows in sorted(groups.items()):
            rows = _dedupe_rows(rows)
            out_path = paths.bars_parquet_root / f"timeframe={timeframe}" / f"symbol={safe_symbol(symbol)}" / "bars.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            table = pa.Table.from_pylist(rows, schema=_schema(pa))
            pq.write_table(table, out_path, compression="zstd")
            record_data_inventory(
                conn,
                source="finam",
                dataset="bars_parquet",
                symbol=symbol,
                timeframe=timeframe,
                start_ts=rows[0]["ts"].isoformat().replace("+00:00", "Z"),
                end_ts=rows[-1]["ts"].isoformat().replace("+00:00", "Z"),
                row_count=len(rows),
                storage_path=out_path,
                content_format="parquet",
            )
            conn.commit()
            print(json.dumps({"symbol": symbol, "timeframe": timeframe, "rows": len(rows), "path": str(out_path)}, ensure_ascii=False))
    finally:
        conn.close()

    return 0


def _read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def _normalize_row(row: dict[str, object]) -> dict[str, object]:
    return {
        "symbol": str(row["symbol"]),
        "timeframe": str(row["timeframe"]),
        "ts": _parse_ts(str(row["ts"])),
        "open": float(row["open"]),
        "high": float(row["high"]),
        "low": float(row["low"]),
        "close": float(row["close"]),
        "volume": float(row["volume"]),
    }


def _dedupe_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    deduped = {row["ts"]: row for row in rows}
    return [deduped[key] for key in sorted(deduped)]


def _parse_ts(raw: str) -> datetime:
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    return datetime.fromisoformat(raw).astimezone(timezone.utc)


def _schema(pa):
    return pa.schema(
        [
            ("symbol", pa.string()),
            ("timeframe", pa.string()),
            ("ts", pa.timestamp("us", tz="UTC")),
            ("open", pa.float64()),
            ("high", pa.float64()),
            ("low", pa.float64()),
            ("close", pa.float64()),
            ("volume", pa.float64()),
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
