#!/usr/bin/env python3
"""Deterministic self-check for the MOEX execution adapter. No pytest needed.

    .venv/bin/python tools/test_execution_adapter.py
"""

from __future__ import annotations

import sys
from datetime import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from moex_futures_bot.execution.clearing_schedule import (  # noqa: E402
    ClearingScheduleGuard, Session,
)
from moex_futures_bot.execution.moex_execution_adapter import (  # noqa: E402
    ISS_DELAY_SECONDS, MAX_SIZE_LOTS, AdapterError, Intent, LegRiskError,
    MOEXExecutionAdapter, Order, Quote, Side, SpreadIntentTranslator,
    TopOfBookFillApproximation,
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


NEAR = Quote("BRU6", bid=82.70, ask=82.71, minstep=0.01, lasttradedate="2026-08-31")
FAR = Quote("BRV6", bid=80.79, ask=80.80, minstep=0.01, lasttradedate="2026-10-01")
G = ClearingScheduleGuard()


# --- clearing guard ---------------------------------------------------------

def test_sessions_are_labelled():
    assert G.session_at(time(11, 0)) is Session.MAIN
    assert G.session_at(time(14, 2)) is Session.CLEARING_DAY
    assert G.session_at(time(18, 55)) is Session.CLEARING_EVENING
    assert G.session_at(time(21, 0)) is Session.EVENING
    assert G.session_at(time(3, 0)) is Session.CLOSED


def test_entry_blocked_inside_both_clearings():
    for t in (time(14, 0), time(14, 4), time(18, 50), time(19, 4)):
        v = G.check_entry(t)
        assert not v.allowed, t
        assert v.cancel_resting_orders, t


def test_entry_blocked_five_minutes_before_each_clearing():
    assert not G.check_entry(time(13, 55)).allowed
    assert not G.check_entry(time(13, 59)).allowed
    assert not G.check_entry(time(18, 45)).allowed
    assert G.check_entry(time(13, 54)).allowed, "6 minutes out is clear"


def test_cancel_window_is_two_minutes_not_five():
    """The block lead and the cancel lead are different numbers and must not be
    collapsed: entries stop at 5 minutes, resting orders are pulled at 2."""
    assert not G.check_entry(time(13, 57)).allowed
    assert not G.check_entry(time(13, 57)).cancel_resting_orders, "5-min block, not yet cancelling"
    assert G.should_cancel_resting(time(13, 59)).cancel_resting_orders
    assert not G.should_cancel_resting(time(13, 55)).cancel_resting_orders


def test_boundaries_are_half_open():
    assert G.session_at(time(14, 5)) is Session.MAIN, "clearing ends at 14:05 exclusive"
    assert G.session_at(time(19, 5)) is Session.EVENING
    assert G.session_at(time(23, 50)) is Session.CLOSED


def test_verdict_always_carries_a_reason():
    for t in (time(11, 0), time(14, 2), time(3, 0), time(13, 56)):
        assert G.check_entry(t).reason.strip(), t


# --- intent translation -----------------------------------------------------

def test_long_spread_buys_the_near_and_sells_the_far():
    orders = SpreadIntentTranslator().translate(Intent.ENTER_SPREAD_LONG, NEAR, FAR)
    assert [(o.secid, o.side, o.leg) for o in orders] == [
        ("BRU6", Side.BUY, 1), ("BRV6", Side.SELL, 2)]
    assert orders[0].limit_price == NEAR.ask and orders[1].limit_price == FAR.bid


def test_short_spread_is_the_mirror():
    orders = SpreadIntentTranslator().translate(Intent.ENTER_SPREAD_SHORT, NEAR, FAR)
    assert [(o.secid, o.side) for o in orders] == [("BRU6", Side.SELL), ("BRV6", Side.BUY)]


def test_legs_must_be_ordered_by_expiry_not_by_secid():
    """BRF7 sorts before BRZ6 as a string and after it by expiry."""
    z6 = Quote("BRZ6", 79.0, 79.01, 0.01, "2026-12-01")
    f7 = Quote("BRF7", 78.0, 78.01, 0.01, "2027-01-04")
    SpreadIntentTranslator().translate(Intent.ENTER_SPREAD_LONG, z6, f7)   # correct
    raises(AdapterError,
           lambda: SpreadIntentTranslator().translate(Intent.ENTER_SPREAD_LONG, f7, z6),
           "LEG_ORDER_WRONG")


def test_a_missing_side_refuses_the_whole_pair():
    """One leg alone is an outright position wearing a spread's name."""
    no_bid = Quote("BRV6", bid=None, ask=80.80, minstep=0.01, lasttradedate="2026-10-01")
    raises(LegRiskError,
           lambda: SpreadIntentTranslator().translate(Intent.ENTER_SPREAD_LONG, NEAR, no_bid),
           "MISSING_QUOTE")


def test_bad_intent_and_size_refused():
    raises(AdapterError, lambda: SpreadIntentTranslator().translate("go long", NEAR, FAR), "UNKNOWN_INTENT")
    raises(AdapterError, lambda: SpreadIntentTranslator().translate(Intent.ENTER_SPREAD_LONG, NEAR, FAR, 0), "BAD_SIZE")


# --- fill approximation ------------------------------------------------------

def test_marketable_order_fills_at_the_touch():
    o = Order("BRU6", Side.BUY, 1, 82.71, 1)
    v = TopOfBookFillApproximation().check(o, NEAR)
    assert v.filled and v.price == 82.71


def test_unmarketable_limit_does_not_fill():
    o = Order("BRU6", Side.BUY, 1, 82.65, 1)
    assert not TopOfBookFillApproximation().check(o, NEAR).filled


def test_size_above_one_lot_is_unsupported_not_assumed():
    o = Order("BRU6", Side.BUY, 2, 82.71, 1)
    v = TopOfBookFillApproximation().check(o, NEAR)
    assert not v.filled and not v.size_supported
    assert "no depth" in v.reason
    assert MAX_SIZE_LOTS == 1


def test_every_verdict_carries_depth_basis_and_delay():
    for o in (Order("BRU6", Side.BUY, 1, 82.71, 1), Order("BRU6", Side.BUY, 1, 1.0, 1)):
        v = TopOfBookFillApproximation().check(o, NEAR)
        assert v.depth_basis == "UNSUPPORTED"
        assert v.delay_seconds == ISS_DELAY_SECONDS == 900
        assert "NOT an L2 replay" in v.citation()


def test_crossed_book_is_refused():
    bad = Quote("BRU6", bid=82.75, ask=82.70, minstep=0.01, lasttradedate="2026-08-31")
    v = TopOfBookFillApproximation().check(Order("BRU6", Side.BUY, 1, 99.0, 1), bad)
    assert not v.filled and "crossed" in v.reason


def test_quote_must_match_the_order():
    raises(AdapterError,
           lambda: TopOfBookFillApproximation().check(Order("BRU6", Side.BUY, 1, 82.71, 1), FAR),
           "QUOTE_MISMATCH")


# --- adapter ----------------------------------------------------------------

def test_spread_ceiling_has_no_default():
    raises(AdapterError, lambda: MOEXExecutionAdapter(max_entry_spread_ticks=None), "REQUIRED")
    raises(AdapterError, lambda: MOEXExecutionAdapter(max_entry_spread_ticks=0), "REQUIRED")


def test_accepts_a_clean_spread_in_the_main_session():
    r = MOEXExecutionAdapter(max_entry_spread_ticks=4.08).submit(
        Intent.ENTER_SPREAD_LONG, NEAR, FAR, now=time(11, 30))
    assert r["accepted"] and len(r["orders"]) == 2
    assert r["depth_basis"] == "UNSUPPORTED" and r["simulation_only"] is True


def test_clearing_guard_wins_over_a_good_quote():
    r = MOEXExecutionAdapter(max_entry_spread_ticks=4.08).submit(
        Intent.ENTER_SPREAD_LONG, NEAR, FAR, now=time(13, 58))
    assert not r["accepted"] and "clearing guard" in r["reason"] and r["orders"] == []


def test_wide_leg_blocks_entry_against_the_frozen_threshold():
    """The second leg was first observed at 3 ticks in the evening session, above
    the 1.90-tick breakeven frozen for the 1d horizon in TASK-MX-002."""
    wide = Quote("BRV6", bid=80.79, ask=80.82, minstep=0.01, lasttradedate="2026-10-01")
    r = MOEXExecutionAdapter(max_entry_spread_ticks=1.90).submit(
        Intent.ENTER_SPREAD_LONG, NEAR, wide, now=time(21, 0))
    assert not r["accepted"] and "3.00 ticks wide" in r["reason"]
    r2 = MOEXExecutionAdapter(max_entry_spread_ticks=4.08).submit(
        Intent.ENTER_SPREAD_LONG, NEAR, wide, now=time(21, 0))
    assert r2["accepted"], "the same quote clears the 3d threshold"


def test_no_broker_or_order_path_in_the_public_surface():
    import moex_futures_bot.execution.moex_execution_adapter as m
    src = Path(m.__file__).read_text(encoding="utf-8")
    for forbidden in ("requests", "urllib", "http", "socket", "FinamClient", "place_order", "account"):
        assert forbidden not in src.replace("no broker client", "").replace("account, position", ""), forbidden


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"execution_adapter self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
