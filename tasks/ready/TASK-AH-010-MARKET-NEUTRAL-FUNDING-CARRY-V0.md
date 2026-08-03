# TASK-AH-010: Market-Neutral Funding Carry v0

## Objective

Evaluate a simple, market-neutral funding-carry sleeve without modifying the
existing HL_CARRY or FUND_EXTREME_FADE forward observers.

## Lifecycle

`DATA_HEALTH -> DISCOVERY -> IDEAL_FILL_AND_OOS` only. No paper/live transition.

## Rule

At fixed funding decision times, trade only an equal-dollar two-leg construction:
collect positive funding on an eligible perp leg while hedging price exposure with
a correlated liquid leg. Include funding received/paid, both-leg fees, borrow or
hedge proxy if applicable, spread/slippage, liquidation/custody constraints, and
the cost of rebalancing. No directional price forecast.

## Required Data Gate

Inventory historical funding timestamps/rates, both-leg price bars, and executable
liquidity coverage before any result. If the existing sources cannot align all
three at decision time, stop `DATA_INADEQUATE`; do not model missing funding as zero.

## Validation

- Freeze universe, funding threshold, hedge rule and rebalance cadence before OOS.
- Chronological train/validation/holdout/forward splits.
- Double all costs; report realised funding versus hedge drift, drawdown, venue and
  asset concentration, custody-tail scenarios, and matched null.
- A pass needs positive mean+median after double costs on holdout+forward,
  at least five assets and 100 funding events, and no dependence on one asset.

## Allowed Files

- `scripts/analysis/market_neutral_funding_carry_v0.mjs`
- `scripts/test_market_neutral_funding_carry_v0.mjs`
- `reference/MARKET_NEUTRAL_FUNDING_CARRY_V0_2026-07-30.md`
- `data/market_neutral_funding_carry_v0_2026-07-30.{json,csv}`
- `tasks/results/TASK-AH-010-MARKET-NEUTRAL-FUNDING-CARRY-V0-RESULT.md`

## Safety

Use existing local data only. No private/public network calls, keys, exchange
actions, paper/live, runner, service, coordinator, approval, KILL, config, model-ID
or RESET_TS changes. `promising_count=0`. Commit only allowed files.
