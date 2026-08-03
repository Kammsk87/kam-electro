"""Paper execution against read-only order book snapshots."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


@dataclass(frozen=True)
class PaperFill:
    symbol: str
    side: str
    requested_qty: Decimal
    filled_qty: Decimal
    avg_price: Decimal
    status: str
    levels_used: int
    estimated_notional: Decimal

    def to_dict(self) -> dict[str, str]:
        data = asdict(self)
        return {key: str(value) for key, value in data.items()}


class PaperEngine:
    def quote(self, orderbook_response: dict[str, Any]) -> dict[str, str | None]:
        rows = orderbook_response.get("orderbook", {}).get("rows", [])
        bids = _levels(rows, "buy_size", reverse=True)
        asks = _levels(rows, "sell_size", reverse=False)
        best_bid = bids[0][0] if bids else None
        best_ask = asks[0][0] if asks else None
        mid = None
        if best_bid is not None and best_ask is not None:
            mid = (best_bid + best_ask) / Decimal("2")
        return {
            "best_bid": _fmt(best_bid),
            "best_ask": _fmt(best_ask),
            "mid": _fmt(mid),
        }

    def simulate_market_order(self, symbol: str, side: str, quantity: Decimal, orderbook_response: dict[str, Any]) -> PaperFill:
        if side not in {"buy", "sell"}:
            raise ValueError("side must be buy or sell")
        if quantity <= 0:
            raise ValueError("quantity must be positive")

        rows = orderbook_response.get("orderbook", {}).get("rows", [])
        levels = _levels(rows, "sell_size", reverse=False) if side == "buy" else _levels(rows, "buy_size", reverse=True)

        remaining = quantity
        filled = Decimal("0")
        notional = Decimal("0")
        levels_used = 0

        for price, available in levels:
            if remaining <= 0:
                break
            take = min(remaining, available)
            filled += take
            notional += take * price
            remaining -= take
            levels_used += 1

        avg_price = notional / filled if filled else Decimal("0")
        status = "filled" if filled == quantity else "partial" if filled else "rejected_no_liquidity"
        return PaperFill(
            symbol=symbol,
            side=side,
            requested_qty=quantity,
            filled_qty=filled,
            avg_price=avg_price,
            status=status,
            levels_used=levels_used,
            estimated_notional=notional,
        )


def _levels(rows: list[dict[str, Any]], size_key: str, reverse: bool) -> list[tuple[Decimal, Decimal]]:
    levels: list[tuple[Decimal, Decimal]] = []
    for row in rows:
        size = _decimal_value(row.get(size_key))
        price = _decimal_value(row.get("price"))
        if price is None or size is None or size <= 0:
            continue
        levels.append((price, size))
    return sorted(levels, key=lambda item: item[0], reverse=reverse)


def _decimal_value(raw: Any) -> Decimal | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        raw = raw.get("value")
    try:
        return Decimal(str(raw))
    except Exception:
        return None


def _fmt(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP).normalize())

