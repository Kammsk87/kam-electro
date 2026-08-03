#!/usr/bin/env python3
"""Cross-check local Finam daily bars against public MOEX ISS history."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage


DEFAULT_SYMBOLS = ["GLDRUBF@RTSX", "BRQ6@RTSX", "BRU6@RTSX", "BRV6@RTSX", "GDU6@RTSX"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbol", action="append", help="Finam symbol, e.g. GLDRUBF@RTSX. Can be repeated.")
    parser.add_argument("--timeframe", default="TIME_FRAME_D")
    parser.add_argument("--warn-close-diff-pct", type=float, default=0.5)
    return parser.parse_args()


def main() -> int:
    try:
        import duckdb
    except ImportError as exc:
        raise SystemExit("Missing duckdb. Run: .venv/bin/python -m pip install -r requirements.txt") from exc

    args = parse_args()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)

    symbols = args.symbol or DEFAULT_SYMBOLS
    con = duckdb.connect(str(paths.research_db))
    try:
        rows = [_audit_symbol(con, paths, symbol, args) for symbol in symbols]
    finally:
        con.close()

    report_path = _write_report(paths.reports_root, rows, args)
    print(json.dumps({"symbols": rows, "report": str(report_path)}, ensure_ascii=False, default=str, indent=2))
    return 0


def _audit_symbol(con, paths, symbol: str, args: argparse.Namespace) -> dict[str, object]:
    secid = symbol.replace("@RTSX", "")
    finam_glob = str(paths.bars_parquet_root / "timeframe=*" / "symbol=*" / "bars.parquet")
    iss_path = str(paths.moex_iss_history_root / f"security={secid}" / "history.parquet")
    row = con.execute(
        """
        WITH finam AS (
            SELECT CAST(ts AS DATE) AS tradedate, close, volume
            FROM read_parquet(?, hive_partitioning=false)
            WHERE symbol = ? AND timeframe = ?
        ),
        iss AS (
            SELECT tradedate, close, settleprice, volume
            FROM read_parquet(?, hive_partitioning=false)
            WHERE secid = ?
        ),
        joined AS (
            SELECT
                f.tradedate,
                f.close AS finam_close,
                i.close AS iss_close,
                i.settleprice AS iss_settle,
                f.volume AS finam_volume,
                i.volume AS iss_volume,
                ABS(f.close / NULLIF(i.close, 0) - 1) * 100 AS close_diff_pct,
                ABS(f.close / NULLIF(i.settleprice, 0) - 1) * 100 AS settle_diff_pct
            FROM finam f
            JOIN iss i USING (tradedate)
        )
        SELECT
            COUNT(*) AS matched_days,
            MIN(tradedate) AS first_date,
            MAX(tradedate) AS last_date,
            AVG(close_diff_pct) AS avg_close_diff_pct,
            MAX(close_diff_pct) AS max_close_diff_pct,
            AVG(settle_diff_pct) AS avg_settle_diff_pct,
            MAX(settle_diff_pct) AS max_settle_diff_pct,
            SUM(CASE WHEN close_diff_pct >= ? THEN 1 ELSE 0 END) AS close_warning_days,
            SUM(CASE WHEN settle_diff_pct >= ? THEN 1 ELSE 0 END) AS settle_warning_days,
            corr(finam_close, iss_close) AS close_corr,
            corr(finam_close, iss_settle) AS settle_corr
        FROM joined
        """,
        [finam_glob, symbol, args.timeframe, iss_path, secid, args.warn_close_diff_pct, args.warn_close_diff_pct],
    ).fetchone()
    samples = con.execute(
        """
        WITH finam AS (
            SELECT CAST(ts AS DATE) AS tradedate, close, volume
            FROM read_parquet(?, hive_partitioning=false)
            WHERE symbol = ? AND timeframe = ?
        ),
        iss AS (
            SELECT tradedate, close, settleprice, volume
            FROM read_parquet(?, hive_partitioning=false)
            WHERE secid = ?
        )
        SELECT
            f.tradedate,
            f.close AS finam_close,
            i.close AS iss_close,
            i.settleprice AS iss_settle,
            ABS(f.close / NULLIF(i.close, 0) - 1) * 100 AS close_diff_pct,
            ABS(f.close / NULLIF(i.settleprice, 0) - 1) * 100 AS settle_diff_pct
        FROM finam f
        JOIN iss i USING (tradedate)
        ORDER BY close_diff_pct DESC NULLS LAST
        LIMIT 5
        """,
        [finam_glob, symbol, args.timeframe, iss_path, secid],
    ).fetchall()
    return {
        "symbol": symbol,
        "secid": secid,
        "matched_days": int(row[0] or 0),
        "first_date": row[1],
        "last_date": row[2],
        "avg_close_diff_pct": float(row[3] or 0),
        "max_close_diff_pct": float(row[4] or 0),
        "avg_settle_diff_pct": float(row[5] or 0),
        "max_settle_diff_pct": float(row[6] or 0),
        "close_warning_days": int(row[7] or 0),
        "settle_warning_days": int(row[8] or 0),
        "close_corr": float(row[9] or 0),
        "settle_corr": float(row[10] or 0),
        "top_close_diffs": [
            {
                "date": item[0],
                "finam_close": float(item[1]),
                "iss_close": float(item[2]),
                "iss_settle": float(item[3]),
                "close_diff_pct": float(item[4] or 0),
                "settle_diff_pct": float(item[5] or 0),
            }
            for item in samples
        ],
    }


def _write_report(root: Path, rows: list[dict[str, object]], args: argparse.Namespace) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"finam_vs_moex_iss_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    lines = [
        "# Finam vs MOEX ISS Daily Bar Cross-Check",
        "",
        f"- Timeframe: `{args.timeframe}`",
        f"- Warning threshold: `{args.warn_close_diff_pct}`%",
        "",
        "| symbol | matched days | period | avg close diff % | max close diff % | avg settle diff % | max settle diff % | close warn days | settle warn days | close corr | settle corr |",
        "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        period = "-" if not row["matched_days"] else f"{row['first_date']} - {row['last_date']}"
        lines.append(
            "| {symbol} | {matched_days} | {period} | {avg_close_diff_pct:.4f} | {max_close_diff_pct:.4f} | {avg_settle_diff_pct:.4f} | {max_settle_diff_pct:.4f} | {close_warning_days} | {settle_warning_days} | {close_corr:.6f} | {settle_corr:.6f} |".format(
                **{**row, "period": period}
            )
        )
    lines.append("")
    lines.append("## Largest Close Differences")
    for row in rows:
        lines.append("")
        lines.append(f"### {row['symbol']}")
        lines.append("")
        lines.append("| date | Finam close | ISS close | ISS settle | close diff % | settle diff % |")
        lines.append("|---|---:|---:|---:|---:|---:|")
        for item in row["top_close_diffs"]:
            lines.append(
                "| {date} | {finam_close:.4f} | {iss_close:.4f} | {iss_settle:.4f} | {close_diff_pct:.4f} | {settle_diff_pct:.4f} |".format(
                    **item
                )
            )
    lines.extend(
        [
            "",
            "Notes:",
            "- Finam daily bars are joined to MOEX ISS rows by calendar date.",
            "- Large close/settle differences can indicate a session-definition difference or a source-specific close convention.",
            "- This audit does not prove which source is correct; it flags where strategy data assumptions need review.",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


if __name__ == "__main__":
    raise SystemExit(main())
