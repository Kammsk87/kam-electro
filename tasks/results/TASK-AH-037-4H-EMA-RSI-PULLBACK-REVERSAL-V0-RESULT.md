# TASK-AH-037 Result - 4H EMA/RSI Pullback Reversal v0

## Verdict

`DATA_INADEQUATE` / `DISCOVERY_NOT_PROOF`

The frozen strategy does not generate the minimum sample required to make an
OOS claim: 17 trades over the full archive, 1 in holdout and 2 in forward. The
three combined OOS trades all lost money after costs. No parameter, regime, or
exit rule was changed after this observation. No paper or live candidate was
created.

## Frozen Data and Rule

- Source: `/opt/botalin-edge/data/bars_xs/bars.json` with
  `bars_xs_manifest.json`; 109 original 1h symbols, 87 passing the predeclared
  95% per-split coverage screen.
- 4h bars: complete UTC blocks only, `2025-03-20T00:00:00Z` through
  `2026-03-19T20:00:00Z`; train/validation/holdout/forward = 55/20/15/10.
- Rule: EMA20/EMA50 trend slopes, EMA-zone touch, RSI14 40--50 long or 50--60
  short, mechanical engulfing/pin-bar confirmation, next-open entry, 0.5%
  decision-extreme stop, 2R target, six-bar timeout.
- Costs: 11 bps conservative round trip; 22 bps double-cost check.

## Results (net bps)

| Split | N | Symbols | Days | Mean | Median | Win rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Train | 6 | 6 | 6 | -166.87 | -113.07 | 0% |
| Validation | 8 | 8 | 5 | +42.41 | -41.43 | 50% |
| Holdout | 1 | 1 | 1 | -118.86 | -118.86 | 0% |
| Forward | 2 | 2 | 2 | -131.02 | -131.02 | 0% |
| Holdout + forward | 3 | 2 | 3 | -126.97 | -127.31 | 0% |

Matched null: 1,000 deterministic samples; observed net median `-127.31`
bps vs null median `-19.16` bps, p=`0.811`. Both declared robustness neighbours
also had 3 combined OOS trades and `-127.31` bps median. Removing the least bad
symbol/day remains negative. The largest absolute symbol contribution is
66.6%, but concentration is secondary because the sample and returns already
fail.

Prior-family event ledgers were not retained with the AH-005A archive, so exact
event overlap is `UNAVAILABLE`; this independently blocks any promotion claim.

## Verification and Safety

- `node --check`: passed.
- Deterministic unit tests: 9/9 passed.
- Full offline run: completed using only the server-resident AH-005A archive.
- Static scan: no URL, HTTP client, `fetch`, `child_process`, API-key, or
  trading endpoint surface in either AH-037 script.
- `git diff --check`: passed for the allowlisted deliverables.
- Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
  LESSON-017, LESSON-019, LESSON-021.
- New lesson: none. This is a low-frequency, negative baseline test, not
  evidence that a tuned variant would be an edge.

## What This Task Cannot Conclude

It cannot prove that every pullback method fails, select a different parameter,
or justify paper/live trading. A materially distinct strategy requires a new
predeclared task and an independent OOS test.
