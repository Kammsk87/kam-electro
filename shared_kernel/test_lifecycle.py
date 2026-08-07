#!/usr/bin/env python3
"""Deterministic self-check for shared_kernel/lifecycle.py. No pytest required.

    python3 shared_kernel/test_lifecycle.py

Every check below corresponds to a way this project, or Botalin before it, has
actually gone wrong or could go wrong.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared_kernel.lifecycle import (  # noqa: E402
    ALLOWED,
    CandidateLifecycle,
    IllegalTransition,
    LifecycleError,
    OperatorGoRequired,
    Route,
    Stage,
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


def new(**kw):
    kw.setdefault("candidate_id", "BR.CAL.FRONT_SECOND")
    kw.setdefault("family", "br_calendar_spread")
    kw.setdefault("model_id", "m1")
    kw.setdefault("reset_ts", "2026-08-07T00:00:00+00:00")
    return CandidateLifecycle(**kw)


def step(c, to, task="TASK-TEST"):
    return c.advance(to, reason="r", evidence="e", task_id=task)


# --- the ladder is a ladder --------------------------------------------------

def test_starts_at_data_health():
    assert new().stage is Stage.DATA_HEALTH


def test_adjacent_transition_works():
    c = new()
    step(c, Stage.DISCOVERY)
    assert c.stage is Stage.DISCOVERY


def test_skipping_rungs_is_refused():
    """The single most dangerous thing a lifecycle can permit."""
    c = new()
    raises(IllegalTransition, lambda: step(c, Stage.PORTFOLIO_FORWARD), "not adjacent")
    raises(IllegalTransition, lambda: step(c, Stage.EXECUTION_REPLAY), "not adjacent")
    assert c.stage is Stage.DATA_HEALTH


def test_backward_transition_is_refused():
    c = new()
    step(c, Stage.DISCOVERY)
    raises(IllegalTransition, lambda: step(c, Stage.DATA_HEALTH), "not adjacent")


def test_end_of_ladder_has_no_successor():
    assert ALLOWED[Stage.PORTFOLIO_FORWARD] == set()


def test_every_stage_has_at_most_one_successor():
    for stage, nxt in ALLOWED.items():
        assert len(nxt) <= 1, (stage, nxt)


# --- transitions must be traceable -------------------------------------------

def test_transition_without_evidence_is_refused():
    c = new()
    raises(
        LifecycleError,
        lambda: c.advance(Stage.DISCOVERY, reason="r", evidence="  ", task_id="T"),
        "UNTRACEABLE",
    )
    raises(
        LifecycleError,
        lambda: c.advance(Stage.DISCOVERY, reason="", evidence="e", task_id="T"),
        "UNTRACEABLE",
    )


def test_history_records_both_ends_and_the_task():
    c = new()
    c.advance(Stage.DISCOVERY, reason="why", evidence="report.md", task_id="TASK-MX-001")
    h = c.history[-1]
    assert (h.from_state, h.to_state, h.task_id) == ("DATA_HEALTH", "DISCOVERY", "TASK-MX-001")
    assert h.kind == "STAGE"


# --- paper and live are not reachable from code ------------------------------

def test_can_enter_paper_is_always_false():
    c = new()
    for s in [Stage.DISCOVERY, Stage.CANDIDATE_PASSPORT, Stage.IDEAL_FILL_AND_OOS, Stage.EXECUTION_REPLAY]:
        step(c, s)
    assert c.stage is Stage.EXECUTION_REPLAY
    assert c.can_enter_paper() is False, "no code path may answer True; a GO is a human act"


def test_paper_observer_requires_operator_go():
    c = new()
    for s in [Stage.DISCOVERY, Stage.CANDIDATE_PASSPORT, Stage.IDEAL_FILL_AND_OOS, Stage.EXECUTION_REPLAY]:
        step(c, s)
    raises(OperatorGoRequired, lambda: step(c, Stage.QUARANTINED_PAPER_OBSERVER), "fresh explicit operator GO")
    c.advance(
        Stage.QUARANTINED_PAPER_OBSERVER,
        reason="r", evidence="e", task_id="T", operator_go_ref="GO-2026-08-07-signed",
    )
    assert c.stage is Stage.QUARANTINED_PAPER_OBSERVER
    assert c.history[-1].operator_go_ref == "GO-2026-08-07-signed"


def test_micro_live_requires_its_own_go():
    """An earlier GO must not carry forward. Botalin: not a standing authorization."""
    c = new()
    for s in [Stage.DISCOVERY, Stage.CANDIDATE_PASSPORT, Stage.IDEAL_FILL_AND_OOS, Stage.EXECUTION_REPLAY]:
        step(c, s)
    c.advance(Stage.QUARANTINED_PAPER_OBSERVER, reason="r", evidence="e", task_id="T", operator_go_ref="GO-1")
    raises(OperatorGoRequired, lambda: step(c, Stage.MICRO_LIVE_MECHANICS))


# --- failure routes ----------------------------------------------------------

def test_data_request_is_not_terminal():
    """TASK-MX-001 took this route and TASK-MX-002 followed. It must remain legal."""
    c = new()
    c.route_to(Route.DATA_REQUEST, reason="two cost inputs unmeasured", evidence="RESULT.md", task_id="TASK-MX-001")
    assert c.is_closed and c.can_resume


def test_closed_candidate_cannot_advance():
    c = new()
    c.route_to(Route.DATA_REQUEST, reason="r", evidence="e", task_id="T")
    raises(IllegalTransition, lambda: step(c, Stage.DISCOVERY), "closed on route")


def test_resume_produces_a_new_identity_not_a_repair():
    c = new()
    c.route_to(Route.DATA_REQUEST, reason="r", evidence="e", task_id="TASK-MX-001")
    child = c.structural_variant(
        new_model_id="m2", structural_difference="broker fee and margin rule now measured", task_id="TASK-MX-002"
    )
    assert child.model_id == "m2" and child.parent_model_id == "m1"
    assert child is not c and c.model_id == "m1", "the parent must not be mutated"
    assert child.route is None and not child.is_closed


def test_variant_without_a_recorded_difference_is_a_retry():
    c = new()
    c.route_to(Route.GUARD_ONLY, reason="r", evidence="e", task_id="T")
    raises(
        LifecycleError,
        lambda: c.structural_variant(new_model_id="m2", structural_difference="   ", task_id="T"),
        "STRUCTURAL_DIFFERENCE_REQUIRED",
    )


def test_variant_must_change_the_model_id():
    c = new()
    c.route_to(Route.GUARD_ONLY, reason="r", evidence="e", task_id="T")
    raises(
        LifecycleError,
        lambda: c.structural_variant(new_model_id="m1", structural_difference="d", task_id="T"),
        "MODEL_ID_UNCHANGED",
    )


def test_quarantine_and_rejected_family_are_terminal():
    for route in (Route.QUARANTINE, Route.REJECTED_FAMILY):
        c = new()
        c.route_to(route, reason="holdout spent", evidence="ledger.json", task_id="T")
        assert c.is_closed and not c.can_resume
        raises(
            IllegalTransition,
            lambda cc=c: cc.structural_variant(new_model_id="m2", structural_difference="d", task_id="T"),
            "terminal",
        )


def test_cannot_route_twice():
    c = new()
    c.route_to(Route.DATA_REQUEST, reason="r", evidence="e", task_id="T")
    raises(IllegalTransition, lambda: c.route_to(Route.QUARANTINE, reason="r", evidence="e", task_id="T"))


def test_route_requires_evidence():
    c = new()
    raises(LifecycleError, lambda: c.route_to(Route.DATA_REQUEST, reason="r", evidence="", task_id="T"), "UNTRACEABLE")


# --- persistence -------------------------------------------------------------

def test_round_trips_through_disk():
    c = new()
    step(c, Stage.DISCOVERY)
    c.route_to(Route.DATA_REQUEST, reason="r", evidence="e", task_id="T")
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "c.json"
        c.save(p)
        back = CandidateLifecycle.load(p)
    assert back.stage is Stage.DISCOVERY
    assert back.route is Route.DATA_REQUEST
    assert len(back.history) == 2
    assert back.history[0].to_state == "DISCOVERY"


# --- the machine can represent the work actually done ------------------------

def test_replays_the_real_mx_history():
    """MX-001 -> DATA_REQUEST -> MX-002 -> MX-003. If the machine cannot express
    this, it is the wrong machine."""
    mx1 = new(model_id="br_cal_v0")
    mx1.route_to(
        Route.DATA_REQUEST,
        reason="broker tariff and spread margin discount both unmeasured",
        evidence="tasks/results/TASK-MX-001-...-RESULT.md",
        task_id="TASK-MX-001",
    )
    mx2 = mx1.structural_variant(
        new_model_id="br_cal_v1",
        structural_difference="broker component and NCC margining rule now in the cost model",
        task_id="TASK-MX-002",
    )
    assert mx2.stage is Stage.DATA_HEALTH and not mx2.is_closed
    mx2.route_to(
        Route.DATA_REQUEST,
        reason="bid-ask spread unmeasured; ISS gives no depth",
        evidence="data/reports/mx003_phase0_quote_source_probe_20260807.md",
        task_id="TASK-MX-003",
    )
    assert mx2.can_resume


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"lifecycle self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
