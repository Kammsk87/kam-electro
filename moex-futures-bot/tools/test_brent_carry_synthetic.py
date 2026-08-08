#!/usr/bin/env python3
"""Synthetic-only self-check for the frozen MX-007 carry rule.

    .venv/bin/python tools/test_brent_carry_synthetic.py

**No real market data is touched.** The confirmation cohort closes 2026-10-01 and
running the rule on it before then would spend the very hermeticity the freeze
was for. Every series here is constructed, so a failure in October is the
market's answer and not a bug found under the pressure of a result.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from moex_futures_bot.strategies.brent_carry import (  # noqa: E402
    FROZEN, CarryError, CarryOutcome, expanding_quantile, run_carry,
    trading_days_to_expiry,
)

PASSED = 0
FAILED = []


def check(name, fn):
    global PASSED
    try:
        fn()
    except AssertionError as exc:
        FAILED.append((name, f"assertion: {exc}"))
    except Exception as exc:  # noqa: BLE001
        FAILED.append((name, f"{type(exc).__name__}: {exc}"))
    else:
        PASSED += 1


def raises(exc_type, fn, contains=None):
    try:
        fn()
    except exc_type as exc:
        if contains is not None:
            assert contains in str(exc), f"expected {contains!r} in {exc!r}"
        return
    except Exception as exc:  # noqa: BLE001
        raise AssertionError(f"expected {exc_type.__name__}, got {type(exc).__name__}: {exc}")
    raise AssertionError(f"expected {exc_type.__name__}, nothing raised")


@dataclass(frozen=True)
class FakeBar:
    ts: datetime
    near: str
    far: str
    spread: float
    regime: str = "CONTANGO"


T0 = datetime(2026, 1, 5, 10, 0)
BPD = FROZEN["bars_per_trading_day"]


def series(n, spread_fn, near="BRU6", far="BRV6", start=T0):
    """n hourly bars, BPD per calendar day, weekends ignored (synthetic)."""
    bars = []
    for i in range(n):
        day, hour = divmod(i, BPD)
        bars.append(FakeBar(start + timedelta(days=day, hours=hour), near, far, spread_fn(i)))
    return bars


def calendar_for(bars):
    return sorted({b.ts.date() for b in bars})


# --- expanding quantile: the look-ahead guard --------------------------------

def test_quantile_is_none_until_warmup():
    q = expanding_quantile(list(range(100)), 0.5, warmup=10)
    assert q[:10] == [None] * 10 and q[10] is not None


def test_quantile_never_sees_its_own_bar():
    """out[i] must depend on values[:i] only. A spike at i must not move out[i]."""
    base = [i / 29.0 for i in range(30)]
    spiked = list(base)
    spiked[22] = 1e9
    a = expanding_quantile(base, 0.9, warmup=10)
    b = expanding_quantile(spiked, 0.9, warmup=10)
    assert a[:23] == b[:23], "a bar helped set a threshold at or before its own index"
    assert a[23:] != b[23:], "the spike must move at least one LATER threshold"


def test_quantile_matches_a_direct_computation():
    vals = [3.0, 1.0, 4.0, 1.0, 5.0, 9.0, 2.0, 6.0]
    got = expanding_quantile(vals, 0.5, warmup=4)
    prior = sorted(vals[:4])
    expected = prior[1] + (prior[2] - prior[1]) * (0.5 * 3 - 1)
    assert abs(got[4] - expected) < 1e-12, (got[4], expected)


def test_quantile_tracks_a_shifting_distribution():
    vals = [0.0] * 600 + [100.0] * 600
    q = expanding_quantile(vals, 0.9, warmup=500)
    assert q[600] == 0.0, "before the shift the 90th percentile is still 0"
    assert q[-1] > 0.0, "after 600 high readings it must have moved"


def test_quantile_validates_inputs():
    raises(CarryError, lambda: expanding_quantile([1.0], 0.0, 10), "BAD_QUANTILE")
    raises(CarryError, lambda: expanding_quantile([1.0], 1.0, 10), "BAD_QUANTILE")
    raises(CarryError, lambda: expanding_quantile([1.0], 0.5, 1), "WARMUP_TOO_SHORT")


# --- days to expiry ----------------------------------------------------------

def test_dte_counts_trading_days_not_calendar_days():
    cal = [date(2026, 3, 2), date(2026, 3, 3), date(2026, 3, 4),
           date(2026, 3, 9), date(2026, 3, 10)]      # a gap, as a holiday week
    assert trading_days_to_expiry(date(2026, 3, 2), date(2026, 3, 10), cal) == 4
    assert (date(2026, 3, 10) - date(2026, 3, 2)).days == 8, "calendar days differ, as intended"


def test_dte_is_exclusive_of_today_and_inclusive_of_expiry():
    cal = [date(2026, 3, i) for i in (2, 3, 4, 5)]
    assert trading_days_to_expiry(date(2026, 3, 2), date(2026, 3, 5), cal) == 3
    assert trading_days_to_expiry(date(2026, 3, 5), date(2026, 3, 5), cal) == 0


def test_dte_after_expiry_is_zero_not_negative():
    cal = [date(2026, 3, i) for i in (2, 3, 4)]
    assert trading_days_to_expiry(date(2026, 3, 4), date(2026, 3, 2), cal) == 0


# --- the rule ----------------------------------------------------------------

WARM = FROZEN["warmup_bars"]
NEUTRAL = 0.5      # the median of the warm-up below, so it sits between q10 and q90


def ry_series(n, spike_from=None, spike_to=None, spike_value=None):
    """Warm-up spread over 0..1 so the quantiles separate, then a neutral level.

    A flat warm-up would make q10 == q50 == q90 and fire an entry on equality at
    the first post-warm-up bar; an oscillating one fires on its own dips. Neither
    tests what the test says it tests.
    """
    out = [i / (WARM - 1.0) for i in range(WARM)]
    out += [NEUTRAL] * (n - WARM)
    if spike_from is not None:
        for i in range(spike_from, spike_to if spike_to is not None else n):
            out[i] = spike_value
    return out
COST = dict(roundtrip_rub=53.44, rub_per_price_point=783.987,
            margin_blocked_rub=16009.16, annual_rate_pct=16.38)


def run(bars, ry, expiry=None, cal=None):
    exp = expiry or {b.near: date(2030, 1, 1) for b in bars}
    return run_carry(bars, ry, expiry_dates=exp, calendar=cal or calendar_for(bars), **COST)


def test_no_trades_during_warmup():
    n = WARM - 50
    bars = series(n, lambda i: 1.0)
    raises(CarryError, lambda: run(bars, [0.05] * n), "TOO_SHORT")


def test_a_low_carry_excursion_opens_a_long_spread():
    """Flat carry through the warm-up, then a dive into the bottom decile."""
    n = WARM + 400
    ry = ry_series(n, WARM + 50, WARM + 60, -5.0)
    bars = series(n, lambda i: 1.0 + 0.001 * i)
    out = run(bars, ry)
    assert out.trades, "a decile excursion must produce an entry"
    assert out.trades[0].direction == 1, "low carry is a LONG spread"
    assert out.trades[0].entry_ry == -5.0, "the neutral level must not have fired earlier"


def test_a_high_carry_excursion_opens_a_short_spread():
    n = WARM + 400
    ry = ry_series(n, WARM + 50, WARM + 60, 5.0)
    out = run(series(n, lambda i: 1.0), ry)
    assert out.trades and out.trades[0].direction == -1
    assert out.trades[0].entry_ry == 5.0


def test_timeout_is_five_trading_days():
    """Carry that never returns to the median must exit exactly at the timeout."""
    n = WARM + 600
    ry = ry_series(n, WARM + 50, None, -5.0)   # stays low forever, never crosses q50
    out = run(series(n, lambda i: 1.0), ry)
    assert out.trades
    t = out.trades[0]
    assert t.exit_reason == "timeout", t.exit_reason
    assert t.bars_held == FROZEN["timeout_trading_days"] * BPD == 75


def test_reversion_to_the_median_exits_early():
    n = WARM + 400
    ry = ry_series(n, WARM + 50, WARM + 55, -5.0)
    out = run(series(n, lambda i: 1.0), ry)
    assert out.trades and out.trades[0].exit_reason == "q50_reversion"
    assert out.trades[0].bars_held < 75


def test_dte_filter_suppresses_entries_in_the_final_week():
    n = WARM + 400
    ry = ry_series(n, WARM + 50, WARM + 60, -5.0)
    bars = series(n, lambda i: 1.0)
    cal = calendar_for(bars)
    near_expiry = {bars[0].near: cal[min(len(cal) - 1, (WARM + 55) // BPD + 3)]}
    out = run_carry(bars, ry, expiry_dates=near_expiry, calendar=cal, **COST)
    assert out.blocked_dte > 0, "an entry three trading days from expiry must be blocked"
    assert all(t.dte_at_entry > FROZEN["min_dte_trading_days"] for t in out.trades)


def test_pnl_sign_follows_the_spread_convention():
    """direction +1 is long the near leg, so it profits when far-near FALLS."""
    n = WARM + 400
    ry = ry_series(n, WARM + 50, WARM + 55, -5.0)
    falling = run(series(n, lambda i: 10.0 - 0.01 * i), ry)
    rising = run(series(n, lambda i: 10.0 + 0.01 * i), ry)
    assert falling.trades[0].direction == 1 and rising.trades[0].direction == 1
    assert falling.trades[0].gross_rub > 0, "spread fell, long spread profits"
    assert rising.trades[0].gross_rub < 0


def test_one_position_at_a_time():
    n = WARM + 800
    ry = ry_series(n, WARM + 50, WARM + 300, -5.0)
    out = run(series(n, lambda i: 1.0), ry)
    for a, b in zip(out.trades, out.trades[1:]):
        assert a.exit_ts < b.entry_ts, "trades must not overlap"


def test_a_roll_closes_the_position():
    n = WARM + 400
    ry = ry_series(n, WARM + 50, None, -5.0)
    bars = series(n, lambda i: 1.0)
    bars = [b if idx < WARM + 60 else FakeBar(b.ts, "BRV6", "BRX6", b.spread)
            for idx, b in enumerate(bars)]
    exp = {"BRU6": date(2030, 1, 1), "BRV6": date(2030, 1, 1)}
    out = run_carry(bars, ry, expiry_dates=exp, calendar=calendar_for(bars), **COST)
    assert out.trades and out.trades[0].exit_reason == "roll"


def test_costs_and_funding_are_charged_not_assumed():
    n = WARM + 400
    ry = ry_series(n, WARM + 50, WARM + 55, -5.0)
    t = run(series(n, lambda i: 1.0), ry).trades[0]
    assert t.cost_rub == 53.44
    assert t.funding_rub > 0
    assert abs(t.net_rub - (t.gross_rub - t.cost_rub - t.funding_rub)) < 1e-12


def test_missing_expiry_date_raises_rather_than_guessing():
    n = WARM + 400
    bars = series(n, lambda i: 1.0)
    raises(CarryError,
           lambda: run_carry(bars, [0.08] * n, expiry_dates={}, calendar=calendar_for(bars), **COST),
           "EXPIRY_DATES_MISSING")


def test_misaligned_inputs_raise():
    bars = series(10, lambda i: 1.0)
    raises(CarryError, lambda: run(bars, [0.1] * 9), "MISALIGNED")


def test_frozen_parameters_are_what_the_task_card_says():
    assert FROZEN["warmup_bars"] == 500
    assert (FROZEN["entry_low_q"], FROZEN["exit_q"], FROZEN["entry_high_q"]) == (0.10, 0.50, 0.90)
    assert FROZEN["timeout_trading_days"] == 5
    assert FROZEN["min_dte_trading_days"] == 7
    assert FROZEN["search_space"] == "moex.br.calendar_spread.1h", \
        "a separate carry space would reset the multiplicity count to zero"


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"brent_carry synthetic self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
