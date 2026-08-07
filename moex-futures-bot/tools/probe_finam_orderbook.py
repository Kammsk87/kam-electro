#!/usr/bin/env python3
"""TASK-MX-003 phase 0 — can we get a BR order book at all?

One bounded read-only call per contract. No collector is written until this
proves the endpoint serves these instruments, because
`data/market/finam/orderbook/` is empty today and nobody recorded why.

Two sources are probed independently:

1. Finam `/v1/instruments/{symbol}/orderbook` — needs the saved token.
2. MOEX ISS `marketdata` — needs nothing, and is the declared fallback.

Credential handling: the token is loaded by the project's existing mechanism
into the process environment and passed to the client. It is never printed,
logged, written to a file, or included in an error message; error bodies are
redacted before display. This script does not display `.env`.

Safety: read-only market data. No account, position, order or execution path.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))

from moex_futures_bot.config import load_env  # noqa: E402
from moex_futures_bot.finam_client import ReadOnlyFinamClient, redact  # noqa: E402

# BRQ6 last traded 2026-08-03. Front and second as of 2026-08-07.
FINAM_SYMBOLS = ["BRU6@RTSX", "BRV6@RTSX"]
ISS_SECIDS = ["BRU6", "BRV6"]

ISS_URL = (
    "https://iss.moex.com/iss/engines/futures/markets/forts/securities/{secid}.json"
    "?iss.only=marketdata&iss.meta=off"
)


def probe_finam() -> Dict[str, Any]:
    out: Dict[str, Any] = {"source": "finam", "symbols": {}}
    load_env()
    secret = os.environ.get("FINAM_SECRET_TOKEN")
    if not secret or secret == "put_your_saved_secret_token_here":
        out["status"] = "NO_CREDENTIAL"
        out["note"] = "FINAM_SECRET_TOKEN absent or still the placeholder; not an error, just unavailable"
        return out

    try:
        client = ReadOnlyFinamClient(secret_token=secret)
        client.auth()
    except Exception as exc:  # noqa: BLE001
        out["status"] = "AUTH_FAILED"
        out["error"] = redact(str(exc))[:300]
        return out

    out["status"] = "AUTHENTICATED"
    for sym in FINAM_SYMBOLS:
        try:
            book = client.orderbook(sym)
        except Exception as exc:  # noqa: BLE001
            out["symbols"][sym] = {"ok": False, "error": redact(str(exc))[:300]}
            continue
        out["symbols"][sym] = summarise_book(book)
    return out


def summarise_book(book: Any) -> Dict[str, Any]:
    """Report shape and top of book only. Market data, never credentials."""
    if not isinstance(book, dict):
        return {"ok": False, "error": f"unexpected payload type {type(book).__name__}"}
    rows = book.get("orderbook") or book.get("rows") or book
    if isinstance(rows, dict):
        rows = rows.get("rows") or rows.get("levels") or []
    if not isinstance(rows, list) or not rows:
        return {"ok": False, "error": "no levels in payload", "keys": sorted(book.keys())[:10]}

    bids = [r for r in rows if _num(r.get("buySize") or r.get("bid_size") or r.get("BIDQUANTITY"))]
    asks = [r for r in rows if _num(r.get("sellSize") or r.get("ask_size") or r.get("OFFERQUANTITY"))]
    return {
        "ok": True,
        "levels": len(rows),
        "bid_levels": len(bids),
        "ask_levels": len(asks),
        "sample_level_keys": sorted(rows[0].keys())[:12] if isinstance(rows[0], dict) else None,
    }


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f else None


def probe_iss() -> Dict[str, Any]:
    out: Dict[str, Any] = {"source": "moex_iss_marketdata", "symbols": {}}
    for secid in ISS_SECIDS:
        try:
            req = urllib.request.Request(
                ISS_URL.format(secid=secid), headers={"User-Agent": "moex-futures-bot/research"}
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            out["symbols"][secid] = {"ok": False, "error": f"HTTP {exc.code}"}
            continue
        except Exception as exc:  # noqa: BLE001
            out["symbols"][secid] = {"ok": False, "error": type(exc).__name__}
            continue

        md = payload.get("marketdata") or {}
        cols = md.get("columns") or []
        data = md.get("data") or []
        if not data:
            out["symbols"][secid] = {"ok": False, "error": "empty marketdata", "columns": cols[:15]}
            continue
        row = dict(zip(cols, data[0]))
        bid, offer = row.get("BID"), row.get("OFFER")
        out["symbols"][secid] = {
            "ok": bid is not None and offer is not None,
            "BID": bid,
            "OFFER": offer,
            "spread_points": (offer - bid) if (bid is not None and offer is not None) else None,
            "BIDDEPTH": row.get("BIDDEPTH"),
            "OFFERDEPTH": row.get("OFFERDEPTH"),
            "UPDATETIME": row.get("UPDATETIME"),
            "has_bid_ask_columns": ("BID" in cols and "OFFER" in cols),
        }
    return out


def main() -> int:
    results = [probe_finam(), probe_iss()]
    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))

    finam_ok = any(s.get("ok") for s in results[0].get("symbols", {}).values())
    iss_ok = any(s.get("ok") for s in results[1].get("symbols", {}).values())
    print()
    print(f"finam orderbook usable: {finam_ok}   (status {results[0].get('status')})")
    print(f"iss marketdata usable:  {iss_ok}")
    if not finam_ok and not iss_ok:
        print("\nVERDICT: DATA_INADEQUATE at source. Do not build a collector.")
        return 2
    print("\nVERDICT: at least one source serves BR quotes; collector may be built against it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
