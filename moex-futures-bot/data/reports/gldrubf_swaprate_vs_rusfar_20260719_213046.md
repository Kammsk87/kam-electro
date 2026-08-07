# GLDRUBF SWAPRATE vs RUSFAR Cross-Check

- Security: `GLDRUBF`
- Index: `RUSFAR`
- Matched days: `613`
- Period: `2024-01-09 - 2026-07-17`
- Average implied SWAPRATE annualized: `28.67`%
- Average RUSFAR: `17.37`%
- Average difference: `11.30` percentage points
- Mean absolute difference: `13.97` percentage points
- Daily correlation: `0.336`
- 5-day smoothed correlation: `0.475`
- Implied rate range: `0.55`% - `118.10`%

## Largest Differences

| date | swaprate | settleprice | implied rate % | RUSFAR % | diff pp |
|---|---:|---:|---:|---:|---:|
| 2024-06-20 | 21.28987 | 6580.00 | 118.10 | 15.24 | 102.86 |
| 2024-08-09 | 11.72469 | 6741.90 | 63.48 | 17.22 | 46.26 |
| 2024-08-01 | 11.54585 | 6765.00 | 62.29 | 17.13 | 45.16 |
| 2024-06-19 | 10.12196 | 6366.90 | 58.03 | 15.28 | 42.75 |
| 2024-09-19 | 12.42992 | 7653.10 | 59.28 | 18.51 | 40.77 |
| 2025-12-29 | 16.57035 | 10701.00 | 56.52 | 15.77 | 40.75 |
| 2024-06-13 | 10.07243 | 6542.50 | 56.19 | 15.80 | 40.39 |
| 2024-09-20 | 12.39850 | 7757.00 | 58.34 | 18.36 | 39.98 |
| 2025-12-25 | 16.51650 | 10967.10 | 54.97 | 15.76 | 39.21 |
| 2025-12-26 | 16.45065 | 11046.90 | 54.35 | 15.76 | 38.59 |

Notes:
- Implied rate is calculated as `SWAPRATE / SETTLEPRICE * 365 * 100`.
- This checks whether SWAPRATE behaves like a RUB daily funding charge for a long GLDRUBF position.
- Calendar-day/weekend accrual details are not fully modeled here; large one-day differences require contract-spec verification.