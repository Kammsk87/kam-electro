"""Paper-mode risk gates."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class RiskConfig:
    max_abs_position: Decimal = Decimal("1")
    max_orders_per_day: int = 20
    max_daily_loss: Decimal = Decimal("5000")
    allowed_symbols: tuple[str, ...] = ()
    kill_switch: bool = False


@dataclass
class PaperRiskState:
    positions: dict[str, Decimal] = field(default_factory=dict)
    orders_today: int = 0
    realized_pnl: Decimal = Decimal("0")


@dataclass(frozen=True)
class RiskDecision:
    allowed: bool
    reason: str


class RiskGate:
    def __init__(self, config: RiskConfig):
        self.config = config

    def check(self, symbol: str, side: str, quantity: Decimal, state: PaperRiskState) -> RiskDecision:
        if self.config.kill_switch:
            return RiskDecision(False, "kill_switch_enabled")
        if self.config.allowed_symbols and symbol not in self.config.allowed_symbols:
            return RiskDecision(False, "symbol_not_allowed")
        if state.orders_today >= self.config.max_orders_per_day:
            return RiskDecision(False, "max_orders_per_day")
        if state.realized_pnl <= -self.config.max_daily_loss:
            return RiskDecision(False, "max_daily_loss")

        current = state.positions.get(symbol, Decimal("0"))
        delta = quantity if side == "buy" else -quantity
        projected = current + delta
        if abs(projected) > self.config.max_abs_position:
            return RiskDecision(False, "max_abs_position")

        return RiskDecision(True, "ok")

    def apply_paper_fill(self, fill_symbol: str, side: str, filled_qty: Decimal, state: PaperRiskState) -> None:
        delta = filled_qty if side == "buy" else -filled_qty
        state.positions[fill_symbol] = state.positions.get(fill_symbol, Decimal("0")) + delta
        state.orders_today += 1

