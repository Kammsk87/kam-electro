# TASK-MX-006 Result — Brent Calendar Spread, First Frozen MOEX Rule

Date: 2026-08-08
Evidence: `data/reports/mx006_calendar_spread_20260808.json`
Lifecycle record: `data/lifecycle/br_calendar_zscore_v0.json`

## Lifecycle footer

- Entered `CANDIDATE_PASSPORT`, advanced to `IDEAL_FILL_AND_OOS`, **left on route
  `QUARANTINE`**.
- Evidence gate: **FAILED at ideal fill**. The pre-registered kill condition
  fired.
- `model_id` `br_calendar_zscore_v0` is closed. It is terminal: a return requires
  a new task ID, a recorded structural difference, a new model identity, and
  confirmation on data generated after this failure.
- Multiplicity: **2 `TRIAL_RECORD`s**, the first ever written to
  `moex.br.calendar_spread.1h`.
- `check_paper_gate.py` returns `blocked`, now reporting *«all 1 candidate
  identities are closed on a failure route»*.

## Verdict

The rule does not work, and it fails for the plainest possible reason: **its
signal is indistinguishable from its own null.**

| | 3d timeout | 5d timeout |
|---|---:|---:|
| trades | 197 | 185 |
| **gross mean per trade** | **+36.41 ₽** | **+36.11 ₽** |
| t-statistic on gross | +0.63 | +0.60 |
| matched-null p | 0.138 | 0.158 |
| BH-adjusted q | 0.158 | 0.158 |
| win rate | 62% | 62% |
| DSR | **0.273** | **0.264** |
| net mean, tick floor | −31.17 ₽ | −33.99 ₽ |
| net mean, tick-floor stress | −46.85 ₽ | −49.67 ₽ |
| net total | −6,141 ₽ | −6,288 ₽ |

Against the thresholds frozen in `TASK-SK-002` before any of these numbers
existed: BH q of 0.158 exceeds 0.10, and a DSR of 0.27 is nowhere near 0.95.
Both timeouts fail both gates.

## The arithmetic that settles it

The gross edge is **+36.41 ₽ per trade**. The round-trip cost floor frozen in
`TASK-MX-002` is **53.44 ₽**.

Even if the edge were real — and at t = 0.63 it is not — it would not reach the
cost of harvesting it. There is no execution improvement, no better fill model
and no venue discount that closes a 17-rouble gap, because the gap is measured
*before* any of that is applied.

## Why Stage 0 passed and this failed, which is not a contradiction

Stage 0 measured that the **median 3-day move of the spread** is 133 ₽ against an
all-in cost of 85 ₽. That is a statement about how far the spread travels.

This task asked a different question: whether a z-score of ±2 **tells you which
way it will travel**. It does not. The dispersion Stage 0 found is real and is
still there; this rule simply does not capture it. Stage 0 was never evidence of
edge and said so in its own result — «a contour that clears its cost floor at the
median has earned a protocol, not a position». That is exactly what happened.

## What the attacks showed

- **t on gross, not on net.** The gross t is +0.63. The net t is −0.82 and is
  reported only under the key `t_stat_net_DO_NOT_QUOTE`: a t-statistic on a mean
  carrying a constant cost tests whether the cost differs from zero.
- **Matched null**, 1,000 seeded draws, random entries with the same count and
  the same holding distribution — so the null keeps everything except the rule's
  timing. Null mean +1.06 ₽ against the observed +36.41 ₽, p = 0.138.
- **Purge and embargo** split 197 trades into 92 train and 93 test with a
  timeout-sized embargo, dropping none. Train net mean **+18.06 ₽**, test net
  mean **−116.68 ₽**. The better half was the earlier half.
- **Remove-best-day** moves the 5d net mean from −33.99 to −60.48. A single day
  carried a quarter of the result.
- **Remove-regime**: dropping backwardation leaves −59.81, dropping contango
  leaves −48.37. 164 of 185 trades were in backwardation, so the rule was mostly
  trading one regime.
- **Return distribution**: skew −4.15, raw kurtosis 28.8. A 62% win rate with a
  left tail that heavy is the classic payoff trap — many small wins, a few
  destroying losses.

## The route, and why it is QUARANTINE

The pipeline protocol allows five routes and forbids sending a failure back for
tuning. This is not `DATA_REQUEST` — 10,613 spread bars and 197 trades are not a
coverage problem. It is not `GUARD_ONLY` — the rule suppresses nothing useful. It
is not `REJECTED_FAMILY` — calendar-spread mean reversion as a mechanism is not
disproven by one parameterisation of one z-score rule, and MX-004 measured a real
half-life of 31 to 89 bars.

`QUARANTINE` closes **this model identity**. Anything further requires a recorded
structural difference and a new identity. What it explicitly does not license is
re-running the same rule with a different z-threshold, window or timeout until
something passes; the 72-bar window and the ±2.0 threshold were pre-declared, and
a search over their neighbours is a search, which the ledger would now count.

## The one genuinely good number

**Multiplicity in this space is 2.** Not 390, not 3,762. The rule was frozen in a
task card before any result existed, two pre-declared variants were run, and both
were recorded. That is what preregistration buys: when the answer had been a pass,
it would have been deflated against a search of size two rather than against a
grid nobody counted.

It was not a pass. But the machinery worked exactly as it was built to.

## What this result cannot conclude

- Nothing about executability. The bid-ask spread is still unmeasured and the
  Track A cohort has zero valid days.
- Hourly bars remain a `BAR_RESOLUTION_PROXY`; Stage 2 was never in reach.
- The DSR rests on a variance of Sharpe across **two** trials. With n = 2 that
  input is fragile, and the DSR would be a weak statistic here even had the
  Sharpe been positive. It is reported with that caveat rather than omitted.

## Deliverables

1. `src/moex_futures_bot/strategies/brent_calendar_spread.py`
2. `tools/run_mx006_calendar_spread.py`
3. `data/reports/mx006_calendar_spread_20260808.json`
4. `data/lifecycle/br_calendar_zscore_v0.json`
5. Two `TRIAL_RECORD`s in `data/trials_ledger.jsonl`
6. This report.
