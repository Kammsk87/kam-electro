# MOEX ISS Last-Trade Return-Stitched Chain

- Assetcode: `BR`
- Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
- Source method: `sticky_volume_leader_last_trade`
- Output method: `sticky_volume_leader_last_trade_return_stitched`
- Price field: `last_trade`
- Rows: `1309`
- Period: `2021-09-01T05:00:00+05:00 - 2026-07-19T05:00:00+05:00`
- Rolls: `48`
- Fallback days: `1`
- Fallback roll days: `1`
- Max absolute stitched daily return: `13.13`%
- Source symbol days: BRF3: 21, BRF4: 20, BRF5: 22, BRF6: 28, BRG3: 22, BRG4: 22, BRG5: 20, BRG6: 24, BRH3: 19, BRH4: 20, BRH5: 20, BRH6: 27, BRJ3: 22, BRJ4: 20, BRJ5: 21, BRJ6: 26, BRK3: 20, BRK4: 23, BRK5: 22, BRK6: 33, BRN3: 42, BRN4: 40, BRN5: 40, BRN6: 54, BRQ3: 21, BRQ4: 23, BRQ5: 23, BRQ6: 18, BRU2: 150, BRU3: 23, BRU4: 22, BRU5: 27, BRV2: 49, BRV3: 21, BRV4: 21, BRV5: 28, BRX2: 21, BRX3: 22, BRX4: 23, BRX5: 30, BRZ2: 91, BRZ3: 22, BRZ4: 21, BRZ5: 25

Notes:
- Each daily return is calculated from the selected source contract against the same source contract on the previous chain date when available.
- This removes direct old-contract/new-contract jumps from the last-trade continuous chain.
- This is the preferred BR research chain for mean-reversion screens.