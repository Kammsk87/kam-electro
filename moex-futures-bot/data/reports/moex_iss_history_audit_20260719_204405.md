# MOEX ISS Futures History Audit

| secid | rows | first | last | bad OHLC | bad range | zero volume | nonzero swaprate | min swap | max swap | avg swap | avg volume | median volume |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| BRQ6 | 142 | 2025-12-23 | 2026-07-17 | 2 | 0 | 2 | 0 | 0.00000 | 0.00000 | 0.00000 | 83918.42 | 1088.50 |
| BRU6 | 123 | 2026-01-23 | 2026-07-17 | 2 | 0 | 2 | 0 | 0.00000 | 0.00000 | 0.00000 | 9524.37 | 796.00 |
| BRV6 | 104 | 2026-02-19 | 2026-07-17 | 1 | 0 | 1 | 0 | 0.00000 | 0.00000 | 0.00000 | 1019.78 | 649.00 |
| GDU6 | 215 | 2025-09-11 | 2026-07-17 | 3 | 0 | 3 | 0 | 0.00000 | 0.00000 | 0.00000 | 19844.86 | 629.00 |
| GLDRUBF | 763 | 2023-07-20 | 2026-07-17 | 0 | 0 | 0 | 748 | 0.00000 | 21.28987 | 6.15391 | 295308.22 | 245328.00 |

Notes:
- `SWAPRATE` is the key field for GLDRUBF funding research.
- Ordinary dated futures are expected to have zero `SWAPRATE`.
- This audit does not yet translate `SWAPRATE` into position PnL.