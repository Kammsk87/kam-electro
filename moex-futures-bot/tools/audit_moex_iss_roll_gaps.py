#!/usr/bin/env python3
"""Audit roll gaps in MOEX ISS continuous futures chains."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage, safe_symbol


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assetcode", default="BR")
    parser.add_argument("--method", default="sticky_volume_leader")
    parser.add_argument("--price-field", choices=("close", "settleprice"), default="settleprice")
    parser.add_argument("--warn-gap-pct", type=float, default=3.0)
    return parser.parse_args()


def main() -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)

    con = duckdb.connect(str(paths.research_db))
    try:
        chain = _chain_rows(con, paths, args)
        if not chain:
            print("No chain rows found.", file=sys.stderr)
            return 1
        history = _history_prices(con, paths, args)
    finally:
        con.close()

    rolls = _roll_rows(chain, history, args.price_field, args.warn_gap_pct)
    summary = {
        "assetcode": args.assetcode,
        "method": args.method,
        "price_field": args.price_field,
        "rows": len(chain),
        "start_ts": chain[0]["ts"].isoformat(),
        "end_ts": chain[-1]["ts"].isoformat(),
        "rolls": len(rolls),
        "warn_gap_pct": args.warn_gap_pct,
        "large_abs_chain_gaps": sum(1 for row in rolls if abs(row["chain_gap_pct"]) >= args.warn_gap_pct),
        "max_abs_chain_gap_pct": max((abs(row["chain_gap_pct"]) for row in rolls), default=0.0),
    }
    report_path = _write_report(paths.reports_root, summary, rolls)
    print(json.dumps({**summary, "report": str(report_path)}, ensure_ascii=False, indent=2))
    return 0


def _chain_rows(con, paths, args: argparse.Namespace) -> list[dict[str, object]]:
    path = (
        paths.moex_iss_continuous_root
        / f"method={args.method}"
        / f"assetcode={safe_symbol(args.assetcode)}"
        / f"price={args.price_field}"
        / "bars.parquet"
    )
    rows = con.execute(
        """
        SELECT ts, source_symbol, close, roll_flag
        FROM read_parquet(?)
        ORDER BY ts
        """,
        [str(path)],
    ).fetchall()
    return [{"ts": row[0], "source_symbol": str(row[1]), "close": float(row[2]), "roll_flag": bool(row[3])} for row in rows]


def _history_prices(con, paths, args: argparse.Namespace) -> dict[tuple[str, str], float]:
    glob = str(paths.moex_iss_history_root / "security=*" / "history.parquet")
    rows = con.execute(
        f"""
        SELECT tradedate, secid, {args.price_field}
        FROM read_parquet(?, hive_partitioning=false)
        WHERE assetcode = ? AND {args.price_field} > 0
        """,
        [glob, args.assetcode],
    ).fetchall()
    return {(str(row[1]), str(row[0])): float(row[2]) for row in rows}


def _roll_rows(
    chain: list[dict[str, object]],
    history: dict[tuple[str, str], float],
    price_field: str,
    warn_gap_pct: float,
) -> list[dict[str, object]]:
    rolls: list[dict[str, object]] = []
    for index, row in enumerate(chain):
        if index == 0 or not row["roll_flag"]:
            continue
        prev = chain[index - 1]
        roll_date = row["ts"].date().isoformat()
        old_symbol = str(prev["source_symbol"])
        new_symbol = str(row["source_symbol"])
        prev_close = float(prev["close"])
        new_close = float(row["close"])
        chain_gap_pct = (new_close / prev_close - 1) * 100 if prev_close else 0.0
        old_same_day = history.get((old_symbol, roll_date))
        new_same_day = history.get((new_symbol, roll_date))
        same_day_gap_pct = None
        if old_same_day and new_same_day:
            same_day_gap_pct = (new_same_day / old_same_day - 1) * 100
        rolls.append(
            {
                "date": roll_date,
                "old_symbol": old_symbol,
                "new_symbol": new_symbol,
                "prev_chain_price": prev_close,
                "new_chain_price": new_close,
                "chain_gap_pct": chain_gap_pct,
                "same_day_old_price": old_same_day,
                "same_day_new_price": new_same_day,
                "same_day_gap_pct": same_day_gap_pct,
                "warning": abs(chain_gap_pct) >= warn_gap_pct,
                "price_field": price_field,
            }
        )
    return rolls


def _write_report(root: Path, summary: dict[str, object], rolls: list[dict[str, object]]) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"moex_iss_roll_gaps_{summary['assetcode']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    path.write_text(_markdown(summary, rolls), encoding="utf-8")
    return path


def _markdown(summary: dict[str, object], rolls: list[dict[str, object]]) -> str:
    lines = [
        "# MOEX ISS Roll Gap Audit",
        "",
        f"- Assetcode: `{summary['assetcode']}`",
        f"- Method: `{summary['method']}`",
        f"- Price field: `{summary['price_field']}`",
        f"- Rows: `{summary['rows']}`",
        f"- Period: `{summary['start_ts']} - {summary['end_ts']}`",
        f"- Rolls: `{summary['rolls']}`",
        f"- Warning threshold: `{summary['warn_gap_pct']}`%",
        f"- Large absolute chain gaps: `{summary['large_abs_chain_gaps']}`",
        f"- Max absolute chain gap: `{summary['max_abs_chain_gap_pct']:.2f}`%",
        "",
        "| date | old | new | chain gap % | same-day gap % | warning |",
        "|---|---|---|---:|---:|---|",
    ]
    for row in rolls:
        same_day = "-" if row["same_day_gap_pct"] is None else f"{row['same_day_gap_pct']:.2f}"
        warning = "yes" if row["warning"] else ""
        lines.append(
            f"| {row['date']} | {row['old_symbol']} | {row['new_symbol']} | {row['chain_gap_pct']:.2f} | {same_day} | {warning} |"
        )
    lines.extend(
        [
            "",
            "Notes:",
            "- Chain gap compares the new selected contract price on roll day with the previous chain close.",
            "- Same-day gap compares old and new contract prices on the roll day when both are available.",
            "- This audit does not back-adjust prices; it flags discontinuities that can distort strategy returns.",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
