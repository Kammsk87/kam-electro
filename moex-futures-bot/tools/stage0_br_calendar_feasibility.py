#!/usr/bin/env python3
"""TASK-MX-001 Part B - Stage 0 feasibility for the BR calendar-spread contour.

This is NOT a strategy. It contains no entry rule, no exit rule and no parameter
to tune. It answers one question, in minutes, that the project has never asked
before writing code: can the front/second Brent calendar spread move far enough,
often enough, to pay for the round trip that would harvest it?

Kill conditions K1, K2a, K2b, K3a and K3b are pre-registered in
tasks/ready/TASK-MX-001-MOEX-COST-MODEL-AND-STAGE0-FEASIBILITY-V0.md and were
frozen before this script was run.

Method notes that decide whether the numbers mean anything:

* Contracts are ordered by expiry derived from the MOEX code (month letter +
  year digit), never by alphabetical secid and never by last observed trade
  date. Last-observed-date would misrank every contract still alive at the end
  of the sample.
* A spread move is measured only across windows where the *contract pair is
  unchanged for the entire horizon*. Spanning a roll would measure the roll
  jump, not the spread, and would manufacture dispersion that no position could
  have captured.
* The spread is expressed in ROUBLES per one-lot spread, because the cost floor
  is roubles. Basis points of a leg's notional are the wrong denominator for a
  two-leg position and are reported only for reference.

Safety: read-only. No network, credential, broker, order or service path.

Usage:
    .venv/bin/python tools/stage0_br_calendar_feasibility.py \
        --report data/reports/stage0_br_calendar_feasibility.md
"""

from __future__ import annotations

import argparse
import glob
import math
import statistics
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import duckdb

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src"))

from moex_futures_bot.cost_model import require_floor  # noqa: E402

AS_OF = "2026-08-06"
HORIZONS = (1, 3, 5, 10)
K1_SHARE_THRESHOLD = 0.20
K2B_COTRADE_THRESHOLD = 0.60

# MOEX futures month codes. The contract named for month M last trades near the
# end of month M-1, but only the ORDERING matters here and the ordering is exact.
MONTH_CODE = {
    "F": 1, "G": 2, "H": 3, "J": 4, "K": 5, "M": 6,
    "N": 7, "Q": 8, "U": 9, "V": 10, "X": 11, "Z": 12,
}


def expiry_key(secid: str) -> Optional[Tuple[int, int]]:
    """(year, month) implied by a BR contract code, or None if unparseable.

    The sample spans 2021-09..2026-07, so a single year digit is unambiguous.
    """
    if len(secid) != 4 or not secid.startswith("BR"):
        return None
    month = MONTH_CODE.get(secid[2])
    if month is None or not secid[3].isdigit():
        return None
    return (2020 + int(secid[3]), month)


def pct(x: float) -> str:
    return f"{100.0 * x:.1f}%"


def quantile(values: Sequence[float], q: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


# --------------------------------------------------------------------------
# data
# --------------------------------------------------------------------------

def load_daily_legs(db: Path) -> Dict[date, List[Tuple[str, float, int, int]]]:
    """Per trading date, BR contracts that actually traded, ordered by expiry.

    Returns date -> [(secid, close, volume, openposition), ...] with leg 1 first.
    """
    con = duckdb.connect(str(db), read_only=True)
    rows = con.execute(
        """
        select tradedate, secid, close, volume, openposition
        from moex_iss_futures_history
        where assetcode = 'BR' and volume > 0 and close is not null
        """
    ).fetchall()
    con.close()

    by_date: Dict[date, List[Tuple[str, float, int, int]]] = defaultdict(list)
    unparsed = set()
    for tradedate, secid, close, volume, oi in rows:
        key = expiry_key(secid)
        if key is None:
            unparsed.add(secid)
            continue
        by_date[tradedate].append((key, secid, float(close), int(volume or 0), int(oi or 0)))
    if unparsed:
        print(f"  note: {len(unparsed)} unparseable contract codes skipped: {sorted(unparsed)[:5]}")

    out: Dict[date, List[Tuple[str, float, int, int]]] = {}
    for d, legs in by_date.items():
        legs.sort(key=lambda r: r[0])
        out[d] = [(secid, close, vol, oi) for _key, secid, close, vol, oi in legs]
    return out


def load_rusfar(db_dir: Path) -> Dict[date, float]:
    files = glob.glob(str(db_dir / "index_history" / "security=RUSFAR" / "*.parquet"))
    if not files:
        return {}
    con = duckdb.connect()
    rows = con.execute(
        f"select tradedate, close from read_parquet('{files[0]}') where close is not null"
    ).fetchall()
    con.close()
    return {d: float(c) for d, c in rows}


def load_hourly_cotrade(
    candles_dir: Path,
    by_date: Dict[date, List[Tuple[str, float, int, int]]],
    pairs_needed: int = 3,
) -> Tuple[Dict[int, float], Dict[str, object]]:
    """Share of 60-minute slots where the ranked leg N and leg N+1 both printed.

    A spread quoted from two bars that did not trade in the same hour is a
    stale-price artefact, not an observation of the curve. The check must name
    the two specific contracts: counting "at least N+1 contracts printed" would
    credit leg3/leg4 on a slot where legs 1, 2, 5 and 6 traded and leg 3 did not.
    """
    files = glob.glob(str(candles_dir / "interval=60" / "*" / "candles.parquet"))
    if not files:
        return {}, {"reason": "no 60-minute candle files"}
    con = duckdb.connect()
    rows = con.execute(
        f"select security, begin from read_parquet({files!r}) where volume > 0"
    ).fetchall()
    con.close()

    printed: Dict[object, set] = defaultdict(set)
    slots_by_date: Dict[date, set] = defaultdict(set)
    for secid, begin in rows:
        if expiry_key(secid) is None:
            continue
        printed[begin].add(secid)
        slots_by_date[begin.date()].add(begin)

    both: Dict[int, int] = defaultdict(int)
    total: Dict[int, int] = defaultdict(int)
    covered_dates = 0
    for d, legs in by_date.items():
        slots = slots_by_date.get(d)
        if not slots:
            continue
        covered_dates += 1
        names = [secid for secid, _c, _v, _oi in legs]
        for slot in slots:
            here = printed[slot]
            for n in range(1, pairs_needed + 1):
                if len(names) <= n:
                    continue
                total[n] += 1
                if names[n - 1] in here and names[n] in here:
                    both[n] += 1

    coverage = {
        "dates_with_candles": covered_dates,
        "dates_in_window": len(by_date),
        "slots": sum(len(s) for d, s in slots_by_date.items() if d in by_date),
    }
    return {n: (both[n] / total[n] if total[n] else 0.0) for n in sorted(total)}, coverage


# --------------------------------------------------------------------------
# measurement
# --------------------------------------------------------------------------

def spread_series(
    by_date: Dict[date, List[Tuple[str, float, int, int]]],
    near: int,
    far: int,
    rub_per_point: float,
) -> List[Tuple[date, str, str, float, int, int]]:
    """(date, near_secid, far_secid, spread_rub, near_vol, far_vol) per day."""
    out = []
    for d in sorted(by_date):
        legs = by_date[d]
        if len(legs) <= far:
            continue
        n_secid, n_close, n_vol, _ = legs[near]
        f_secid, f_close, f_vol, _ = legs[far]
        out.append((d, n_secid, f_secid, (f_close - n_close) * rub_per_point, n_vol, f_vol))
    return out


def horizon_moves(series, horizon: int) -> List[float]:
    """Spread changes in RUB over `horizon` trading days, pair held constant."""
    moves = []
    for i in range(len(series) - horizon):
        a, b = series[i], series[i + horizon]
        # the pair must be identical at both ends AND at every step between,
        # otherwise the window silently spans a roll
        if any(
            series[j][1] != a[1] or series[j][2] != a[2]
            for j in range(i, i + horizon + 1)
        ):
            continue
        moves.append(b[3] - a[3])
    return moves


def half_life(series) -> Tuple[Optional[float], Optional[float], int]:
    """OU half-life in trading days and typical deviation from the pair's mean.

    Fitted inside each constant-pair regime and pooled, so a roll never enters
    the regression.
    """
    regimes: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    for _d, n, f, s, _nv, _fv in series:
        regimes[(n, f)].append(s)

    num = den = 0.0
    deviations: List[float] = []
    used = 0
    for _pair, values in regimes.items():
        if len(values) < 20:
            continue
        used += 1
        mean = statistics.fmean(values)
        deviations.extend(abs(v - mean) for v in values)
        for prev, cur in zip(values, values[1:]):
            x = prev - mean
            num += x * (cur - prev)
            den += x * x
    if used == 0 or den == 0:
        return None, None, used
    beta = num / den  # dS = beta * (S - mean)
    if beta >= 0 or beta <= -2:
        return None, quantile(deviations, 0.5), used
    hl = -math.log(2) / math.log(1 + beta)
    return hl, quantile(deviations, 0.5), used


def days_to_expiry_buckets(
    by_date, series, horizon: int
) -> Dict[str, List[float]]:
    """Horizon moves partitioned by how long the near leg has left.

    Days-to-expiry is measured as the number of remaining trading dates on which
    that contract still prints, which is observable from the retained history and
    does not require a contract specification.
    """
    last_seen: Dict[str, date] = {}
    trading_days = sorted(by_date)
    index_of = {d: i for i, d in enumerate(trading_days)}
    for d in trading_days:
        for secid, _c, _v, _oi in by_date[d]:
            last_seen[secid] = d

    # A contract still alive on the final date of the sample has not expired;
    # its last-seen date is the end of the data, not its expiry. Counting it
    # would label live contracts as being in their final week.
    data_end = trading_days[-1]
    still_alive = {s for s, d in last_seen.items() if d == data_end}

    buckets: Dict[str, List[float]] = defaultdict(list)
    for i in range(len(series) - horizon):
        a = series[i]
        if a[1] in still_alive:
            continue
        if any(
            series[j][1] != a[1] or series[j][2] != a[2]
            for j in range(i, i + horizon + 1)
        ):
            continue
        move = series[i + horizon][3] - a[3]
        dte = index_of[last_seen[a[1]]] - index_of[a[0]]
        if dte <= 5:
            buckets["0-5 dte (final week)"].append(move)
        elif dte <= 15:
            buckets["6-15 dte"].append(move)
        else:
            buckets["16+ dte"].append(move)
    return buckets


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(REPO / "data" / "research.duckdb"))
    ap.add_argument("--market", default=str(REPO / "data" / "market" / "moex_iss"))
    ap.add_argument("--report", default=str(REPO / "data" / "reports" / "stage0_br_calendar_feasibility.md"))
    ap.add_argument("--start", default="2024-01-01", help="RUSFAR coverage begins 2024-01")
    args = ap.parse_args()

    floor = require_floor(
        as_of=AS_OF,
        instrument="BR",
        execution_basis="TICK_FLOOR",
        legs=2,
        reference_price=88.33,
    )
    floor_stress = require_floor(
        as_of=AS_OF, instrument="BR", execution_basis="TICK_FLOOR_STRESS", legs=2, reference_price=88.33
    )
    rub_per_point = floor.rub_per_price_point

    print("cost floor:", floor.citation())

    by_date_all = load_daily_legs(Path(args.db))
    start = date.fromisoformat(args.start)
    by_date = {d: v for d, v in by_date_all.items() if d >= start}
    print(f"  BR trading dates: {len(by_date_all)} total, {len(by_date)} from {args.start}")

    rusfar = load_rusfar(Path(args.market))
    cotrade, cotrade_coverage = load_hourly_cotrade(Path(args.market) / "candles", by_date)

    pairs = {"front/second": (0, 1), "second/third": (1, 2)}
    results: Dict[str, dict] = {}

    for label, (near, far) in pairs.items():
        series = spread_series(by_date, near, far, rub_per_point)
        per_horizon = {}
        for h in HORIZONS:
            moves = horizon_moves(series, h)
            absmoves = [abs(m) for m in moves]
            per_horizon[h] = {
                "n": len(moves),
                "median_abs": quantile(absmoves, 0.5),
                "p75_abs": quantile(absmoves, 0.75),
                "p90_abs": quantile(absmoves, 0.90),
                "share_above_floor": (
                    sum(1 for m in absmoves if m > floor.roundtrip_rub) / len(absmoves) if absmoves else 0.0
                ),
                "share_above_stress": (
                    sum(1 for m in absmoves if m > floor_stress.roundtrip_rub) / len(absmoves) if absmoves else 0.0
                ),
                "mean_signed": statistics.fmean(moves) if moves else float("nan"),
            }
        hl, typical_dev, regimes = half_life(series)
        results[label] = {
            "series_len": len(series),
            "per_horizon": per_horizon,
            "half_life": hl,
            "typical_deviation": typical_dev,
            "regimes": regimes,
            "buckets": days_to_expiry_buckets(by_date, series, 5),
        }

    fs = results["front/second"]["per_horizon"]

    # K3b: margin funding of both legs at RUSFAR
    margin_two_legs = (floor.initial_margin_rub or 0.0) * 2
    rates = [r for d, r in rusfar.items() if d >= start]
    rusfar_median = quantile(rates, 0.5) if rates else None
    funding = {}
    if rusfar_median is not None:
        for h in HORIZONS:
            funding[h] = margin_two_legs * (rusfar_median / 100.0) * (h / 252.0)

    lines: List[str] = []
    w = lines.append
    w("# TASK-MX-001 Stage 0 - BR calendar spread feasibility")
    w("")
    w(f"Generated: {AS_OF}. Lifecycle stage `DATA_HEALTH`. This is a feasibility measurement,")
    w("not a strategy, not a candidate, and not evidence of edge.")
    w("")
    w("## Cost floor in force")
    w("")
    w(f"```\n{floor.citation()}\n```")
    w("")
    w(f"- two-leg round trip, tick floor: **{floor.roundtrip_rub:.2f} RUB** ({floor.roundtrip_bps:.2f} bps of one leg)")
    w(f"- two-leg round trip, tick-floor stress: **{floor_stress.roundtrip_rub:.2f} RUB**")
    w(f"- this is a LOWER BOUND: {'; '.join(floor.lower_bound_reasons)}")
    w("")

    for label, res in results.items():
        w(f"## {label} spread")
        w("")
        w(f"Constant-pair daily observations from {args.start}: {res['series_len']}")
        w("")
        w("| horizon | n windows | median abs | p75 | p90 | share > floor | share > stress |")
        w("|---|---:|---:|---:|---:|---:|---:|")
        for h in HORIZONS:
            s = res["per_horizon"][h]
            w(
                f"| {h}d | {s['n']} | {s['median_abs']:.0f} ₽ | {s['p75_abs']:.0f} ₽ | {s['p90_abs']:.0f} ₽ "
                f"| {pct(s['share_above_floor'])} | {pct(s['share_above_stress'])} |"
            )
        w("")
        hl = res["half_life"]
        w(f"- mean-reversion half-life: {f'{hl:.1f} trading days' if hl else 'not identified (no reversion)'}"
          f" over {res['regimes']} constant-pair regimes")
        w(f"- typical absolute deviation from the pair's own mean: "
          f"{res['typical_deviation']:.0f} ₽" if res["typical_deviation"] else "- typical deviation: n/a")
        w("")
        w("Five-day moves by the near leg's remaining life:")
        w("")
        w("| bucket | n | median abs | share > floor |")
        w("|---|---:|---:|---:|")
        for name in ("0-5 dte (final week)", "6-15 dte", "16+ dte"):
            vals = [abs(v) for v in res["buckets"].get(name, [])]
            if not vals:
                continue
            share = sum(1 for v in vals if v > floor.roundtrip_rub) / len(vals)
            w(f"| {name} | {len(vals)} | {quantile(vals, 0.5):.0f} ₽ | {pct(share)} |")
        w("")

    w("## Cost sensitivity - how wide can the real spread be before K1 fails")
    w("")
    w("The floor assumes a one-tick bid-ask. The true spread is unmeasured. This is the")
    w("widest true spread, in ticks per leg, at which the median move still clears the")
    w("round trip. One tick is 0.01 price points = 7.84 ₽ per leg.")
    w("")
    w("| horizon | median abs move | breakeven spread (ticks/leg) | breakeven cost |")
    w("|---|---:|---:|---:|")
    tick_rub = floor.minstep * rub_per_point
    for h in HORIZONS:
        med = fs_preview = results["front/second"]["per_horizon"][h]["median_abs"]
        # total = fee + 2 legs * ticks * tick_rub  ->  ticks at which total == med
        ticks = (med - floor.fee_component_rub) / (2 * tick_rub)
        w(f"| {h}d | {med:.0f} ₽ | {ticks:.1f} | {med:.0f} ₽ |")
    w("")
    w(f"Fee alone is {floor.fee_component_rub:.2f} ₽, so any horizon whose median move is below")
    w("that figure is dead on fees regardless of the book.")
    w("")

    w("## K2b - hourly co-trading adequacy")
    w("")
    if cotrade:
        w("Measured on the two specific ranked contracts, not on a count of how many")
        w("contracts happened to print in the slot.")
        w("")
        w(f"60-minute candle coverage: {cotrade_coverage['dates_with_candles']} of "
          f"{cotrade_coverage['dates_in_window']} trading dates in the window, "
          f"{cotrade_coverage['slots']} slots.")
        w("")
        w("| leg pair | share of 60m slots with both legs printing |")
        w("|---|---:|")
        for n in sorted(cotrade):
            w(f"| leg {n} / leg {n + 1} | {pct(cotrade[n])} |")
    else:
        w("No 60-minute candles available; K2b is `DATA_INADEQUATE` by absence.")
    w("")

    w("## K3b - margin funding")
    w("")
    if rusfar_median is None:
        w("RUSFAR unavailable for the window; K3b `UNDETERMINED`.")
    else:
        w(f"Initial margin, both legs, conservative: {margin_two_legs:,.0f} ₽. "
          f"RUSFAR median from {args.start}: {rusfar_median:.2f}%.")
        w("")
        w("| horizon | funding cost | vs median abs move (front/second) |")
        w("|---|---:|---|")
        for h in HORIZONS:
            med = results["front/second"]["per_horizon"][h]["median_abs"]
            verdict = "funding exceeds move" if funding[h] > med else "move exceeds funding"
            w(f"| {h}d | {funding[h]:.0f} ₽ | {verdict} |")
        w("")
        w("FORTS grants inter-contract spread margin discounts. This uses the full sum of both legs,")
        w("which is conservative; the exact discount is `undetermined` and would reduce these figures.")
        w("")
        w("### All-in: trade cost AND funding together")
        w("")
        w("K3b as pre-registered compares funding against the move on its own. A position pays")
        w("both. This is the number that decides whether a horizon can pay for itself, and it is")
        w("harsher than either gate taken separately.")
        w("")
        w("| horizon | median abs move | round trip | funding | all-in | headroom |")
        w("|---|---:|---:|---:|---:|---:|")
        for h in HORIZONS:
            med = fs[h]["median_abs"]
            allin = floor.roundtrip_rub + funding[h]
            head = (med - allin) / med if med else float("nan")
            w(f"| {h}d | {med:.0f} ₽ | {floor.roundtrip_rub:.0f} ₽ | {funding[h]:.0f} ₽ "
              f"| {allin:.0f} ₽ | {pct(head)} |")
        w("")
        dead = [h for h in HORIZONS if floor.roundtrip_rub + funding[h] >= fs[h]["median_abs"]]
        if dead:
            w(f"**Horizons where the median move does not cover the all-in cost: {dead}.** "
              "Those horizons are not viable at the median even before a signal is applied.")
        else:
            w("Every declared horizon clears its all-in cost at the median.")
    w("")

    # ---- verdicts -------------------------------------------------------
    k1_all_below = all(
        fs[h]["share_above_floor"] < K1_SHARE_THRESHOLD and fs[h]["median_abs"] < floor.roundtrip_rub
        for h in HORIZONS
    )
    k1 = "FAIL (contour closed)" if k1_all_below else "PASS"

    hl = results["front/second"]["half_life"]
    dev = results["front/second"]["typical_deviation"]
    if hl is None:
        k2a = "FAIL (no reversion identified)"
    elif hl > max(HORIZONS):
        k2a = f"FAIL (half-life {hl:.1f}d exceeds longest horizon {max(HORIZONS)}d)"
    elif dev is None or dev < floor.roundtrip_rub:
        k2a = "FAIL (typical deviation below the cost floor)"
    else:
        k2a = f"PASS (half-life {hl:.1f}d, typical deviation {dev:.0f} ₽ vs floor {floor.roundtrip_rub:.0f} ₽)"

    if not cotrade:
        k2b = "DATA_INADEQUATE"
    else:
        k2b = "PASS" if cotrade.get(2, 0.0) >= K2B_COTRADE_THRESHOLD else (
            f"FAIL (leg2/leg3 co-trade {pct(cotrade.get(2, 0.0))} < {pct(K2B_COTRADE_THRESHOLD)}): "
            "no three-point curve feature may be built from candles"
        )

    buckets = results["front/second"]["buckets"]
    final = [abs(v) for v in buckets.get("0-5 dte (final week)", [])]
    other = [abs(v) for v in buckets.get("16+ dte", [])]
    if final and other:
        ratio = quantile(final, 0.5) / quantile(other, 0.5) if quantile(other, 0.5) else float("inf")
        k3a = (
            f"CONCENTRATED in the final week (median {quantile(final, 0.5):.0f} ₽ vs "
            f"{quantile(other, 0.5):.0f} ₽, ratio {ratio:.1f}x)"
            if ratio > 1.5
            else f"NOT concentrated (ratio {ratio:.1f}x)"
        )
    else:
        k3a = "insufficient bucket coverage"

    if rusfar_median is None:
        k3b = "UNDETERMINED (no RUSFAR)"
    else:
        worst = [h for h in HORIZONS if funding[h] > fs[h]["median_abs"]]
        dead = [h for h in HORIZONS if floor.roundtrip_rub + funding[h] >= fs[h]["median_abs"]]
        k3b = (
            f"FAIL at horizons {worst} (funding alone exceeds the median move)"
            if worst
            else "PASS as pre-registered (funding alone)"
        )
        if dead:
            k3b += f"; but all-in cost exceeds the median move at horizons {dead}"

    w("## Verdicts against pre-registered kill conditions")
    w("")
    w("| gate | verdict |")
    w("|---|---|")
    w(f"| K1 volatility floor | {k1} |")
    w(f"| K2a mean-reversion amplitude | {k2a} |")
    w(f"| K2b leg-3 data adequacy | {k2b} |")
    w(f"| K3a expiry-window anomaly | {k3a} |")
    w(f"| K3b margin funding | {k3b} |")
    w("")
    w("## What this cannot conclude")
    w("")
    w("- It says nothing about whether any signal predicts the spread. Stage 0 tests arithmetic, not edge.")
    w("- Every cost figure is a lower bound: no broker commission, no measured spread, no slippage.")
    w("- Dispersion measured on daily closes is not dispersion capturable at a decision time.")
    w("- Passing K1 does not authorise a strategy; it authorises writing a Stage 1 protocol.")
    w("")
    w("Lifecycle: entered `DATA_HEALTH`, left `DATA_HEALTH`. No candidate created. "
      "`check_paper_gate.py` unchanged and still blocked.")

    out = Path(args.report)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nreport written: {out}")
    print(f"\nK1  {k1}\nK2a {k2a}\nK2b {k2b}\nK3a {k3a}\nK3b {k3b}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
