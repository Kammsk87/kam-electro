#!/usr/bin/env python3
"""Deterministic self-check for features/term_structure.py. No pytest needed.

    .venv/bin/python tools/test_term_structure.py

Each check corresponds to a trap the naive implementation falls into, and
several of them correspond to defects this project has already shipped once.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from moex_futures_bot.features.term_structure import (  # noqa: E402
    SpreadBar,
    annualised_roll_yield,
    build_spread_bars,
    dte_buckets,
    expiry_gap_days,
    expiry_key,
    ou_half_life,
    rolling_zscore,
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


T0 = datetime(2026, 1, 5, 10, 0)


def bar(i, near="BRU6", far="BRV6", spread=1.0, near_close=80.0, gap=31):
    return SpreadBar(
        ts=T0 + timedelta(hours=i),
        near=near,
        far=far,
        near_close=near_close,
        far_close=near_close + spread,
        spread=spread,
        expiry_gap_days=gap,
        regime="CONTANGO" if spread > 0 else "BACKWARDATION",
    )


# --- expiry ordering ---------------------------------------------------------

def test_expiry_key_orders_across_the_year_boundary():
    """BRF7 sorts before BRZ6 alphabetically and after it by expiry.
    Ranking legs by secid has already been a live defect in this project."""
    assert expiry_key("BRZ6") == (2026, 12)
    assert expiry_key("BRF7") == (2027, 1)
    assert "BRF7" < "BRZ6"                       # the wrong ordering
    assert expiry_key("BRF7") > expiry_key("BRZ6")  # the right one


def test_expiry_key_rejects_junk():
    for bad in ("BR", "BRA6", "BRU", "XXU6", "BRUX"):
        assert expiry_key(bad) is None, bad


def test_expiry_gap_is_between_expiries_not_to_expiry():
    assert 28 <= expiry_gap_days("BRU6", "BRV6") <= 32
    assert 58 <= expiry_gap_days("BRU6", "BRX6") <= 63
    assert expiry_gap_days("BRV6", "BRU6") is None  # far must be later


# --- roll yield --------------------------------------------------------------

def test_roll_yield_sign_convention():
    """Positive in backwardation: the near contract is dearer and a long rolls down."""
    back = bar(0, spread=-1.0)
    cont = bar(0, spread=+1.0)
    assert annualised_roll_yield(back) > 0
    assert annualised_roll_yield(cont) < 0


def test_roll_yield_does_not_explode_near_expiry():
    """The trap: using the front's remaining life as dt makes the same curve
    shape produce a roll yield that blows up as expiry approaches."""
    early = bar(0, gap=31)
    late = bar(500, gap=31)  # same pair, same shape, much closer to expiry
    assert abs(annualised_roll_yield(early) - annualised_roll_yield(late)) < 1e-12


def test_roll_yield_scales_inversely_with_the_gap():
    one_month = annualised_roll_yield(bar(0, gap=30))
    two_months = annualised_roll_yield(bar(0, gap=60))
    assert abs(one_month - 2 * two_months) < 1e-9


# --- z-score -----------------------------------------------------------------

def test_zscore_is_none_until_the_window_fills():
    series = [bar(i, spread=1.0 + 0.01 * i) for i in range(10)]
    z = rolling_zscore(series, 5)
    assert z[:4] == [None] * 4
    assert z[4] is not None


def test_zscore_is_none_across_a_roll():
    """The whole point: a window spanning a roll measures the roll jump."""
    left = [bar(i, near="BRU6", far="BRV6", spread=1.0 + 0.01 * i) for i in range(6)]
    right = [bar(6 + i, near="BRV6", far="BRX6", spread=9.0 + 0.01 * i) for i in range(6)]
    z = rolling_zscore(left + right, 4)
    spanning = z[6:9]
    assert all(v is None for v in spanning), f"roll-spanning windows must be None, got {spanning}"
    assert z[9] is not None, "the window clears the roll at index 9 and must produce a number"


def test_zscore_flat_series_is_none_not_infinity():
    series = [bar(i, spread=1.0) for i in range(10)]
    assert rolling_zscore(series, 5)[-1] is None


def test_zscore_window_below_two_is_refused():
    try:
        rolling_zscore([bar(0)], 1)
    except ValueError as exc:
        assert "WINDOW_TOO_SHORT" in str(exc)
    else:
        raise AssertionError("expected ValueError")


# --- half-life ---------------------------------------------------------------

def test_half_life_recovers_a_known_reversion():
    """A synthetic AR(1) with phi=0.5 has a half-life of exactly 1 bar."""
    phi, mean = 0.5, 0.0
    x, series = 4.0, []
    for i in range(400):
        series.append(bar(i, spread=x if x != 0 else 1e-9))
        x = mean + phi * (x - mean)
    hl, used = ou_half_life(series)
    assert used >= 1
    assert 0.7 < hl < 1.4, hl


def test_half_life_none_when_there_is_no_reversion():
    series = [bar(i, spread=1.0 + 0.5 * i) for i in range(100)]  # pure trend
    hl, _ = ou_half_life(series)
    assert hl is None


def test_half_life_separates_regimes():
    """Pooling contango and backwardation estimates a mixture that never existed."""
    cont = [bar(i, spread=1.0 + (0.5 ** i)) for i in range(40)]
    back = [bar(40 + i, spread=-1.0 - (0.9 ** i)) for i in range(40)]
    series = cont + back
    _, used_all = ou_half_life(series)
    _, used_cont = ou_half_life(series, regime="CONTANGO")
    assert used_cont < used_all or used_cont == 1


def test_half_life_ignores_short_segments():
    series = [bar(i, spread=1.0 + 0.5 ** i) for i in range(5)]
    hl, used = ou_half_life(series, min_points=20)
    assert (hl, used) == (None, 0)


# --- days to expiry ----------------------------------------------------------

def test_dte_excludes_contracts_still_alive_at_the_end():
    """The defect already fixed once in the Stage 0 script: a contract still
    trading in the final slot has not expired, and counting it labels live
    contracts as being in their final week."""
    dead = [bar(i, near="BRU6", far="BRV6", spread=1.0) for i in range(30)]
    live = [bar(30 + i, near="BRV6", far="BRX6", spread=2.0) for i in range(30)]
    buckets = dte_buckets(dead + live)
    assert all(v == 1.0 for vals in buckets.values() for v in vals), \
        "the still-alive pair must contribute nothing"


def test_dte_buckets_partition_without_overlap():
    series = [bar(i, near="BRU6", far="BRV6", spread=float(i)) for i in range(40)]
    series += [bar(40 + i, near="BRV6", far="BRX6", spread=-1.0) for i in range(3)]
    buckets = dte_buckets(series)
    assert sum(len(v) for v in buckets.values()) == 40


# --- co-trading rule ---------------------------------------------------------

def test_single_leg_slots_are_dropped_and_counted():
    """A spread built where only one leg printed moves on staleness, not on the curve."""
    raw = [
        (T0, "BRU6", 80.0, 5.0), (T0, "BRV6", 81.0, 5.0),          # both legs
        (T0 + timedelta(hours=1), "BRU6", 80.5, 5.0),               # near only
        (T0 + timedelta(hours=2), "BRU6", 80.2, 5.0), (T0 + timedelta(hours=2), "BRV6", 81.4, 5.0),
    ]
    bars, rep = build_spread_bars(raw)
    assert rep.bars_emitted == 2
    assert rep.dropped_single_leg == 1
    assert rep.hourly_slots_seen == 3
    assert all(b.both_traded for b in bars)


def test_legs_are_ranked_by_expiry_not_alphabetically():
    raw = [
        (T0, "BRZ6", 79.0, 1.0),   # Dec 2026
        (T0, "BRF7", 78.0, 1.0),   # Jan 2027 - sorts FIRST as a string
    ]
    bars, _ = build_spread_bars(raw)
    assert bars[0].near == "BRZ6" and bars[0].far == "BRF7"


def test_other_assets_are_skipped_not_reported_as_malformed():
    """GLDRUBF and GDU6 share the candles directory. They are a different asset,
    not a data-quality problem, and must not inflate a defect counter."""
    raw = [(T0, "BRU6", 80.0, 1.0), (T0, "BRV6", 81.0, 1.0), (T0, "GLDRUBF", 10000.0, 1.0)]
    _, rep = build_spread_bars(raw)
    assert rep.skipped_other_asset == 1
    assert rep.dropped_unparseable == 0


def test_pair_is_fixed_by_the_daily_universe_not_by_who_printed():
    """The defect this caught on real data: ranking inside the hour promotes leg 2
    to leg 1 in any slot the front did not trade, emitting a second/third spread
    labelled front/second. Slot-level ranking produced 50 distinct pairs over
    2024+ where the daily universe has 28."""
    h0, h1 = T0, T0 + timedelta(hours=1)
    raw = [
        (h0, "BRU6", 80.0, 1.0), (h0, "BRV6", 81.0, 1.0), (h0, "BRX6", 82.0, 1.0),
        # front is silent this hour; only the back two print
        (h1, "BRV6", 81.5, 1.0), (h1, "BRX6", 82.5, 1.0),
    ]
    bars, rep = build_spread_bars(raw)
    assert len(bars) == 1, "the hour without the front must not yield a spread"
    assert (bars[0].near, bars[0].far) == ("BRU6", "BRV6")
    assert rep.dropped_single_leg == 1
    assert len(rep.pairs) == 1, f"exactly one pair for the day, got {rep.pairs}"


def test_regime_label_matches_the_sign():
    raw = [(T0, "BRU6", 80.0, 1.0), (T0, "BRV6", 81.0, 1.0)]
    bars, _ = build_spread_bars(raw)
    assert bars[0].regime == "CONTANGO" and bars[0].spread > 0


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"term_structure self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
