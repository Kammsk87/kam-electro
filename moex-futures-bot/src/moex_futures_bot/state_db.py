"""SQLite state database for paper trading and research bookkeeping."""

from __future__ import annotations

import sqlite3
import json
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = "1"


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS instruments (
    symbol TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    mic TEXT NOT NULL,
    family TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    dataset TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT,
    depth INTEGER,
    start_ts TEXT NOT NULL,
    end_ts TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    content_format TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_inventory_unique_span
ON data_inventory (
    source,
    dataset,
    symbol,
    COALESCE(timeframe, ''),
    COALESCE(depth, -1),
    start_ts,
    end_ts,
    storage_path
);

CREATE TABLE IF NOT EXISTS strategy_runs (
    run_id TEXT PRIMARY KEY,
    strategy_name TEXT NOT NULL,
    status TEXT NOT NULL,
    symbols TEXT NOT NULL,
    timeframe TEXT,
    start_ts TEXT NOT NULL,
    end_ts TEXT NOT NULL,
    params_json TEXT NOT NULL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    verdict TEXT NOT NULL DEFAULT 'unreviewed',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    symbol TEXT,
    strategy_name TEXT,
    run_id TEXT,
    payload_json TEXT NOT NULL
);

INSERT INTO schema_meta(key, value)
VALUES ('schema_version', '1')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;
"""


def connect_state_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_state_db(path: Path) -> None:
    with connect_state_db(path) as conn:
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO schema_meta(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            ("schema_version", SCHEMA_VERSION),
        )


def upsert_instruments(conn: sqlite3.Connection, instruments: Iterable[Any]) -> None:
    rows = [
        (
            item.symbol,
            item.ticker,
            item.name,
            item.mic,
            item.family,
            item.status,
            item.notes,
        )
        for item in instruments
    ]
    conn.executemany(
        """
        INSERT INTO instruments(symbol, ticker, name, mic, family, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
            ticker=excluded.ticker,
            name=excluded.name,
            mic=excluded.mic,
            family=excluded.family,
            status=excluded.status,
            notes=excluded.notes,
            last_seen_at=CURRENT_TIMESTAMP
        """,
        rows,
    )


def append_paper_event(
    conn: sqlite3.Connection,
    event_type: str,
    payload: dict[str, Any],
    symbol: str | None = None,
    strategy_name: str | None = None,
    run_id: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO paper_events(event_type, symbol, strategy_name, run_id, payload_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (event_type, symbol, strategy_name, run_id, json.dumps(payload, ensure_ascii=False, default=str)),
    )


def record_data_inventory(
    conn: sqlite3.Connection,
    *,
    source: str,
    dataset: str,
    symbol: str,
    start_ts: str,
    end_ts: str,
    row_count: int,
    storage_path: Path,
    content_format: str,
    timeframe: str | None = None,
    depth: int | None = None,
) -> None:
    conn.execute(
        """
        DELETE FROM data_inventory
        WHERE source = ?
          AND dataset = ?
          AND symbol = ?
          AND COALESCE(timeframe, '') = COALESCE(?, '')
          AND COALESCE(depth, -1) = COALESCE(?, -1)
          AND storage_path = ?
        """,
        (source, dataset, symbol, timeframe, depth, str(storage_path)),
    )
    conn.execute(
        """
        INSERT INTO data_inventory(
            source,
            dataset,
            symbol,
            timeframe,
            depth,
            start_ts,
            end_ts,
            row_count,
            storage_path,
            content_format
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source,
            dataset,
            symbol,
            timeframe,
            depth,
            start_ts,
            end_ts,
            row_count,
            str(storage_path),
            content_format,
        ),
    )


def record_strategy_run(
    conn: sqlite3.Connection,
    *,
    run_id: str,
    strategy_name: str,
    status: str,
    symbols: list[str],
    timeframe: str,
    start_ts: str,
    end_ts: str,
    params: dict[str, Any],
    metrics: dict[str, Any],
    verdict: str,
) -> None:
    conn.execute(
        """
        INSERT INTO strategy_runs(
            run_id,
            strategy_name,
            status,
            symbols,
            timeframe,
            start_ts,
            end_ts,
            params_json,
            metrics_json,
            verdict
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
            strategy_name=excluded.strategy_name,
            status=excluded.status,
            symbols=excluded.symbols,
            timeframe=excluded.timeframe,
            start_ts=excluded.start_ts,
            end_ts=excluded.end_ts,
            params_json=excluded.params_json,
            metrics_json=excluded.metrics_json,
            verdict=excluded.verdict
        """,
        (
            run_id,
            strategy_name,
            status,
            json.dumps(symbols, ensure_ascii=False),
            timeframe,
            start_ts,
            end_ts,
            json.dumps(params, ensure_ascii=False, sort_keys=True, default=str),
            json.dumps(metrics, ensure_ascii=False, sort_keys=True, default=str),
            verdict,
        ),
    )
