# TASK-AH-041 Result - Triad Structural Strategies v0

## Verdicts

`DISCOVERY_NOT_PROOF`. No paper/live candidate, promotion, service, collector,
configuration, or trading state was changed. PnL is never pooled.

| Member | Verdict | Material reason |
| --- | --- | --- |
| `CS_RELATIVE_STRENGTH_24H` | `DATA_INADEQUATE` | Actual AH-005A replay ran, but holdout/forward have 45/29 observations, below the predeclared 100 each; combined OOS is net-negative. |
| `FUNDING_PERSISTENCE_CARRY` | `DATA_INADEQUATE` | The supplied canonical inputs do not form a causal synchronized spot/perp/funding-publication/borrow/basis/two-leg dataset. |
| `NEWS_FORCED_FLOW_REACTION` | `DATA_INADEQUATE` | No supplied causal `first_seen` event labels and aligned executable quotes meet the fixed schema. |

## Cross-Sectional Relative Strength Replay

Input was the frozen AH-005A 109-symbol, 1h archive from 2025-03-20 through
2026-03-19, deterministically aggregated into complete UTC daily bars in
`/tmp`; the source archive was not modified. The frozen universe identifier is
`AH-005A-e0ef986fe15e818750ffdd98d707cdb4fbfa2e5e07b804cdb8908bc60b113a0f`.

The fixed book is: daily 7-day return minus universe-median return; long the
top quintile and short the bottom quintile, equal notional, gross 1.0/net 0,
next-open entry and 24h hold. Costs are 11 bps gross round trip and 22 bps
double-cost stress. Purge is two days and embargo seven days.

| Split | Observations | Days | Net mean bps | Net median bps | Net total bps |
| --- | ---: | ---: | ---: | ---: | ---: |
| Train | 169 | 169 | -9.64 | -10.66 | -1,629.71 |
| Validation | 64 | 64 | +2.69 | +8.06 | +171.90 |
| Holdout | 45 | 45 | +0.14 | +7.94 | +6.12 |
| Forward | 29 | 29 | -14.74 | -16.95 | -427.38 |
| Combined OOS | 74 | 74 | -5.69 | +1.30 | -421.26 |

The 1,000 shuffled-rank null has median -11.04 bps versus observed +1.30 bps,
but `p=0.05` does not clear the strict `<0.05` gate. Double-cost OOS median is
-9.70 bps. Removing the best symbol (`RENDERUSDT`) or day (`2026-02-04`) makes
the total more negative. The 6-day neighbour has negative validation mean;
the 8-day neighbour is slightly positive. Concentration is low (2.98%), but
it does not rescue the negative combined OOS mean or thin forward sample.

Exact overlap with rejected raw-momentum and pairs families is unavailable and
blocking, so no passport could be drafted even if all statistics had passed.

## Checks

`node --check` passed; deterministic suite passed 58/58. The server replay
completed using only the offline archive and temporary derived daily bars.
Static tests assert no network, credentials, order, account, position, service,
or configuration code. `git diff --check` passed. The server staged scan with
`gitleaks` must pass before commit. No push is performed.

Artifacts: `data/ah041_triad_structural_strategies_2026-08-03.{json,csv}`.
