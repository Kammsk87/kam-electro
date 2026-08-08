"""TASK-MX-006 — BR front/second calendar spread. The first frozen MOEX rule.

The rule was written into
`tasks/ready/TASK-MX-006-BRENT-CALENDAR-SPREAD-STRATEGY-AND-TRIALS-LEDGER-V0.md`
**before any result existed** and is reproduced here unchanged. It may not be
edited; a different rule is a different `model_id` and a new trial.

    universe   BR front/second pair only
    signal     enter when the 72-bar rolling z-score of the spread exceeds +2.0
               (sell the spread) or falls below -2.0 (buy it)
    exit       z returns to 0, or the timeout, whichever first
    timeouts   3 trading days and 5 trading days, both pre-declared
    costs      cost_model rev2, two legs, non-scalper, TRADE_OUT, POLUNETTO
               margin; TICK_FLOOR and TICK_FLOOR_STRESS both reported

Sign convention, stated because getting it backwards is silent and fatal.
`term_structure.SpreadBar.spread` is `far - near`. A position that is long the
near leg and short the far one profits when that number falls, so its P&L is
`-delta_spread`. A z-score above +2 means the spread is unusually wide and the
rule expects it to fall, which is `ENTER_SPREAD_LONG` in the execution adapter's
vocabulary: buy the near, sell the far.

One position at a time. Re-entering while already in the market would stack
overlapping trades whose P&L is not independent, and the t-statistic would then
be computed over observations that are largely the same trade counted twice.

Safety: pure computation over local history. No network, credential, broker or
order path. Nothing here can place an order; the execution adapter it names is a
simulation and is not called from this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional, Sequence, Tuple

__all__ = ["FROZEN_RULE", "Trade", "BacktestOutcome", "run_calendar_spread"]

#: Frozen 2026-08-08. Reproduced from the task card; not a place to experiment.
FROZEN_RULE = {
    "model_id": "br_calendar_zscore_v0",
    "z_window_bars": 72,
    "entry_abs_z": 2.0,
    "exit_z": 0.0,
    "timeouts_trading_days": (3, 5),
    "bars_per_trading_day": 15,      # measured median over 723 days, 2024+
    "pair": "front/second",
    "one_position_at_a_time": True,
}


@dataclass(frozen=True)
class Trade:
    entry_ts: datetime
    exit_ts: datetime
    direction: int                 # +1 long the spread (buy near, sell far), -1 short
    entry_spread: float
    exit_spread: float
    bars_held: int
    days_held: float
    regime: str
    pair: Tuple[str, str]
    exit_reason: str
    gross_rub: float
    cost_rub: float
    funding_rub: float

    @property
    def net_rub(self) -> float:
        return self.gross_rub - self.cost_rub - self.funding_rub


@dataclass
class BacktestOutcome:
    trades: List[Trade] = field(default_factory=list)
    timeout_days: int = 0
    execution_basis: str = ""
    bars_seen: int = 0
    entries_blocked_no_z: int = 0

    @property
    def gross(self) -> List[float]:
        return [t.gross_rub for t in self.trades]

    @property
    def net(self) -> List[float]:
        return [t.net_rub for t in self.trades]

    def summary(self) -> Dict[str, object]:
        n = len(self.trades)
        if not n:
            return {"trades": 0, "timeout_days": self.timeout_days,
                    "execution_basis": self.execution_basis}
        g, ne = self.gross, self.net
        wins = sum(1 for v in ne if v > 0)
        return {
            "trades": n,
            "timeout_days": self.timeout_days,
            "execution_basis": self.execution_basis,
            "gross_mean_rub": sum(g) / n,
            "net_mean_rub": sum(ne) / n,
            "net_total_rub": sum(ne),
            "win_rate_pct": 100.0 * wins / n,
            "median_days_held": sorted(t.days_held for t in self.trades)[n // 2],
            "exit_reasons": {r: sum(1 for t in self.trades if t.exit_reason == r)
                             for r in {t.exit_reason for t in self.trades}},
            "regimes": {r: sum(1 for t in self.trades if t.regime == r)
                        for r in {t.regime for t in self.trades}},
        }


def run_calendar_spread(
    bars: Sequence,               # term_structure.SpreadBar
    zscores: Sequence[Optional[float]],
    *,
    timeout_days: int,
    roundtrip_rub: float,
    rub_per_price_point: float,
    margin_blocked_rub: float,
    annual_rate_pct: float,
    execution_basis: str,
    rule: Dict = FROZEN_RULE,
) -> BacktestOutcome:
    """Run the frozen rule. Costs and funding are supplied, never assumed here.

    `zscores` must align with `bars` and carry None wherever the window spanned a
    roll — `term_structure.rolling_zscore` already does this, and a signal taken
    on a roll-spanning window would be trading the roll jump.
    """
    if len(bars) != len(zscores):
        raise ValueError("ZSCORE_MISALIGNED: one z-score per bar is required")

    timeout_bars = int(timeout_days * rule["bars_per_trading_day"])
    entry_z = float(rule["entry_abs_z"])
    exit_z = float(rule["exit_z"])

    out = BacktestOutcome(timeout_days=timeout_days, execution_basis=execution_basis,
                          bars_seen=len(bars))
    i = 0
    while i < len(bars):
        z = zscores[i]
        if z is None:
            out.entries_blocked_no_z += 1
            i += 1
            continue
        if abs(z) < entry_z:
            i += 1
            continue

        # z above +entry means the spread is wide and expected to fall; the
        # position that profits from a falling spread is long the near leg.
        direction = 1 if z > 0 else -1
        entry = bars[i]
        exit_idx = None
        exit_reason = "timeout"
        for j in range(i + 1, min(i + 1 + timeout_bars, len(bars))):
            # A roll ends the trade: the pair we opened no longer exists.
            if bars[j].near != entry.near or bars[j].far != entry.far:
                exit_idx = j - 1
                exit_reason = "roll"
                break
            zj = zscores[j]
            if zj is not None and ((direction == 1 and zj <= exit_z) or (direction == -1 and zj >= exit_z)):
                exit_idx = j
                exit_reason = "z_reversion"
                break
        if exit_idx is None:
            exit_idx = min(i + timeout_bars, len(bars) - 1)
        if exit_idx <= i:
            i += 1
            continue

        ex = bars[exit_idx]
        d_spread = ex.spread - entry.spread
        gross = -direction * d_spread * rub_per_price_point
        bars_held = exit_idx - i
        days_held = bars_held / rule["bars_per_trading_day"]
        funding = margin_blocked_rub * (annual_rate_pct / 100.0) * (days_held / 252.0)

        out.trades.append(
            Trade(
                entry_ts=entry.ts, exit_ts=ex.ts, direction=direction,
                entry_spread=entry.spread, exit_spread=ex.spread,
                bars_held=bars_held, days_held=days_held,
                regime=entry.regime, pair=(entry.near, entry.far),
                exit_reason=exit_reason,
                gross_rub=gross, cost_rub=roundtrip_rub, funding_rub=funding,
            )
        )
        i = exit_idx + 1     # one position at a time
    return out
