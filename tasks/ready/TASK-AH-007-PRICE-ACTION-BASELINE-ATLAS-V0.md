# TASK-AH-007: Price-Action Baseline Atlas v0

## Objective

Test whether simple, indicator-free price behaviour contains any robust,
net-of-cost candidate for the multi-strategy router.

This is intentionally a control experiment: no EMA, SMA, RSI, MACD, ATR, VWAP,
Bollinger bands, volume indicators, or externally scored signal may be used.
Only causal OHLC prices, session timestamps, direct rolling highs/lows, and a
fixed cost model are permitted.

## Lifecycle

Stage: `DISCOVERY -> IDEAL_FILL_AND_OOS`.

Next permitted transition: at most one result may become a
`CANDIDATE_PASSPORT` draft, and only if it passes every predeclared gate.
It must not become paper or live in this task.

## Preconditions

Read `CLAUDE.md`, `docs/PROJECT_CONSTITUTION.md`,
`docs/BOTALIN_MASTER_ORCHESTRATION_PLAN_2026-07-30.md`,
`docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, the lessons ledger, and the
existing strategy/rejection inventory. Do not reuse a rejected family through a
renamed rule.

## Scope and Data

Use only existing local/server historical OHLC data. Do not download data,
start collectors, read secrets, or access private endpoints.

Inventory actual coverage first. Test every available causal timeframe among:
`1m, 5m, 15m, 1h, 4h, 1d`. If a timeframe or universe is unavailable, record
`DATA_UNAVAILABLE`; do not synthesize it.

Use liquid crypto perps only. Exclude tokenized stocks, commodities, and symbols
without enough bars for the frozen splits.

## Frozen Rule Families

Each family uses direct price geometry; thresholds may be a small predeclared
grid, but cannot change after validation is inspected.

1. `RANGE_BREAKOUT_CONTINUATION`: close beyond causal N-bar high/low, then
   directionally hold for a fixed horizon.
2. `BREAKOUT_RETEST_CONTINUATION`: breakout, causal retest of the broken level,
   then confirmation close in the original direction.
3. `FAILED_BREAKOUT_REVERSAL`: breakout followed by a close back inside the
   preceding range; enter in the reversal direction.
4. `RANGE_EDGE_BOUNCE`: touch/overshoot a causal range boundary and close back
   inside, with a fixed reversal exit.
5. `CONSECUTIVE_CLOSE_IMPULSE`: K same-direction closes, entered only at the
   next independent bar open and held for a fixed horizon.
6. `SESSION_HANDOFF_REPRICING`: the final move of one UTC session predicts or
   reverses at the next session; define session boundaries before data access.

Do not add a seventh family after looking at outcomes.

## Execution and Validation

- Entry is the next independent bar open, never the deciding bar close.
- Apply the repository's conservative round-trip taker cost model and repeat at
  double cost. If it is unavailable, stop `DATA_INADEQUATE`.
- Use chronological split: train 55%, validation 20%, holdout 15%, forward 10%.
- Parameter selection may use train + validation only. Holdout and forward are
  each inspected once, after rules are frozen.
- Include matched random-time/null controls, remove-best-symbol and
  remove-best-day tests, median return, symbol concentration, and trade count.
- Assess overlap against FADE, HTF mean-reversion, HTF-vol, failed-breakout,
  carry, wallet-follow/fade, and the rejected price-shock family.

## Hard Gates

A result is eligible only if all are true on both holdout and forward:

- at least 100 trades and at least 5 symbols;
- net mean > 0 and net median > 0 after costs;
- survives double cost;
- beats matched null;
- stays positive after removing the best symbol and best day;
- is not a duplicate or a renamed rejected family.

Otherwise use one of: `OOS_FAIL_REJECT_FAMILY`, `ROBUSTNESS_FAIL_DEPRIORITIZE`,
`DUPLICATE_OR_OVERLAP`, `DATA_INADEQUATE`, or `NEEDS_MORE_LOGGING`.

## Allowed Files

- `scripts/analysis/price_action_baseline_atlas.mjs`
- `scripts/test_price_action_baseline_atlas.mjs`
- `reference/PRICE_ACTION_BASELINE_ATLAS_2026-07-30.md`
- `data/price_action_baseline_atlas_2026-07-30.csv`
- `data/price_action_baseline_atlas_2026-07-30.json`
- `tasks/results/TASK-AH-007-PRICE-ACTION-BASELINE-ATLAS-V0-RESULT.md`

## Safety

No live/paper orders or runners; no services/timers; no coordinator, approvals,
KILL, configurations, model IDs, RESET_TS, secrets, or runtime data changes.
`promising_count` stays zero. Do not create a paper configuration.

## Acceptance

- `node --check` and focused tests pass.
- Static scan proves no order/execution/position endpoint or credential use.
- Results state coverage by timeframe, each family outcome, gates, and the one
  next permitted transition.
- Commit only the allowed files and include relevant lessons plus post-task hook.
