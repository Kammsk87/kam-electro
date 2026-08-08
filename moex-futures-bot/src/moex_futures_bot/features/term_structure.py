"""TASK-MX-004 — Brent term structure and carry features.

This module produces **features, not signals**. It computes no return, ranks
nothing, and reports no view about which feature looks promising. Selecting among
features after seeing how they behave is selection, and it would spend
multiplicity budget invisibly; that belongs to a later task at a later lifecycle
stage.

Four constructions, each with a trap the naive version falls into:

* **Annualised roll yield** — `(F1-F2)/F1 * 365/dt`, where `dt` is the gap
  between the two contracts' EXPIRIES. It is not the front's days-to-expiry.
  Both get called "dt" and only one annualises a spread correctly: using the
  front's remaining life makes the same curve shape produce a roll yield that
  explodes as expiry approaches.

* **Rolling z-score** — windows must not span a roll. A z-score computed across a
  change of contract pair measures the roll jump, not the spread, and it is
  precisely the observation a strategy could never have traded. Spanning windows
  are emitted as None.

* **Ornstein-Uhlenbeck half-life** — fitted inside constant-pair regimes only,
  and separately in contango and backwardation, because pooling them estimates
  the half-life of a mixture that never existed.

* **Days-to-expiry proxy** — contracts still alive at the end of the sample are
  excluded. Their last observed bar is the end of the data, not their expiry;
  including them labels live contracts as being in their final week. This defect
  was found and fixed once already, in the Stage 0 script.

Over all of it sits one data-quality rule: **a spread bar exists only where both
legs printed in the same hourly slot.** Away from the front pair a bar can carry
an hour-old trade, and the resulting spread moves because one leg is stale, not
because the curve moved. Rows failing this are dropped and counted, never
imputed.

Safety: reads local parquet only. No network, credential, broker or order path.
"""

from __future__ import annotations

import glob
import math
import statistics
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

__all__ = [
    "MONTH_CODE",
    "expiry_key",
    "SpreadBar",
    "CoverageReport",
    "build_spread_bars",
    "annualised_roll_yield",
    "rolling_zscore",
    "ou_half_life",
    "dte_buckets",
    "load_hourly_bars",
]

#: MOEX futures month codes. Only the ORDERING matters here, and it is exact.
MONTH_CODE = {
    "F": 1, "G": 2, "H": 3, "J": 4, "K": 5, "M": 6,
    "N": 7, "Q": 8, "U": 9, "V": 10, "X": 11, "Z": 12,
}

Z_WINDOWS: Tuple[int, ...] = (24, 72, 120)


def expiry_key(secid: str) -> Optional[Tuple[int, int]]:
    """(year, month) implied by a BR contract code, or None."""
    if len(secid) != 4 or not secid.startswith("BR"):
        return None
    month = MONTH_CODE.get(secid[2])
    if month is None or not secid[3].isdigit():
        return None
    return (2020 + int(secid[3]), month)


def expiry_gap_days(near: str, far: str) -> Optional[int]:
    """Calendar days between the two contracts' expiry MONTHS.

    Deliberately derived from the contract codes rather than from observed data:
    the gap is a property of the contract pair and must not shrink as the front
    approaches its own expiry.
    """
    a, b = expiry_key(near), expiry_key(far)
    if a is None or b is None:
        return None
    months = (b[0] - a[0]) * 12 + (b[1] - a[1])
    if months <= 0:
        return None
    return int(round(months * 365.25 / 12))


@dataclass(frozen=True)
class SpreadBar:
    ts: datetime
    near: str
    far: str
    near_close: float
    far_close: float
    spread: float                 # far - near, in price points
    expiry_gap_days: int
    both_traded: bool = True
    regime: str = ""              # CONTANGO or BACKWARDATION


@dataclass
class CoverageReport:
    hourly_slots_seen: int = 0
    bars_emitted: int = 0
    dropped_single_leg: int = 0
    dropped_no_pair_that_day: int = 0
    dropped_unparseable: int = 0
    skipped_other_asset: int = 0
    pairs: Dict[str, int] = field(default_factory=dict)

    @property
    def stale_drop_rate(self) -> float:
        """Share of slots lost because one of the day's two legs did not print."""
        total = self.bars_emitted + self.dropped_single_leg
        return self.dropped_single_leg / total if total else 0.0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "hourly_slots_seen": self.hourly_slots_seen,
            "bars_emitted": self.bars_emitted,
            "dropped_single_leg": self.dropped_single_leg,
            "dropped_no_pair_that_day": self.dropped_no_pair_that_day,
            "dropped_unparseable": self.dropped_unparseable,
            "skipped_other_asset": self.skipped_other_asset,
            "stale_drop_rate": round(self.stale_drop_rate, 4),
            "distinct_pairs": len(self.pairs),
        }


def load_hourly_bars(candles_root: Any) -> List[Tuple[datetime, str, float, float]]:
    """(ts, secid, close, volume) for every traded BR 60-minute bar."""
    import duckdb  # imported here so the module's pure functions stay dependency-free

    files = sorted(glob.glob(str(Path(candles_root) / "interval=60" / "*" / "candles.parquet")))
    if not files:
        return []
    con = duckdb.connect()
    rows = con.execute(
        f"select begin, security, close, volume from read_parquet({files!r}) "
        "where volume > 0 and close is not null order by begin"
    ).fetchall()
    con.close()
    return [(b, s, float(c), float(v)) for b, s, c, v in rows]


def build_spread_bars(
    bars: Iterable[Tuple[datetime, str, float, float]],
    *,
    near_rank: int = 0,
    far_rank: int = 1,
) -> Tuple[List[SpreadBar], CoverageReport]:
    """Spread bars for the ranked pair, one per hourly slot where BOTH legs traded.

    `near_rank`/`far_rank` are positions in the expiry ordering of the contracts
    that traded in that slot. Ranking is by expiry derived from the contract code,
    never alphabetically: BRF7 sorts before BRZ6 as a string and after it by
    expiry.
    """
    report = CoverageReport()
    by_slot: Dict[datetime, Dict[str, float]] = {}
    live_by_day: Dict[date, set] = {}
    for ts, secid, close, _vol in bars:
        key = expiry_key(secid)
        if key is None:
            # Another asset's contracts share the candles directory (GLDRUBF, GD).
            # They are not malformed BR codes and are not a data-quality problem.
            report.skipped_other_asset += 1
            continue
        by_slot.setdefault(ts, {})[secid] = close
        live_by_day.setdefault(ts.date(), set()).add(secid)

    # The pair is decided by the day's LIVE UNIVERSE, not by whichever contracts
    # happened to print inside one hour. Ranking within the slot silently
    # promotes leg 2 to leg 1 in any hour the front did not trade, emitting a
    # second/third spread labelled front/second. Measured on real data: slot-level
    # ranking produced 50 distinct "front/second" pairs over 2024+ where the daily
    # universe has 28.
    expected: Dict[date, Optional[Tuple[str, str]]] = {}
    for day, names in live_by_day.items():
        ordered = sorted(names, key=lambda s: expiry_key(s))
        expected[day] = (
            (ordered[near_rank], ordered[far_rank])
            if len(ordered) > max(near_rank, far_rank)
            else None
        )

    out: List[SpreadBar] = []
    for ts in sorted(by_slot):
        report.hourly_slots_seen += 1
        pair = expected.get(ts.date())
        if pair is None:
            report.dropped_no_pair_that_day += 1
            continue
        near, far = pair
        printed = by_slot[ts]
        if near not in printed or far not in printed:
            # one of the two legs did not print in this slot; a spread built from
            # the other leg's last known price would move on staleness alone
            report.dropped_single_leg += 1
            continue
        near_close, far_close = printed[near], printed[far]
        gap = expiry_gap_days(near, far)
        if gap is None:
            report.dropped_unparseable += 1
            continue
        spread = far_close - near_close
        out.append(
            SpreadBar(
                ts=ts,
                near=near,
                far=far,
                near_close=near_close,
                far_close=far_close,
                spread=spread,
                expiry_gap_days=gap,
                both_traded=True,
                regime="CONTANGO" if spread > 0 else "BACKWARDATION",
            )
        )
        report.bars_emitted += 1
        report.pairs[f"{near}/{far}"] = report.pairs.get(f"{near}/{far}", 0) + 1
    return out, report


def annualised_roll_yield(bar: SpreadBar) -> Optional[float]:
    """(F1 - F2)/F1 * 365/dt, dt = gap between the two EXPIRIES in days.

    Sign convention: positive in backwardation, where the near contract trades
    above the far one and a long position rolls down into profit.
    """
    if bar.near_close == 0 or bar.expiry_gap_days <= 0:
        return None
    return (bar.near_close - bar.far_close) / bar.near_close * (365.0 / bar.expiry_gap_days)


def rolling_zscore(
    series: Sequence[SpreadBar], window: int
) -> List[Optional[float]]:
    """Rolling z-score of the spread, None wherever the window spans a roll.

    A window covering a change of contract pair contains the roll jump. The
    resulting z-score is large, meaningless, and exactly the kind of artefact a
    backtest happily trades.
    """
    if window < 2:
        raise ValueError("ZSCORE_WINDOW_TOO_SHORT: a window below 2 has no dispersion")
    out: List[Optional[float]] = []
    for i, bar in enumerate(series):
        if i + 1 < window:
            out.append(None)
            continue
        chunk = series[i + 1 - window : i + 1]
        if any(b.near != bar.near or b.far != bar.far for b in chunk):
            out.append(None)  # spans a roll
            continue
        values = [b.spread for b in chunk]
        sd = statistics.pstdev(values)
        if sd == 0:
            out.append(None)
            continue
        out.append((bar.spread - statistics.fmean(values)) / sd)
    return out


def ou_half_life(
    series: Sequence[SpreadBar], regime: Optional[str] = None, min_points: int = 20
) -> Tuple[Optional[float], int]:
    """Ornstein-Uhlenbeck half-life in bars, and the number of regimes used.

    Fitted within constant-pair segments and, when `regime` is given, within that
    curve regime only. Pooling contango and backwardation would estimate the
    reversion speed of a mixture that never existed as a single process.
    """
    segments: Dict[Tuple[str, str, str], List[float]] = {}
    for bar in series:
        if regime is not None and bar.regime != regime:
            continue
        segments.setdefault((bar.near, bar.far, bar.regime), []).append(bar.spread)

    num = den = 0.0
    used = 0
    n_points = 0
    for values in segments.values():
        if len(values) < min_points:
            continue
        used += 1
        n_points += len(values)
        mean = statistics.fmean(values)
        for prev, cur in zip(values, values[1:]):
            x = prev - mean
            num += x * (cur - prev)
            den += x * x
    if used == 0 or den == 0:
        return None, used
    beta = num / den
    if beta >= 0 or beta <= -2:
        return None, used  # no reversion, or an overshooting fit that has no half-life
    hl = -math.log(2) / math.log(1 + beta)
    if hl > n_points:
        # A half-life longer than the sample it was fitted on is not a measurement.
        # A pure trend drives beta towards zero and the estimator towards infinity;
        # reporting the resulting large finite number would dress "no reversion
        # detectable here" as a quantity.
        return None, used
    return hl, used


def dte_buckets(
    series: Sequence[SpreadBar], edges: Sequence[int] = (5, 15)
) -> Dict[str, List[float]]:
    """Spread values bucketed by the near leg's remaining life, in trading bars.

    Contracts still trading in the final slot of the sample are EXCLUDED: their
    last observed bar is the end of the data, not their expiry, and counting them
    would label live contracts as being in their final week.
    """
    if not series:
        return {}
    last_slot = max(b.ts for b in series)
    last_seen: Dict[str, datetime] = {}
    for bar in series:
        if bar.ts > last_seen.get(bar.near, datetime.min):
            last_seen[bar.near] = bar.ts
    still_alive = {s for s, t in last_seen.items() if t == last_slot}

    order = sorted({b.ts for b in series})
    index_of = {t: i for i, t in enumerate(order)}

    buckets: Dict[str, List[float]] = {}
    lo, hi = edges[0], edges[1]
    for bar in series:
        if bar.near in still_alive:
            continue
        remaining = index_of[last_seen[bar.near]] - index_of[bar.ts]
        if remaining <= lo:
            name = f"0-{lo} bars to roll"
        elif remaining <= hi:
            name = f"{lo + 1}-{hi} bars to roll"
        else:
            name = f"{hi + 1}+ bars to roll"
        buckets.setdefault(name, []).append(bar.spread)
    return buckets
