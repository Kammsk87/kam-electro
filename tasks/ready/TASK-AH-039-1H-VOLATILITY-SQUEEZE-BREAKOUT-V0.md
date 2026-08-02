# TASK-AH-039 - 1H Volatility Squeeze Breakout v0

## Objective

Test one fixed, bidirectional volatility-squeeze breakout mechanism on the
AH-005A archive. It is distinct from AH-038: no support geometry, lower highs,
or volume-break condition. It must prove event-level non-overlap with rejected
1h compression and failed-breakout families before any candidate wording.

## Boundary

Use only the committed AH-005A 109-symbol 1h archive and manifest. No network,
parameter search, live/paper process, service, collector, configuration,
coordinator, approval, KILL, model_id, RESET_TS, promising_count, secrets,
orders, accounts, or positions. Research only.

## Frozen Rule

At a completed 1h bar `t`, Bollinger width using close/20/2 must be in the
lowest 20% of the prior 120 completed widths for at least six consecutive
bars. ATR14 must be below its prior-60-bar median. Define the squeeze high and
low as the highest high and lowest low of those six bars. Long only when close
breaks above high plus 0.2 ATR; short only when close breaks below low minus
0.2 ATR. Enter next open; first break only. Stop is the opposite squeeze bound
or 1.5 ATR, whichever is nearer; target 2.5R; timeout 18 bars; adverse
resolution when one OHLC bar touches both stop and target.

Use chronological 55/20/15/10 train/validation/holdout/forward, 95% coverage
per split, primary liquid-crypto universe, 11 bps round-trip cost, 22 bps
double cost. No threshold changes after validation.

## Required Checks

For each split and combined OOS: N, symbols, days, mean/median, win rate,
p5/p95, drawdown, exit reasons; 1,000 matched nulls; remove-best-symbol,
remove-best-three, remove-best-day; symbol/day concentration; two fixed
neighbours (width percentile 15% and 25%); exact timestamp overlap against
available rejected-family ledgers, otherwise `OVERLAP_UNAVAILABLE` and no
promotion.

`CANDIDATE_PASSPORT_DRAFT` requires both OOS parts to have 100 trades, five
symbols, ten days, 30 combined days, positive net mean/median, nonnegative
double-cost median, null p<0.05, positive remove-best checks, <=25% symbol PnL
share, and nonnegative neighbours. Otherwise return a non-promotion verdict.

## Allowlisted Deliverables

1. `scripts/analysis/ah039_1h_volatility_squeeze_breakout.mjs`
2. `scripts/test_ah039_1h_volatility_squeeze_breakout.mjs`
3. `reference/AH039_1H_VOLATILITY_SQUEEZE_BREAKOUT_PROTOCOL_2026-08-03.md`
4. `data/ah039_1h_volatility_squeeze_breakout_2026-08-03.{csv,json}`
5. `tasks/results/TASK-AH-039-1H-VOLATILITY-SQUEEZE-BREAKOUT-V0-RESULT.md`

Run syntax, deterministic tests, static scan, lessons checker, full replay,
gitleaks, and `git diff --check`. Commit only these deliverables. Push requires
an explicit confirmation of the destination remote.
