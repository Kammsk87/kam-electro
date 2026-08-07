#!/usr/bin/env python3
"""Deterministic self-check for src/moex_futures_bot/cost_model.py.

The venv has no pytest, so this is a plain assert script in the style of
Botalin's scripts/test_*.mjs. Run:

    .venv/bin/python tools/test_cost_model.py

Every check below exists because the corresponding failure is one this project
or Botalin has actually made: a defaulted cost, a bare constant, a silently
assumed execution model, or a floor quoted without its derivation.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from moex_futures_bot.cost_model import (  # noqa: E402
    DEFAULT_SCHEDULE_PATH,
    CostModelError,
    ExecutionBasisUnavailable,
    contract_notional_rub,
    entry_as_of,
    load_schedule,
    require_floor,
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


# --- the schedule is not optional -------------------------------------------

def test_missing_schedule_raises():
    with tempfile.TemporaryDirectory() as d:
        raises(CostModelError, lambda: load_schedule(Path(d) / "nope.json"), "FEE_SCHEDULE_MISSING")


def test_empty_schedule_raises():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "empty.json"
        p.write_text(json.dumps({"entries": []}), encoding="utf-8")
        raises(CostModelError, lambda: load_schedule(p), "FEE_SCHEDULE_EMPTY")


def test_shipped_schedule_loads():
    s = load_schedule(DEFAULT_SCHEDULE_PATH)
    assert s["venue"] == "MOEX_FORTS"
    assert s["undetermined"], "a schedule with nothing undetermined is claiming more than it measured"


# --- as_of is required, and it is honoured -----------------------------------

def test_as_of_required():
    raises(
        CostModelError,
        lambda: require_floor(as_of=None, instrument="BR", execution_basis="TICK_FLOOR"),
        "COST_MODEL_ASOF_REQUIRED",
    )
    raises(
        CostModelError,
        lambda: require_floor(as_of="2026/08/06", instrument="BR", execution_basis="TICK_FLOOR"),
        "COST_MODEL_ASOF_REQUIRED",
    )


def test_as_of_before_effective_from_has_no_entry():
    raises(
        CostModelError,
        lambda: require_floor(as_of="2026-01-01", instrument="BR", execution_basis="TICK_FLOOR"),
        "NO_FEE_SCHEDULE_ENTRY_FOR",
    )


def test_unknown_instrument_raises():
    raises(
        CostModelError,
        lambda: require_floor(as_of="2026-08-06", instrument="SILVER", execution_basis="TICK_FLOOR"),
        "NO_FEE_SCHEDULE_ENTRY_FOR",
    )


# --- the execution assumption must be named ----------------------------------

def test_execution_basis_required():
    raises(
        TypeError,
        lambda: require_floor(as_of="2026-08-06", instrument="BR"),
    )
    raises(
        CostModelError,
        lambda: require_floor(as_of="2026-08-06", instrument="BR", execution_basis=""),
        "EXECUTION_BASIS_REQUIRED",
    )


def test_measured_basis_refuses():
    """There is no MOEX book data. The model must say so, not substitute a proxy."""
    raises(
        ExecutionBasisUnavailable,
        lambda: require_floor(as_of="2026-08-06", instrument="BR", execution_basis="MEASURED"),
        "EXECUTION_BASIS_UNAVAILABLE",
    )


def test_unknown_basis_raises():
    raises(
        CostModelError,
        lambda: require_floor(as_of="2026-08-06", instrument="BR", execution_basis="OPTIMISTIC"),
        "UNKNOWN_EXECUTION_BASIS",
    )


# --- legs -------------------------------------------------------------------

def test_bad_legs_raises():
    for bad in (0, 3, 1.5, "2"):
        raises(
            CostModelError,
            lambda b=bad: require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", legs=b),
            "BAD_LEGS",
        )


def test_two_legs_costs_exactly_double():
    one = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", legs=1)
    two = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", legs=2)
    assert abs(two.roundtrip_rub - 2 * one.roundtrip_rub) < 1e-9, (one.roundtrip_rub, two.roundtrip_rub)


# --- roubles are primitive, bps are derived ----------------------------------

def test_bps_requires_a_price():
    f = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR")
    assert f.roundtrip_rub > 0
    assert f.roundtrip_bps is None, "bps must not appear without a declared reference price"


def test_bps_depends_on_price():
    """The whole reason a cost_bps constant is wrong on FORTS: a flat rouble fee
    is a different number of basis points at a different price."""
    a = require_floor(
        as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", reference_price=88.33
    )
    b = require_floor(
        as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", reference_price=44.165
    )
    assert a.roundtrip_rub == b.roundtrip_rub, "rouble cost must not depend on price"
    assert abs(b.roundtrip_bps - 2 * a.roundtrip_bps) < 1e-6, (a.roundtrip_bps, b.roundtrip_bps)
    assert abs(a.bps_at(88.33) - a.roundtrip_bps) < 1e-9


def test_bad_price_raises():
    raises(
        CostModelError,
        lambda: require_floor(
            as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", reference_price=0
        ),
        "BAD_PRICE",
    )


def test_notional_algebra():
    assert abs(contract_notional_rub(88.33, 783.987) - 69250.5) < 1.0


# --- the cheap rate is never silent ------------------------------------------

def test_scalper_is_not_the_default():
    default = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="NONE")
    scalp = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="NONE", scalper=True)
    assert default.scalper is False
    assert scalp.roundtrip_rub < default.roundtrip_rub
    assert abs(default.roundtrip_rub - 2 * 8.99) < 1e-9, default.roundtrip_rub
    assert any("intraday" in r for r in scalp.lower_bound_reasons)


def test_stress_multiplies():
    base = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR")
    hard = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", stress=True)
    assert abs(hard.roundtrip_rub - 2 * base.roundtrip_rub) < 1e-9


def test_tick_floor_adds_the_spread_term():
    none = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="NONE")
    tick = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR")
    stressed = require_floor(as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR_STRESS")
    assert none.execution_component_rub == 0.0
    assert abs(tick.execution_component_rub - 0.01 * 783.987) < 1e-9
    assert abs(stressed.execution_component_rub - 2 * tick.execution_component_rub) < 1e-9


# --- the floor cannot be quoted bare -----------------------------------------

def test_every_floor_is_labelled_a_lower_bound():
    for instrument in ("BR", "GD", "GLDRUBF"):
        f = require_floor(as_of="2026-08-06", instrument=instrument, execution_basis="TICK_FLOOR")
        assert f.is_lower_bound is True
        assert f.lower_bound_reasons
        assert f.undetermined, "the schedule's undetermined list must travel with the floor"


def test_citation_carries_provenance():
    f = require_floor(
        as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", legs=2, reference_price=88.33
    )
    c = f.citation()
    for token in ("RUB", "2-leg", "non-scalper", "TICK_FLOOR", "MOEX.FORTS.FEE.SCHEDULE", "LOWER BOUND", "params.parquet"):
        assert token in c, f"citation missing {token!r}: {c}"


def test_entry_as_of_picks_latest_effective():
    s = load_schedule(DEFAULT_SCHEDULE_PATH)
    e = entry_as_of(s, "BR", "2026-08-06")
    assert e["instrument"] == "BR"
    assert e["effective_from"] <= "2026-08-06"


# --- the numbers this task will actually quote -------------------------------

def test_br_calendar_spread_reference_figures():
    """Locks the Stage 0 inputs so a later schedule change is visible as a diff."""
    f = require_floor(
        as_of="2026-08-06",
        instrument="BR",
        execution_basis="TICK_FLOOR",
        legs=2,
        reference_price=88.33,
    )
    assert abs(f.fee_component_rub - 35.96) < 0.01, f.fee_component_rub
    assert abs(f.execution_component_rub - 15.68) < 0.01, f.execution_component_rub
    assert abs(f.roundtrip_rub - 51.64) < 0.01, f.roundtrip_rub
    assert abs(f.roundtrip_bps - 7.46) < 0.02, f.roundtrip_bps
    assert f.initial_margin_rub == 16009.16


# --- rev2: broker component, margining rule, exit route ---------------------

REV2 = DEFAULT_SCHEDULE_PATH.parent / "moex_forts_fee_schedule_2026-08-06_rev2.json"


def _rev2(**kw):
    kw.setdefault("as_of", "2026-08-06")
    kw.setdefault("instrument", "BR")
    kw.setdefault("execution_basis", "TICK_FLOOR")
    kw["schedule_path"] = REV2
    return require_floor(**kw)


def test_rev2_broker_component_is_included_and_attributed():
    f = _rev2(legs=2)
    assert abs(f.broker_component_rub - 4 * 0.45) < 1e-9, f.broker_component_rub
    assert f.broker_basis == "OPERATOR_ATTESTED"


def test_rev2_operator_attested_is_flagged_as_weak():
    """An attestation is stronger than hearsay and weaker than a filed document.
    The floor must say so rather than passing it off as published."""
    f = _rev2(legs=2)
    assert any("not a filed tariff document" in r for r in f.lower_bound_reasons), f.lower_bound_reasons
    assert "OPERATOR_ATTESTED" in f.citation()


def test_rev2_polunetto_blocks_the_greater_leg_not_the_sum():
    f = _rev2(legs=2)
    assert f.margining_rule_used == "POLUNETTO"
    assert abs(f.margin_blocked_rub - 16009.16) < 1e-6, f.margin_blocked_rub
    # the sum would be 30455.81; using it would overstate funding by 90%
    assert f.margin_blocked_rub < 14446.65 + 16009.16


def test_rev2_bound_is_declared_as_a_bound():
    """POLUNETTO is applied while NETTO is in force. That must be visible."""
    f = _rev2(legs=2)
    assert f.margining_rule_in_force == "NETTO"
    assert f.margining_rule_basis == "INFERRED_BOUND"
    assert any("overstates the funding cost" in r for r in f.lower_bound_reasons), f.lower_bound_reasons


def test_rev2_netto_refuses_without_its_parameter():
    """The one thing that must never happen: inventing a discount for NETTO."""
    import json as _json

    with tempfile.TemporaryDirectory() as d:
        s = _json.loads(REV2.read_text(encoding="utf-8"))
        s["margining"]["computation_rule_used"] = "NETTO"
        p = Path(d) / "netto.json"
        p.write_text(_json.dumps(s), encoding="utf-8")
        raises(
            CostModelError,
            lambda: require_floor(
                as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", legs=2, schedule_path=p
            ),
            "NETTO_PARAMETER_MISSING",
        )


def test_rev2_exit_route_default_is_trade_out():
    f = _rev2(legs=2)
    assert f.exit_route == "TRADE_OUT"
    assert abs(f.fee_component_rub - 4 * 8.99) < 1e-9


def test_rev2_expiry_settle_is_cheaper_and_must_be_claimed():
    out = _rev2(legs=2, exit_route="TRADE_OUT")
    settle = _rev2(legs=2, exit_route="EXPIRY_SETTLE")
    assert abs(settle.fee_component_rub - (3 * 8.99 + 3.0)) < 1e-9, settle.fee_component_rub
    assert settle.fee_component_rub < out.fee_component_rub
    assert any("surrenders its choice of exit timing" in r for r in settle.lower_bound_reasons)


def test_rev2_broker_is_charged_even_on_the_settled_leg():
    """Whether the broker waives its fee at settlement is unknown, so it is paid."""
    out = _rev2(legs=2, exit_route="TRADE_OUT")
    settle = _rev2(legs=2, exit_route="EXPIRY_SETTLE")
    assert settle.broker_component_rub == out.broker_component_rub


def test_rev2_unknown_exit_route_raises():
    raises(CostModelError, lambda: _rev2(legs=2, exit_route="ROLL_OVER"), "UNKNOWN_EXIT_ROUTE")


def test_expiry_settle_refuses_when_the_schedule_has_no_exercise_fee():
    raises(
        CostModelError,
        lambda: require_floor(
            as_of="2026-08-06", instrument="BR", execution_basis="TICK_FLOOR", legs=2,
            exit_route="EXPIRY_SETTLE", schedule_path=DEFAULT_SCHEDULE_PATH,
        ),
        "NO_EXERCISE_FEE",
    )


def test_rev2_reference_figures():
    """Locks the numbers the TASK-MX-002 verdict is computed from."""
    f = _rev2(legs=2, reference_price=88.33)
    assert abs(f.fee_component_rub - 35.96) < 0.01
    assert abs(f.broker_component_rub - 1.80) < 0.01
    assert abs(f.execution_component_rub - 15.68) < 0.01
    assert abs(f.roundtrip_rub - 53.44) < 0.01, f.roundtrip_rub
    assert abs(f.margin_blocked_rub - 16009.16) < 0.01


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"cost_model self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
