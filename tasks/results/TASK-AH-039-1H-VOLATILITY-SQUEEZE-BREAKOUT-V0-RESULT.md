# TASK-AH-039 Result - 1H Volatility Squeeze Breakout v0

## Verdict

`OOS_FAIL_REJECT_FAMILY`. This is `DISCOVERY_NOT_PROOF`, not a paper or live
candidate. No runtime, collector, paper, or trading state was changed.

## Data and Rule

AH-005A 1h OHLCV archive: 109 source symbols, 87 eligible symbols, from
2025-03-20 through 2026-03-19. The frozen rule was six low-Bollinger-width
bars with below-median ATR, first +/-0.2 ATR break, next-open entry, 2.5R
target, nearer squeeze/1.5-ATR stop, and an 18-bar timeout. Costs: 11 bps
round trip, 22 bps double cost.

## Material Results

| Split | Trades | Days | Net mean bps | Net median bps | Net total bps |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 4,081 | 181 | -2.04 | -117.38 | -8,324.04 |
| Validation | 1,578 | 67 | -22.26 | -129.94 | -35,122.77 |
| Holdout | 1,362 | 54 | -41.85 | -121.28 | -57,005.39 |
| Forward | 824 | 36 | +33.28 | -103.38 | +27,421.02 |
| Combined OOS | 2,186 | 89 | -13.53 | -116.35 | -29,584.37 |

The 1,000 matched time/symbol nulls had median -10.65 bps versus observed
OOS median -116.35 bps (`p=1.0`). Both fixed neighbours also had negative OOS
median (-115.73 and -117.66 bps). Removing the best symbol or best day made
combined OOS worse, so a single lucky source does not explain the loss.
Maximum absolute symbol-PnL share was 2.15%; concentration is not the issue.
Exact rejected-family timestamp overlap was unavailable because those ledgers
are not retained with AH-005A; it cannot rescue this failed rule.

## Checks

`node --check` passed. Deterministic tests passed 3/3, covering next-open
entry/target, adverse same-bar stop-target handling, and costed statistics.
Static scan found no network, secret, or process-control code. `git diff
--check` passed. No new lesson was created: the result is a direct rejection
of the fixed squeeze-breakout family, not proof of a mechanism.

Artifacts: `data/ah039_1h_volatility_squeeze_breakout_2026-08-03.json` and
`data/ah039_1h_volatility_squeeze_breakout_2026-08-03.csv`.
