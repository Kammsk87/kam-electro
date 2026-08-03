# TASK-AH-008: Simple Portfolio Momentum v0

## Objective

Test two indicator-free, diversified portfolio baselines on the completed
AH-005A dataset: slow time-series trend and cross-sectional momentum.

## Lifecycle

`DISCOVERY -> IDEAL_FILL_AND_OOS` only. No paper/live transition.

## Preconditions

- AH-005A result must be `DATA_READY_FOR_FROZEN_AH005`; otherwise stop
  `DATA_INADEQUATE`.
- Read governance, lifecycle, master plan, lessons ledger, price-action atlas,
  and rejected-family inventory.
- Do not change or use any active paper/live runner.

## Frozen Strategies

1. `TSMOM_SLOW`: per liquid perp, use only the sign of its trailing close-to-close
   return at 20, 60, or 120 calendar-day horizons; long positive, short negative,
   or flat. Rebalance weekly. Hold one week. Equal notional across eligible assets.
2. `CSMOM_SLOW`: weekly rank the same liquid universe by trailing 20, 60, or
   120-day return; long top quintile and short bottom quintile, equal notional,
   market-neutral gross exposure, one-week hold.

No EMA/SMA/RSI/MACD/ATR/VWAP, discretionary regimes, news, wallet data, or
post-hoc filters. Volatility scaling is forbidden in v0; this tests raw simplicity.

## Validation

- Chronological train 55%, validation 20%, holdout 15%, forward 10%.
- Choose one horizon using train+validation only.
- Apply conservative per-leg taker costs, then double costs.
- Report mean, median, drawdown, turnover, long/short balance, concentration,
  matched-null, remove-best-day/month/symbol, and beta-to-BTC.
- Require positive holdout and forward mean+median after double cost, >= 5 assets,
  >= 100 weekly portfolio observations, and no single asset >25% of PnL.

## Allowed Files

- `scripts/analysis/simple_portfolio_momentum_v0.mjs`
- `scripts/test_simple_portfolio_momentum_v0.mjs`
- `reference/SIMPLE_PORTFOLIO_MOMENTUM_V0_2026-07-30.md`
- `data/simple_portfolio_momentum_v0_2026-07-30.{json,csv}`
- `tasks/results/TASK-AH-008-SIMPLE-PORTFOLIO-MOMENTUM-V0-RESULT.md`

## Safety

Existing local data only; no network, keys, exchange endpoints, paper/live,
services, timers, coordinator, approvals, KILL, configurations, or raw data edits.
`promising_count=0`. Commit only allowed files.
