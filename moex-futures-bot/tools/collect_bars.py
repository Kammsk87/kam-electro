#!/usr/bin/env python3
"""Collect historical Finam bars into local storage."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.bars_store import normalize_bars_response, write_bars_jsonl_partitions
from moex_futures_bot.config import load_env, require_env
from moex_futures_bot.finam_client import ReadOnlyFinamClient
from moex_futures_bot.instrument_registry import discover_moex_commodity_futures
from moex_futures_bot.state_db import (
    connect_state_db,
    init_state_db,
    record_data_inventory,
    upsert_instruments,
)
from moex_futures_bot.storage import default_storage_paths, init_storage


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeframe", default="TIME_FRAME_D", help="Finam timeframe, for example TIME_FRAME_D")
    parser.add_argument("--days", type=int, default=365 * 3, help="Lookback window in calendar days")
    parser.add_argument("--chunk-days", type=int, default=30, help="Finam request window size in calendar days")
    parser.add_argument("--families", default="brent,gold", help="Comma-separated instrument families")
    parser.add_argument("--limit-symbols", type=int, default=0, help="Limit symbols for smoke tests")
    parser.add_argument("--symbol", action="append", help="Collect an explicit Finam symbol; can be repeated")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env(PROJECT_ROOT / ".env")
    secret = require_env("FINAM_SECRET_TOKEN")

    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    client = ReadOnlyFinamClient(secret)
    client.auth()
    assets = client.assets()
    discovered = discover_moex_commodity_futures(assets)
    selected = _select_instruments(discovered, args)
    if not selected:
        print("No instruments selected for bars collection.", file=sys.stderr)
        return 1

    end = datetime.now(timezone.utc).replace(microsecond=0)
    start = end - timedelta(days=args.days)

    conn = connect_state_db(paths.state_db)
    total_rows = 0
    total_files = 0
    try:
        upsert_instruments(conn, selected)
        conn.commit()

        for instrument in selected:
            print(
                json.dumps(
                    {
                        "status": "collecting",
                        "symbol": instrument.symbol,
                        "timeframe": args.timeframe,
                        "start": start.isoformat().replace("+00:00", "Z"),
                        "end": end.isoformat().replace("+00:00", "Z"),
                        "chunk_days": args.chunk_days,
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            bars = []
            for chunk_start, chunk_end in _date_chunks(start, end, args.chunk_days):
                response = client.bars(instrument.symbol, args.timeframe, chunk_start, chunk_end)
                bars.extend(normalize_bars_response(instrument.symbol, args.timeframe, response))
            bars = _dedupe_bars(bars)
            inventory_rows = write_bars_jsonl_partitions(instrument.symbol, args.timeframe, bars, paths)
            for item in inventory_rows:
                record_data_inventory(
                    conn,
                    source="finam",
                    dataset="bars",
                    symbol=instrument.symbol,
                    timeframe=args.timeframe,
                    start_ts=item["start_ts"],
                    end_ts=item["end_ts"],
                    row_count=item["row_count"],
                    storage_path=item["path"],
                    content_format="jsonl",
                )
            conn.commit()
            total_rows += len(bars)
            total_files += len(inventory_rows)
            print(
                json.dumps(
                    {
                        "symbol": instrument.symbol,
                        "timeframe": args.timeframe,
                        "bars": len(bars),
                        "files": len(inventory_rows),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    finally:
        conn.close()

    print(
        json.dumps(
            {
                "status": "ok",
                "symbols": len(selected),
                "rows": total_rows,
                "files": total_files,
                "bars_root": str(paths.bars_root),
                "state_db": str(paths.state_db),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def _select_instruments(discovered, args: argparse.Namespace):
    if args.symbol:
        selected_symbols = set(args.symbol)
        selected = [item for item in discovered if item.symbol in selected_symbols]
        missing = sorted(selected_symbols - {item.symbol for item in selected})
        for symbol in missing:
            print(f"Requested symbol not found in discovered MOEX commodity futures: {symbol}", file=sys.stderr)
    else:
        families = {item.strip() for item in args.families.split(",") if item.strip()}
        selected = [item for item in discovered if item.family in families]

    selected = sorted(selected, key=lambda item: (item.family, item.name, item.symbol))
    if args.limit_symbols:
        selected = selected[: args.limit_symbols]
    return selected


def _date_chunks(start: datetime, end: datetime, chunk_days: int):
    if chunk_days <= 0:
        raise ValueError("--chunk-days must be positive")
    cursor = start
    step = timedelta(days=chunk_days)
    while cursor < end:
        chunk_end = min(cursor + step, end)
        yield cursor, chunk_end
        cursor = chunk_end


def _dedupe_bars(bars: list[dict[str, str]]) -> list[dict[str, str]]:
    deduped = {bar["ts"]: bar for bar in bars}
    return [deduped[key] for key in sorted(deduped)]


if __name__ == "__main__":
    raise SystemExit(main())
