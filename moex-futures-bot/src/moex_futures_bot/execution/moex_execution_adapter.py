"""TASK-MX-005 — MOEX calendar-spread execution adapter. SIMULATION ONLY.

**No order is placed, routed, or sent anywhere.** There is no broker client, no
account, position, balance or execution endpoint, and no credential is read. A
static scan of this module must find no such path, and the tests assert the
public surface contains nothing that could be mistaken for one.

Three components:

1. `SpreadIntentTranslator` — an abstract intent becomes exactly two orders, or
   none. A translator that can emit one leg produces an outright position while
   claiming to be a spread, so there is no partial intent.
2. `ClearingScheduleGuard` — in `clearing_schedule.py`.
3. `TopOfBookFillApproximation` — **not an L2 engine, and it must never be
   called one.** MOEX ISS publishes no depth at all: BIDDEPTH, OFFERDEPTH,
   NUMBIDS and NUMOFFERS are null on every call, and there is no ISS L2 endpoint
   for FORTS. What can be decided from a recorded best bid and ask is whether a
   marketable order would have crossed, at the quoted price, for a size the book
   was never shown to absorb. Every verdict therefore carries
   `depth_basis="UNSUPPORTED"` and `delay_seconds=900`, and any size above one
   contract returns `UNSUPPORTED` rather than an assumed fill.

Gate 2 of `docs/ORDERBOOK_EXECUTION_PLAN.md` remains blocked. Nothing here
approaches it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time
from enum import Enum
from typing import Dict, List, Optional, Tuple

from .clearing_schedule import ClearingScheduleGuard, GuardVerdict, Session

__all__ = [
    "AdapterError",
    "LegRiskError",
    "Side",
    "Intent",
    "Order",
    "SpreadIntentTranslator",
    "Quote",
    "FillVerdict",
    "TopOfBookFillApproximation",
    "MOEXExecutionAdapter",
    "ISS_DELAY_SECONDS",
    "MAX_SIZE_LOTS",
]

#: Measured 2026-08-07: SYSTIME and UPDATETIME advance together with a constant
#: 15-minute offset. The quotes are real; they are not current.
ISS_DELAY_SECONDS = 900

#: The book was never shown to absorb more than this, because ISS reports no
#: depth. It is not a risk limit; it is the edge of what the data can support.
MAX_SIZE_LOTS = 1


class AdapterError(Exception):
    """A refusal by the adapter."""


class LegRiskError(AdapterError):
    """One leg of a spread could fill while the other could not."""


class Side(Enum):
    BUY = "BUY"
    SELL = "SELL"


class Intent(Enum):
    ENTER_SPREAD_LONG = "ENTER_SPREAD_LONG"    # long the near leg, short the far
    ENTER_SPREAD_SHORT = "ENTER_SPREAD_SHORT"
    EXIT_SPREAD_LONG = "EXIT_SPREAD_LONG"
    EXIT_SPREAD_SHORT = "EXIT_SPREAD_SHORT"


@dataclass(frozen=True)
class Order:
    secid: str
    side: Side
    lots: int
    limit_price: float
    leg: int          # 1 = near, 2 = far


@dataclass(frozen=True)
class Quote:
    secid: str
    bid: Optional[float]
    ask: Optional[float]
    minstep: float
    lasttradedate: str      # the venue's own expiry, used to order the legs

    @property
    def spread_ticks(self) -> Optional[float]:
        if self.bid is None or self.ask is None or not self.minstep:
            return None
        return (self.ask - self.bid) / self.minstep

    @property
    def crossed(self) -> bool:
        return self.bid is not None and self.ask is not None and self.bid > self.ask


class SpreadIntentTranslator:
    """One intent becomes two orders, atomically, or the call raises."""

    def translate(self, intent: Intent, near: Quote, far: Quote, lots: int = 1) -> List[Order]:
        if not isinstance(intent, Intent):
            raise AdapterError(f"UNKNOWN_INTENT: {intent!r}")
        if lots < 1:
            raise AdapterError(f"BAD_SIZE: {lots}")

        # Legs are ordered by the venue's expiry, never by secid. BRF7 sorts
        # before BRZ6 as a string and after it by expiry; this has already been a
        # live defect in this project once.
        if near.lasttradedate >= far.lasttradedate:
            raise AdapterError(
                f"LEG_ORDER_WRONG: {near.secid} ({near.lasttradedate}) does not expire before "
                f"{far.secid} ({far.lasttradedate}). Legs are ordered by expiry, not by secid."
            )

        long_spread = intent in (Intent.ENTER_SPREAD_LONG, Intent.EXIT_SPREAD_SHORT)
        near_side = Side.BUY if long_spread else Side.SELL
        far_side = Side.SELL if long_spread else Side.BUY

        near_px = near.ask if near_side is Side.BUY else near.bid
        far_px = far.ask if far_side is Side.BUY else far.bid
        if near_px is None or far_px is None:
            raise LegRiskError(
                f"MISSING_QUOTE: {near.secid} or {far.secid} has no price on the side it must trade. "
                "A spread is emitted whole or not at all; one leg alone is an outright position."
            )
        return [
            Order(near.secid, near_side, lots, near_px, leg=1),
            Order(far.secid, far_side, lots, far_px, leg=2),
        ]


@dataclass(frozen=True)
class FillVerdict:
    filled: bool
    reason: str
    price: Optional[float] = None
    depth_basis: str = "UNSUPPORTED"
    delay_seconds: int = ISS_DELAY_SECONDS
    size_supported: bool = True

    def citation(self) -> str:
        return (
            f"{'FILL' if self.filled else 'NO FILL'} at {self.price} — {self.reason}; "
            f"depth_basis={self.depth_basis}, delay_seconds={self.delay_seconds}, "
            f"size_supported={self.size_supported}. Top-of-book approximation, NOT an L2 replay."
        )


class TopOfBookFillApproximation:
    """Would a marketable order have crossed, at the quoted price?

    That is the whole question this can answer. It cannot answer how much would
    have filled, at what average price, or where in the queue a passive order sat,
    because none of that is in the data.
    """

    def check(self, order: Order, quote: Quote, lots: Optional[int] = None) -> FillVerdict:
        size = lots if lots is not None else order.lots
        if quote.secid != order.secid:
            raise AdapterError(f"QUOTE_MISMATCH: order on {order.secid}, quote for {quote.secid}")
        if size > MAX_SIZE_LOTS:
            return FillVerdict(
                False,
                f"size {size} exceeds the {MAX_SIZE_LOTS}-lot ceiling the data supports; "
                "ISS reports no depth, so a larger fill would be assumed rather than observed",
                size_supported=False,
            )
        if quote.crossed:
            return FillVerdict(False, "crossed book: bid above ask, the snapshot is not usable")
        touch = quote.ask if order.side is Side.BUY else quote.bid
        if touch is None:
            return FillVerdict(False, f"no {'ask' if order.side is Side.BUY else 'bid'} in the snapshot")
        marketable = (order.limit_price >= touch) if order.side is Side.BUY else (order.limit_price <= touch)
        if not marketable:
            return FillVerdict(False, f"limit {order.limit_price} does not reach the touch at {touch}")
        return FillVerdict(True, "marketable against the recorded touch", price=touch)


class MOEXExecutionAdapter:
    """Intent in, validated orders or a named refusal out. Nothing is sent."""

    def __init__(
        self,
        max_entry_spread_ticks: float,
        guard: Optional[ClearingScheduleGuard] = None,
    ):
        # No default. The breakeven spreads frozen in TASK-MX-002 are 1.90 ticks
        # per leg at 1d, 4.08 at 3d, 4.29 at 5d and 5.94 at 10d; the caller
        # declares which horizon it is trading. A default here would be a
        # parameter selected without a preregistration.
        if max_entry_spread_ticks is None or max_entry_spread_ticks <= 0:
            raise AdapterError(
                "MAX_ENTRY_SPREAD_REQUIRED: state the tick threshold from the frozen "
                "TASK-MX-002 breakeven table for the horizon being traded"
            )
        self.max_entry_spread_ticks = float(max_entry_spread_ticks)
        self.guard = guard or ClearingScheduleGuard()
        self.translator = SpreadIntentTranslator()
        self.fills = TopOfBookFillApproximation()

    def submit(
        self, intent: Intent, near: Quote, far: Quote, now: time, lots: int = 1
    ) -> Dict[str, object]:
        """Validate an intent. Returns a decision record; sends nothing."""
        verdict: GuardVerdict = self.guard.check_entry(now)
        if not verdict.allowed:
            return {
                "accepted": False,
                "reason": f"clearing guard: {verdict.reason}",
                "session": verdict.session.value,
                "cancel_resting_orders": verdict.cancel_resting_orders,
                "orders": [],
            }

        # The evening session is where the second leg was first observed at three
        # ticks, which is above the 1d breakeven. The filter applies in every
        # session; the evening is simply where it bites.
        for q in (near, far):
            width = q.spread_ticks
            if width is None:
                return {"accepted": False, "reason": f"no two-sided quote for {q.secid}",
                        "session": verdict.session.value, "orders": []}
            if width > self.max_entry_spread_ticks:
                return {
                    "accepted": False,
                    "reason": (
                        f"{q.secid} quoted {width:.2f} ticks wide, above the declared "
                        f"{self.max_entry_spread_ticks} ceiling"
                    ),
                    "session": verdict.session.value,
                    "orders": [],
                }

        orders = self.translator.translate(intent, near, far, lots)
        quotes = {near.secid: near, far.secid: far}
        checks = [self.fills.check(o, quotes[o.secid]) for o in orders]

        if not all(c.filled for c in checks):
            # Refusing the whole package is the point. Accepting the fillable leg
            # would leave an outright position dressed as a spread.
            return {
                "accepted": False,
                "reason": "LEG_RISK: not both legs are marketable, so neither is sent",
                "session": verdict.session.value,
                "orders": [],
                "leg_checks": [c.citation() for c in checks],
            }

        return {
            "accepted": True,
            "reason": "both legs marketable and clear of any clearing window",
            "session": verdict.session.value,
            "orders": orders,
            "leg_checks": [c.citation() for c in checks],
            "depth_basis": "UNSUPPORTED",
            "delay_seconds": ISS_DELAY_SECONDS,
            "simulation_only": True,
        }
