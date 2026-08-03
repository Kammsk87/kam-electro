# TASK-010 - Causal Router Replay Adapter v0

## Goal

Connect the canonical causal dataset contract from TASK-005 to the pure Router Lab core from TASK-009 in a strictly read-only replay path. The output must explain why each historical row is `NO_TRADE` or remains ineligible; it must never manufacture an admissible strategy.

This is integration infrastructure, not a strategy search, paper observer, or live deployment.

## Prerequisites

Read before work:

1. `CLAUDE.md`.
2. `reference/CAUSAL_ROUTER_DATASET_CONTRACT_2026-07-29.md`.
3. `reference/ROUTER_LAB_V0_IMPLEMENTATION_CONTRACT_2026-07-30.md`.
4. `tasks/results/TASK-005-CAUSAL-DATASET-BUILDER-FOR-MULTI-STRATEGY-ROUTER-RESULT.md`.
5. `tasks/results/TASK-009-ROUTER-LAB-CORE-SCAFFOLD-V0-RESULT.md`.
6. `reference/BOTALIN_LESSONS_LEDGER.md`.

Relevant lessons: `LESSON-001`, `LESSON-003`, `LESSON-007`, `LESSON-013`, `LESSON-016`, `LESSON-017`, `LESSON-021`.

## Safety boundary

Work in `/opt/botalin-edge`.

- Read only explicitly supplied source paths. No default scan of runtime logs.
- No network, keys, environment reads, exchange endpoints, Telegram, order/position/execution calls, subprocesses, services, timers, paper runs, live runs, coordinator, approval, KILL, strategy config, model ID, or `RESET_TS`.
- Do not write to `logs/`, `config/`, runtime datasets, or any active path.
- Default mode is `--smoke` with entirely in-file synthetic data. A real replay needs an explicit `--input <path>` and explicit `--out <path>` outside tracked/runtime paths.
- `promising_count` remains `0`. Do not create a candidate, paper config, or registry admission.

## Allowed files

- `lib/router_causal_replay_adapter.mjs`
- `scripts/analysis/router_lab_causal_replay_v0.mjs`
- `scripts/test_router_causal_replay_adapter.mjs`
- `reference/ROUTER_LAB_CAUSAL_REPLAY_ADAPTER_CONTRACT_2026-07-30.md`
- `tasks/results/TASK-010-CAUSAL-ROUTER-REPLAY-ADAPTER-V0-RESULT.md`

No other repository file may change. Generated replay output is not committed.

## Required behaviour

### A. One-way causal adapter

Accept only normalized decision-time fields from the TASK-005 schema and a caller-supplied, non-admitted synthetic registry. Explicitly reject:

- `execution.*`, `outcome.*`, realized PnL, post-decision fills, forward returns, and future timestamps as router features;
- incomplete regime values, unknown provenance, fixture/real label ambiguity, stale or malformed timestamp rows;
- any record that tries to claim `ALPHA_SLEEVE` admission for a real Botalin family.

The adapter must retain source provenance, row identity, fixture status, decision timestamp, and rejection reasons in each record.

### B. Replay semantics

For each input row:

1. validate causal availability at decision time;
2. construct only the Router Lab's decision-time input;
3. invoke the pure TASK-009 core;
4. emit a deterministic record containing input validation, router outcome, and an explanation of missing gates;
5. never use any realized or forward outcome in selection.

The first real replay is expected to be mostly or entirely `NO_TRADE`; that is a successful integrity result if caused by genuinely missing regime or admission evidence.

### C. Output and diagnostics

The CLI must report, without claiming performance:

- total / valid / refused rows;
- `NO_TRADE` counts by primary reason and missing gate;
- coverage by timeframe (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`) and provenance class;
- rows excluded for look-ahead, stale data, fixture ambiguity, missing regime, or missing execution proof;
- exact schema/core/registry fingerprints;
- `promising_count=0` and zero allocation.

Do not calculate PnL, win rate, Sharpe, strategy ranking, or an action recommendation.

### D. Tests

Test at least:

- synthetic valid decision-time row yields a deterministic router record;
- outcome/execution/PnL leakage is refused before calling the core;
- future `ingest_ts` or `value_ts` is refused;
- malformed/stale/fixture-ambiguous rows fail closed;
- a real-family registry row cannot become an admitted alpha sleeve;
- missing regime or execution proof yields `NO_TRADE`, never a default action;
- identical input yields byte-stable output;
- static scans prove no network, keys, environment, order/position/execution, Telegram, child-process, or runtime-write capabilities;
- `--smoke` uses only in-file fixtures;
- explicit input/output argument forms with both `--k v` and `--k=v` behave identically.

## Acceptance

```bash
node --check lib/router_causal_replay_adapter.mjs
node --check scripts/analysis/router_lab_causal_replay_v0.mjs
node --check scripts/test_router_causal_replay_adapter.mjs
node scripts/test_router_causal_replay_adapter.mjs
node scripts/analysis/router_lab_causal_replay_v0.mjs --smoke
node scripts/analysis/check_lessons_referenced.mjs --file tasks/results/TASK-010-CAUSAL-ROUTER-REPLAY-ADAPTER-V0-RESULT.md
git diff --check
```

Commit and push only the five allowlisted artifacts. The result must state lifecycle position, data limitations, what cannot be concluded, exact changed files, checks, and `No new lesson.`
