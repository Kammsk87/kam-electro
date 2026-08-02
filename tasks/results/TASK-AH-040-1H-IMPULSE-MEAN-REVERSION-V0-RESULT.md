# TASK-AH-040 Result - 1H Impulse Mean-Reversion v0

## Verdict

`OOS_FAIL_REJECT_FAMILY`. This is `DISCOVERY_NOT_PROOF`, not a paper or live
candidate. No runtime, collector, paper, or trading state was changed.

## Rule and Data

AH-005A 1h OHLCV archive: 109 source symbols, 87 eligible symbols, from
2025-03-20 through 2026-03-19. The fixed rule used a 2.5 ATR five-bar impulse,
2x prior-20 volume, extreme RSI14, one-bar midpoint reversal confirmation and
next-open entry. Stop was one ATR beyond the impulse, target was the earlier
pre-impulse price or 2R, and timeout was six bars. Costs were 11/22 bps.

## Material Results

| Split | Trades | Days | Net mean bps | Net median bps | Net total bps |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 715 | 178 | -15.46 | -7.25 | -11,051.69 |
| Validation | 248 | 60 | +88.84 | +97.04 | +22,031.50 |
| Holdout | 201 | 51 | -23.65 | +17.02 | -4,754.10 |
| Forward | 134 | 32 | +6.00 | +29.66 | +803.99 |
| Combined OOS | 335 | 82 | -11.79 | +26.02 | -3,950.11 |

The matched 1,000 time/symbol nulls were beaten on median: observed +26.02
bps versus null -7.98 bps (`p=0.001`). But the crucial mean is negative in
holdout and combined OOS: a minority of large losses consumes the many modest
wins. Removing the best symbol or day remains negative; both fixed neighbours
also have negative OOS mean. No concentration issue was found (largest symbol
share 7.12%). Timestamp overlap remains unavailable because rejected-family
ledgers are not retained with AH-005A.

## Interpretation

This is not a reason to tune the ATR threshold. The separate, future mechanism
question is whether a causal event/liquidity regime filter can identify the
tail-loss cases; it needs new independent data and a new preregistered task.

## Checks

`node --check` passed. Deterministic tests passed 3/3: confirmed next-open
target, adverse same-bar ordering, and costed statistics. Static scan found no
network, secrets, or process-control code; `git diff --check` passed. No new
lesson and no promotion.

Artifacts: `data/ah040_1h_impulse_mean_reversion_2026-08-03.json` and
`data/ah040_1h_impulse_mean_reversion_2026-08-03.csv`.
