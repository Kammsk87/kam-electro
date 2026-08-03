# TASK-AH-038 - 4H Compression/Volume Short Breakout v0

## Objective

Test the operator-proposed short breakout mechanism as a distinct fixed
discovery family: repeated support, declining range/volume compression,
lower-high pressure, and a high-volume downside break. Compare two predeclared
entry forms: immediate confirmation and successful retest. This is not a
manual-chart exercise, paper run, or live strategy.

## Safety and evidence boundary

Use only the committed AH-005A 109-symbol OHLCV archive and manifest. No
network. Do not start, stop, or alter live/paper processes, services, timers,
coordinator, approval, KILL, configuration, model_id, RESET_TS,
promising_count, or production data. Do not read secrets or call
order/account/position endpoints.

Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
LESSON-017, LESSON-019, LESSON-021.

## Universe and chronology

- Derive causal 4h OHLCV bars from the AH-005A 1h archive only. Record its
  aggregation convention and all exclusions.
- Exclude tokenized shares, commodities, duplicate/remapped symbols, and any
  symbol without 95% continuous bars in every split or missing volume.
- Use train 55%, validation 20%, holdout 15%, forward 10% in chronological
  order. Rules cannot change after validation. Inspect holdout and forward once.
- BTC is used only for the predeclared broad-market safety filter below; it is
  never used to select symbols after outcomes are seen.

## Mechanical market structure

At the close of decision bar `t`, using only bars through `t`:

1. `ATR14(t)` is the standard 4h true-range average.
2. Support `S` is the median low of the bars in `t-24..t-4` whose low is within
   `0.35 * ATR14(t)` of the window's minimum low. It is valid only with at
   least three such touches, each separated by at least two bars.
3. The lower-high condition is true when the maximum high of `t-8..t-5` is
   below the maximum high of `t-16..t-13`.
4. Compression is true when mean true range over `t-3..t-1` is at most 75% of
   mean true range over `t-13..t-4`, and mean volume over `t-3..t-1` is at
   most 80% of the mean volume over `t-23..t-4`.
5. A downside break is true only if `close(t) <= S * 0.9975` and
   `volume(t) >= 1.5 * SMA20(volume)(t)`.
6. Do not short if BTC's prior 30-bar (five-day) return is at or below -10%.

No additional indicator, discretionary triangle, market-context, news,
funding, wallet, or post-hoc liquidity filter is allowed.

## Two frozen entries

Both versions require every structure condition above. Never choose between
them based on holdout or forward results.

### A. Confirmation entry

Enter short at next independent 4h bar open after a valid downside break.

### B. Retest entry

After a valid break, wait no more than three completed 4h bars. Enter short at
the next bar open only if a retest bar has `high >= S - 0.15*ATR14(t)` and
`close < S`; otherwise record a missed signal, not a trade.

## Risk and exit

- Stop is `max(high(t-3..t), entry + 1.5*ATR14(t))`.
- Primary target is `3R` below entry, where `R = stop - entry`.
- Force exit six completed 4h bars after entry if neither stop nor target is
  reached.
- If a single OHLC bar can reach both stop and target, resolve it adversely.
- Do not simulate the suggested 50/50 scale-in: intrabar ordering and separate
  fills cannot be truthfully reconstructed from 4h OHLCV. Report this as a
  required later execution study, not as a favourable assumption.

## Economics, controls, and gates

- Report ideal-fill gross outcome, then apply the repository's conservative
  round-trip taker cost and double-cost tiers.
- Generate at least 1,000 matched-null samples for each entry form with same
  timestamps, symbols, holding profile, cost model, and recorded fixed seed.
- For each split and combined holdout+forward, report N, symbols, calendar
  days, mean, median, win rate, p5/p95, maximum drawdown, target/stop/timeout
  fractions, missed retests, costs, and null p-value.
- Run remove-best-symbol, remove-best-three-symbols, and remove-best-day;
  report concentration shares.
- Test exactly two robustness neighbours without optimisation: volume spike
  `1.25x` and `1.75x` SMA20, all else unchanged.
- Explicitly test event overlap with AH-027/028/032/033 1h level geometry and
  the prior failed-breakout family. This is distinct only if 4h compression +
  volume produces a materially different event set.

An entry form may receive `CANDIDATE_PASSPORT_DRAFT` only if both holdout and
forward have: at least 100 trades, five symbols, at least 10 calendar days in
each OOS split, and at least 30 calendar days combined across holdout plus
forward; positive net mean and median after conservative cost; non-negative
median after double cost;
matched-null p below 0.05; positive after remove-best-symbol and
remove-best-day; no symbol above 25% of PnL; and non-negative median in both
volume neighbours. Otherwise return a non-promotion verdict for that form.

## Deliverables

1. `scripts/analysis/ah038_4h_compression_volume_short_breakout.mjs`
2. `scripts/test_ah038_4h_compression_volume_short_breakout.mjs`
3. `reference/AH038_4H_COMPRESSION_VOLUME_SHORT_BREAKOUT_PROTOCOL_2026-08-02.md`
4. `data/ah038_4h_compression_volume_short_breakout_2026-08-02.{csv,json}`
5. `tasks/results/TASK-AH-038-4H-COMPRESSION-VOLUME-SHORT-BREAKOUT-V0-RESULT.md`

Run `node --check`, deterministic unit tests, smoke, static scan for trading
endpoints/secrets, lessons checker, and full replay. Inspect `git status`, then
commit and push only the listed deliverables.
