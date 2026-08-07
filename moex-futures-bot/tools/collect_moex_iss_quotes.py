#!/usr/bin/env python3
"""TASK-MX-003 track A — forward collector for BR top-of-book quotes.

Records what the MOEX ISS `marketdata` endpoint reports for the two nearest BR
contracts. It records; it decides nothing. No verdict, no threshold, no filter is
applied here, because a collector that judges its own data is a collector that
can be tuned.

Why ISS and not Finam: `tools/probe_finam_orderbook.py` established on 2026-08-07
that no Finam credential is configured, that ISS serves BID/OFFER/SPREAD for BR,
and that ISS exposes **no depth at all** — BIDDEPTH, OFFERDEPTH, NUMBIDS and
NUMOFFERS are always null. This collector therefore measures the spread and can
never measure size impact. Anything built on it must say so.

Design notes that matter:

* **SYSTIME is the source of truth**, stored raw. MOEX assigns the evening
  session to the next trading day, so TRADEDATE and the wall clock disagree by
  design. Slot and session labels are derived from SYSTIME in Moscow time; the
  venue's own TRADEDATE is stored alongside, unmodified, so either convention can
  be reconstructed later.
* **STEPPRICE is stored per snapshot.** The rouble value of one tick tracks the
  currency and is not a constant: it read 7.83987 in July 2026 and 8.09293 in
  August. A spread converted to roubles with a stale STEPPRICE is wrong.
* **The front/second pair is rediscovered periodically**, by expiry from the
  venue's own LASTTRADEDATE, so a roll is picked up without restarting.
* Append-only JSONL, one file per calendar day. Nothing is ever rewritten.

Storage lives under `data/market/moex_iss/quotes/`, not under
`data/market/finam/orderbook/` as the original execution plan specified: the
source is ISS, and filing ISS data under a Finam path would misattribute its
provenance.

Safety: read-only public market data. No credential is read or required. No
account, position, order or execution path. Rate limited. Manual start and stop,
no service, no autostart.

Usage:
    .venv/bin/python tools/collect_moex_iss_quotes.py            # runs until Ctrl-C
    .venv/bin/python tools/collect_moex_iss_quotes.py --once     # single snapshot
    nohup .venv/bin/python tools/collect_moex_iss_quotes.py > collector.log 2>&1 &
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytz

REPO = Path(__file__).resolve().parents[1]
MSK = pytz.timezone("Europe/Moscow")

ISS_BASE = "https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.meta=off"
USER_AGENT = "moex-futures-bot/research (read-only research collector)"

ASSET = "BR"
LEGS = 2
INTERVAL_SEC = 5.0
REDISCOVER_EVERY_SEC = 600.0
MAX_CONSECUTIVE_ERRORS = 20

_stop = False


def _handle_stop(signum, frame):  # noqa: ARG001
    global _stop
    _stop = True
    print("\nstop requested; finishing current cycle", flush=True)


def get_json(url: str, timeout: int = 25) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def rows(payload: Dict[str, Any], block: str) -> List[Dict[str, Any]]:
    b = payload.get(block) or {}
    cols = b.get("columns") or []
    return [dict(zip(cols, r)) for r in (b.get("data") or [])]


def discover_legs(asset: str = ASSET, legs: int = LEGS) -> List[str]:
    """The `legs` nearest contracts by the venue's own LASTTRADEDATE."""
    payload = get_json(f"{ISS_BASE}&iss.only=securities&assetcode={asset}")
    live = [
        r for r in rows(payload, "securities")
        if r.get("ASSETCODE") == asset and r.get("LASTTRADEDATE")
    ]
    live.sort(key=lambda r: r["LASTTRADEDATE"])
    return [r["SECID"] for r in live[:legs]]


def session_of(dt_msk: datetime) -> str:
    """Session label from Moscow wall-clock time.

    Boundaries are the venue's published schedule. A snapshot landing in a
    clearing pause is labelled as such rather than dropped: how the spread
    behaves there is one of the things this collection exists to find out.
    """
    t = dt_msk.time()
    hm = t.hour * 60 + t.minute
    if 14 * 60 <= hm < 14 * 60 + 5:
        return "CLEARING_DAY"
    if 18 * 60 + 50 <= hm < 19 * 60 + 5:
        return "CLEARING_EVENING"
    if 10 * 60 <= hm < 18 * 60 + 50:
        return "MAIN_SESSION"
    if 19 * 60 + 5 <= hm < 23 * 60 + 50:
        return "EVENING_SESSION"
    return "CLOSED"


def snapshot(secids: List[str]) -> List[Dict[str, Any]]:
    url = f"{ISS_BASE}&iss.only=securities,marketdata&securities={','.join(secids)}"
    payload = get_json(url)
    static = {r["SECID"]: r for r in rows(payload, "securities")}
    captured = datetime.now(pytz.utc)
    captured_msk = captured.astimezone(MSK)

    out = []
    for i, secid in enumerate(secids):
        md = next((r for r in rows(payload, "marketdata") if r.get("SECID") == secid), None)
        st = static.get(secid, {})
        if md is None:
            continue
        bid, offer = md.get("BID"), md.get("OFFER")
        minstep = st.get("MINSTEP")
        stepprice = st.get("STEPPRICE")
        spread_pts = md.get("SPREAD")
        if spread_pts is None and bid is not None and offer is not None:
            spread_pts = round(offer - bid, 10)
        out.append(
            {
                # provenance
                "captured_utc": captured.isoformat(),
                "captured_msk": captured_msk.isoformat(),
                "systime": md.get("SYSTIME"),
                "updatetime": md.get("UPDATETIME"),
                "venue_tradedate": md.get("TRADEDATE"),
                "venue_trade_session_date": md.get("TRADE_SESSION_DATE"),
                "seqnum": md.get("SEQNUM"),
                "session": session_of(captured_msk),
                # identity
                "secid": secid,
                "leg": i + 1,
                "lasttradedate": st.get("LASTTRADEDATE"),
                # quote
                "bid": bid,
                "offer": offer,
                "spread_points": spread_pts,
                "spread_ticks": (spread_pts / minstep) if (spread_pts is not None and minstep) else None,
                "last": md.get("LAST"),
                "settleprice": md.get("SETTLEPRICE"),
                # tick economics, which move with the currency
                "minstep": minstep,
                "stepprice": stepprice,
                "rub_per_price_point": (stepprice / minstep) if (minstep and stepprice) else None,
                # context
                "openposition": md.get("OPENPOSITION"),
                "voltoday": md.get("VOLTODAY"),
                "numtrades": md.get("NUMTRADES"),
                "swaprate": md.get("SWAPRATE"),
                # depth, recorded so its absence is evidence rather than assumption
                "biddepth": md.get("BIDDEPTH"),
                "offerdepth": md.get("OFFERDEPTH"),
                "numbids": md.get("NUMBIDS"),
                "numoffers": md.get("NUMOFFERS"),
            }
        )
    return out


def out_path(root: Path, dt_msk: datetime) -> Path:
    p = root / f"date={dt_msk.date().isoformat()}"
    p.mkdir(parents=True, exist_ok=True)
    return p / "quotes.jsonl"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(REPO / "data" / "market" / "moex_iss" / "quotes"))
    ap.add_argument("--interval", type=float, default=INTERVAL_SEC)
    ap.add_argument("--legs", type=int, default=LEGS)
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()

    if args.interval < 5.0:
        raise SystemExit("COLLECTOR_RATE_LIMIT: interval below 5 seconds is not permitted")

    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    root = Path(args.root)
    secids = discover_legs(legs=args.legs)
    print(f"legs: {secids}  interval: {args.interval}s  root: {root}", flush=True)

    last_discover = time.time()
    errors = 0
    written = 0
    started = time.time()

    while not _stop:
        cycle = time.time()
        try:
            if cycle - last_discover >= REDISCOVER_EVERY_SEC:
                new = discover_legs(legs=args.legs)
                if new != secids:
                    print(f"roll detected: {secids} -> {new}", flush=True)
                    secids = new
                last_discover = cycle

            recs = snapshot(secids)
            if recs:
                path = out_path(root, datetime.now(MSK))
                with path.open("a", encoding="utf-8") as fh:
                    for r in recs:
                        fh.write(json.dumps(r, ensure_ascii=False) + "\n")
                written += len(recs)
            errors = 0
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            errors += 1
            print(f"transient error {errors}/{MAX_CONSECUTIVE_ERRORS}: {type(exc).__name__}", flush=True)
            if errors >= MAX_CONSECUTIVE_ERRORS:
                print("too many consecutive errors; stopping rather than hammering the endpoint", flush=True)
                return 1
            time.sleep(min(60.0, args.interval * (2 ** min(errors, 5))))
            continue
        except Exception as exc:  # noqa: BLE001
            print(f"fatal: {type(exc).__name__}: {exc}", flush=True)
            return 1

        if args.once:
            for r in recs:
                print(json.dumps(r, ensure_ascii=False, indent=2))
            return 0

        if written and written % 240 == 0:
            mins = (time.time() - started) / 60
            print(f"{written} records, {mins:.0f} min elapsed, legs {secids}", flush=True)

        time.sleep(max(0.0, args.interval - (time.time() - cycle)))

    print(f"stopped cleanly after {written} records", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
