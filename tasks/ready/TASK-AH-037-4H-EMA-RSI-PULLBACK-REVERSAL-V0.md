# TASK-AH-037 - 4H EMA/RSI Pullback Reversal v0

## Objective

Test the exact classic trend-pullback rule proposed by the operator as a
separate, fixed hypothesis. The question is whether a 4h pullback into the
EMA20--EMA50 zone, followed by a mechanically defined reversal candle and an
RSI filter, has a robust net-of-cost edge. This is a research backtest only.

## Safety and evidence boundary

Use only the committed AH-005A 109-symbol OHLC archive and its manifest. No
network access. Do not start or stop live or paper processes; change
coordinator, approval, KILL, configuration, model_id, RESET_TS, or
promising_count; read secrets; or call order, account, or position endpoints.

Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
LESSON-017, LESSON-019, LESSON-021.

## Universe and chronology

- Derive 4h bars causally from the AH-005A 1h archive only; retain the archive
  manifest and every aggregation convention in the result.
- Exclude tokenized shares, commodities, duplicate/remapped symbols, and any
  symbol lacking 95% continuous bars in every split. Do not replace exclusions
  after looking at results.
- Chronological split: train 55%, validation 20%, holdout 15%, forward 10%.
  The selected rule is chosen on train plus validation only. Holdout and
  forward are each examined once.
- Primary universe is all eligible liquid crypto perps, not BTC-only.

## Frozen primary rule

All conditions are known at the close of the decision 4h candle `t`. Entry is
the next independent 4h bar open; no same-candle fill is permitted.

### Long

1. `EMA20(t) > EMA50(t)`.
2. Both trend slopes are positive: `EMA20(t) > EMA20(t-2)` and
   `EMA50(t) > EMA50(t-2)`.
3. The decision candle trades into the EMA zone:
   `low(t) <= EMA20(t)` and `close(t) >= EMA50(t)`.
4. `RSI14(t)` is inclusive in `[40, 50]`.
5. The candle is a mechanical bullish reversal: either
   - bullish engulfing: `close(t) > open(t)`, `close(t) >= open(t-1)`, and
     `open(t) <= close(t-1)`; or
   - bullish pin bar: lower wick at least twice the body, lower wick at least
     45% of full range, and `close(t) >= open(t)`.

### Short

Mirror every long condition: `EMA20 < EMA50`, both two-bar slopes negative,
`high(t) >= EMA20(t)` and `close(t) <= EMA50(t)`, RSI inclusive in `[50, 60]`,
and either bearish engulfing or bearish pin bar.

### Entry, stop, exit

- Entry: next 4h bar open.
- Stop: the decision candle low minus `0.5%` for a long, or high plus `0.5%`
  for a short. If bar order makes both stop and target attainable within one
  OHLC bar, mark the trade ambiguous and resolve it adversely.
- Primary target: `2R`. If neither stop nor target is hit, force exit exactly
  six 4h bars after entry at that bar close.
- No scaling, trailing stop, discretionary support/resistance, news filter,
  BTC filter, volume filter, or additional regime filter in the primary rule.

## Predeclared robustness neighbours

These are robustness checks, not an optimisation grid. They retain every
condition and split, changing only one exit value:

1. target `1.5R`, six-bar timeout;
2. target `2R`, four-bar timeout.

No other thresholds, candle definitions, EMA periods, RSI ranges, or exits may
be added after validation is viewed. If primary is not robust, return the
appropriate non-promotion verdict rather than tuning it.

## Economics, controls, and gates

- Report ideal-fill gross result first, then apply the repository's current
  conservative round-trip taker cost model and double that cost.
- Produce at least 1,000 matched-null samples with identical timestamps,
  symbols, sides, holding profile, and a recorded seed but randomised eligible
  entries.
- For validation, holdout, forward, and combined holdout+forward report N,
  symbols, calendar days, mean, median, win rate, p5/p95, maximum drawdown,
  stop/target/timeout fractions, cost tiers, and matched-null p-value.
- Run remove-best-symbol, remove-best-three-symbols, and remove-best-day;
  report concentration shares.
- Compare with the previously rejected 4h trend continuation and HTF
  mean-reversion families. This rule is distinct only if its pullback-zone +
  RSI + reversal-candle conjunction supplies a materially different event set;
  report event overlap explicitly.

Return `CANDIDATE_PASSPORT_DRAFT` only if both holdout and forward each have:

1. at least 100 trades across at least five symbols, at least 10 calendar
   days in each OOS split, and at least 30 calendar days combined across
   holdout plus forward;
2. positive net mean and median after conservative cost;
3. non-negative median after double cost;
4. matched-null p below 0.05;
5. positive combined outcome after remove-best-symbol and remove-best-day;
6. no symbol contributes more than 25% of combined PnL; and
7. both robustness neighbours have non-negative net median.

Otherwise return `OOS_FAIL_REJECT_FAMILY`, `ROBUSTNESS_FAIL_DEPRIORITIZE`,
`DUPLICATE_OR_OVERLAP`, or `DATA_INADEQUATE`. A pass permits only a future
execution-replay decision; it does not create paper/live status.

## Deliverables

1. `scripts/analysis/ah037_4h_ema_rsi_pullback_reversal.mjs`
2. `scripts/test_ah037_4h_ema_rsi_pullback_reversal.mjs`
3. `reference/AH037_4H_EMA_RSI_PULLBACK_REVERSAL_PROTOCOL_2026-08-02.md`
4. `data/ah037_4h_ema_rsi_pullback_reversal_2026-08-02.{csv,json}`
5. `tasks/results/TASK-AH-037-4H-EMA-RSI-PULLBACK-REVERSAL-V0-RESULT.md`

Run `node --check`, deterministic unit tests, smoke mode, static scan for
trading endpoints/secrets, lessons checker, and the full run. Commit and push
only the listed deliverables after inspecting `git status` for unrelated work.
