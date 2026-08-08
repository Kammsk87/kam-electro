# TASK-MX-006 - Brent Calendar Spread Strategy And Trials Ledger v0

## Lifecycle

- Stage on entry: `CANDIDATE_PASSPORT`. This is the first MOEX task that freezes
  a rule, and therefore the first that **consumes multiplicity budget**.
- Next permitted transition: `IDEAL_FILL_AND_OOS`.
- **Status: BLOCKED on `TASK-SK-002`.** See below.

## Why this task cannot start yet

The specification requires the run to be recorded «в trials_ledger с фиксацией
Deflated Sharpe Ratio и поправки на множественную проверку». Verified
2026-08-08: `shared_kernel/` contains `lifecycle.py` and nothing else. There is
no trials ledger, no DSR, no purge-and-embargo splitter. `TASK-SK-002` is a
specification in `tasks/ready/`, not an implementation.

Worse, a dependency inside that dependency: `TASK-SK-002` established that
`backtest.py` discards the return series and retains only aggregates, so the
skewness, kurtosis and sample length that DSR needs **do not exist for any run
this project has ever made**. Until item 4 of `TASK-SK-002` lands, a DSR figure
here would be either uncomputable or fabricated.

Running this task first would produce exactly the artefact the whole kernel
exists to prevent: a headline backtest result with no multiplicity correction,
recorded nowhere, on a rule that was the first thing anyone tried.

**Required order: `TASK-SK-002` → `TASK-MX-006`.** Not a preference.

## Frozen rule — declared now, before any result exists

Written here so that it is preregistered rather than chosen after the first
backtest. It may not be edited once the task runs; a different rule is a
different `model_id` and a new trial.

- **Universe.** BR front/second pair only. Second/third is out of scope; leg 3
  trades a median 741 lots per day and its liquidity was never shown to support
  the size a spread needs.
- **Signal.** Entry when the 72-hour rolling z-score of the spread exceeds
  +2.0 (sell the spread) or falls below −2.0 (buy it). The window is 72 hours
  because it is the middle of the three computed in `TASK-MX-004`; picking the
  best-performing of the three would be selection, and the other two are
  reported as pre-declared neighbours on validation only, never on holdout.
- **Exit.** z-score returns to 0, or a 5-day timeout, whichever first.
- **Horizon.** The 3d and 5d horizons only. 1d is excluded: its breakeven spread
  is 1.90 ticks per leg and the first quotes observed on the second leg were
  3 ticks. 10d is excluded: it survived Stage 0 only under the margin bound.
- **Costs.** `cost_model.py`, schedule `2026-08-06_rev2`, two legs, non-scalper,
  `TRADE_OUT`, POLUNETTO margin. Execution basis `TICK_FLOOR` **and**
  `TICK_FLOOR_STRESS`, both reported. A result that survives only the tick floor
  is not a result.
- **Kill condition.** Non-positive at ideal fill, or indistinguishable from its
  matched null, closes the family along a named route. It is not sent back for
  tuning.

## Statistical requirements

- **t-statistics on the gross mean, never on the cost-inclusive net mean.** A
  t-stat on a mean carrying a constant cost only tests whether the cost differs
  from zero and grows more impressive with every added observation. Botalin
  published t-statistics of −101, −75 and −53 this way before catching it.
- **Purge and embargo** sized to the outcome window and the 120-hour feature
  warm-up. Overlapping trades on a 5-day horizon are not independent
  observations.
- **Matched null**, at least 1,000 samples, two-sided, seeded.
- **Remove-best-day and remove-best-regime** checks.
- The trial is written to the ledger as `TRIAL_RECORD` with its `search_space`,
  and reports both the BH-FDR-adjusted p and the DSR against the trial count in
  that space.

## Pre-registered thresholds

From `TASK-SK-002`, frozen before any number exists: BH-FDR-adjusted p above
0.10 is not a screening pass; DSR below 0.95 is not holdout-eligible;
`DSR_UNAVAILABLE` is not holdout-eligible either.

## What this task cannot conclude

Even a full pass proves nothing about executability. The bid-ask spread is still
unmeasured — the Track A cohort has zero valid days — and under the pipeline
protocol a decision taken on an hourly bar is a `BAR_RESOLUTION_PROXY`, so
Stage 2 stays out of reach regardless of the outcome here.

## Allowlisted deliverables

1. `moex-futures-bot/src/moex_futures_bot/strategies/__init__.py`
2. `moex-futures-bot/src/moex_futures_bot/strategies/brent_calendar_spread.py`
3. `moex-futures-bot/tools/test_brent_calendar_spread.py`
4. `data/trials_ledger.jsonl` — one appended record
5. `tasks/results/TASK-MX-006-BRENT-CALENDAR-SPREAD-STRATEGY-AND-TRIALS-LEDGER-V0-RESULT.md`
