# TASK-AH-005 - Pre-Registered Unseen 1h Pattern Recheck v0

## Goal

Test the sole structural variant discovered in AH-004A on genuinely unseen time: a 1-hour cross-sectional fade of an extreme upward impulse in the illiquid tier. This is a falsification test, not a search for a better parameter set.

## Frozen Rule

The following choices are frozen before the new window is read:

- universe: the same available crypto-perpetual universe used by AH-004, with source/provenance written explicitly;
- bar timeframe: `1h`;
- signal: upward impulse `z >= 4.0`, where z is calculated only from decision-time trailing data;
- liquidity tier: lower third by **train-only** hourly traded-volume distribution;
- direction: short the signal symbol;
- hedge: cross-sectional mean return excluding the signal symbol;
- entry reference: next executable 1h open when an independent open exists; otherwise label entry realism `DATA_INADEQUATE` and do not substitute close-to-close silently;
- exits: exactly `12h` and `24h`, both reported with no further exit search;
- costs: both `11 bps per leg` and `22 bps per leg`, no favourable funding assumption;
- primary robustness gate: holdout mean remains positive after removing the three best symbols.

No threshold, universe, liquidity tier, hedge, entry, exit, or cost may be changed after reading new outcomes.

## Data Boundary

Work read-only in `/opt/botalin-edge`. First inventory existing 1h bars. If the needed 2026-03-20-to-present range is missing, public keyless Bybit klines may be fetched only through an existing research helper or a new read-only downloader that:

- uses no keys, environment files, private endpoints, order/position/execution endpoints, or live/paper paths;
- writes raw downloads only under `/mnt/data-vol/botalin-research/ah005/`, never into the repo, config, or runtime logs;
- records endpoint, fetch timestamp, symbol, interval, pagination and missing-data status;
- stops if disk free space would fall below 2 GB.

No live/paper/coordinator/approval/KILL/config/model ID/RESET_TS/services/timers changes. `promising_count=0`.

## Required Checks

1. Verify source timestamps, independent opens, continuity and decision-time availability.
2. Keep the original pre-2026-03-20 period immutable as development history; do not combine it into the primary OOS result.
3. Evaluate the frozen rule on the unseen window by calendar-day blocks.
4. Report event count, symbols, day clusters, mean, median, both cost tiers, matched null, remove-best-1/3 symbols, remove-best day, and concentration.
5. State whether the result passes the frozen primary gate. Do not inspect alternative thresholds or holds after seeing the OOS result.

## Verdicts

- `OOS_SURVIVES_EXECUTION_DATA_REQUEST`: all frozen OOS gates pass, so at-event order-book/funding data can be requested next.
- `OOS_FAIL_REJECT_FAMILY`: primary gate fails; close this exact family and do not revive it under a renamed parameter set.
- `DATA_INADEQUATE`: source/opens/coverage prevent the specified test; state precisely what is missing.

## Deliverables

Create only a narrow allowlist of analysis script, unit/smoke test, reference report, CSV/JSON result and task result. Do not commit raw downloaded data. Before commit/push, run syntax, smoke, full test, static no-trading scan, lessons checker, and `git diff --check`.

## Required Lessons

Apply `LESSON-003`, `LESSON-007`, `LESSON-016`, `LESSON-017`, and `LESSON-021`. State lifecycle position, gate, failure route, next owner, and what the task cannot conclude.
