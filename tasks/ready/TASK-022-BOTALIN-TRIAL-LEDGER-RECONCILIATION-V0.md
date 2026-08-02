# TASK-022 - Botalin Trial Ledger Reconciliation v0

## Objective

Extend the read-only research warehouse so the programme does not confuse a
family-level experiment with the individual hypotheses, parameter variants,
data splits, and attacks that consumed shared evidence. The ledger must expose
the real lower-bound trial count, avoid double counting, preserve the link from
every trial to its parent experiment, and make missing row-level evidence
visible instead of inventing it.

This is a research-memory task, not a new strategy search, parameter sweep, or
promotion task.

## Safety boundary

Use only committed/local task reports, result artefacts, and explicit metadata
already described in the repository. Do not access the server, move/copy/raw
ingest runtime data, create a database or service, start/stop collectors or
live/paper processes, modify coordinator/approval/KILL/config/model_id/RESET_TS
or promising_count, read secrets, use network, or contact any exchange,
account, order, execution, or position endpoint.

Do not infer individual variants from an aggregate count. A count may be
represented as an aggregate ledger entry only when its source gives no
recoverable child records; it must then state exactly what source artefact is
needed to reconcile it later.

## Required work

1. Add versioned `trial_ledger_entry` and `trial_evidence` schemas to the
   warehouse contract. Each entry must record immutable trial and parent IDs,
   mechanism/family, kind, representation, exact trial count, deduplication
   key, evidence path, verification grade, parameter fingerprint where
   available, split/cost/verdict/failure route, reconciliation status, and
   missing child evidence where needed.
2. Reconcile the documented lower-bound count across the existing warehouse
   seed. Account separately for at least the 930 AMEL combinations and 116
   overfit-lab variants, without pretending they are one or two experiments.
   Add only records whose factual fields are supported by a local artefact;
   preserve unknown values as unknown.
3. Enforce count conservation: every parent experiment's `prior_trials_seeded`
   equals the sum of non-overlapping ledger entries linked to it. A child cannot
   be both an individual variant and included in an aggregate batch. Reject an
   entry with an invented parameter fingerprint or no evidence link.
4. Extend the read-only query CLI with `trials`, `trial-summary`, and
   `trial-lineage` commands. They must show independent experiments,
   individual rows, aggregate-only batches, lower-bound trials, reconciliation
   coverage, missing-evidence sources, and parent/outcome/lesson lineage.
5. Update the warehouse activation plan with a Phase 0b reconciliation step:
   source-by-source import of historical trial records only after physical
   source verification. It must not authorize a backfill or database.

## Acceptance

- The result reports the precise lower-bound trial total, and separately the
  number of individual and aggregate-only entries. It must not describe all
  aggregate counts as individual ideas.
- Unit tests prove count conservation, parent linkage, aggregate/child
  exclusivity, refusal of fabricated variants, no double counting across
  robustness/null controls, deterministic output, and query answers.
- Existing TASK-021 safety tests stay green, new static scan proves no network,
  credential, runtime, process, service, exchange, or trading path.
- No candidate state, paper/live process, raw dataset, or server state changes.

## Allowlisted deliverables

1. `scripts/analysis/build_research_warehouse_catalog.mjs`
2. `scripts/analysis/query_research_warehouse_catalog.mjs`
3. `scripts/test_research_warehouse_catalog.mjs`
4. `reference/BOTALIN_RESEARCH_WAREHOUSE_CONTRACT_2026-08-02.md`
5. `reference/BOTALIN_RESEARCH_WAREHOUSE_ACTIVATION_PLAN_2026-08-02.md`
6. `data/research_warehouse_catalog_schema_2026-08-02.json`
7. `data/research_warehouse_catalog_fixture_2026-08-02.json`
8. `tasks/results/TASK-022-BOTALIN-TRIAL-LEDGER-RECONCILIATION-V0-RESULT.md`

Run syntax checks, the full deterministic test suite, smoke queries, static
scan, lessons checker, and `git diff --check`. Commit only the allowlisted
deliverables and report any unresolvable historical gaps as explicit recovery
sources, never as zero trials.
