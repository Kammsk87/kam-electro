# TASK-005 - Causal Dataset Builder for Multi-Strategy Router

## Goal

Build a read-only, reproducible canonical dataset from the primary Botalin server logs. The dataset will be the sole permitted substrate for later multi-strategy routing research across 1m, 5m, 15m, 1h, 4h, and 1d horizons.

This task does not search for a profitable strategy and must not create a paper or live candidate.

## Why now

Telegram is an outbound reporting surface, not the source of truth. The server already has primary records for shadow events, counterfactuals, live micro-session decision traces, and completed session outcomes. They must be made causally joinable before any router can choose among sleeves by market regime.

## Preconditions

Read these before work:

1. `CLAUDE.md` in this repository.
2. `/opt/botalin-edge/docs/PROJECT_CONSTITUTION.md` if it exists. If it is absent, report that fact without inventing a replacement.
3. `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`.
4. The current task file.

Relevant lessons must include at least `LESSON-001`, `LESSON-003`, `LESSON-011`, `LESSON-013`, `LESSON-016`, `LESSON-017`, and `LESSON-021`.

## Scope

Work read-only against `/opt/botalin-edge`. Do not alter any active process, service, timer, runner, coordinator, approval, KILL file, environment file, secret, strategy config, paper factory state, or runtime log.

## Required Claude Code subagents

Claude Code must use up to three bounded subagents, then reconcile their findings itself. They are read-only and may not use secrets, start processes, or change server state.

1. **Source mapper**: inspect only the listed primary source paths; produce field-level source/provenance map and identify timestamp semantics.
2. **Causality and data-quality reviewer**: independently identify look-ahead, stale-file, fixture, symbol/venue, duplicate, and outcome-leakage risks; define fail-closed flags.
3. **Test reviewer**: review the proposed builder interface and define synthetic test cases that prove its read-only and causal behavior.

Their roles are deliberately disjoint. The main Claude Code agent owns integration, writes the allowlisted artifacts, runs tests, and resolves contradictions explicitly in the result report. Subagents may not expand scope into strategy selection, paper, live, or data downloads.

The only permitted repository writes are these new research artifacts:

- `scripts/analysis/build_causal_router_dataset.mjs`
- `scripts/test_causal_router_dataset.mjs`
- `reference/CAUSAL_ROUTER_DATASET_CONTRACT_2026-07-29.md`
- `data/causal_router_dataset_schema_2026-07-29.json`
- `tasks/results/TASK-005-CAUSAL-DATASET-BUILDER-FOR-MULTI-STRATEGY-ROUTER-RESULT.md`

Do not commit runtime-derived data files or copied logs. A local/generated sample fixture is permitted only if it is small, synthetic, documented, and covered by `.gitignore` where appropriate.

## Primary sources to inspect

Start from these server-native sources and verify each path exists before relying on it:

- `logs/shadow_trades.jsonl`
- `logs/shadow_counterfactual.jsonl`
- `logs/fade_tokenized_tiny_smoke/decision_trace_*.jsonl`
- `logs/fade_tokenized_tiny_smoke/edge-dc-*.out`
- existing AMEL, NEWS, wallet-flow, order-book, bars, funding/OI files that are already present

Do not treat Telegram message text, dashboard cards, summaries, or derived Markdown reports as source-of-truth evidence when raw logs exist.

## Deliverable A - Canonical event contract

Define a versioned JSON schema for one causal event row. It must make it possible to answer, without looking into the future:

- what was observed at decision time;
- which sleeve/family emitted the event;
- its market, symbol, venue, timestamp and timeframe;
- regime features known at that time;
- entry reference and economic side;
- decision and rejection reason;
- stop/target/timeout if known at decision time;
- realized/forward outcome separated from decision-time fields;
- executable-cost provenance and confidence;
- source path, source row identity, fixture/real label, and data-quality flags.

Separate decision-time, execution-time, and outcome-time namespaces. No field observed after the decision timestamp may be usable as a router feature.

## Deliverable B - Source map and builder

Implement a read-only builder that:

1. Reads explicitly supplied source files only; no network, no keys, no exchange endpoints.
2. Normalizes timestamps to ISO UTC and rejects/flags malformed timestamps.
3. Preserves source provenance per row.
4. Never silently fills missing fields from a later observation.
5. Emits a compact schema/coverage summary to stdout or an explicitly supplied output path.
6. Has `--smoke` mode using only synthetic fixtures and no server/runtime writes.
7. Defaults to dry/read-only behavior. It must not write under `logs/`, `config/`, `/etc`, or any active dataset path.

It is acceptable for the first version to emit a manifest and validation result instead of a full historical merged dataset. Accuracy and source discipline are more important than bulk ingestion.

## Deliverable C - Readiness report

The report must include:

- exact source paths found and their field coverage;
- which data can support 1m/5m/15m/1h/4h/1d router features;
- missing data by sleeve class;
- contamination, fixture, stale-file, venue/symbol, and look-ahead risks;
- a clear distinction between observed data, proxy data, and unavailable data;
- the smallest next task for Router Lab once the contract passes;
- statement that this task cannot conclude profitability, paper readiness, or live readiness.

## Tests and acceptance criteria

Run:

```bash
node --check scripts/analysis/build_causal_router_dataset.mjs
node --check scripts/test_causal_router_dataset.mjs
node scripts/test_causal_router_dataset.mjs
node scripts/analysis/build_causal_router_dataset.mjs --smoke
node scripts/analysis/check_lessons_referenced.mjs --file tasks/results/TASK-005-CAUSAL-DATASET-BUILDER-FOR-MULTI-STRATEGY-ROUTER-RESULT.md
git diff --check
```

Tests must prove at least:

- no order, position, execution, secret, or exchange endpoint appears in the builder;
- an outcome-time field cannot be emitted as a decision-time router feature;
- malformed/missing timestamps fail closed or are flagged;
- fixture rows remain labelled as fixtures;
- source provenance survives normalization;
- `--smoke` does not touch runtime logs or network;
- all default behavior is read-only.

## Hard prohibitions

- No live orders, paper starts, timers, service restarts, coordinator/lease/approval/KILL changes, or execution keys.
- No download of paid data and no public network data pull.
- No modification of `shadow_trades.jsonl`, AMEL, NEWS, wallet watcher, paper factory, active config, or active process.
- No strategy/paper candidate, no `RESET_TS`, no promotion, and `promising_count` must remain zero.
- Do not call anything profitable, paper-ready, or live-ready.

## Completion

Commit and push only the allowlisted task artifacts. Final report must list changed files, tests, source coverage, gaps, and confirmations that all hard prohibitions were respected.
