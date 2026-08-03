#!/usr/bin/env python3
"""Build return-stitched MOEX ISS last-trade continuous futures chains."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import connect_state_db, init_state_db, record_data_inventory
from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assetcode", default="BR")
    parser.add_argument("--source-method", default="sticky_volume_leader_last_trade")
    parser.add_argument("--output-method", default="sticky_volume_leader_last_trade_return_stitched")
    parser.add_argument("--interval", type=int, default=60)
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
        chain = _source_chain(con, paths, args)
        if not chain:
            print("No source last-trade chain rows found.", file=sys.stderr)
            return 1
        daily = _daily_last_trade_by_symbol(con, paths, args)
    finally:
        con.close()

    stitched, diagnostics = _stitch(chain, daily, args)
    out_path = (
        paths.moex_iss_continuous_root
        / f"method={args.output_method}"
        / f"assetcode={safe_symbol(args.assetcode)}"
        / "price=last_trade"
        / "bars.parquet"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(stitched, schema=_schema(pa)), out_path, compression="zstd")

    sqlite_conn = connect_state_db(paths.state_db)
    try:
        record_data_inventory(
            sqlite_conn,
            source="moex_iss",
            dataset="last_trade_return_stitched_continuous_bars",
            symbol=args.assetcode,
            timeframe="TIME_FRAME_D",
            start_ts=stitched[0]["ts"].isoformat().replace("+00:00", "Z"),
            end_ts=stitched[-1]["ts"].isoformat().replace("+00:00", "Z"),
            row_count=len(stitched),
            storage_path=out_path,
            content_format="parquet",
        )
        sqlite_conn.commit()
    finally:
        sqlite_conn.close()

    summary = _summary(args, stitched, diagnostics, out_path)
    report_path = _write_report(paths.reports_root, summary)
    print(json.dumps({**summary, "report": str(report_path)}, ensure_ascii=False, default=str, indent=2))
    return 0


def _source_chain(con, paths, args: argparse.Namespace) -> list[dict[str, object]]:
    path = (
        paths.moex_iss_continuous_root
        / f"method={args.source_method}"
        / f"assetcode={safe_symbol(args.assetcode)}"
        / "price=last_trade"
        / "bars.parquet"
    )
    rows = con.execute(
        """
        SELECT assetcode, symbol, source_symbol, shortname, timeframe, ts, open, high, low, close, volume, candidate_count, roll_flag
        FROM read_parquet(?)
        ORDER BY ts
        """,
        [str(path)],
    ).fetchall()
    return [
        {
            "assetcode": row[0],
            "symbol": row[1],
            "source_symbol": row[2],
            "shortname": row[3],
            "timeframe": row[4],
            "ts": row[5],
            "open": float(row[6]),
            "high": float(row[7]),
            "low": float(row[8]),
            "close": float(row[9]),
            "volume": float(row[10]),
            "candidate_count": int(row[11]),
            "roll_flag": bool(row[12]),
        }
        for row in rows
    ]


def _daily_last_trade_by_symbol(con, paths, args: argparse.Namespace) -> dict[tuple[str, str], dict[str, float]]:
    candles_glob = str(paths.moex_iss_root / "candles" / f"interval={args.interval}" / "security=*" / "candles.parquet")
    rows = con.execute(
        """
        SELECT
            secid,
            CAST(begin AS DATE) AS tradedate,
            arg_min(open, begin) AS open,
            max(high) AS high,
            min(low) AS low,
            arg_max(close, begin) AS close,
            sum(volume) AS volume
        FROM read_parquet(?, hive_partitioning=false)
        GROUP BY secid, CAST(begin AS DATE)
        HAVING sum(volume) > 0 AND arg_max(close, begin) > 0
        """,
        [candles_glob],
    ).fetchall()
    return {
        (str(row[0]), str(row[1])): {
            "open": float(row[2] or row[5]),
            "high": float(row[3] or row[5]),
            "low": float(row[4] or row[5]),
            "close": float(row[5]),
            "volume": float(row[6] or 0),
        }
        for row in rows
    }


def _stitch(
    chain: list[dict[str, object]],
    daily: dict[tuple[str, str], dict[str, float]],
    args: argparse.Namespace,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    stitched: list[dict[str, object]] = []
    fallback_days = 0
    fallback_roll_days = 0
    roll_count = 0
    max_abs_stitched_return_pct = 0.0
    source_days: Counter[str] = Counter()

    adjusted_close = float(chain[0]["close"])
    for index, row in enumerate(chain):
        date_key = row["ts"].date().isoformat()
        symbol = str(row["source_symbol"])
        source_days[symbol] += 1
        raw = daily.get((symbol, date_key))
        if raw is None:
            raw = {"open": row["open"], "high": row["high"], "low": row["low"], "close": row["close"], "volume": row["volume"]}

        if index == 0:
            daily_return = 0.0
        else:
            prev_date_key = chain[index - 1]["ts"].date().isoformat()
            prev_same_symbol = daily.get((symbol, prev_date_key))
            if prev_same_symbol and prev_same_symbol["close"] > 0:
                daily_return = raw["close"] / prev_same_symbol["close"] - 1
            else:
                prev_chain_close = float(chain[index - 1]["close"])
                daily_return = raw["close"] / prev_chain_close - 1 if prev_chain_close else 0.0
                fallback_days += 1
                if row["roll_flag"]:
                    fallback_roll_days += 1
            adjusted_close *= 1 + daily_return

        roll_count += 1 if row["roll_flag"] else 0
        max_abs_stitched_return_pct = max(max_abs_stitched_return_pct, abs(daily_return) * 100)
        scale = adjusted_close / raw["close"] if raw["close"] else 1.0
        stitched.append(
            {
                "assetcode": row["assetcode"],
                "symbol": f"{args.assetcode}_last_trade_return_stitched@MOEX_ISS",
                "source_symbol": symbol,
                "shortname": row["shortname"],
                "timeframe": row["timeframe"],
                "ts": row["ts"],
                "open": raw["open"] * scale,
                "high": raw["high"] * scale,
                "low": raw["low"] * scale,
                "close": adjusted_close,
                "volume": raw["volume"],
                "candidate_count": row["candidate_count"],
                "roll_flag": row["roll_flag"],
                "method": args.output_method,
                "price_field": "last_trade",
            }
        )

    return stitched, {
        "fallback_days": fallback_days,
        "fallback_roll_days": fallback_roll_days,
        "roll_count": roll_count,
        "max_abs_stitched_return_pct": max_abs_stitched_return_pct,
        "source_symbol_days": dict(sorted(source_days.items())),
    }


def _summary(args: argparse.Namespace, rows: list[dict[str, object]], diagnostics: dict[str, object], out_path: Path) -> dict[str, object]:
    return {
        "assetcode": args.assetcode,
        "symbol": f"{args.assetcode}_last_trade_return_stitched@MOEX_ISS",
        "source_method": args.source_method,
        "output_method": args.output_method,
        "price_field": "last_trade",
        "rows": len(rows),
        "start_ts": rows[0]["ts"].isoformat(),
        "end_ts": rows[-1]["ts"].isoformat(),
        "path": str(out_path),
        **diagnostics,
    }


def _write_report(root: Path, summary: dict[str, object]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"moex_iss_last_trade_return_stitched_{summary['assetcode']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    source_days = ", ".join(f"{symbol}: {days}" for symbol, days in summary["source_symbol_days"].items())
    lines = [
        "# MOEX ISS Last-Trade Return-Stitched Chain",
        "",
        f"- Assetcode: `{summary['assetcode']}`",
        f"- Symbol: `{summary['symbol']}`",
        f"- Source method: `{summary['source_method']}`",
        f"- Output method: `{summary['output_method']}`",
        f"- Price field: `{summary['price_field']}`",
        f"- Rows: `{summary['rows']}`",
        f"- Period: `{summary['start_ts']} - {summary['end_ts']}`",
        f"- Rolls: `{summary['roll_count']}`",
        f"- Fallback days: `{summary['fallback_days']}`",
        f"- Fallback roll days: `{summary['fallback_roll_days']}`",
        f"- Max absolute stitched daily return: `{summary['max_abs_stitched_return_pct']:.2f}`%",
        f"- Source symbol days: {source_days}",
        "",
        "Notes:",
        "- Each daily return is calculated from the selected source contract against the same source contract on the previous chain date when available.",
        "- This removes direct old-contract/new-contract jumps from the last-trade continuous chain.",
        "- This is the preferred BR research chain for mean-reversion screens.",
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
