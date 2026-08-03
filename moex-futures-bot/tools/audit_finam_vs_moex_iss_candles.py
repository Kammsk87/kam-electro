#!/usr/bin/env python3
"""Compare Finam daily bars with MOEX ISS history and intraday candle closes."""

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
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--warn-diff-pct", type=float, default=0.05)
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
    history_path = str(paths.moex_iss_history_root / f"security={secid}" / "history.parquet")
    candles_path = str(paths.moex_iss_root / "candles" / f"interval={args.interval}" / f"security={secid}" / "candles.parquet")
    stats = con.execute(
        """
        WITH finam AS (
            SELECT CAST(ts AS DATE) AS tradedate, close, open, high, low, volume
            FROM read_parquet(?, hive_partitioning=false)
            WHERE symbol = ? AND timeframe = ?
        ),
        history AS (
            SELECT tradedate, close AS history_close, settleprice, volume AS history_volume
            FROM read_parquet(?, hive_partitioning=false)
            WHERE secid = ?
        ),
        candle_days AS (
            SELECT
                CAST("begin" AS DATE) AS tradedate,
                arg_min(open, "begin") AS candle_open,
                arg_max(close, "begin") AS candle_last_close,
                max(high) AS candle_high,
                min(low) AS candle_low,
                sum(volume) AS candle_volume,
                max("end") AS candle_last_end,
                count(*) AS candle_count
            FROM read_parquet(?, hive_partitioning=false)
            WHERE secid = ?
            GROUP BY CAST("begin" AS DATE)
        ),
        joined AS (
            SELECT
                f.tradedate,
                f.close AS finam_close,
                h.history_close,
                h.settleprice,
                c.candle_last_close,
                c.candle_last_end,
                c.candle_count,
                ABS(f.close / NULLIF(h.history_close, 0) - 1) * 100 AS history_close_diff_pct,
                ABS(f.close / NULLIF(h.settleprice, 0) - 1) * 100 AS settle_diff_pct,
                ABS(f.close / NULLIF(c.candle_last_close, 0) - 1) * 100 AS candle_last_diff_pct
            FROM finam f
            JOIN history h USING (tradedate)
            JOIN candle_days c USING (tradedate)
        )
        SELECT
            COUNT(*) AS matched_days,
            MIN(tradedate) AS first_date,
            MAX(tradedate) AS last_date,
            AVG(history_close_diff_pct) AS avg_history_close_diff_pct,
            MAX(history_close_diff_pct) AS max_history_close_diff_pct,
            AVG(settle_diff_pct) AS avg_settle_diff_pct,
            MAX(settle_diff_pct) AS max_settle_diff_pct,
            AVG(candle_last_diff_pct) AS avg_candle_last_diff_pct,
            MAX(candle_last_diff_pct) AS max_candle_last_diff_pct,
            SUM(CASE WHEN candle_last_diff_pct >= ? THEN 1 ELSE 0 END) AS candle_warning_days,
            corr(finam_close, history_close) AS history_close_corr,
            corr(finam_close, candle_last_close) AS candle_last_corr,
            mode(candle_last_end) AS modal_last_end
        FROM joined
        """,
        [finam_glob, symbol, args.timeframe, history_path, secid, candles_path, secid, args.warn_diff_pct],
    ).fetchone()
    samples = con.execute(
        """
        WITH finam AS (
            SELECT CAST(ts AS DATE) AS tradedate, close
            FROM read_parquet(?, hive_partitioning=false)
            WHERE symbol = ? AND timeframe = ?
        ),
        history AS (
            SELECT tradedate, close AS history_close, settleprice
            FROM read_parquet(?, hive_partitioning=false)
            WHERE secid = ?
        ),
        candle_days AS (
            SELECT
                CAST("begin" AS DATE) AS tradedate,
                arg_max(close, "begin") AS candle_last_close,
                max("end") AS candle_last_end,
                count(*) AS candle_count
            FROM read_parquet(?, hive_partitioning=false)
            WHERE secid = ?
            GROUP BY CAST("begin" AS DATE)
        )
        SELECT
            f.tradedate,
            f.close AS finam_close,
            h.history_close,
            h.settleprice,
            c.candle_last_close,
            c.candle_last_end,
            ABS(f.close / NULLIF(h.history_close, 0) - 1) * 100 AS history_close_diff_pct,
            ABS(f.close / NULLIF(c.candle_last_close, 0) - 1) * 100 AS candle_last_diff_pct
        FROM finam f
        JOIN history h USING (tradedate)
        JOIN candle_days c USING (tradedate)
        ORDER BY history_close_diff_pct DESC NULLS LAST
        LIMIT 8
        """,
        [finam_glob, symbol, args.timeframe, history_path, secid, candles_path, secid],
    ).fetchall()
    return {
        "symbol": symbol,
        "secid": secid,
        "matched_days": int(stats[0] or 0),
        "first_date": stats[1],
        "last_date": stats[2],
        "avg_history_close_diff_pct": float(stats[3] or 0),
        "max_history_close_diff_pct": float(stats[4] or 0),
        "avg_settle_diff_pct": float(stats[5] or 0),
        "max_settle_diff_pct": float(stats[6] or 0),
        "avg_candle_last_diff_pct": float(stats[7] or 0),
        "max_candle_last_diff_pct": float(stats[8] or 0),
        "candle_warning_days": int(stats[9] or 0),
        "history_close_corr": float(stats[10] or 0),
        "candle_last_corr": float(stats[11] or 0),
        "modal_last_end": stats[12],
        "top_history_diffs": [
            {
                "date": item[0],
                "finam_close": float(item[1]),
                "history_close": float(item[2]),
                "settleprice": float(item[3]),
                "candle_last_close": float(item[4]),
                "candle_last_end": item[5],
                "history_close_diff_pct": float(item[6] or 0),
                "candle_last_diff_pct": float(item[7] or 0),
            }
            for item in samples
        ],
    }


def _write_report(root: Path, rows: list[dict[str, object]], args: argparse.Namespace) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"finam_vs_moex_iss_candles_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    path.write_text(_markdown(rows, args), encoding="utf-8")
    return path


def _markdown(rows: list[dict[str, object]], args: argparse.Namespace) -> str:
    lines = [
        "# Finam vs MOEX ISS Intraday Candle Cross-Check",
        "",
        f"- Finam timeframe: `{args.timeframe}`",
        f"- MOEX ISS candle interval: `{args.interval}` minutes",
        f"- Candle warning threshold: `{args.warn_diff_pct}`%",
        "",
        "| symbol | matched days | period | avg Finam-vs-history close diff % | max history diff % | avg Finam-vs-last-candle diff % | max last-candle diff % | last-candle warn days | history corr | last-candle corr | modal last candle end |",
        "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in rows:
        period = "-" if not row["matched_days"] else f"{row['first_date']} - {row['last_date']}"
        lines.append(
            "| {symbol} | {matched_days} | {period} | {avg_history_close_diff_pct:.4f} | {max_history_close_diff_pct:.4f} | {avg_candle_last_diff_pct:.6f} | {max_candle_last_diff_pct:.6f} | {candle_warning_days} | {history_close_corr:.6f} | {candle_last_corr:.6f} | {modal_last_end} |".format(
                **{**row, "period": period}
            )
        )
    lines.append("")
    lines.append("## Largest Finam-vs-History Close Differences")
    for row in rows:
        lines.append("")
        lines.append(f"### {row['symbol']}")
        lines.append("")
        lines.append("| date | Finam close | ISS history close | ISS settle | ISS last candle close | last candle end | history diff % | last-candle diff % |")
        lines.append("|---|---:|---:|---:|---:|---|---:|---:|")
        for item in row["top_history_diffs"]:
            lines.append(
                "| {date} | {finam_close:.4f} | {history_close:.4f} | {settleprice:.4f} | {candle_last_close:.4f} | {candle_last_end} | {history_close_diff_pct:.4f} | {candle_last_diff_pct:.6f} |".format(
                    **item
                )
            )
    lines.extend(
        [
            "",
            "Decision:",
            "- If Finam close matches MOEX ISS last intraday candle close, Finam daily bars should be interpreted as last-trade daily bars including evening trading.",
            "- MOEX ISS history `close` / interval-24 candle `close` should not be mixed with Finam close-to-close returns without explicit conversion.",
            "- MOEX ISS `settleprice` remains a separate settlement/funding research field.",
        ]
    )
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
