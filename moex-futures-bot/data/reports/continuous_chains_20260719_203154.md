# Continuous Chains

| family | method | rows | period | rolls | source symbol days |
|---|---|---:|---|---:|---|
| brent | sticky_volume_leader | 189 | 2025-12-23T05:00:00Z - 2026-07-19T04:00:00Z | 0 | BRQ6@RTSX: 189 |
| gold | sticky_volume_leader | 840 | 2023-07-20T04:00:00Z - 2026-07-19T04:00:00Z | 0 | GLDRUBF@RTSX: 840 |

Notes:
- Method `volume_leader` picks the highest-volume source contract for each date.
- Method `sticky_volume_leader` requires sustained volume leadership before switching.
- Series are not back-adjusted; roll jumps must be reviewed before serious strategy verdicts.
- This is a research dataset only.