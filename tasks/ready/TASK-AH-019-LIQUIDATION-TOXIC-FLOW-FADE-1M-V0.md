# TASK-AH-019 - Liquidation Toxic-Flow Fade 1m v0

## Objective

Test a distinct microstructure hypothesis: forced liquidations can temporarily
dislocate price when aggressive flow consumes the book faster than passive
liquidity reprices. The candidate entry is a fade only after measured
liquidation pressure, one-minute signed trade-flow imbalance, open-interest
reduction, and same-time replenishment of the consumed book side coincide.
This is research-only, not a paper or live strategy.

## Safety boundary

Use only existing local/server records. No network fetches or purchases. Do not
start, stop, reload, or modify AMEL, NEWS, wallet, order-book, or any other
collector; live/paper runner; service/timer; coordinator; approval; KILL;
configuration; model_id; RESET_TS; promising_count; or runtime data. Do not
read secrets or call order, account, position, or execution endpoints.

Relevant lessons: LESSON-001, LESSON-003, LESSON-007, LESSON-013,
LESSON-016, LESSON-017, LESSON-019, LESSON-021.

## Mandatory data gate

Before calculating a signal, inventory exact decision-time coverage per symbol:

1. One-minute trade records with aggressor side sufficient to calculate signed
   trade volume. Candle direction, close-to-close return, or a later price move
   cannot substitute for aggressor classification.
2. One-minute or finer OI observations.
3. Timestamped liquidation notional and liquidation side.
4. L2 snapshot/delta coverage sufficient to measure top-of-book and depth
   within 10 bps on the consumed side before and after the event.
5. A causally usable next-minute reference and depth-based cost estimate for
   $7, $200, and $1k.

Align all fields to a common UTC one-minute bucket. State the authoritative
timestamp and maximum permitted staleness per source before outcomes are read.
Exclude every incomplete bucket and report why. If any required field is absent
or the independent sample cannot meet the gates below, return `DATA_INADEQUATE`;
never construct CVD from OHLCV proxies or use a later snapshot.

## Frozen event definition

All quantile thresholds are fitted on the train segment only, per symbol. Split
chronologically: train 55%, validation 20%, holdout 15%, forward 10%.

At completed minute `t`, for a potential long fade:

1. Signed aggressive sell volume during `t` is at or below the train-only 5th
   percentile of one-minute signed volume.
2. Five-minute OI change through `t` is at or below the train-only 10th
   percentile.
3. Long-liquidation notional during `t` is at or above the train-only 95th
   percentile.
4. Bid depth within 10 bps at the final decision snapshot is at least 150% of
   the minimum bid depth observed during the same minute, and the best bid has
   recovered to within 5 bps of its pre-minute level.

The short fade is the exact mirror: aggressive buy volume, OI reduction,
short-liquidation notional, and ask-depth replenishment.

Primary entry is the next independent minute reference, labelled
`NEXT_MINUTE_BOOK_REFERENCE_ONLY`; it must include a depth-walk executable
VWAP rather than a candle close. Primary exit is exactly five completed minutes
later. Predeclared exit neighbours are three and fifteen minutes, all other
conditions unchanged. No discretionary level, EMA, RSI, news, wallet, funding,
or post-event filter is allowed.

## Validation and economics

- Separate ideal reference outcome from executable VWAP outcome at $7, $200,
  and $1k. Unsupported tiers remain `UNSUPPORTED`.
- Include entry/exit depth walk, fees, spread, no-fill, and missing-book counts.
- Matched null: at least 1,000 same-symbol, same-time-of-day, same-direction,
  liquidity-matched non-event minutes, fixed seed and two-sided p-value.
- Report each OOS split and combined OOS: N, days, symbols, gross/net mean and
  median, win rate, p5/p95, MFE/MAE, cost tiers, no-fill rate, null result,
  remove-best-symbol/three-symbols/day, and concentration.
- Explicitly compare events to AMEL, existing wick/failed-breakout, NEWS,
  funding, wallet, and liquidity guard families. Stop as overlap if the new
  conditions add no distinct event set beyond an existing rejected trigger.

`CANDIDATE_PASSPORT_DRAFT` is possible only if both holdout and forward each
have at least 100 events across five symbols and 30 days; positive net mean and
median after $200 executable cost; non-negative median at double cost; null
p < 0.05; positive after remove-best-symbol and remove-best-day; no symbol
above 25% of PnL; and both exit neighbours non-negative after cost. Otherwise
return `DATA_INADEQUATE`, `ROBUSTNESS_FAIL_DEPRIORITIZE`,
`OOS_FAIL_REJECT_FAMILY`, or `DUPLICATE_OR_OVERLAP`.

## Deliverables

1. `scripts/analysis/ah019_liquidation_toxic_flow_fade_1m.mjs`
2. `scripts/test_ah019_liquidation_toxic_flow_fade_1m.mjs`
3. `reference/AH019_LIQUIDATION_TOXIC_FLOW_FADE_1M_PROTOCOL_2026-08-02.md`
4. `data/ah019_liquidation_toxic_flow_fade_1m_2026-08-02.{csv,json}`
5. `tasks/results/TASK-AH-019-LIQUIDATION-TOXIC-FLOW-FADE-1M-V0-RESULT.md`

Run syntax, deterministic unit tests, smoke, static no-trading scan, lessons
checker, full replay where the data gate permits, then commit/push only the
allowlisted deliverables. The final report must state what it cannot conclude
about paper or live readiness.
