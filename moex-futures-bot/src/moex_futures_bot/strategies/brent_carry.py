"""TASK-MX-007 — BR carry anomaly. Code written before the data exists.

The rule was frozen in
`tasks/ready/TASK-MX-007-BRENT-CARRY-ANOMALY-CANDIDATE-V0.md` at commit 28cd9732,
2026-08-08T23:26+05:00 — before the confirmation cohort finished collecting. This
module implements that rule and nothing else.

**It has never been run on real data and must not be until the cohort closes on
2026-10-01.** Its tests use synthetic series only, so that a wrong answer in
October can be attributed to the market rather than to a bug found under the
pressure of a result.

Three things this module refuses to do, each because the frozen rule says so:

* **No fixed quantile constants.** The thresholds are expanding-window: at bar
  `t` they are computed from roll-yield observations strictly before `t`. Fixing
  them at the sample's own p10/p90 would be look-ahead, and it is not repairable
  after a run.
* **No default expiry map.** Days-to-expiry is in TRADING DAYS to the venue's
  `lasttradedate`. A caller must supply the dates; deriving them from "the last
  day the contract happened to trade" is a proxy that quietly mislabels any
  contract still alive at the end of a sample.
* **No parameter grid.** One variant. `FROZEN` below is the whole specification
  and a second setting is a second trial in the ledger.

Safety: pure computation. No network, credential, broker or order path.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple

__all__ = [
    "FROZEN",
    "CarryError",
    "expanding_quantile",
    "trading_days_to_expiry",
    "CarryTrade",
    "CarryOutcome",
    "run_carry",
]

#: Frozen 2026-08-08, commit 28cd9732. Not a place to experiment.
FROZEN = {
    "model_id": "br_carry_v0",
    "reset_ts": "2026-08-08T00:00:00+00:00",
    "warmup_bars": 500,
    "entry_low_q": 0.10,
    "entry_high_q": 0.90,
    "exit_q": 0.50,
    "timeout_trading_days": 5,
    "bars_per_trading_day": 15,
    "min_dte_trading_days": 7,      # strictly greater than this to enter
    "search_space": "moex.br.calendar_spread.1h",
}


class CarryError(Exception):
    """A refusal. No default is ever substituted for a missing input."""


def expanding_quantile(
    values: Sequence[float], q: float, warmup: int
) -> List[Optional[float]]:
    """Quantile of everything strictly BEFORE each position.

    `out[i]` uses `values[:i]` and never `values[i]`. Including the current
    observation would let a bar help set the threshold it is then tested against —
    a small leak that is invisible in a P&L curve and fatal to the conclusion.

    Returns None until `warmup` observations have accumulated.
    """
    if not 0.0 < q < 1.0:
        raise CarryError(f"BAD_QUANTILE: {q}")
    if warmup < 2:
        raise CarryError(f"WARMUP_TOO_SHORT: {warmup}")

    out: List[Optional[float]] = []
    seen: List[float] = []
    for i, v in enumerate(values):
        if len(seen) < warmup:
            out.append(None)
        else:
            pos = q * (len(seen) - 1)
            lo = int(pos)
            hi = min(lo + 1, len(seen) - 1)
            out.append(seen[lo] + (seen[hi] - seen[lo]) * (pos - lo))
        bisect.insort(seen, v)      # inserted AFTER the threshold for bar i is taken
    return out


def trading_days_to_expiry(
    current: date, expiry: date, calendar: Sequence[date]
) -> int:
    """Trading days from `current` (exclusive) to `expiry` (inclusive).

    `calendar` is the exchange's trading calendar, which MOEX publishes in
    advance. Passing the set of days a contract *was observed* to trade would
    make this quantity partly unknowable at decision time, so the calendar is an
    argument rather than something inferred from the price series.
    """
    if expiry < current:
        return 0
    return sum(1 for d in calendar if current < d <= expiry)


@dataclass(frozen=True)
class CarryTrade:
    entry_ts: object
    exit_ts: object
    direction: int                 # +1 long the spread (buy near, sell far)
    entry_ry: float
    exit_ry: float
    entry_spread: float
    exit_spread: float
    bars_held: int
    days_held: float
    dte_at_entry: int
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
class CarryOutcome:
    trades: List[CarryTrade] = field(default_factory=list)
    bars_seen: int = 0
    blocked_warmup: int = 0
    blocked_dte: int = 0
    signals_seen: int = 0

    @property
    def net(self) -> List[float]:
        return [t.net_rub for t in self.trades]

    @property
    def gross(self) -> List[float]:
        return [t.gross_rub for t in self.trades]

    def summary(self) -> Dict[str, object]:
        n = len(self.trades)
        base = {
            "trades": n,
            "bars_seen": self.bars_seen,
            "blocked_warmup": self.blocked_warmup,
            "blocked_by_dte_filter": self.blocked_dte,
            "signals_seen": self.signals_seen,
        }
        if not n:
            return base
        base.update({
            "gross_mean_rub": sum(self.gross) / n,
            "net_mean_rub": sum(self.net) / n,
            "net_total_rub": sum(self.net),
            "win_rate_pct": 100.0 * sum(1 for v in self.net if v > 0) / n,
            "exit_reasons": {r: sum(1 for t in self.trades if t.exit_reason == r)
                             for r in {t.exit_reason for t in self.trades}},
        })
        return base


def run_carry(
    bars: Sequence,                       # term_structure.SpreadBar
    roll_yields: Sequence[Optional[float]],
    *,
    expiry_dates: Dict[str, date],
    calendar: Sequence[date],
    roundtrip_rub: float,
    rub_per_price_point: float,
    margin_blocked_rub: float,
    annual_rate_pct: float,
    frozen: Dict = FROZEN,
) -> CarryOutcome:
    """Run the frozen carry rule. Costs, calendar and expiries are supplied.

    `roll_yields` aligns with `bars` and carries None where it could not be
    computed. Entries are permitted only after the warm-up and only while the
    front leg has more than `min_dte_trading_days` trading days left.
    """
    if len(bars) != len(roll_yields):
        raise CarryError("ROLL_YIELD_MISALIGNED: one value per bar is required")
    missing = {b.near for b in bars} - set(expiry_dates)
    if missing:
        raise CarryError(
            f"EXPIRY_DATES_MISSING for {sorted(missing)[:5]}. Days-to-expiry is in trading "
            "days to the venue lasttradedate; inferring it from the last day a contract "
            "happened to trade mislabels any contract still alive at the end of the sample."
        )

    clean = [v for v in roll_yields if v is not None]
    if len(clean) < frozen["warmup_bars"]:
        raise CarryError(
            f"TOO_SHORT: {len(clean)} usable roll-yield observations against a "
            f"{frozen['warmup_bars']}-bar warm-up"
        )

    # Quantile tracks are built over the whole aligned series so that index i of a
    # track corresponds to bar i; the expanding computation itself never looks
    # forward. Bars with no roll yield carry the previous threshold forward.
    filled: List[float] = []
    last = clean[0]
    for v in roll_yields:
        last = v if v is not None else last
        filled.append(last)

    q_lo = expanding_quantile(filled, frozen["entry_low_q"], frozen["warmup_bars"])
    q_mid = expanding_quantile(filled, frozen["exit_q"], frozen["warmup_bars"])
    q_hi = expanding_quantile(filled, frozen["entry_high_q"], frozen["warmup_bars"])

    timeout_bars = int(frozen["timeout_trading_days"] * frozen["bars_per_trading_day"])
    min_dte = int(frozen["min_dte_trading_days"])

    out = CarryOutcome(bars_seen=len(bars))
    i = 0
    while i < len(bars):
        ry = roll_yields[i]
        lo, mid, hi = q_lo[i], q_mid[i], q_hi[i]
        if ry is None or lo is None or hi is None or mid is None:
            out.blocked_warmup += 1
            i += 1
            continue

        if ry <= lo:
            direction = 1        # carry unusually low; expect it to revert up
        elif ry >= hi:
            direction = -1
        else:
            i += 1
            continue
        out.signals_seen += 1

        entry = bars[i]
        dte = trading_days_to_expiry(entry.ts.date(), expiry_dates[entry.near], calendar)
        if dte <= min_dte:
            out.blocked_dte += 1
            i += 1
            continue

        exit_idx = None
        exit_reason = "timeout"
        for j in range(i + 1, min(i + 1 + timeout_bars, len(bars))):
            b = bars[j]
            if b.near != entry.near or b.far != entry.far:
                exit_idx, exit_reason = j - 1, "roll"
                break
            if trading_days_to_expiry(b.ts.date(), expiry_dates[b.near], calendar) <= min_dte:
                exit_idx, exit_reason = j, "dte_floor"
                break
            rj, mj = roll_yields[j], q_mid[j]
            if rj is not None and mj is not None and (
                (direction == 1 and rj >= mj) or (direction == -1 and rj <= mj)
            ):
                exit_idx, exit_reason = j, "q50_reversion"
                break
        if exit_idx is None:
            exit_idx = min(i + timeout_bars, len(bars) - 1)
        if exit_idx <= i:
            i += 1
            continue

        ex = bars[exit_idx]
        # +1 is long the near leg and short the far one, so it profits when
        # (far - near) falls. SpreadBar.spread is far - near.
        gross = -direction * (ex.spread - entry.spread) * rub_per_price_point
        bars_held = exit_idx - i
        days_held = bars_held / frozen["bars_per_trading_day"]
        funding = margin_blocked_rub * (annual_rate_pct / 100.0) * (days_held / 252.0)

        out.trades.append(
            CarryTrade(
                entry_ts=entry.ts, exit_ts=ex.ts, direction=direction,
                entry_ry=ry, exit_ry=roll_yields[exit_idx] if roll_yields[exit_idx] is not None else ry,
                entry_spread=entry.spread, exit_spread=ex.spread,
                bars_held=bars_held, days_held=days_held, dte_at_entry=dte,
                regime=entry.regime, pair=(entry.near, entry.far),
                exit_reason=exit_reason,
                gross_rub=gross, cost_rub=roundtrip_rub, funding_rub=funding,
            )
        )
        i = exit_idx + 1     # one position at a time
    return out
