# Brent Research Matrix

- Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
- Continuous method: `sticky_volume_leader_last_trade_return_stitched`
- Holdout bars excluded: `252`
- Matrix rows: `1`
- Failures: `0`
- Screening passes: `1`

## Screening Passes

| window | strategy | broker fee | cost bps | roll window | avg test % | avg B&H % | avg excess % | positive excess % | sign p | worst excess % | max DD % | trades | report |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| strict_252_63 | mean_reversion_sma | 0.45 | 0.0 | 0 | 0.12 | -2.59 | 2.71 | 66.67 | 0.194 | -8.33 | 15.89 | 113 | `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/backtests/walk_forward_moex_iss_continuous_20260720_001218_637885.md` |

## All Rows

| window | strategy | broker fee | cost bps | roll window | avg test % | avg B&H % | avg excess % | positive excess % | sign p | worst excess % | max DD % | trades | verdict | report |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| strict_252_63 | mean_reversion_sma | 0.45 | 0.0 | 0 | 0.12 | -2.59 | 2.71 | 66.67 | 0.194 | -8.33 | 15.89 | 113 | screening_pass | `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/backtests/walk_forward_moex_iss_continuous_20260720_001218_637885.md` |

Notes:
- Holdout bars are excluded before train/test windows are formed.
- `roll_window` removes +/- N rows around raw chain roll dates.
- `screening_pass` is a research screen only, not paper-mode permission.