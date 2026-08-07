# MOEX ISS Roll Gap Audit

- Assetcode: `BR`
- Method: `sticky_volume_leader`
- Price field: `settleprice`
- Rows: `1233`
- Period: `2021-09-01T05:00:00+05:00 - 2026-07-17T05:00:00+05:00`
- Rolls: `48`
- Warning threshold: `3.0`%
- Large absolute chain gaps: `21`
- Max absolute chain gap: `16.33`%

| date | old | new | chain gap % | same-day gap % | warning |
|---|---|---|---:|---:|---|
| 2021-09-30 | BRU2 | BRV2 | -1.65 | - |  |
| 2021-10-04 | BRV2 | BRU2 | 2.11 | - |  |
| 2021-12-07 | BRU2 | BRZ2 | 2.82 | -1.40 |  |
| 2022-03-22 | BRZ2 | BRV2 | 2.74 | 0.69 |  |
| 2022-04-25 | BRV2 | BRU2 | -2.21 | 0.98 |  |
| 2022-09-02 | BRU2 | BRV2 | 0.97 | - |  |
| 2022-10-04 | BRV2 | BRX2 | 5.98 | - | yes |
| 2022-11-02 | BRX2 | BRZ2 | 2.07 | - |  |
| 2022-12-02 | BRZ2 | BRF3 | 4.31 | - | yes |
| 2023-01-03 | BRF3 | BRG3 | 6.88 | - | yes |
| 2023-02-02 | BRG3 | BRH3 | 1.25 | - |  |
| 2023-03-02 | BRH3 | BRJ3 | 2.36 | - |  |
| 2023-04-04 | BRJ3 | BRK3 | 7.86 | - | yes |
| 2023-05-03 | BRK3 | BRN3 | -4.38 | - | yes |
| 2023-07-04 | BRN3 | BRQ3 | 1.95 | - |  |
| 2023-08-02 | BRQ3 | BRU3 | -1.94 | - |  |
| 2023-09-04 | BRU3 | BRV3 | 2.50 | - |  |
| 2023-10-03 | BRV3 | BRX3 | -3.84 | - | yes |
| 2023-11-02 | BRX3 | BRZ3 | -0.89 | - |  |
| 2023-12-04 | BRZ3 | BRF4 | -3.68 | - | yes |
| 2024-01-03 | BRF4 | BRG4 | 0.31 | - |  |
| 2024-02-02 | BRG4 | BRH4 | -3.74 | - | yes |
| 2024-03-04 | BRH4 | BRJ4 | 0.22 | - |  |
| 2024-04-02 | BRJ4 | BRK4 | 1.82 | - |  |
| 2024-05-03 | BRK4 | BRN4 | -5.22 | - | yes |
| 2024-07-02 | BRN4 | BRQ4 | 0.61 | - |  |
| 2024-08-02 | BRQ4 | BRU4 | -3.02 | - | yes |
| 2024-09-03 | BRU4 | BRV4 | -5.21 | - | yes |
| 2024-10-02 | BRV4 | BRX4 | 3.47 | - | yes |
| 2024-11-02 | BRX4 | BRZ4 | 0.40 | - |  |
| 2024-12-03 | BRZ4 | BRF5 | 0.69 | - |  |
| 2025-01-06 | BRF5 | BRG5 | 3.39 | - | yes |
| 2025-02-04 | BRG5 | BRH5 | -0.46 | - |  |
| 2025-03-04 | BRH5 | BRJ5 | -3.80 | - | yes |
| 2025-04-02 | BRJ5 | BRK5 | -0.39 | - |  |
| 2025-05-05 | BRK5 | BRN5 | -5.18 | - | yes |
| 2025-07-02 | BRN5 | BRQ5 | 0.33 | - |  |
| 2025-08-04 | BRQ5 | BRU5 | -4.67 | - | yes |
| 2025-09-02 | BRU5 | BRV5 | 0.90 | - |  |
| 2025-10-02 | BRV5 | BRX5 | -3.77 | - | yes |
| 2025-11-05 | BRX5 | BRZ5 | -1.05 | - |  |
| 2025-12-02 | BRZ5 | BRF6 | -0.36 | - |  |
| 2026-01-06 | BRF6 | BRG6 | -0.45 | - |  |
| 2026-02-03 | BRG6 | BRH6 | -5.33 | - | yes |
| 2026-03-03 | BRH6 | BRJ6 | 16.33 | - | yes |
| 2026-04-02 | BRJ6 | BRK6 | -8.96 | - | yes |
| 2026-05-05 | BRK6 | BRN6 | -7.50 | - | yes |
| 2026-07-02 | BRN6 | BRQ6 | -2.60 | - |  |

Notes:
- Chain gap compares the new selected contract price on roll day with the previous chain close.
- Same-day gap compares old and new contract prices on the roll day when both are available.
- This audit does not back-adjust prices; it flags discontinuities that can distort strategy returns.