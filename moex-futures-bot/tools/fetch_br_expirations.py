#!/usr/bin/env python3
"""TASK-MX-007 prerequisite — the authoritative BR expiration calendar.

`brent_carry.py` requires `expiry_dates` explicitly and raises without them,
because days-to-expiry must be measured against the venue's own `LSTTRADE` and
not against "the last day a contract happened to trade". This builds that map,
once, so the October run is a single command rather than an API scramble.

**It does not validate the dates against an assumed contract rule.** The obvious
rule — last trading day is the first trading day of the contract's own month —
holds for most BR contracts and demonstrably fails for at least one: BRU6 is
BR-9.26 and its LSTTRADE is 2026-08-31, while 2026-09-01 is an ordinary Tuesday.
A validator built on the assumed rule would reject authoritative venue data.
Deviations from the modal pattern are therefore REPORTED, never rejected.

Safety: read-only public ISS metadata. No credential, no account, no order path.
Rate limited. Writes exactly one file.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

UA = {"User-Agent": "moex-futures-bot/research (read-only metadata)"}
OUT = PROJECT_ROOT / "data" / "specs" / "moex_forts_br_expiration_calendar.json"
DELAY_SEC = 0.35

MONTH_CODE = {"F": 1, "G": 2, "H": 3, "J": 4, "K": 5, "M": 6,
              "N": 7, "Q": 8, "U": 9, "V": 10, "X": 11, "Z": 12}


def get(url: str) -> dict:
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read().decode())


def known_secids() -> list:
    """Every BR contract this project has data for, plus every one live today."""
    import duckdb
    con = duckdb.connect(str(PROJECT_ROOT / "data" / "research.duckdb"), read_only=True)
    hist = {r[0] for r in con.execute("select distinct secid from moex_iss_futures_history where assetcode='BR'").fetchall()}
    con.close()

    import glob
    files = glob.glob(str(PROJECT_ROOT / "data/market/moex_iss/candles/interval=60/*/candles.parquet"))
    con = duckdb.connect()
    cand = {r[0] for r in con.execute(f"select distinct security from read_parquet({files!r})").fetchall()}
    con.close()

    live = set()
    p = get("https://iss.moex.com/iss/engines/futures/markets/forts/securities.json"
            "?iss.meta=off&iss.only=securities&assetcode=BR")
    cols = p["securities"]["columns"]
    for row in p["securities"]["data"]:
        r = dict(zip(cols, row))
        if r.get("ASSETCODE") == "BR":
            live.add(r["SECID"])
    return sorted({s for s in (hist | cand | live) if len(s) == 4 and s.startswith("BR") and s[2] in MONTH_CODE})


def lsttrade(secid: str) -> dict:
    p = get(f"https://iss.moex.com/iss/securities/{secid}.json?iss.meta=off")
    d = p.get("description") or {}
    cols, rows = d.get("columns", []), d.get("data", [])
    if not rows:
        return {}
    kv = {r[cols.index("name")]: r[cols.index("value")] for r in rows}
    return {"secid": secid, "name": kv.get("NAME"), "lsttrade": kv.get("LSTTRADE"),
            "lstdeldate": kv.get("LSTDELDATE"), "assetcode": kv.get("ASSETCODE")}


def contract_month(secid: str):
    return (2020 + int(secid[3]), MONTH_CODE[secid[2]]) if secid[3].isdigit() else None


def main() -> int:
    secids = known_secids()
    print(f"{len(secids)} BR contracts to resolve", flush=True)

    entries, failures = {}, []
    for i, s in enumerate(secids, 1):
        try:
            rec = lsttrade(s)
            if rec.get("lsttrade"):
                entries[s] = rec
            else:
                failures.append({"secid": s, "reason": "no LSTTRADE in description"})
        except urllib.error.HTTPError as exc:
            failures.append({"secid": s, "reason": f"HTTP {exc.code}"})
        except Exception as exc:  # noqa: BLE001
            failures.append({"secid": s, "reason": type(exc).__name__})
        if i % 10 == 0:
            print(f"  {i}/{len(secids)}", flush=True)
        time.sleep(DELAY_SEC)

    # Report the modal pattern and every deviation. Do not enforce either.
    same_month = Counter()
    deviations = []
    for s, rec in entries.items():
        cm = contract_month(s)
        lt = date.fromisoformat(rec["lsttrade"])
        rel = "own_month" if (lt.year, lt.month) == cm else "prior_month" if (
            (lt.year, lt.month) == ((cm[0], cm[1] - 1) if cm[1] > 1 else (cm[0] - 1, 12))) else "other"
        same_month[rel] += 1
        if rel != "own_month":
            deviations.append({"secid": s, "name": rec["name"], "lsttrade": rec["lsttrade"],
                               "contract_month": f"{cm[0]}-{cm[1]:02d}", "relation": rel})

    doc = {
        "calendar_id": "MOEX.FORTS.BR.EXPIRATIONS",
        "schema_version": "1.0.0",
        "basis": "PUBLISHED_VENUE_PARAMS",
        "source": "https://iss.moex.com/iss/securities/{secid}.json, description block, LSTTRADE",
        "retrieved_on": "2026-08-09",
        "note": ("Authoritative last trading dates. Consumed by strategies/brent_carry.py, which "
                 "requires expiry_dates explicitly and raises without them. Deriving the date from "
                 "the last day a contract happened to trade mislabels any contract still alive at "
                 "the end of a sample."),
        "validation_policy": (
            "Deviations from the modal pattern are REPORTED, never rejected. The obvious rule - last "
            "trading day is the first trading day of the contract's own month - fails for at least "
            "BRU6, which is BR-9.26 with LSTTRADE 2026-08-31 while 2026-09-01 is an ordinary Tuesday. "
            "A validator built on the assumed rule would reject authoritative venue data."),
        "pattern_counts": dict(same_month),
        "deviations_from_own_month": sorted(deviations, key=lambda d: d["secid"]),
        "expirations": {s: rec["lsttrade"] for s, rec in sorted(entries.items())},
        "detail": {s: entries[s] for s in sorted(entries)},
        "failures": failures,
        "resolved": len(entries),
        "requested": len(secids),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nresolved {len(entries)}/{len(secids)}; failures {len(failures)}")
    print("pattern:", dict(same_month))
    for d in doc["deviations_from_own_month"]:
        print(f"  deviation: {d['secid']} ({d['name']}) LSTTRADE {d['lsttrade']} vs contract month {d['contract_month']}")
    print(f"written: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
