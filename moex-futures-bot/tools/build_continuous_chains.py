#!/usr/bin/env python3
"""Build continuous futures chains from local bars."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


DEFAULT_METHOD = "sticky_volume_leader"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeframe", default="TIME_FRAME_D")
    parser.add_argument("--families", default="brent,gold", help="Comma-separated instrument families")
    parser.add_argument("--method", choices=("volume_leader", "sticky_volume_leader"), default=DEFAULT_METHOD)
    parser.add_argument("--switch-ratio", type=float, default=1.5, help="Sticky method switch threshold vs current volume")
    parser.add_argument("--confirm-days", type=int, default=3, help="Sticky method consecutive confirmation days")
    parser.add_argument("--min-hold-days", type=int, default=20, help="Sticky method minimum days before voluntary switch")
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
    sqlite_conn = connect_state_db(paths.state_db)
    family_map = _family_map(sqlite_conn)
    selected_families = {item.strip() for item in args.families.split(",") if item.strip()}

    duck = duckdb.connect(str(paths.research_db))
    _ensure_bars_view(duck, paths)
    all_rows = duck.execute(
        """
        SELECT symbol, timeframe, ts, open, high, low, close, volume
        FROM finam_bars
        WHERE timeframe = ?
        ORDER BY ts, symbol
        """,
        [args.timeframe],
    ).fetchall()
    duck.close()

    rows_by_family: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in all_rows:
        symbol = row[0]
        family = family_map.get(symbol)
        if family not in selected_families:
            continue
        rows_by_family[family].append(
            {
                "source_symbol": symbol,
                "family": family,
                "timeframe": row[1],
                "ts": _as_utc(row[2]),
                "open": float(row[3]),
                "high": float(row[4]),
                "low": float(row[5]),
                "close": float(row[6]),
                "volume": float(row[7]),
            }
        )

    if not rows_by_family:
        print("No rows matched selected families.", file=sys.stderr)
        return 1

    summaries = []
    try:
        for family, rows in sorted(rows_by_family.items()):
            chain_rows = _build_chain(family, args.timeframe, rows, args)
            out_path = paths.continuous_bars_root / f"method={args.method}" / f"timeframe={args.timeframe}" / f"family={safe_symbol(family)}" / "bars.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            table = pa.Table.from_pylist(chain_rows, schema=_schema(pa))
            pq.write_table(table, out_path, compression="zstd")
            record_data_inventory(
                sqlite_conn,
                source="finam",
                dataset="continuous_bars",
                symbol=family,
                timeframe=args.timeframe,
                start_ts=chain_rows[0]["ts"].isoformat().replace("+00:00", "Z"),
                end_ts=chain_rows[-1]["ts"].isoformat().replace("+00:00", "Z"),
                row_count=len(chain_rows),
                storage_path=out_path,
                content_format="parquet",
            )
            sqlite_conn.commit()
            summary = _summary(family, args.timeframe, chain_rows, out_path)
            summaries.append(summary)
            print(json.dumps(summary, ensure_ascii=False, default=str))
    finally:
        sqlite_conn.close()

    report_path = _write_report(paths.reports_root, summaries)
    print(f"Report: {report_path}")
    return 0


def _family_map(conn: sqlite3.Connection) -> dict[str, str]:
    return {
        row["symbol"]: row["family"]
        for row in conn.execute("SELECT symbol, family FROM instruments")
    }


def _ensure_bars_view(duck, paths) -> None:
    parquet_glob = str(paths.bars_parquet_root / "timeframe=*" / "symbol=*" / "bars.parquet").replace("'", "''")
    duck.execute(
        f"""
        CREATE OR REPLACE VIEW finam_bars AS
        SELECT *
        FROM read_parquet('{parquet_glob}', hive_partitioning=false)
        """
    )


def _build_chain(family: str, timeframe: str, rows: list[dict[str, object]], args: argparse.Namespace) -> list[dict[str, object]]:
    by_ts: dict[datetime, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        by_ts[row["ts"]].append(row)

    chain: list[dict[str, object]] = []
    current_symbol = ""
    hold_days = 0
    pending_symbol = ""
    pending_days = 0
    for ts in sorted(by_ts):
        candidates = sorted(
            by_ts[ts],
            key=lambda item: (float(item["volume"]), str(item["source_symbol"])),
            reverse=True,
        )
        selected = candidates[0] if args.method == "volume_leader" else _sticky_select(
            candidates,
            current_symbol=current_symbol,
            hold_days=hold_days,
            pending_symbol=pending_symbol,
            pending_days=pending_days,
            args=args,
        )
        pending_symbol = selected["pending_symbol"]
        pending_days = selected["pending_days"]
        selected_row = selected["row"]
        source_symbol = str(selected["source_symbol"])
        roll_flag = bool(current_symbol and source_symbol != current_symbol)
        chain.append(
            {
                "family": family,
                "symbol": f"{family}_continuous@FINAM",
                "source_symbol": source_symbol,
                "timeframe": timeframe,
                "ts": ts,
                "open": selected_row["open"],
                "high": selected_row["high"],
                "low": selected_row["low"],
                "close": selected_row["close"],
                "volume": selected_row["volume"],
                "candidate_count": len(candidates),
                "roll_flag": roll_flag,
                "method": args.method,
            }
        )
        current_symbol = source_symbol
        hold_days = 1 if roll_flag or hold_days == 0 else hold_days + 1
    return chain


def _sticky_select(
    candidates: list[dict[str, object]],
    *,
    current_symbol: str,
    hold_days: int,
    pending_symbol: str,
    pending_days: int,
    args: argparse.Namespace,
) -> dict[str, object]:
    by_symbol = {str(item["source_symbol"]): item for item in candidates}
    leader = candidates[0]
    leader_symbol = str(leader["source_symbol"])
    if not current_symbol or current_symbol not in by_symbol:
        return {"row": leader, "source_symbol": leader_symbol, "pending_symbol": "", "pending_days": 0}

    current = by_symbol[current_symbol]
    current_volume = max(float(current["volume"]), 1.0)
    leader_volume = float(leader["volume"])
    should_consider = (
        leader_symbol != current_symbol
        and hold_days >= args.min_hold_days
        and leader_volume >= current_volume * args.switch_ratio
    )

    if should_consider:
        pending_days = pending_days + 1 if pending_symbol == leader_symbol else 1
        pending_symbol = leader_symbol
        if pending_days >= args.confirm_days:
            return {"row": leader, "source_symbol": leader_symbol, "pending_symbol": "", "pending_days": 0}
        return {"row": current, "source_symbol": current_symbol, "pending_symbol": pending_symbol, "pending_days": pending_days}

    return {"row": current, "source_symbol": current_symbol, "pending_symbol": "", "pending_days": 0}


def _summary(family: str, timeframe: str, rows: list[dict[str, object]], out_path: Path) -> dict[str, object]:
    counts: dict[str, int] = defaultdict(int)
    roll_dates = []
    for row in rows:
        counts[str(row["source_symbol"])] += 1
        if row["roll_flag"]:
            roll_dates.append({"ts": row["ts"].isoformat().replace("+00:00", "Z"), "source_symbol": row["source_symbol"]})
    return {
        "family": family,
        "timeframe": timeframe,
        "method": str(rows[0]["method"]),
        "rows": len(rows),
        "start_ts": rows[0]["ts"].isoformat().replace("+00:00", "Z"),
        "end_ts": rows[-1]["ts"].isoformat().replace("+00:00", "Z"),
        "roll_count": len(roll_dates),
        "source_symbol_days": dict(sorted(counts.items())),
        "roll_dates": roll_dates,
        "path": str(out_path),
    }


def _write_report(root: Path, summaries: list[dict[str, object]]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"continuous_chains_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    lines = ["# Continuous Chains", ""]
    lines.append("| family | method | rows | period | rolls | source symbol days |")
    lines.append("|---|---|---:|---|---:|---|")
    for item in summaries:
        period = f"{item['start_ts']} - {item['end_ts']}"
        source_days = ", ".join(f"{symbol}: {days}" for symbol, days in item["source_symbol_days"].items())
        lines.append(f"| {item['family']} | {item['method']} | {item['rows']} | {period} | {item['roll_count']} | {source_days} |")
    lines.append("")
    lines.append("Notes:")
    lines.append("- Method `volume_leader` picks the highest-volume source contract for each date.")
    lines.append("- Method `sticky_volume_leader` requires sustained volume leadership before switching.")
    lines.append("- Series are not back-adjusted; roll jumps must be reviewed before serious strategy verdicts.")
    lines.append("- This is a research dataset only.")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _schema(pa):
    return pa.schema(
        [
            ("family", pa.string()),
            ("symbol", pa.string()),
            ("source_symbol", pa.string()),
            ("timeframe", pa.string()),
            ("ts", pa.timestamp("us", tz="UTC")),
            ("open", pa.float64()),
            ("high", pa.float64()),
            ("low", pa.float64()),
            ("close", pa.float64()),
            ("volume", pa.float64()),
            ("candidate_count", pa.int32()),
            ("roll_flag", pa.bool_()),
            ("method", pa.string()),
        ]
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


if __name__ == "__main__":
    raise SystemExit(main())
