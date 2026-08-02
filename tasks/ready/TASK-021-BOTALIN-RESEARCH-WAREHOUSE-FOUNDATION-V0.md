# TASK-021 - Botalin Research Warehouse Foundation v0

## Objective

Build the read-only foundation for a durable Botalin research warehouse. It
must make accumulated raw data, experiment results, known failures, lessons,
and remaining structural variants discoverable without mixing them with live or
paper trading state. This task builds the catalogue, lineage contract, query
tool, and migration plan; it does not migrate or rewrite production logs and
does not start a server service.

## Architecture to establish

The warehouse has three deliberately separate layers:

1. **Immutable data lake**: server-resident raw market, order-book, trade,
   liquidation, OI, funding, NEWS, wallet-flow, and manual-trade evidence.
   Each object needs source, run ID, time span, schema fingerprint, retained
   path, write ownership, and read-only status.
2. **Research catalogue**: one record per experiment, data source, model family,
   frozen rule, timeframe, universe, decision-time fields, outcome fields,
   costs, result, gate results, failure mechanism, overlap/closure status,
   allowed successor, evidence paths, commit/branch, and evidence grade.
3. **Lessons and lineage graph**: explicit links from an experiment to the
   lesson/failure it created or applied, and to any permitted structural variant.
   Rejected family variants cannot be started unless their linkage records the
   specific structural difference and a new frozen task ID.

## Safety boundary

Read-only inventory of existing server/local sources. Do not move, copy, delete,
backfill, rewrite, or relabel runtime logs; start a database/server/service;
modify collectors, runners, coordinator, approval, KILL, configurations,
model_id, RESET_TS, or promising_count; read secrets; or call exchange,
account, order, execution, or position endpoints. No network download or paid
service.

Relevant lessons: LESSON-003, LESSON-005, LESSON-011, LESSON-013,
LESSON-016, LESSON-017, LESSON-019, LESSON-021.

## Required work

1. Inventory actual raw-source paths and existing result artefacts by evidence
   type, but preserve source paths as references only. Treat Telegram and
   Markdown summaries as secondary evidence when a raw source exists.
2. Define versioned JSON schemas for `data_source`, `experiment`, `result`,
   `failure_route`, `lesson_link`, and `lineage_edge`. Separate decision-time,
   execution-time, and outcome-time fields.
3. Implement a pure, read-only catalogue builder that accepts explicit input
   roots, validates manifests and result records, emits a compact JSON/CSV
   catalogue to an explicitly supplied output path, and defaults to smoke mode
   with synthetic fixtures. It must not scan arbitrary home directories.
4. Implement a query CLI that can answer at minimum:
   - What data exists for a given source/timeframe/symbol/time span?
   - Which experiments tested a mechanism and what were their gates/verdicts?
   - Why was a family rejected or left data-inadequate?
   - Which structural variants are still permitted, and which are quarantined?
   - Which data gap blocks the highest-priority next test?
5. Create a server activation/migration plan for a future Parquet + DuckDB
   research lake. The plan must include partitioning, hashes, append-only raw
   ingestion, retention, access control, backup, a read-only query endpoint,
   and a separate operator GO. Do not install DuckDB, create a database, or
   enable the service in this task.
6. Seed only small synthetic fixtures and metadata about known experiment
   families; do not commit raw runtime data, account history, or secrets.

## Acceptance

- Static scan proves no network, credential, exchange, process, service, or
  runtime-write path.
- Unit tests prove schema validation, provenance preservation, decision/outcome
  separation, refusal of unlinked rejected-family variants, explicit-root-only
  scanning, and smoke-mode non-mutation.
- Result reports inventory coverage, unindexed gaps, the proposed warehouse
  root/layout, and the exact operator-GO needed for activation/migration.
- No strategy is promoted; paper/live remain untouched.

## Allowlisted deliverables

1. `scripts/analysis/build_research_warehouse_catalog.mjs`
2. `scripts/analysis/query_research_warehouse_catalog.mjs`
3. `scripts/test_research_warehouse_catalog.mjs`
4. `reference/BOTALIN_RESEARCH_WAREHOUSE_CONTRACT_2026-08-02.md`
5. `reference/BOTALIN_RESEARCH_WAREHOUSE_ACTIVATION_PLAN_2026-08-02.md`
6. `data/research_warehouse_catalog_schema_2026-08-02.json`
7. `data/research_warehouse_catalog_fixture_2026-08-02.json`
8. `tasks/results/TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0-RESULT.md`

Run syntax, deterministic tests, smoke, static scan, lessons checker, and
`git diff --check`, then commit/push only the allowlisted deliverables.
