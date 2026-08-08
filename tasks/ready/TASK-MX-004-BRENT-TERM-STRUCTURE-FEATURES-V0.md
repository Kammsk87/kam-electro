# TASK-MX-004 - Brent Term Structure And Carry Features v0

## Lifecycle

- Stage: `DISCOVERY`. Features computed on history with no rule frozen.
- Entered from: `TASK-MX-002`, Stage 0 cleared at all four horizons.
- Next permitted transition: `CANDIDATE_PASSPORT`, only once a rule is frozen.
- This task produces **features, not signals**. It computes no return, tests no
  hypothesis, and consumes no multiplicity budget.

## Dependencies — this task is unblocked

Verified 2026-08-08: 60-minute candles exist for 51 BR contracts spanning
2021-09 to 2026-07 (104,817 bars), and daily history covers 49 contracts. Leg 1
and leg 2 co-trade in the same hourly slot 97.2% of the time, leg 2 and leg 3
92.4%. Nothing in this task waits on the quote collector or on
`TASK-SK-002`.

## Features

Computed for the front/second pair, and separately for second/third with its
coverage caveat.

1. **Annualised roll yield.** `(F1 - F2) / F1 * 365 / dt`, where `dt` is the gap
   in calendar days between the two contracts' **expiries** — not the front's
   days-to-expiry. Both quantities are called "dt" in casual usage and only one
   of them annualises a spread correctly.
2. **Rolling z-score of the spread**, windows of 24, 72 and 120 hours. The
   window must not span a roll: a z-score computed across a change of contract
   pair measures the roll, not the spread. Windows that span one are emitted as
   null, not as a number.
3. **Ornstein-Uhlenbeck half-life**, fitted separately in contango (`F1 < F2`)
   and backwardation (`F1 > F2`), inside constant-pair regimes only.
4. **Days-to-expiry decay proxy** — the spread as a function of the front leg's
   remaining life. Contracts still alive at the end of the sample are excluded:
   their last observed bar is the end of the data, not their expiry, and
   including them labels live contracts as being in their final week.

## Mandatory data-quality rule

A spread bar is emitted **only where both legs printed in the same hourly slot**.
Away from the front pair, a bar carrying the last trade from an hour ago produces
a spread that moved because one leg was stale, not because the curve moved.
Every emitted row carries `both_traded: true`; rows failing it are dropped and
counted, and the dropped count appears in the result.

## Pre-registered honesty constraints

- No feature is dropped, added or re-parameterised after seeing whether it
  correlates with anything. The three z-score windows and the four features above
  are the whole set.
- The module returns features. It does not rank them, select among them, or
  report which looks promising. That is a later task and a different lifecycle
  stage, and doing it here would spend selection budget invisibly.

## Safety boundary

Read-only, local data only. No network, credential, broker, order or service
path. Does not modify `backtest.py`, any config, any schedule, the frozen Stage 0
script, or `check_paper_gate.py`.

## Acceptance

- Self-check passes with no test framework installed.
- Tests prove: roll yield uses the expiry gap; roll-spanning windows are null;
  half-life is fitted within regimes only; still-alive contracts are excluded
  from the DTE proxy; stale-leg rows are dropped and counted.
- The result reports coverage, the dropped-row count, and what the features
  cannot support.
- No signal, no return, no candidate.

## Allowlisted deliverables

1. `moex-futures-bot/src/moex_futures_bot/features/__init__.py`
2. `moex-futures-bot/src/moex_futures_bot/features/term_structure.py`
3. `moex-futures-bot/tools/test_term_structure.py`
4. `tasks/results/TASK-MX-004-BRENT-TERM-STRUCTURE-FEATURES-V0-RESULT.md`
