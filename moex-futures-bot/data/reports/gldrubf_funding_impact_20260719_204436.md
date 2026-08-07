# GLDRUBF Funding Impact Audit

This is a provisional estimate, not final PnL accounting.

| metric | value |
|---|---:|
| period | 2023-07-20 - 2026-07-17 |
| rows | 763 |
| nonzero swaprate rows | 747 |
| sum swaprate | 4693.70067 |
| close raw return % | 78.86 |
| close funding-adjusted return % | 0.60 |
| close funding drag % points | 78.26 |
| settle raw return % | 79.25 |
| settle funding-adjusted return % | 0.76 |
| settle funding drag % points | 78.49 |

Assumption:
- Positive `SWAPRATE` is treated as a RUB-per-contract funding charge paid by a long position.
- This assumption follows MOEX perpetual-futures documentation directionally, but exact contract PnL still needs specification-level verification.
- Strategy verdicts must remain blocked until this funding model is confirmed and integrated into backtests.