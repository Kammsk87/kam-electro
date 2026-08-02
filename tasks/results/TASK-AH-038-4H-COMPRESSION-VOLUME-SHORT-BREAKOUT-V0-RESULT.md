# TASK-AH-038 Result - 4H Compression/Volume Short Breakout v0

## Verdict

`DATA_INADEQUATE` / `DISCOVERY_NOT_PROOF` for both frozen entry forms. No
paper/live candidate, configuration, timer, collector, or order was created.

## Data and Method

AH-005A archive: 109 1h symbols, 87 eligible after the predeclared 95%
per-split coverage screen; complete UTC 4h aggregation from 2025-03-20 through
2026-03-19. The rule was fixed: support touches, lower highs, compression,
1.5x volume downside break, BTC five-day safety veto, 3R target, 1.5 ATR/local
high stop, six-bar timeout. Costs are 11 bps round trip and 22 bps double cost.

## OOS Results

| Entry form | Holdout | Forward | Combined OOS | Net mean / median | Null p |
| --- | --- | --- | --- | --- | ---: |
| Confirmation | 11 trades, +102.30 / -3.26 bps | 7 trades, -180.74 / -462.75 bps | 18 trades, 17 symbols, 10 days | -7.77 / -42.16 bps | 0.743 |
| Retest | 4 trades, +52.50 / +0.88 bps | 5 trades, -268.68 / -552.49 bps | 9 trades, 8 symbols, 7 days | -125.93 / -27.39 bps | 0.647 |

Neither form reaches the required 100 trades, five symbols, ten days in each
OOS split, or 30 combined OOS days. Both have negative combined net median and
lose to their matched null. Confirmation removes to -958.93 bps after the best
symbol and -2482.77 bps after the best day; retest remains negative after both
removals. The volume neighbours are mixed and cannot repair the failed sample.

Retest recorded 22 missed valid-break opportunities; these are not favourable
fills and were not converted into trades. No scale-in was simulated because 4h
OHLC cannot establish intrabar fill ordering.

Historical event ledgers for AH-027/028/032/033 and the failed-breakout family
were not retained beside AH-005A; exact overlap is `UNAVAILABLE`, which also
blocks promotion.

## Verification

- `node --check`: passed.
- Deterministic tests: 6/6 passed.
- Full offline replay completed against only the server-resident AH-005A archive.
- Static scan for URL/HTTP/process/key surfaces: clean.
- `git diff --check`: passed for allowlisted paths.
- Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
  LESSON-017, LESSON-019, LESSON-021. New lesson: none.

## What This Cannot Conclude

It does not prove every breakout method fails and does not justify changing a
threshold after seeing these results. A materially new mechanism needs a new
predeclared task and independent OOS evidence.
