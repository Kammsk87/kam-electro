#!/usr/bin/env python3
"""Compare GLDRUBF SWAPRATE-implied carry with RUSFAR."""

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--security", default="GLDRUBF")
    parser.add_argument("--index-security", default="RUSFAR")
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
        stats = _stats(con, paths, args)
        samples = _largest_diffs(con, paths, args)
    finally:
        con.close()

    report_path = _write_report(paths.reports_root, stats, samples, args)
    print(json.dumps({**stats, "report": str(report_path)}, ensure_ascii=False, default=str, indent=2))
    return 0


def _stats(con, paths, args: argparse.Namespace) -> dict[str, object]:
    gld_path = str(paths.moex_iss_history_root / f"security={args.security}" / "history.parquet")
    rusfar_path = str(paths.moex_iss_root / "index_history" / f"security={args.index_security}" / "history.parquet")
    row = con.execute(
        """
        WITH joined AS (
            SELECT
                g.tradedate,
                g.swaprate,
                g.settleprice,
                LAG(g.tradedate) OVER (ORDER BY g.tradedate) AS prev_tradedate,
                g.swaprate / NULLIF(g.settleprice, 0) * 36500 AS implied_rate_pct_raw,
                r.close AS rusfar_pct
            FROM read_parquet(?) g
            JOIN read_parquet(?) r USING (tradedate)
            WHERE g.swaprate != 0 AND g.settleprice > 0 AND r.close > 0
        ),
        normalized AS (
            SELECT
                tradedate,
                swaprate,
                settleprice,
                rusfar_pct,
                implied_rate_pct_raw,
                implied_rate_pct_raw / GREATEST(date_diff('day', prev_tradedate, tradedate), 1) AS implied_rate_pct_calendar
            FROM joined
        ),
        smoothed AS (
            SELECT
                tradedate,
                implied_rate_pct_raw,
                implied_rate_pct_calendar,
                rusfar_pct,
                AVG(implied_rate_pct_calendar) OVER (ORDER BY tradedate ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS implied_calendar_5d_pct,
                AVG(rusfar_pct) OVER (ORDER BY tradedate ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS rusfar_5d_pct
            FROM normalized
        )
        SELECT
            COUNT(*) AS matched_days,
            MIN(tradedate) AS first_date,
            MAX(tradedate) AS last_date,
            AVG(implied_rate_pct_raw) AS avg_implied_rate_pct_raw,
            AVG(implied_rate_pct_calendar) AS avg_implied_rate_pct_calendar,
            AVG(rusfar_pct) AS avg_rusfar_pct,
            AVG(implied_rate_pct_calendar - rusfar_pct) AS avg_diff_pct,
            AVG(ABS(implied_rate_pct_calendar - rusfar_pct)) AS mean_abs_diff_pct,
            corr(implied_rate_pct_calendar, rusfar_pct) AS corr_daily,
            corr(implied_calendar_5d_pct, rusfar_5d_pct) AS corr_5d,
            MIN(implied_rate_pct_calendar) AS min_implied_rate_pct,
            MAX(implied_rate_pct_calendar) AS max_implied_rate_pct
        FROM smoothed
        """,
        [gld_path, rusfar_path],
    ).fetchone()
    return {
        "matched_days": int(row[0] or 0),
        "first_date": row[1],
        "last_date": row[2],
        "avg_implied_rate_pct_raw": float(row[3] or 0),
        "avg_implied_rate_pct_calendar": float(row[4] or 0),
        "avg_rusfar_pct": float(row[5] or 0),
        "avg_diff_pct": float(row[6] or 0),
        "mean_abs_diff_pct": float(row[7] or 0),
        "corr_daily": float(row[8] or 0),
        "corr_5d": float(row[9] or 0),
        "min_implied_rate_pct": float(row[10] or 0),
        "max_implied_rate_pct": float(row[11] or 0),
    }


def _largest_diffs(con, paths, args: argparse.Namespace) -> list[dict[str, object]]:
    gld_path = str(paths.moex_iss_history_root / f"security={args.security}" / "history.parquet")
    rusfar_path = str(paths.moex_iss_root / "index_history" / f"security={args.index_security}" / "history.parquet")
    rows = con.execute(
        """
        SELECT
            g.tradedate,
            g.swaprate,
            g.settleprice,
            g.swaprate / NULLIF(g.settleprice, 0) * 36500 / GREATEST(date_diff('day', LAG(g.tradedate) OVER (ORDER BY g.tradedate), g.tradedate), 1) AS implied_rate_pct,
            r.close AS rusfar_pct,
            g.swaprate / NULLIF(g.settleprice, 0) * 36500 / GREATEST(date_diff('day', LAG(g.tradedate) OVER (ORDER BY g.tradedate), g.tradedate), 1) - r.close AS diff_pct
        FROM read_parquet(?) g
        JOIN read_parquet(?) r USING (tradedate)
        WHERE g.swaprate != 0 AND g.settleprice > 0 AND r.close > 0
        ORDER BY ABS(diff_pct) DESC
        LIMIT 10
        """,
        [gld_path, rusfar_path],
    ).fetchall()
    return [
        {
            "date": row[0],
            "swaprate": float(row[1]),
            "settleprice": float(row[2]),
            "implied_rate_pct": float(row[3]),
            "rusfar_pct": float(row[4]),
            "diff_pct": float(row[5]),
        }
        for row in rows
    ]


def _write_report(root: Path, stats: dict[str, object], samples: list[dict[str, object]], args: argparse.Namespace) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"gldrubf_swaprate_vs_rusfar_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    lines = [
        "# GLDRUBF SWAPRATE vs RUSFAR Cross-Check",
        "",
        f"- Security: `{args.security}`",
        f"- Index: `{args.index_security}`",
        f"- Matched days: `{stats['matched_days']}`",
        f"- Period: `{stats['first_date']} - {stats['last_date']}`",
        f"- Average implied SWAPRATE annualized, raw trading-day: `{stats['avg_implied_rate_pct_raw']:.2f}`%",
        f"- Average implied SWAPRATE annualized, calendar-adjusted: `{stats['avg_implied_rate_pct_calendar']:.2f}`%",
        f"- Average RUSFAR: `{stats['avg_rusfar_pct']:.2f}`%",
        f"- Average difference: `{stats['avg_diff_pct']:.2f}` percentage points",
        f"- Mean absolute difference: `{stats['mean_abs_diff_pct']:.2f}` percentage points",
        f"- Daily correlation: `{stats['corr_daily']:.3f}`",
        f"- 5-day smoothed correlation: `{stats['corr_5d']:.3f}`",
        f"- Implied rate range: `{stats['min_implied_rate_pct']:.2f}`% - `{stats['max_implied_rate_pct']:.2f}`%",
        "",
        "## Largest Differences",
        "",
        "| date | swaprate | settleprice | implied rate % | RUSFAR % | diff pp |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in samples:
        lines.append(
            "| {date} | {swaprate:.5f} | {settleprice:.2f} | {implied_rate_pct:.2f} | {rusfar_pct:.2f} | {diff_pct:.2f} |".format(
                **row
            )
        )
    lines.extend(
        [
            "",
            "Notes:",
            "- Raw implied rate is calculated as `SWAPRATE / SETTLEPRICE * 365 * 100`.",
            "- Calendar-adjusted implied rate divides the raw value by calendar days since the previous trading date.",
            "- This checks whether SWAPRATE behaves like a RUB daily funding charge for a long GLDRUBF position.",
            "- Calendar-day/weekend accrual details are not fully modeled here; large one-day differences require contract-spec verification.",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


if __name__ == "__main__":
    raise SystemExit(main())
