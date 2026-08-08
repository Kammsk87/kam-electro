"""Shared kernel — multiplicity correction and the Deflated Sharpe Ratio.

Why this module exists: a MOEX autopilot run declared 390 screening passes with
no correction of any kind, while Botalin carries 1,066 documented prior trials
against which no MOEX result has ever been deflated.

**Three tools, and they are not interchangeable.** The most common way to misuse
them is to blend them into a single "corrected p", so this module refuses to
produce one.

* `holm_bonferroni` controls the family-wise error rate across a family of
  hypotheses each carrying its own p-value. Use when you want to assert that
  *any* rejection is real.
* `benjamini_hochberg` controls the false discovery rate across the same kind of
  family. Use when you can tolerate a known share of false positives among the
  rejections. Less brutal than Holm, and the right default for screening.
* `deflated_sharpe_ratio` corrects a *single* Sharpe ratio for the fact that it
  was selected as the best of N attempts. It answers a different question from
  either of the above and cannot be substituted for them.

The autopilot's 390 passes are a selection problem, so DSR is primary there and
BH-FDR is the secondary view.

Pure Python: no numpy, no scipy. The kernel must import in any environment,
including the MOEX venv, which has neither.

Safety: pure computation. No network, filesystem, credential or order path.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

__all__ = [
    "DeflationError",
    "norm_cdf",
    "norm_ppf",
    "holm_bonferroni",
    "benjamini_hochberg",
    "expected_max_sharpe",
    "deflated_sharpe_ratio",
    "DSRResult",
    "purge_and_embargo",
    "sharpe_moments",
]

EULER_MASCHERONI = 0.5772156649015329


class DeflationError(Exception):
    """A refusal. Never caught internally to return a default."""


# ---------------------------------------------------------------------------
# normal distribution, without scipy
# ---------------------------------------------------------------------------

def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


# Acklam's rational approximation, refined by one Halley step. Accurate to
# roughly 1e-15 over the usable range, which is far more than the inputs deserve.
_A = (-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00)
_B = (-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01)
_C = (-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00)
_D = (7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00)
_P_LOW = 0.02425


def norm_ppf(p: float) -> float:
    """Inverse standard normal CDF."""
    if not (0.0 < p < 1.0):
        raise DeflationError(f"NORM_PPF_DOMAIN: p must be strictly inside (0,1), got {p!r}")
    if p < _P_LOW:
        q = math.sqrt(-2.0 * math.log(p))
        x = (((((_C[0] * q + _C[1]) * q + _C[2]) * q + _C[3]) * q + _C[4]) * q + _C[5]) / \
            ((((_D[0] * q + _D[1]) * q + _D[2]) * q + _D[3]) * q + 1.0)
    elif p <= 1.0 - _P_LOW:
        q = p - 0.5
        r = q * q
        x = (((((_A[0] * r + _A[1]) * r + _A[2]) * r + _A[3]) * r + _A[4]) * r + _A[5]) * q / \
            (((((_B[0] * r + _B[1]) * r + _B[2]) * r + _B[3]) * r + _B[4]) * r + 1.0)
    else:
        q = math.sqrt(-2.0 * math.log(1.0 - p))
        x = -(((((_C[0] * q + _C[1]) * q + _C[2]) * q + _C[3]) * q + _C[4]) * q + _C[5]) / \
            ((((_D[0] * q + _D[1]) * q + _D[2]) * q + _D[3]) * q + 1.0)
    # one Halley refinement
    e = norm_cdf(x) - p
    u = e * math.sqrt(2.0 * math.pi) * math.exp(x * x / 2.0)
    return x - u / (1.0 + x * u / 2.0)


# ---------------------------------------------------------------------------
# family-wise corrections
# ---------------------------------------------------------------------------

def _validate_pvalues(pvalues: Sequence[float]) -> List[float]:
    if not pvalues:
        raise DeflationError("NO_PVALUES: an empty family has no correction")
    out = []
    for p in pvalues:
        if not isinstance(p, (int, float)) or math.isnan(p) or not (0.0 <= p <= 1.0):
            raise DeflationError(f"BAD_PVALUE: {p!r}")
        out.append(float(p))
    return out


def holm_bonferroni(pvalues: Sequence[float]) -> List[float]:
    """Holm-adjusted p-values, in the input order. Controls family-wise error."""
    p = _validate_pvalues(pvalues)
    n = len(p)
    order = sorted(range(n), key=lambda i: p[i])
    adjusted = [0.0] * n
    running = 0.0
    for rank, idx in enumerate(order):
        value = (n - rank) * p[idx]
        running = max(running, value)          # enforce monotonicity
        adjusted[idx] = min(1.0, running)
    return adjusted


def benjamini_hochberg(pvalues: Sequence[float]) -> List[float]:
    """BH-adjusted p-values (q-values), in the input order. Controls FDR."""
    p = _validate_pvalues(pvalues)
    n = len(p)
    order = sorted(range(n), key=lambda i: p[i], reverse=True)
    adjusted = [0.0] * n
    running = 1.0
    for pos, idx in enumerate(order):
        rank = n - pos                          # descending, so rank counts down
        value = p[idx] * n / rank
        running = min(running, value)           # enforce monotonicity
        adjusted[idx] = min(1.0, running)
    return adjusted


# ---------------------------------------------------------------------------
# Deflated Sharpe Ratio
# ---------------------------------------------------------------------------

def sharpe_moments(returns: Sequence[float]) -> Dict[str, float]:
    """Non-annualised Sharpe and the higher moments DSR needs.

    Kurtosis is returned RAW, not excess: a normal distribution gives 3.0. The
    DSR formula expects the raw form and passing excess kurtosis silently
    inflates the result.
    """
    n = len(returns)
    if n < 4:
        raise DeflationError(f"TOO_FEW_OBSERVATIONS: {n}; higher moments are meaningless")
    mean = sum(returns) / n
    m2 = sum((r - mean) ** 2 for r in returns) / n
    # Not `m2 <= 0`. A constant series like [0.1]*10 leaves a residual variance of
    # about 1e-34 from floating-point representation, which sails past a
    # zero-check and yields a Sharpe of roughly 1e17. The guard has to be
    # relative to the scale of the data.
    scale = max(abs(mean), max(abs(r) for r in returns), 1e-300)
    if m2 <= (scale * 1e-12) ** 2:
        raise DeflationError(
            "ZERO_VARIANCE: the return series is constant to within floating-point "
            "precision and has no Sharpe"
        )
    sd = math.sqrt(m2)
    m3 = sum((r - mean) ** 3 for r in returns) / n
    m4 = sum((r - mean) ** 4 for r in returns) / n
    return {
        "n_obs": n,
        "mean": mean,
        "sd": sd,
        "sharpe_per_period": mean / sd,
        "skew": m3 / (sd ** 3),
        "kurtosis": m4 / (sd ** 4),   # raw: normal == 3.0
    }


def expected_max_sharpe(n_trials: int, var_sr_across_trials: float) -> float:
    """Expected maximum Sharpe under the null that no trial has skill.

    This is the whole point of DSR: with enough attempts, a headline Sharpe
    arises from the search alone.
    """
    if n_trials < 1:
        raise DeflationError(f"BAD_N_TRIALS: {n_trials}")
    if var_sr_across_trials < 0:
        raise DeflationError(f"BAD_VAR_SR: {var_sr_across_trials}")
    if n_trials == 1:
        return 0.0
    sd = math.sqrt(var_sr_across_trials)
    g = EULER_MASCHERONI
    return sd * ((1.0 - g) * norm_ppf(1.0 - 1.0 / n_trials)
                 + g * norm_ppf(1.0 - 1.0 / (n_trials * math.e)))


@dataclass(frozen=True)
class DSRResult:
    dsr: float
    sharpe_per_period: float
    expected_max_sharpe: float
    n_trials: int
    n_obs: int
    skew: float
    kurtosis: float
    var_sr_across_trials: float

    def citation(self) -> str:
        return (
            f"DSR {self.dsr:.4f} for SR {self.sharpe_per_period:.4f}/period against "
            f"E[max SR] {self.expected_max_sharpe:.4f} from {self.n_trials} trials "
            f"(var across trials {self.var_sr_across_trials:.6g}), "
            f"T={self.n_obs}, skew {self.skew:.3f}, kurtosis {self.kurtosis:.3f}"
        )


def deflated_sharpe_ratio(
    *,
    sharpe_per_period: float,
    n_trials: int,
    var_sr_across_trials: Optional[float],
    skew: Optional[float],
    kurtosis: Optional[float],
    n_obs: Optional[int],
) -> DSRResult:
    """Bailey & Lopez de Prado's Deflated Sharpe Ratio.

    Every argument is keyword-only and mandatory. A missing input **raises**
    rather than defaulting, because each plausible default flatters the result:
    zero variance across trials removes the deflation, zero skew and a kurtosis
    of 3 assume normality that financial returns do not have, and a guessed T
    scales the whole statistic.

    `sharpe_per_period` must be in the SAME periodicity as `n_obs` — the
    non-annualised figure. Passing an annualised Sharpe with T in periods is the
    standard way to get a wrong DSR that looks plausible.
    """
    for name, value in (
        ("var_sr_across_trials", var_sr_across_trials),
        ("skew", skew),
        ("kurtosis", kurtosis),
        ("n_obs", n_obs),
    ):
        if value is None:
            raise DeflationError(
                f"DSR_INPUT_MISSING: {name}. Every default for it flatters the result, "
                "so there is none. Retain the return series or report DSR_UNAVAILABLE."
            )
    if n_obs < 2:
        raise DeflationError(f"DSR_TOO_FEW_OBSERVATIONS: {n_obs}")
    if kurtosis <= 0:
        raise DeflationError(
            f"DSR_BAD_KURTOSIS: {kurtosis}. This formula takes RAW kurtosis "
            "(normal == 3.0), not excess kurtosis."
        )

    sr0 = expected_max_sharpe(n_trials, var_sr_across_trials)
    denom_sq = 1.0 - skew * sharpe_per_period + ((kurtosis - 1.0) / 4.0) * sharpe_per_period ** 2
    if denom_sq <= 0:
        raise DeflationError(
            "DSR_DEGENERATE_VARIANCE: the estimated variance of the Sharpe estimator is "
            "non-positive for these moments; the statistic is not defined here"
        )
    z = (sharpe_per_period - sr0) * math.sqrt(n_obs - 1) / math.sqrt(denom_sq)
    return DSRResult(
        dsr=norm_cdf(z),
        sharpe_per_period=sharpe_per_period,
        expected_max_sharpe=sr0,
        n_trials=n_trials,
        n_obs=n_obs,
        skew=skew,
        kurtosis=kurtosis,
        var_sr_across_trials=var_sr_across_trials,
    )


# ---------------------------------------------------------------------------
# purge and embargo
# ---------------------------------------------------------------------------

def purge_and_embargo(
    event_starts: Sequence[float],
    event_ends: Sequence[float],
    test_start: float,
    test_end: float,
    embargo: float = 0.0,
) -> Tuple[List[int], List[int]]:
    """Split indices into (train, test) with overlapping labels purged.

    Overlapping trades are not independent observations. A 5-day holding period
    means an observation opened on day 1 still carries information about day 5,
    so a naive chronological split leaks the test set into the training set
    through the label window.

    Purge: drop any training observation whose label window `[start, end]`
    overlaps the test window at all.
    Embargo: additionally drop training observations starting within `embargo`
    after the test window ends, where serial correlation persists.

    Times are floats — timestamps, bar indices, anything monotone and consistent.
    """
    if len(event_starts) != len(event_ends):
        raise DeflationError("PURGE_LENGTH_MISMATCH: starts and ends must align")
    if test_end < test_start:
        raise DeflationError("PURGE_BAD_TEST_WINDOW: test_end precedes test_start")
    if embargo < 0:
        raise DeflationError(f"PURGE_BAD_EMBARGO: {embargo}")

    train: List[int] = []
    test: List[int] = []
    for i, (s, e) in enumerate(zip(event_starts, event_ends)):
        if e < s:
            raise DeflationError(f"PURGE_BAD_EVENT at {i}: end precedes start")
        if test_start <= s <= test_end:
            test.append(i)
            continue
        overlaps = not (e < test_start or s > test_end)
        embargoed = test_end < s <= test_end + embargo
        if overlaps or embargoed:
            continue                      # purged
        train.append(i)
    return train, test
