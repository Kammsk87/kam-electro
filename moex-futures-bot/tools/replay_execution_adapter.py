#!/usr/bin/env python3
"""TASK-MX-005 — replay the execution adapter over recorded quotes.

**No order is placed and no broker is contacted.** This feeds quotes the
collector already wrote through `MOEXExecutionAdapter` at their own recorded
timestamps and reports what the adapter decided. It is the honest version of a
"paper mechanics test": it exercises the clearing guard, the spread-intent
translator and the top-of-book fill approximation against real times and real
prices, and it exercises nothing else, because everything else would require
sending an order.

It is not a strategy and produces no P&L. Every paired snapshot is offered to
the adapter as the same intent; the interest is in what the adapter refuses and
when, not in whether the trade would have made money.

Two independent things it answers:

1. **Does the adapter behave on real input?** Counts of accepted, blocked by
   clearing, blocked by spread width, and broken pairs, by session.
2. **Where does the quote go quiet?** UPDATETIME stops advancing when the venue
   is not trading the instrument. This was written to verify `SCHEDULE_2026_08`
   against the venue's real clearing windows, and it **does not work for that**:
   a frozen UPDATETIME means no trade printed, and on the far leg in the evening
   that is ordinary thinness rather than a halt. The first run found a 107-minute
   "halt" at 20:04-21:51, in the middle of the evening session. The measurement
   is retained as a liquidity observation and its original claim is withdrawn.

   Verifying the schedule needs main-session coverage the cohort does not yet
   have, and a signal that separates "halted" from "quiet" - both legs freezing
   simultaneously, at minute boundaries, on several days.

Safety: read-only over local files. No network, credential, broker or order path.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, time
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from moex_futures_bot.execution.clearing_schedule import SCHEDULE_2026_08, ClearingScheduleGuard
from moex_futures_bot.execution.moex_execution_adapter import (
    Intent, MOEXExecutionAdapter, Quote,
)

QUOTES = PROJECT_ROOT / "data" / "market" / "moex_iss" / "quotes"


def load_pairs(root: Path):
    """(captured_msk, near_quote, far_quote, updatetimes) per snapshot cycle.

    Only LIVE snapshots count - those whose venue TRADEDATE equals their capture
    date. The overnight hours replay the previous session's last quote, and
    feeding replay to the adapter would measure nothing.
    """
    by_ts = defaultdict(dict)
    for f in sorted(root.glob("date=*/quotes.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = datetime.fromisoformat(r["captured_msk"]).replace(tzinfo=None)
            if r.get("venue_tradedate") != ts.date().isoformat():
                continue
            by_ts[ts.replace(microsecond=0)][r["leg"]] = r

    out = []
    for ts in sorted(by_ts):
        legs = by_ts[ts]
        if 1 in legs and 2 in legs:
            out.append((ts, legs[1], legs[2]))
    return out


def to_quote(r) -> Quote:
    return Quote(secid=r["secid"], bid=r.get("bid"), ask=r.get("offer"),
                 minstep=r.get("minstep") or 0.01,
                 lasttradedate=r.get("lasttradedate") or "2099-01-01")


def quiet_minutes(root: Path):
    """Minutes of day where the front leg's UPDATETIME stopped advancing.

    NOT a halt detector. A frozen UPDATETIME means no trade printed, which during
    a clearing session is a halt and during a thin evening is ordinary. Nothing
    here separates the two.
    """
    per_day = defaultdict(list)
    for f in sorted(root.glob("date=*/quotes.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("leg") != 1 or not r.get("updatetime"):
                continue
            ts = datetime.fromisoformat(r["captured_msk"]).replace(tzinfo=None)
            if r.get("venue_tradedate") != ts.date().isoformat():
                continue
            per_day[ts.date()].append((ts, r["updatetime"]))

    frozen = Counter()
    seen = Counter()
    for day, rows in per_day.items():
        rows.sort()
        for (t0, u0), (t1, u1) in zip(rows, rows[1:]):
            minute = t1.hour * 60 + t1.minute
            seen[minute] += 1
            if u0 == u1:
                frozen[minute] += 1
    return {m: frozen[m] / seen[m] for m in sorted(seen) if seen[m] >= 3}


def hhmm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-spread-ticks", type=float, required=True,
                    help="from the frozen TASK-MX-002 breakeven table: 1.90 (1d), "
                         "4.08 (3d), 4.29 (5d), 5.94 (10d). No default by design.")
    ap.add_argument("--root", default=str(QUOTES))
    args = ap.parse_args()

    root = Path(args.root)
    pairs = load_pairs(root)
    if not pairs:
        print("no live paired snapshots found")
        return 1

    adapter = MOEXExecutionAdapter(max_entry_spread_ticks=args.max_spread_ticks)
    guard = ClearingScheduleGuard()

    verdicts = Counter()
    by_session = defaultdict(Counter)
    blocked_minutes = Counter()
    reasons = Counter()

    for ts, near_r, far_r in pairs:
        res = adapter.submit(Intent.ENTER_SPREAD_LONG, to_quote(near_r), to_quote(far_r),
                             now=ts.time())
        sess = res.get("session", "?")
        if res["accepted"]:
            key = "accepted"
        elif "clearing guard" in res["reason"]:
            key = "blocked_clearing"
            blocked_minutes[ts.hour * 60 + ts.minute] += 1
        elif "ticks wide" in res["reason"]:
            key = "blocked_spread"
        elif "LEG_RISK" in res["reason"]:
            key = "blocked_leg_risk"
        else:
            key = "blocked_other"
        verdicts[key] += 1
        by_session[sess][key] += 1
        if key != "accepted":
            reasons[res["reason"][:90]] += 1

    total = sum(verdicts.values())
    print(f"paired live snapshots: {total}   spread ceiling: {args.max_spread_ticks} ticks/leg")
    print(f"window: {pairs[0][0]} .. {pairs[-1][0]}")
    print()
    print("verdicts:")
    for k, v in verdicts.most_common():
        print(f"  {k:20} {v:7}  {100*v/total:5.1f}%")
    print()
    print("by session:")
    for s in sorted(by_session):
        c = by_session[s]
        print(f"  {s:18} " + "  ".join(f"{k}={v}" for k, v in c.most_common()))
    print()
    print("top refusal reasons:")
    for r, v in reasons.most_common(5):
        print(f"  {v:6}  {r}")

    print()
    print("=== quiet minutes: front leg UPDATETIME not advancing ===")
    halts = quiet_minutes(root)
    hot = [(m, share) for m, share in halts.items() if share >= 0.8]
    runs = []
    for m, share in hot:
        if runs and m == runs[-1][-1] + 1:
            runs[-1].append(m)
        else:
            runs.append([m])
    cfg = [("day clearing", SCHEDULE_2026_08.clearing_day_start, SCHEDULE_2026_08.clearing_day_end),
           ("evening clearing", SCHEDULE_2026_08.clearing_evening_start, SCHEDULE_2026_08.clearing_evening_end)]
    print("configured clearing windows, for reference only:")
    for name, a, b in cfg:
        print(f"  {name:18} {a.strftime('%H:%M')}-{b.strftime('%H:%M')}")
    print(f"quiet runs (>=80% of samples frozen, >=3 samples/minute): {len(runs)}")
    for r in sorted(runs, key=len, reverse=True)[:10]:
        print(f"  {hhmm(r[0])}-{hhmm(r[-1] + 1)}  ({len(r)} min)")
    if not runs:
        print("  none")
    print("  These are NOT verified halts. A run inside the evening session is thin trading,")
    print("  not a clearing pause; the schedule cannot be checked against this signal.")
    print()
    print("guard blocked entries at these minutes (top 10):")
    for m, v in blocked_minutes.most_common(10):
        print(f"  {hhmm(m)}  {v}")
    print()
    print("NOTE: no order was placed and no broker was contacted. This replays recorded")
    print("quotes through the adapter; it proves the adapter's decisions, not executability.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
