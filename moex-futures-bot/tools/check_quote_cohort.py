#!/usr/bin/env python3
"""TASK-MX-003 — is any collected day actually valid?

The validity register was written by hand, and a hand-written register does not
notice that two months of collection produced no qualifying day. This computes
it from what was actually recorded.

Criteria frozen in the task card on 2026-08-09, at zero valid days:

    a session is COVERED when >= 90% of its 5-minute buckets hold a snapshot
    AND no single gap exceeds 15 minutes
    a day is VALID when MAIN and EVENING are both covered

The gap rule is not redundant with the bucket rule. 90% alone passes a day that
lost one continuous 45-minute block, and a 45-minute hole in the evening session
is where the spread widens - such a day would report an optimistic median while
satisfying the letter of the coverage test.

Safety: read-only over local files. Writes one derived register.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
QUOTES = PROJECT_ROOT / "data" / "market" / "moex_iss" / "quotes"
REGISTER = QUOTES / "COHORT_VALIDITY.json"

BUCKET_MIN = 5
MIN_BUCKET_COVERAGE = 0.90
MAX_GAP_MIN = 15

SESSIONS = {
    "MAIN": (time(10, 0), time(18, 50), (time(14, 0), time(14, 5))),
    "EVENING": (time(19, 5), time(23, 50), None),
}

TARGET_DAYS = 15
TARGET_BOTH_SESSIONS = 10
TARGET_EXPIRIES = 2


def buckets_in(start: time, end: time, hole):
    out = []
    m = start.hour * 60 + start.minute
    end_m = end.hour * 60 + end.minute
    while m < end_m:
        if hole and (hole[0].hour * 60 + hole[0].minute) <= m < (hole[1].hour * 60 + hole[1].minute):
            m += BUCKET_MIN
            continue
        out.append(m)
        m += BUCKET_MIN
    return out


def analyse_day(stamps):
    """stamps: sorted list of MSK datetimes seen on one calendar day."""
    result = {}
    for name, (start, end, hole) in SESSIONS.items():
        expected = buckets_in(start, end, hole)
        in_session = [t for t in stamps
                      if start <= t.time() < end
                      and not (hole and hole[0] <= t.time() < hole[1])]
        seen = {(t.hour * 60 + t.minute) // BUCKET_MIN * BUCKET_MIN for t in in_session}
        hit = sum(1 for b in expected if b in seen)
        coverage = hit / len(expected) if expected else 0.0

        gap = 0.0
        if in_session:
            edges = [datetime.combine(in_session[0].date(), start)] + in_session + \
                    [datetime.combine(in_session[0].date(), end)]
            gap = max((b - a).total_seconds() / 60.0 for a, b in zip(edges, edges[1:]))
        else:
            gap = (datetime.combine(stamps[0].date(), end) -
                   datetime.combine(stamps[0].date(), start)).total_seconds() / 60.0

        result[name] = {
            "bucket_coverage": round(coverage, 4),
            "max_gap_minutes": round(gap, 1),
            "snapshots": len(in_session),
            "covered": coverage >= MIN_BUCKET_COVERAGE and gap <= MAX_GAP_MIN,
        }
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="regenerate COHORT_VALIDITY.json")
    args = ap.parse_args()

    by_day = defaultdict(list)
    fronts = defaultdict(set)
    # A record exists is not the same as the market was open. ISS keeps serving
    # the last known quote while the market is closed, so the overnight hours of
    # 2026-08-07 carry 6,560 records still stamped TRADEDATE 2026-08-06. Counting
    # them as coverage would let stale replay fill the gaps that sleep created.
    #
    # A snapshot is LIVE only when the venue's own TRADEDATE equals the date it
    # was captured on. Note also that MOEX does trade on Saturdays - 2026-08-08
    # is stamped as its own trading date - so weekends are not excluded.
    venue_tradedates = defaultdict(set)
    stale = Counter()
    for f in sorted(QUOTES.glob("date=*/quotes.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = datetime.fromisoformat(r["captured_msk"])
            live = r.get("venue_tradedate") == ts.date().isoformat()
            if live:
                by_day[ts.date()].append(ts.replace(tzinfo=None))
            stale[ts.date()] += 0 if live else 1
            if r.get("leg") == 1:
                fronts[ts.date()].add(r.get("secid"))
            if r.get("venue_tradedate"):
                venue_tradedates[ts.date()].add(r["venue_tradedate"])

    days, non_trading = [], []
    for d in sorted(set(stale) - set(by_day)):
        non_trading.append({
            "date": d.isoformat(),
            "stale_snapshots": stale[d],
            "reason": "every snapshot carried a TRADEDATE from an earlier session; the market "
                      "was closed for the whole calendar day",
        })
    for d in sorted(by_day):
        stamps = sorted(by_day[d])
        sess = analyse_day(stamps)
        days.append({
            "date": d.isoformat(),
            "valid": all(x["covered"] for x in sess.values()),
            "live_snapshots": len(stamps),
            "stale_snapshots_ignored": stale[d],
            "front_contracts": sorted(fronts[d]),
            "sessions": sess,
        })

    valid_days = [d for d in days if d["valid"]]
    both = [d for d in days if all(x["covered"] for x in d["sessions"].values())]
    expiries = {c for d in valid_days for c in d["front_contracts"]}

    doc = {
        "cohort_id": "MX003.TRACK_A.BR_QUOTES",
        "task": "TASK-MX-003-MOEX-QUOTE-AND-SPREAD-MEASUREMENT-V0",
        "generated_by": "tools/check_quote_cohort.py",
        "note": "Derived, not hand-maintained. A hand-written register does not notice that two "
                "months produced no qualifying day.",
        "criteria": {
            "frozen_on": "2026-08-09, at zero valid days",
            "bucket_minutes": BUCKET_MIN,
            "min_bucket_coverage": MIN_BUCKET_COVERAGE,
            "max_gap_minutes": MAX_GAP_MIN,
            "sessions": {k: [str(v[0]), str(v[1])] for k, v in SESSIONS.items()},
        },
        "targets": {
            "valid_days": TARGET_DAYS,
            "days_with_both_sessions": TARGET_BOTH_SESSIONS,
            "distinct_front_expiries": TARGET_EXPIRIES,
        },
        "non_trading_days_excluded": non_trading,
        "progress": {
            "trading_days_collected": len(days),
            "non_trading_days_excluded": len(non_trading),
            "valid_days": len(valid_days),
            "days_with_both_sessions": len(both),
            "distinct_front_expiries_in_valid_days": sorted(expiries),
            "stopping_rule_met": (len(valid_days) >= TARGET_DAYS
                                  and len(both) >= TARGET_BOTH_SESSIONS
                                  and len(expiries) >= TARGET_EXPIRIES),
        },
        "policy": "No day is spliced from fragments. If the host sleeps, that day is excluded and "
                  "the end date moves. The stopping rule is not weakened to fit the calendar.",
        "days": days,
    }

    print(json.dumps({k: doc[k] for k in ("progress", "targets")}, indent=2))
    print()
    for nd in non_trading:
        print(f"  {nd['date']}  excluded: market closed all day ({nd['stale_snapshots']} stale snapshots)")
    for d in days:
        m, e = d["sessions"]["MAIN"], d["sessions"]["EVENING"]
        flag = "VALID  " if d["valid"] else "invalid"
        print(f"  {d['date']}  {flag}  live {d['live_snapshots']:>5} stale {d['stale_snapshots_ignored']:>5}  main {m['bucket_coverage']:.0%} gap {m['max_gap_minutes']:>6.1f}m"
              f" | evening {e['bucket_coverage']:.0%} gap {e['max_gap_minutes']:>6.1f}m")

    if args.write:
        REGISTER.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nwritten: {REGISTER}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
