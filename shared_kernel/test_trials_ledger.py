#!/usr/bin/env python3
"""Deterministic self-check for shared_kernel/trials_ledger.py.

    python3 shared_kernel/test_trials_ledger.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared_kernel.trials_ledger import (  # noqa: E402
    CONTOUR_RECORD,
    RETROSPECTIVE_AGGREGATE,
    TRIAL_RECORD,
    LedgerError,
    TrialRecord,
    TrialsLedger,
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


MOEX = "moex.br.calendar_spread.1h"
CRYPTO = "bybit.perp.funding_carry.1h"


def rec(trial_id, **kw):
    base = dict(
        trial_id=trial_id,
        record_type=TRIAL_RECORD,
        search_space=MOEX,
        family="br_calendar_spread",
        task_id="TASK-TEST",
        evidence_path="tasks/results/x.md",
    )
    base.update(kw)
    return TrialRecord(**base)


def ledger():
    d = tempfile.mkdtemp()
    return TrialsLedger(Path(d) / "trials.jsonl")


# --- record validation -------------------------------------------------------

def test_untraceable_record_refused():
    """A record nobody can trace to a task and a report is not evidence."""
    for field in ("trial_id", "search_space", "family", "task_id", "evidence_path"):
        kwargs = {field: "  "}
        trial_id = kwargs.pop("trial_id", "t1")
        raises(
            LedgerError,
            lambda t=trial_id, k=kwargs: rec(t, **k),
            "UNTRACEABLE",
        )


def test_unknown_record_type_refused():
    raises(LedgerError, lambda: rec("t1", record_type="PROBABLY_FINE"), "UNKNOWN_RECORD_TYPE")


def test_bad_pvalue_refused():
    raises(LedgerError, lambda: rec("t1", p_value=1.4), "BAD_PVALUE")


def test_batches_are_only_for_retrospective_records():
    """A live trial is recorded one at a time or its count is a guess."""
    raises(LedgerError, lambda: rec("t1", batch_size=50), "BATCH_ONLY_FOR_RETROSPECTIVE")
    ok = rec("t1", record_type=RETROSPECTIVE_AGGREGATE, batch_size=1046)
    assert ok.multiplicity_weight == 1046


# --- multiplicity budget -----------------------------------------------------

def test_contour_records_consume_no_budget():
    """TASK-MX-001 through -004 measured venue properties with no rule under
    test. Counting them would deflate future real tests against work that
    searched nothing."""
    lg = ledger()
    lg.append(rec("c1", record_type=CONTOUR_RECORD))
    lg.append(rec("c2", record_type=CONTOUR_RECORD))
    assert lg.trial_count(MOEX) == 0
    assert len(lg.read(MOEX)) == 2


def test_trial_records_consume_budget():
    lg = ledger()
    for i in range(5):
        lg.append(rec(f"t{i}"))
    assert lg.trial_count(MOEX) == 5


def test_selection_among_is_preserved_on_contour_records():
    """Stage 0 measured four horizons and named the survivors. That selection is
    real even though no rule was tested, so it has to travel with the record."""
    lg = ledger()
    lg.append(rec("c1", record_type=CONTOUR_RECORD, selection_among=4))
    assert lg.read(MOEX)[0].selection_among == 4
    assert lg.trial_count(MOEX) == 0


def test_search_spaces_do_not_pool_by_default():
    """The decision recorded in the module: a MOEX result is not deflated by
    crypto trials that never searched its space."""
    lg = ledger()
    for i in range(3):
        lg.append(rec(f"m{i}", search_space=MOEX))
    for i in range(1000):
        lg.append(rec(f"c{i}", search_space=CRYPTO))
    assert lg.trial_count(MOEX) == 3
    assert lg.trial_count(CRYPTO) == 1000
    assert lg.trial_count() == 1003, "pooling is reportable, just never automatic"


# --- append-only -------------------------------------------------------------

def test_duplicate_trial_id_refused():
    lg = ledger()
    lg.append(rec("t1"))
    raises(LedgerError, lambda: lg.append(rec("t1")), "DUPLICATE_TRIAL_ID")


def test_records_survive_a_round_trip():
    lg = ledger()
    lg.append(rec("t1", p_value=0.03, sharpe_per_period=0.11, n_obs=500,
                  skew=-0.4, kurtosis=5.1, params={"z": 2.0}))
    back = lg.read()[0]
    assert back.trial_id == "t1" and back.p_value == 0.03
    assert back.params == {"z": 2.0} and back.kurtosis == 5.1


def test_appending_never_rewrites():
    lg = ledger()
    lg.append(rec("t1"))
    first = lg.path.read_text(encoding="utf-8")
    lg.append(rec("t2"))
    assert lg.path.read_text(encoding="utf-8").startswith(first)


def test_corrupt_line_is_reported_not_skipped():
    lg = ledger()
    lg.append(rec("t1"))
    with lg.path.open("a", encoding="utf-8") as fh:
        fh.write("{not json}\n")
    raises(LedgerError, lg.read, "UNREADABLE_LEDGER_LINE")


def test_missing_ledger_reads_empty_not_error():
    assert ledger().read() == []


# --- DSR inputs --------------------------------------------------------------

def test_sharpe_variance_needs_two_trials():
    """Substituting zero would remove the deflation entirely and turn DSR into
    an ordinary Sharpe wearing a stricter name."""
    lg = ledger()
    assert lg.sharpe_variance(MOEX) is None
    lg.append(rec("t1", sharpe_per_period=0.1))
    assert lg.sharpe_variance(MOEX) is None
    lg.append(rec("t2", sharpe_per_period=0.3))
    v = lg.sharpe_variance(MOEX)
    assert abs(v - 0.02) < 1e-12, v


def test_sharpe_variance_ignores_contour_records():
    lg = ledger()
    lg.append(rec("t1", sharpe_per_period=0.1))
    lg.append(rec("t2", sharpe_per_period=0.3))
    lg.append(rec("c1", record_type=CONTOUR_RECORD, sharpe_per_period=99.0))
    assert abs(lg.sharpe_variance(MOEX) - 0.02) < 1e-12


def test_pvalue_family_is_scoped_to_one_space():
    lg = ledger()
    lg.append(rec("m1", p_value=0.01))
    lg.append(rec("m2"))                             # no p-value
    lg.append(rec("c1", search_space=CRYPTO, p_value=0.02))
    fam = lg.pvalue_family(MOEX)
    assert [r.trial_id for r in fam] == ["m1"]


def test_summary_separates_trials_from_contours():
    lg = ledger()
    lg.append(rec("t1"))
    lg.append(rec("c1", record_type=CONTOUR_RECORD))
    lg.append(rec("b1", record_type=RETROSPECTIVE_AGGREGATE, batch_size=1046,
                  search_space=CRYPTO))
    s = lg.summary()
    assert s[MOEX] == {"trials": 1, "contours": 1, "records": 2}
    assert s[CRYPTO]["trials"] == 1046


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"trials_ledger self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
