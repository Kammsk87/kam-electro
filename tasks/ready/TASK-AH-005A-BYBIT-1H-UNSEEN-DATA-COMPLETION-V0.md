# TASK-AH-005A: Bybit 1h Unseen Data Completion v0

## Objective

Close the documented data-health blocker for the frozen AH-005 OOS recheck:
obtain a provenance-manifested, public Bybit-linear 1h OHLC archive for the
original 109-symbol AH-004 universe from `2026-03-20` through the latest safe
historical boundary. This task supplies data only; it must not test or alter
the frozen AH-005 rule.

## Lifecycle

Stage: `DATA_HEALTH`.

Next permitted transition: `TASK-AH-005` may run only if the completed archive
has exact frozen-universe coverage, independent next-bar opens, continuity, and
an immutable provenance manifest. Otherwise the result is `DATA_INADEQUATE`.

## Rules

- Read `CLAUDE.md`, project constitution, controller protocol, master plan,
  lifecycle, lessons ledger, and frozen `TASK-AH-005` first.
- The frozen universe and OOS start date must not change.
- Public keyless endpoint only: Bybit `/v5/market/kline` with `category=linear`
  and `interval=60`.
- No private endpoint, keys, live/paper, runner/service/timer, coordinator,
  approval, KILL, config, model-id, RESET_TS, or order activity.
- Raw downloads must go outside the repo to
  `/mnt/data-vol/botalin-research/ah005/` and stop before free disk falls below
  2 GB. Do not commit raw market data.
- Never backfill by duplicating a close into an open. The report must prove
  independently sourced OHLC opens.

## Implementation

Allowed tracked files:

- `scripts/analysis/ah005_bybit_1h_data_inventory.mjs`
- `scripts/test_ah005_bybit_1h_data_inventory.mjs`
- `reference/AH005_BYBIT_1H_DATA_COMPLETION_PROTOCOL_2026-07-30.md`
- `data/ah005_bybit_1h_data_inventory_2026-07-30.json`
- `data/ah005_bybit_1h_data_inventory_2026-07-30.csv`
- `tasks/results/TASK-AH-005A-BYBIT-1H-UNSEEN-DATA-COMPLETION-V0-RESULT.md`

The downloader must paginate causally, write one raw file per symbol outside
the repo, and emit a manifest with endpoint, request ranges, fetch timestamp,
source row count, first/last bar, duplicate count, missing intervals,
timestamp semantics, SHA-256, and source/error status.

## Acceptance

- `node --check`, focused unit tests, and a smoke mode pass.
- Test pagination, reversed API order, duplicates, missing bars, HTTP failure,
  non-independent `open == prior close` pattern flagging, and disk guard.
- The result gives coverage by symbol and one decision only:
  `DATA_READY_FOR_FROZEN_AH005` or `DATA_INADEQUATE`.
- Commit only the allowlisted implementation, manifests, protocol, and result.
