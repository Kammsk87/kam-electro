#!/usr/bin/env python3
"""Deterministic self-check for shared_kernel/p_value_deflation.py.

    python3 shared_kernel/test_p_value_deflation.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared_kernel.p_value_deflation import (  # noqa: E402
    DeflationError,
    benjamini_hochberg,
    deflated_sharpe_ratio,
    expected_max_sharpe,
    holm_bonferroni,
    norm_cdf,
    norm_ppf,
    purge_and_embargo,
    sharpe_moments,
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


def close(a, b, tol=1e-6):
    assert abs(a - b) < tol, f"{a} != {b} within {tol}"


# --- normal distribution -----------------------------------------------------

def test_norm_cdf_known_values():
    close(norm_cdf(0.0), 0.5)
    close(norm_cdf(1.959963985), 0.975, 1e-7)
    close(norm_cdf(-1.959963985), 0.025, 1e-7)


def test_norm_ppf_inverts_cdf():
    for p in (0.001, 0.01, 0.25, 0.5, 0.75, 0.99, 0.999):
        close(norm_cdf(norm_ppf(p)), p, 1e-9)


def test_norm_ppf_domain():
    for bad in (0.0, 1.0, -0.1, 1.5):
        raises(DeflationError, lambda b=bad: norm_ppf(b), "DOMAIN")


# --- family-wise corrections -------------------------------------------------

def test_holm_matches_worked_example():
    """R: p.adjust(c(.01,.02,.03,.04), method='holm')"""
    got = holm_bonferroni([0.01, 0.02, 0.03, 0.04])
    for a, b in zip(got, [0.04, 0.06, 0.06, 0.06]):
        close(a, b, 1e-9)


def test_bh_matches_worked_example():
    """R: p.adjust(c(.01,.02,.03,.04), method='BH')"""
    got = benjamini_hochberg([0.01, 0.02, 0.03, 0.04])
    for a, b in zip(got, [0.04, 0.04, 0.04, 0.04]):
        close(a, b, 1e-9)


def test_bh_is_never_more_conservative_than_holm():
    ps = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216]
    for h, b in zip(holm_bonferroni(ps), benjamini_hochberg(ps)):
        assert b <= h + 1e-12, (b, h)


def test_adjusted_pvalues_keep_input_order():
    got = benjamini_hochberg([0.04, 0.01, 0.03, 0.02])
    assert len(got) == 4 and all(0 <= v <= 1 for v in got)
    # the smallest raw p must not receive the largest adjustment
    assert got[1] <= got[0]


def test_corrections_are_monotone():
    ps = [0.001, 0.01, 0.02, 0.5, 0.9]
    for fn in (holm_bonferroni, benjamini_hochberg):
        adj = fn(ps)
        assert adj == sorted(adj), f"{fn.__name__} not monotone: {adj}"


def test_390_screening_passes_mostly_evaporate():
    """The concrete motivation: 390 'passes' at p<0.05 out of 1440 rows is close
    to what pure noise produces, and BH should say so."""
    ps = [0.04] * 390 + [0.5] * 1050
    adj = benjamini_hochberg(ps)
    assert adj[0] > 0.10, f"BH-adjusted p of a marginal member of a 1440-family: {adj[0]}"


def test_empty_and_bad_families_refused():
    raises(DeflationError, lambda: holm_bonferroni([]), "NO_PVALUES")
    raises(DeflationError, lambda: benjamini_hochberg([0.5, 1.5]), "BAD_PVALUE")
    raises(DeflationError, lambda: benjamini_hochberg([0.5, float("nan")]), "BAD_PVALUE")


# --- expected max Sharpe -----------------------------------------------------

def test_single_trial_needs_no_deflation():
    assert expected_max_sharpe(1, 0.25) == 0.0


def test_expected_max_grows_with_trials():
    a = expected_max_sharpe(10, 0.04)
    b = expected_max_sharpe(1000, 0.04)
    assert 0 < a < b, (a, b)


def test_expected_max_scales_with_dispersion():
    a = expected_max_sharpe(100, 0.01)
    b = expected_max_sharpe(100, 0.04)
    close(b / a, 2.0, 1e-9)   # sd doubles


# --- DSR ---------------------------------------------------------------------

def dsr(**kw):
    base = dict(sharpe_per_period=0.10, n_trials=100, var_sr_across_trials=0.01,
                skew=0.0, kurtosis=3.0, n_obs=1000)
    base.update(kw)
    return deflated_sharpe_ratio(**base)


def test_dsr_is_a_probability():
    r = dsr()
    assert 0.0 <= r.dsr <= 1.0


def test_more_trials_lower_the_dsr():
    """The entire purpose of the statistic."""
    few = dsr(n_trials=2).dsr
    many = dsr(n_trials=5000).dsr
    assert many < few, (many, few)


def test_dsr_falls_below_half_when_sharpe_is_the_expected_max():
    sr0 = expected_max_sharpe(500, 0.01)
    r = dsr(sharpe_per_period=sr0, n_trials=500)
    close(r.dsr, 0.5, 1e-6)


def test_negative_skew_and_fat_tails_lower_the_dsr():
    """Only where the Sharpe actually beats the expected maximum.

    The moments enter through the denominator, so they shrink whatever the
    numerator is. When SR sits BELOW E[max SR] the numerator is negative and fat
    tails push the DSR up — a real property of the statistic, not a bug, and the
    reason this test pins a regime rather than a blanket claim.
    """
    normal = dsr(n_trials=2, skew=0.0, kurtosis=3.0)
    ugly = dsr(n_trials=2, skew=-1.5, kurtosis=9.0)
    assert normal.sharpe_per_period > normal.expected_max_sharpe, "premise: SR beats the null"
    assert ugly.dsr < normal.dsr, (ugly.dsr, normal.dsr)


def test_fat_tails_raise_the_dsr_when_the_sharpe_is_already_losing():
    """The mirror image, asserted so nobody 'fixes' the behaviour above into a
    blanket rule and breaks the mathematics."""
    normal = dsr(n_trials=5000, skew=0.0, kurtosis=3.0)
    ugly = dsr(n_trials=5000, skew=-1.5, kurtosis=9.0)
    assert normal.sharpe_per_period < normal.expected_max_sharpe
    assert ugly.dsr > normal.dsr


def test_every_missing_input_raises():
    for field in ("var_sr_across_trials", "skew", "kurtosis", "n_obs"):
        raises(DeflationError, lambda f=field: dsr(**{f: None}), "DSR_INPUT_MISSING")


def test_excess_kurtosis_is_rejected():
    """A normal series has raw kurtosis 3 and excess kurtosis 0. Passing the
    excess form silently inflates DSR, so zero is refused outright."""
    raises(DeflationError, lambda: dsr(kurtosis=0.0), "RAW kurtosis")


def test_dsr_result_carries_its_derivation():
    c = dsr().citation()
    for token in ("DSR", "E[max SR]", "trials", "kurtosis"):
        assert token in c, c


# --- moments -----------------------------------------------------------------

def test_moments_of_a_normal_ish_series():
    xs = [norm_ppf((i + 0.5) / 1000) for i in range(1000)]
    m = sharpe_moments(xs)
    close(m["skew"], 0.0, 1e-6)
    assert 2.5 < m["kurtosis"] < 3.2, m["kurtosis"]


def test_moments_refuse_degenerate_input():
    raises(DeflationError, lambda: sharpe_moments([0.1, 0.2]), "TOO_FEW_OBSERVATIONS")
    raises(DeflationError, lambda: sharpe_moments([0.1] * 10), "ZERO_VARIANCE")


def test_kurtosis_is_raw_not_excess():
    xs = [norm_ppf((i + 0.5) / 2000) for i in range(2000)]
    assert sharpe_moments(xs)["kurtosis"] > 2.0, "raw kurtosis of a normal series is ~3, not ~0"


# --- purge and embargo -------------------------------------------------------

def test_overlapping_labels_are_purged():
    """An observation opened before the test window whose label reaches into it
    leaks the test set into training; one whose label ends before it does not."""
    starts = [0, 1, 2, 3, 10, 20, 30]
    ends = [5, 6, 7, 8, 15, 25, 35]
    train, test = purge_and_embargo(starts, ends, test_start=6, test_end=12)
    assert test == [4]                              # only the event starting at 10
    assert 0 in train, "label [0,5] ends before the window opens at 6 - nothing leaks"
    for i in (1, 2, 3):
        assert i not in train, f"label {[starts[i], ends[i]]} reaches into [6,12]"
    assert 5 in train and 6 in train                # entirely after the window


def test_embargo_drops_the_period_after_the_test_set():
    starts = [0, 100, 101, 110, 130]
    ends = [1, 101, 102, 111, 131]
    train, test = purge_and_embargo(starts, ends, test_start=99, test_end=102, embargo=25)
    assert test == [1, 2]
    assert 3 not in train, "starts at 110, inside the embargo window (102, 127]"
    assert 4 in train, "starts at 130, past the embargo - serial correlation has decayed"
    train2, _ = purge_and_embargo(starts, ends, test_start=99, test_end=102, embargo=0)
    assert 3 in train2, "with no embargo the nearby event returns to training"


def test_no_leakage_between_train_and_test():
    starts = list(range(0, 100, 5))
    ends = [s + 7 for s in starts]
    train, test = purge_and_embargo(starts, ends, 40, 60, embargo=5)
    assert not (set(train) & set(test))
    for i in train:
        s, e = starts[i], ends[i]
        assert e < 40 or s > 60, f"index {i} label [{s},{e}] overlaps the test window"


def test_purge_validates_its_inputs():
    raises(DeflationError, lambda: purge_and_embargo([0], [1, 2], 0, 1), "LENGTH_MISMATCH")
    raises(DeflationError, lambda: purge_and_embargo([0], [1], 5, 1), "BAD_TEST_WINDOW")
    raises(DeflationError, lambda: purge_and_embargo([5], [1], 0, 1), "BAD_EVENT")
    raises(DeflationError, lambda: purge_and_embargo([0], [1], 0, 1, embargo=-1), "BAD_EMBARGO")


def main():
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in tests:
        check(name, fn)
    print(f"p_value_deflation self-check: {PASSED} passed, {len(FAILED)} failed, {len(tests)} total")
    for name, why in FAILED:
        print(f"  FAIL {name}: {why}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
