#!/usr/bin/env python3
"""Read-only Finam Trade API probe for the demo account."""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


BASE_URL = "https://api.finam.ru"
PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_env(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def redact(value):
    text = str(value)
    text = re.sub(r"[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}", "[JWT_REDACTED]", text)
    text = re.sub(r"[A-Za-z0-9_-]{32,}", "[TOKEN_REDACTED]", text)
    return text


def request_json(method, path, body=None, token=None, bearer=False):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token if bearer else token

    req = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        if exc.code in (301, 302, 307, 308):
            location = exc.headers.get("Location") or raw.strip()
            if location:
                if location.startswith(BASE_URL):
                    location = location[len(BASE_URL):]
                if location.startswith("/"):
                    return request_json(method, location, body=body, token=token, bearer=bearer)
        raise RuntimeError(f"{method} {path} failed: HTTP {exc.code}: {redact(raw[:1000])}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {path} failed: {exc}") from exc


def authenticated_get(path, jwt):
    try:
        return request_json("GET", path, token=jwt, bearer=False)
    except RuntimeError as first_error:
        try:
            return request_json("GET", path, token=jwt, bearer=True)
        except RuntimeError:
            raise first_error


def auth(secret):
    payload = {"secret": secret}
    response = request_json("POST", "/v1/sessions", body=payload)
    token = response.get("token") or response.get("access_token") or response.get("jwt")
    if not token:
        raise RuntimeError("Auth response did not contain token/access_token/jwt")
    return token


def compact_asset(asset):
    return {
        "symbol": asset.get("symbol"),
        "ticker": asset.get("ticker"),
        "mic": asset.get("mic"),
        "type": asset.get("type"),
        "name": asset.get("name"),
        "is_archived": asset.get("is_archived"),
    }


def search_assets(assets):
    wanted = ("BR", "BRM", "GL", "GD", "GLDRUBF", "GOLD", "GOLDM", "NG", "NGM", "TTF")
    hits = []
    for asset in assets:
        haystack = " ".join(str(asset.get(k, "")) for k in ("symbol", "ticker", "name", "type", "mic")).upper()
        if any(re.search(rf"(^|[^A-Z0-9]){re.escape(code)}([^A-Z0-9]|$)", haystack) for code in wanted):
            hits.append(compact_asset(asset))
    return hits


def search_moex_futures(assets):
    patterns = (
        r"^BR[-A-Z0-9.]*$",
        r"^BRM[-A-Z0-9.]*$",
        r"^GL[-A-Z0-9.]*$",
        r"^GD[-A-Z0-9.]*$",
        r"^GLDRUBF$",
        r"^GOLD[-A-Z0-9.]*$",
        r"^GOLDM[-A-Z0-9.]*$",
        r"^NG[-A-Z0-9.]*$",
        r"^NGM[-A-Z0-9.]*$",
        r"^TTF[-A-Z0-9.]*$",
    )
    result = []
    for asset in assets:
        if asset.get("type") != "FUTURES" or asset.get("mic") != "RTSX":
            continue
        name = str(asset.get("name") or "").upper()
        ticker = str(asset.get("ticker") or "").upper()
        symbol = str(asset.get("symbol") or "").upper()
        if any(re.search(pattern, name) for pattern in patterns) or any(code in symbol for code in ("BR", "GL", "GD", "NG", "TTF")):
            result.append(compact_asset(asset))
    return result


def search_gas_futures(assets):
    gas_words = ("GAS", "NATURAL", "HENRY", "TTF", "NG", "NGM")
    result = []
    for asset in assets:
        if asset.get("type") != "FUTURES":
            continue
        haystack = " ".join(str(asset.get(k, "")) for k in ("symbol", "ticker", "name", "mic")).upper()
        if any(word in haystack for word in gas_words):
            result.append(compact_asset(asset))
    return result


def safe_orderbook(symbol, jwt):
    try:
        return authenticated_get(f"/v1/instruments/{symbol}/orderbook", jwt)
    except RuntimeError as exc:
        return {"error": str(exc)}


def main():
    load_env(PROJECT_ROOT / ".env")

    secret = os.environ.get("FINAM_SECRET_TOKEN")
    account_id = os.environ.get("FINAM_ACCOUNT_ID", "951464")
    if not secret or secret == "put_your_saved_secret_token_here":
        print("Missing FINAM_SECRET_TOKEN. Put your saved Finam token into moex-futures-bot/.env", file=sys.stderr)
        return 2

    print("Auth: exchanging secret token for temporary JWT...")
    jwt = auth(secret)
    print("Auth: OK")

    print(f"Account: checking configured account {account_id}...")
    try:
        account = authenticated_get(f"/v1/accounts/{account_id}", jwt)
        print(json.dumps({"account_check": account}, ensure_ascii=False, indent=2, default=str))
    except RuntimeError as exc:
        print(f"Account: warning: {exc}")
        print("Account: continuing with instrument discovery; account id can be corrected later.")

    print("Assets: loading available instruments...")
    assets_response = authenticated_get("/v1/assets", jwt)
    assets = assets_response.get("assets", [])
    print(f"Assets: received {len(assets)} instruments")

    raw_hits = search_assets(assets)
    moex_futures = search_moex_futures(assets)
    print("MOEX/RTSX commodity futures candidates:")
    print(json.dumps(moex_futures, ensure_ascii=False, indent=2, default=str))
    if not moex_futures:
        print("No candidates found by ticker/name search. We may need to inspect Finam symbol format or account permissions.")

    gas_hits = search_gas_futures(assets)
    print("Gas futures keyword search:")
    print(json.dumps(gas_hits[:80], ensure_ascii=False, indent=2, default=str))

    print("Order book read-only probes:")
    for asset in moex_futures[:10]:
        symbol = asset.get("symbol")
        print(f"OrderBook: {symbol}")
        orderbook = safe_orderbook(symbol, jwt)
        print(json.dumps(orderbook, ensure_ascii=False, indent=2, default=str)[:2500])

    print(f"Raw broader keyword hits: {len(raw_hits)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
