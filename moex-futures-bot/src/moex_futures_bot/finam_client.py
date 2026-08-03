"""Read-only Finam Trade API client.

This module intentionally has no order placement methods.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


BASE_URL = "https://api.finam.ru"


def redact(value: Any) -> str:
    text = str(value)
    text = re.sub(
        r"[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}",
        "[JWT_REDACTED]",
        text,
    )
    return re.sub(r"[A-Za-z0-9_-]{32,}", "[TOKEN_REDACTED]", text)


@dataclass(frozen=True)
class FinamAsset:
    symbol: str
    ticker: str
    mic: str
    type: str
    name: str
    is_archived: bool

    @classmethod
    def from_raw(cls, raw: dict[str, Any]) -> "FinamAsset":
        return cls(
            symbol=str(raw.get("symbol") or ""),
            ticker=str(raw.get("ticker") or ""),
            mic=str(raw.get("mic") or ""),
            type=str(raw.get("type") or ""),
            name=str(raw.get("name") or ""),
            is_archived=bool(raw.get("is_archived")),
        )


class ReadOnlyFinamClient:
    def __init__(self, secret_token: str, base_url: str = BASE_URL):
        self.secret_token = secret_token
        self.base_url = base_url.rstrip("/")
        self.jwt: str | None = None

    def auth(self) -> str:
        response = self._request_json("POST", "/v1/sessions", body={"secret": self.secret_token})
        token = response.get("token") or response.get("access_token") or response.get("jwt")
        if not token:
            raise RuntimeError("Auth response did not contain token/access_token/jwt")
        self.jwt = str(token)
        return self.jwt

    def assets(self) -> list[FinamAsset]:
        data = self._authenticated_get("/v1/assets")
        return [FinamAsset.from_raw(item) for item in data.get("assets", [])]

    def orderbook(self, symbol: str) -> dict[str, Any]:
        quoted_symbol = urllib.parse.quote(symbol, safe="")
        return self._authenticated_get(f"/v1/instruments/{quoted_symbol}/orderbook")

    def bars(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> dict[str, Any]:
        quoted_symbol = urllib.parse.quote(symbol, safe="")
        query = urllib.parse.urlencode(
            {
                "timeframe": timeframe,
                "interval.start_time": _utc_iso(start),
                "interval.end_time": _utc_iso(end),
            }
        )
        return self._authenticated_get(f"/v1/instruments/{quoted_symbol}/bars?{query}")

    def asset_params(self, symbol: str, account_id: str) -> dict[str, Any]:
        quoted_symbol = urllib.parse.quote(symbol, safe="")
        query = urllib.parse.urlencode({"account_id": account_id})
        return self._authenticated_get(f"/v1/assets/{quoted_symbol}?{query}")

    def _authenticated_get(self, path: str) -> dict[str, Any]:
        if not self.jwt:
            self.auth()
        assert self.jwt is not None
        try:
            return self._request_json("GET", path, token=self.jwt, bearer=False)
        except RuntimeError as first_error:
            try:
                return self._request_json("GET", path, token=self.jwt, bearer=True)
            except RuntimeError:
                raise first_error

    def _request_json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        token: str | None = None,
        bearer: bool = False,
    ) -> dict[str, Any]:
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = "Bearer " + token if bearer else token

        req = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            if exc.code in (301, 302, 307, 308):
                location = exc.headers.get("Location") or raw.strip()
                if location:
                    if location.startswith(self.base_url):
                        location = location[len(self.base_url) :]
                    if location.startswith("/"):
                        return self._request_json(method, location, body=body, token=token, bearer=bearer)
            raise RuntimeError(f"{method} {path} failed: HTTP {exc.code}: {redact(raw[:1000])}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"{method} {path} failed: {exc}") from exc


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
