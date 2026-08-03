"""Historical bars normalization and local JSONL partition writing."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .storage import StoragePaths, bars_partition_path


def normalize_bars_response(symbol: str, timeframe: str, response: dict[str, Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for raw in response.get("bars", []):
        ts = _timestamp_to_iso(raw.get("timestamp"))
        if not ts:
            continue
        rows.append(
            {
                "symbol": symbol,
                "timeframe": timeframe,
                "ts": ts,
                "open": _decimal(raw.get("open")),
                "high": _decimal(raw.get("high")),
                "low": _decimal(raw.get("low")),
                "close": _decimal(raw.get("close")),
                "volume": _decimal(raw.get("volume")),
            }
        )
    return sorted(rows, key=lambda item: item["ts"])


def write_bars_jsonl_partitions(
    symbol: str,
    timeframe: str,
    bars: list[dict[str, str]],
    paths: StoragePaths,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for bar in bars:
        grouped[bar["ts"][:10]].append(bar)

    inventory: list[dict[str, Any]] = []
    for trading_date, rows in sorted(grouped.items()):
        partition_date = datetime.fromisoformat(trading_date).date()
        path = bars_partition_path(symbol, timeframe, partition_date, paths=paths, suffix="jsonl")
        path.parent.mkdir(parents=True, exist_ok=True)
        deduped = {row["ts"]: row for row in rows}
        sorted_rows = [deduped[key] for key in sorted(deduped)]
        with path.open("w", encoding="utf-8") as handle:
            for row in sorted_rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        inventory.append(
            {
                "path": path,
                "start_ts": sorted_rows[0]["ts"],
                "end_ts": sorted_rows[-1]["ts"],
                "row_count": len(sorted_rows),
            }
        )
    return inventory


def _timestamp_to_iso(raw: Any) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        seconds = int(raw.get("seconds") or 0)
        nanos = int(raw.get("nanos") or 0)
        dt = datetime.fromtimestamp(seconds + nanos / 1_000_000_000, tz=timezone.utc)
        return dt.replace(microsecond=dt.microsecond).isoformat().replace("+00:00", "Z")
    if isinstance(raw, str):
        return raw
    return None


def _decimal(raw: Any) -> str:
    if isinstance(raw, dict):
        return str(raw.get("value") or "0")
    if raw is None:
        return "0"
    return str(raw)
