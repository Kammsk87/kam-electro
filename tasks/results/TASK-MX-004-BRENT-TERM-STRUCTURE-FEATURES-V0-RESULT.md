# TASK-MX-004 Result — Brent Term Structure And Carry Features

Date: 2026-08-08
Deliverables: `src/moex_futures_bot/features/term_structure.py`,
`tools/test_term_structure.py`

## Lifecycle footer

- Entered `DISCOVERY`, left `DISCOVERY`. No rule frozen, no candidate created.
- Evidence gate: none applicable. This task produces features and tests no
  hypothesis.
- Multiplicity: `CONTOUR_RECORD`. No signal tested, no parameter selected, no
  feature chosen over another.
- Self-check 21/21. Cost model 33/33 and lifecycle 21/21 still pass.
- `check_paper_gate.py` returns `blocked`.

## Coverage

Built from 104,817 hourly BR bars, 2021-09 to 2026-07.

| | front/second | second/third |
|---|---:|---:|
| spread bars emitted | 16,804 | 15,761 |
| bars in 2024+ | 10,613 | 9,989 |
| distinct pairs 2024+ | 28 | 28 |
| slots dropped, one leg silent | 1,591 (8.7%) | 2,470 (13.6%) |
| slots dropped, no pair that day | 43 | 207 |
| other-asset bars skipped | 16,171 | 16,171 |

The 28 distinct pairs match the daily live universe exactly, which is the check
that the series is one continuous front/second spread rather than a mixture.

Non-null z-score coverage after excluding roll-spanning windows: 94% at 24 bars,
81% at 72, 69% at 120.

## Two defects found in this task's own code, by reading the output

Both were invisible to the tests as first written and were caught by comparing
the module's summary against an independent count.

**1. The pair was decided inside the hour instead of by the day.** Legs were
ranked among the contracts that printed in each hourly slot. In any hour the
front did not trade, leg 2 was promoted to leg 1 and the module emitted a
second/third spread **labelled front/second**. Detected because the run reported
50 distinct front/second pairs over 2024+ where the daily live universe has 28.

Fixed: the pair is fixed per calendar day from the live universe, and the slot
must contain those two specific contracts. Distinct pairs fell to 28, matching.
As a side effect the z-score coverage improved — 94% against 87% at the 24-bar
window — because the spurious pair changes were creating spurious rolls.

**2. A defect counter was counting something that is not a defect.**
`dropped_unparseable: 16,171` was alarming until inspection showed it was
GLDRUBF and GDU6, gold contracts sharing the candles directory. They are a
different asset, not a malformed BR code. Renamed to `skipped_other_asset`; the
malformed-code counter now reads 0, which is the true figure.

A third, smaller correction: the OU fit returned a large finite half-life on a
pure trend, where beta tends to zero and the estimator to infinity. A half-life
longer than the sample it was fitted on is not a measurement, so it now returns
None.

## Feature values, reported without interpretation

Stated because they were computed, not because any of them looks promising.
Selecting among features after seeing how they behave is selection, and it
belongs to a later stage with a preregistration.

| | front/second | second/third |
|---|---|---|
| OU half-life, contango | 31.1 bars, 13 regimes | 2.9 bars, 16 regimes |
| OU half-life, backwardation | 88.6 bars, 28 regimes | 21.6 bars, 27 regimes |
| annualised roll yield, p10 / median / p90 | −0.58% / **+8.47%** / +34.30% | −4.79% / +4.59% / +18.38% |
| share of bars with abs(z) > 2, 72-bar window | 15.9% | 8.8% |

Two facts a later task must take account of rather than rediscover:

- The half-life differs by roughly a factor of three between curve regimes on the
  front pair. `TASK-MX-006` freezes a 72-bar z-window, which lies between the two
  estimates. That is a relation the preregistration should acknowledge; this task
  expresses no view on which regime the window suits.
- The hourly half-lives are consistent with the 4.2 trading days measured
  independently on daily closes in `TASK-MX-001`, which is a useful agreement
  between two different datasets and two different estimators.

## What these features cannot support

- **No executability claim.** The bid-ask spread is still unmeasured; the Track A
  cohort has zero valid days.
- **A 60-minute bar remains a `BAR_RESOLUTION_PROXY`** under the pipeline
  protocol. A feature computed on it cannot be described as available at a
  tick-level decision time.
- **The second/third pair inherits its liquidity problem.** Leg 3 trades a median
  741 lots per day. Its features are computed and reported; that is not a claim
  that a position could be taken in it.
- Roll yield is computed from the expiry gap of the contract codes. It is a
  property of the pair, not a forecast.

## Next

`TASK-MX-005` is partially blocked — the L2 fill engine cannot be built from a
feed that publishes no depth. `TASK-MX-006` is blocked on `TASK-SK-002`, which is
still only a specification. The unblocked path is `TASK-SK-002`.
