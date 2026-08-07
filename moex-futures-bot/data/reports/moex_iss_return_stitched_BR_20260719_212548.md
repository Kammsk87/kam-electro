# MOEX ISS Return-Stitched Chain

- Assetcode: `BR`
- Symbol: `BR_return_stitched@MOEX_ISS`
- Source method: `sticky_volume_leader`
- Output method: `sticky_volume_leader_return_stitched`
- Price field: `settleprice`
- Rows: `1233`
- Period: `2021-09-01T05:00:00+05:00 - 2026-07-17T05:00:00+05:00`
- Rolls: `48`
- Fallback days: `1`
- Fallback roll days: `1`
- Max absolute stitched daily return: `13.75`%
- Source symbol days: BRF3: 21, BRF4: 20, BRF5: 22, BRF6: 22, BRG3: 22, BRG4: 22, BRG5: 20, BRG6: 19, BRH3: 19, BRH4: 20, BRH5: 20, BRH6: 19, BRJ3: 22, BRJ4: 20, BRJ5: 21, BRJ6: 22, BRK3: 20, BRK4: 23, BRK5: 22, BRK6: 22, BRN3: 42, BRN4: 40, BRN5: 40, BRN6: 41, BRQ3: 21, BRQ4: 23, BRQ5: 23, BRQ6: 12, BRU2: 151, BRU3: 23, BRU4: 22, BRU5: 21, BRV2: 48, BRV3: 21, BRV4: 21, BRV5: 22, BRX2: 21, BRX3: 22, BRX4: 23, BRX5: 24, BRZ2: 92, BRZ3: 22, BRZ4: 21, BRZ5: 19

Notes:
- Each daily return is calculated from the selected source contract against the same source contract on the previous chain date when available.
- This removes direct old-contract/new-contract price jumps from the continuous chain.
- Fallback days use raw chain close-to-close return because same-source previous-date history was unavailable.
- This is a research chain, not a tradable price series.