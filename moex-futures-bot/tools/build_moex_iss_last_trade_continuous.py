#!/usr/bin/env python3
"""Build continuous futures chains from MOEX ISS last intraday candle closes."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, time, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assetcode", default="BR")
    parser.add_argument("--method", choices=("volume_leader_last_trade", "sticky_volume_leader_last_trade"), default="sticky_volume_leader_last_trade")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--switch-ratio", type=float, default=1.5)
    parser.add_argument("--confirm-days", type=int, default=3)
    parser.add_argument("--min-hold-days", type=int, default=20)
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

    con = duckdb.connect(str(paths.research_db))
    try:
        rows = _daily_last_trade_rows(con, paths, args)
    finally:
        con.close()

    if not rows:
        print(f"No last-trade candle rows for assetcode={args.assetcode}", file=sys.stderr)
        return 1

    chain_rows = _build_chain(args.assetcode, rows, args)
    out_path = (
        paths.moex_iss_continuous_root
        / f"method={args.method}"
        / f"assetcode={safe_symbol(args.assetcode)}"
        / "price=last_trade"
        / "bars.parquet"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(chain_rows, schema=_schema(pa)), out_path, compression="zstd")

    sqlite_conn = connect_state_db(paths.state_db)
    try:
        record_data_inventory(
            sqlite_conn,
            source="moex_iss",
            dataset="last_trade_continuous_bars",
            symbol=args.assetcode,
            timeframe="TIME_FRAME_D",
            start_ts=chain_rows[0]["ts"].isoformat().replace("+00:00", "Z"),
            end_ts=chain_rows[-1]["ts"].isoformat().replace("+00:00", "Z"),
            row_count=len(chain_rows),
            storage_path=out_path,
            content_format="parquet",
        )
        sqlite_conn.commit()
    finally:
        sqlite_conn.close()

    summary = _summary(args.assetcode, chain_rows, out_path, args)
    report_path = _write_report(paths.reports_root, summary)
    print(json.dumps({**summary, "report": str(report_path)}, ensure_ascii=False, default=str, indent=2))
    return 0


def _daily_last_trade_rows(con, paths, args: argparse.Namespace) -> list[tuple]:
    candles_glob = str(paths.moex_iss_root / "candles" / f"interval={args.interval}" / "security=*" / "candles.parquet")
    history_glob = str(paths.moex_iss_history_root / "security=*" / "history.parquet")
    return con.execute(
        """
        WITH asset_securities AS (
            SELECT DISTINCT secid, assetcode, any_value(shortname) AS shortname
            FROM read_parquet(?, hive_partitioning=false)
            WHERE assetcode = ?
            GROUP BY secid, assetcode
        ),
        daily AS (
            SELECT
                c.secid,
                CAST(c.begin AS DATE) AS tradedate,
                arg_min(c.open, c.begin) AS open,
                max(c.high) AS high,
                min(c.low) AS low,
                arg_max(c.close, c.begin) AS close,
                sum(c.volume) AS volume,
                max(c.end) AS last_end,
                count(*) AS candle_count
            FROM read_parquet(?, hive_partitioning=false) c
            GROUP BY c.secid, CAST(c.begin AS DATE)
        )
        SELECT
            d.tradedate,
            d.secid,
            a.shortname,
            a.assetcode,
            d.open,
            d.high,
            d.low,
            d.close,
            d.volume,
            d.last_end,
            d.candle_count
        FROM daily d
        JOIN asset_securities a USING (secid)
        WHERE d.volume > 0 AND d.close > 0
        ORDER BY d.tradedate, d.secid
        """,
        [history_glob, args.assetcode, candles_glob],
    ).fetchall()


def _build_chain(assetcode: str, rows, args: argparse.Namespace) -> list[dict[str, object]]:
    by_date = defaultdict(list)
    for row in rows:
        tradedate, secid, shortname, _, open_, high, low, close, volume, last_end, candle_count = row
        price = float(close)
        by_date[tradedate].append(
            {
                "source_symbol": str(secid),
                "shortname": str(shortname),
                "open": float(open_ or price),
                "high": float(high or price),
                "low": float(low or price),
                "close": price,
                "volume": float(volume or 0),
                "last_end": last_end,
                "candle_count": int(candle_count),
            }
        )

    chain = []
    current_symbol = ""
    hold_days = 0
    pending_symbol = ""
    pending_days = 0
    for tradedate in sorted(by_date):
        candidates = sorted(by_date[tradedate], key=lambda item: (item["volume"], item["source_symbol"]), reverse=True)
        if args.method == "volume_leader_last_trade":
            selected = {"row": candidates[0], "source_symbol": candidates[0]["source_symbol"], "pending_symbol": "", "pending_days": 0}
        else:
            selected = _sticky_select(
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
        ts = datetime.combine(tradedate, time(0), tzinfo=timezone.utc)
        chain.append(
            {
                "assetcode": assetcode,
                "symbol": f"{assetcode}_last_trade@MOEX_ISS",
                "source_symbol": source_symbol,
                "shortname": selected_row["shortname"],
                "timeframe": "TIME_FRAME_D",
                "ts": ts,
                "open": selected_row["open"],
                "high": selected_row["high"],
                "low": selected_row["low"],
                "close": selected_row["close"],
                "volume": selected_row["volume"],
                "candidate_count": len(candidates),
                "roll_flag": roll_flag,
                "method": args.method,
                "price_field": "last_trade",
            }
        )
        current_symbol = source_symbol
        hold_days = 1 if roll_flag or hold_days == 0 else hold_days + 1
    return chain


def _sticky_select(candidates, *, current_symbol: str, hold_days: int, pending_symbol: str, pending_days: int, args: argparse.Namespace):
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


def _summary(assetcode: str, rows: list[dict[str, object]], out_path: Path, args: argparse.Namespace) -> dict[str, object]:
    counts = defaultdict(int)
    rolls = []
    for row in rows:
        counts[str(row["source_symbol"])] += 1
        if row["roll_flag"]:
            rolls.append({"ts": row["ts"].isoformat().replace("+00:00", "Z"), "source_symbol": row["source_symbol"]})
    return {
        "assetcode": assetcode,
        "symbol": f"{assetcode}_last_trade@MOEX_ISS",
        "method": args.method,
        "price_field": "last_trade",
        "rows": len(rows),
        "start_ts": rows[0]["ts"].isoformat().replace("+00:00", "Z"),
        "end_ts": rows[-1]["ts"].isoformat().replace("+00:00", "Z"),
        "roll_count": len(rolls),
        "source_symbol_days": dict(sorted(counts.items())),
        "roll_dates": rolls,
        "path": str(out_path),
    }


def _write_report(root: Path, summary: dict[str, object]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"moex_iss_last_trade_continuous_{summary['assetcode']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    source_days = ", ".join(f"{symbol}: {days}" for symbol, days in summary["source_symbol_days"].items())
    lines = [
        "# MOEX ISS Last-Trade Continuous Chain",
        "",
        f"- Assetcode: `{summary['assetcode']}`",
        f"- Symbol: `{summary['symbol']}`",
        f"- Method: `{summary['method']}`",
        f"- Price field: `{summary['price_field']}`",
        f"- Rows: `{summary['rows']}`",
        f"- Period: `{summary['start_ts']} - {summary['end_ts']}`",
        f"- Rolls: `{summary['roll_count']}`",
        f"- Source symbol days: {source_days}",
        "",
        "Notes:",
        "- Daily close is the last available MOEX ISS intraday candle close for the selected source contract.",
        "- This is closer to Finam daily bar close than MOEX ISS settlement/history close.",
        "- It is not back-adjusted; use return-stitched output for mean-reversion research.",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _schema(pa):
    return pa.schema(
        [
            ("assetcode", pa.string()),
            ("symbol", pa.string()),
            ("source_symbol", pa.string()),
            ("shortname", pa.string()),
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
            ("price_field", pa.string()),
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
