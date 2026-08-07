# Holdout Candidate Check

- Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
- Strategy: `mean_reversion_sma`
- Selected params from pre-holdout train only: `{"cost_bps": 25.0, "lookback": 20, "threshold_pct": 2.0}`
- Cost bps: `25.0`
- Broker fee RUB/contract: `5.0`
- Roll-window exclusion: `+/-3` bars
- Train: `2021-09-01T05:00:00+05:00 - 2025-10-14T05:00:00+05:00` (`781` filtered bars)
- Holdout: `2025-10-15T05:00:00+05:00 - 2026-07-19T05:00:00+05:00` (`196` filtered bars)

| metric | value |
|---|---:|
| train return % | 9.40 |
| train sharpe | 0.25 |
| holdout return % | -6.48 |
| holdout B&H % | 68.71 |
| holdout excess % | -75.19 |
| holdout max DD % | 21.19 |
| holdout trades | 18 |
| holdout exposure % | 26.02 |

Verdict: `holdout_fail`

Notes:
- The last holdout bars were not used for parameter selection.
- This is a research validation check, not paper/live permission.