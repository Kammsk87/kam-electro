# TASK-021 — Botalin Research Warehouse Foundation v0 (Result)

**Task ID:** TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0
**Date:** 2026-08-02
**Type:** read-only foundation. No data migrated, no database created, no service started, no candidate moved.
**Status of this document:** an inventory and structural contract. It is not evidence, not a backtest, not a promotion.

## 0. Summary

Built the catalogue, schemas, lineage contract, query tool, tests and activation plan for a durable
research warehouse. Nothing was migrated and nothing runs. `promising_count` remains `0`.

| Check | Result |
|---|---|
| Syntax (3 `.mjs`) + JSON parse (2 files) | pass |
| Deterministic test suite | **84 / 84 pass** |
| Static scan (11 assertions) | pass |
| Lessons checker (6 assertions) | pass |
| Smoke mode | exit 0, zero filesystem writes |
| `git diff --check` | clean |

## 1. Architecture established

Three layers, deliberately separate because they have different mutability, owners and failure modes.

**Layer 1 — immutable data lake (references only).** 22 `data_source` records. Each carries
`source_id`, `evidence_type`, `retained_path`, `path_kind`, `run_id`, time span, symbols, timeframes,
`schema_fingerprint`, `write_ownership`, `read_only_status`, `verification_status`, `evidence_grade`,
`fixture_flag`, `known_gaps` and `source_of_record`. The warehouse owns none of these bytes; it owns
a reference and copies every path verbatim.

**Layer 2 — research catalogue.** 16 `experiment` and 16 `result` records covering the family space
from the 2026-07-29 strategy inventory. Decision-time (`dt.`), execution-time (`ex.`) and
outcome-time (`oc.`) fields are physically separate lists, and the separation is enforced, not
documented. Results carry the two-axis evidence position, the G0–G9 battery, verdict, closure status,
overlap status, validator identity and evidence paths.

**Layer 3 — lessons and lineage.** 12 `failure_route`, 12 `lesson_link` and 6 `lineage_edge` records
(5 admitted, 1 refused). Each failure route names exactly one of `STRUCTURAL_VARIANT`,
`DATA_REQUEST`, `GUARD_ONLY`, `QUARANTINE`, `REJECTED_FAMILY`, plus its blocking data gap and a
priority.

## 2. Inventory coverage and gaps

Sources by verification status: **2 `VERIFIED_READ_ONLY`** (both repo-resident documents),
**15 `DOCUMENTED_UNVERIFIED`** (every server-resident source), **5 `MISSING`** (declared gaps).
Two additional synthetic fixtures are labelled `SYNTHETIC_FIXTURE`.

**The largest single gap is that no server path was physically confirmed.** SSH access to
`167.233.205.87` was blocked in this environment, so the inventory is built from explicit in-repo
documented paths (`docs/CURRENT_SOURCE_INVENTORY.md`, `BOTALIN_FULL_PROJECT_HANDOFF_2026-07-26.md`,
`BOTALIN_STRATEGY_STATUS_INVENTORY_2026-07-29.md`, `docs/BOTALIN_MASTER_ORCHESTRATION_PLAN_2026-07-30.md`).
Every such record says so in its own `verification_status`, and most `schema_fingerprint` values are
prefixed `unverified:`. I did not work around the block. Closing this is Phase 0 of the activation
plan and needs `GO-WAREHOUSE-0-INVENTORY`.

Seven evidence types have **no available `RAW_PRIMARY` source**: `BARS`, `TRADES`, `OPEN_INTEREST`,
`NEWS`, `WALLET_FLOW`, `RESULT_ARTIFACT`, `REFERENCE_DOC`. `BARS` and `TRADES` are covered only by
derived snapshots, not by a raw recording with trustworthy ingest provenance — which is precisely the
condition that would make those spans unusable for validation and holdout.

Five declared data gaps, and the failure routes they block:

| Gap | Blocks | Priority |
|---|---|---|
| `GAP.OB.HTF_VOLCOMP_COVERAGE` — only 4 usable order-book events | HTF 4h/alt volatility expansion; the execution gate cannot run at all | **1** |
| `GAP.OI_LIQ.FINE_GRAIN` — 5m granularity hides the cascade | Forced-flow / liquidation cascade; the event is undefinable at decision time | 2 |
| `GAP.NEWS.TAGGER_V2` — noisy tagger, future-dated `published_at` | NEWS delayed reaction | 3 |
| `GAP.AMEL.SEVEN_DAY` — recorder incomplete | Wick-reclaim sweep; positive mean with zero median over too few day clusters | 4 |
| `GAP.WALLET.SEVEN_WALLET_BALANCED` — completed run was 3 wallets, all-short | Wallet/crowd guard | 5 |

Unindexed by design: the canonical lessons ledger is not mirrored into this repository, so 8 of 12
lesson titles are reconstructed from prior task reports rather than read from
`BOTALIN_LESSONS_LEDGER.md`. All are marked `DOCUMENTED_UNVERIFIED` and must be reconciled on the
first verified read. Also unindexed: `BYBIT.ACCOUNT.HISTORY` has no recorded retained path at all —
the dataset exists only in narrative form.

## 3. Lineage safeguards

The failure this warehouse exists to prevent is a rejected family returning under a new name with
filters narrowed on the sample that killed it.

**INV-03.** A `STRUCTURAL_VARIANT_OF` edge whose parent is closed rejected or quarantined is admitted
only with all three of `structural_difference`, `new_task_id` and `new_model_identity` present and
non-blank. A failing edge is **refused**, not warned about: it never enters the catalogue, it is
recorded in `rejected_records` as `UNLINKED_REJECTED_FAMILY_VARIANT`, and the query CLI lists it
under refused, never under permitted. Blank and whitespace-only values do not satisfy it, and partial
linkage does not either.

The seed carries one such edge deliberately (`LE.FADE_UNLINKED_REVIVAL_BLOCKED`, a proposed FADE
retry) so the refusal path is exercised on every single run rather than only inside a unit test. The
one permitted variant, 1h → 4h/alt volatility compression, satisfies all three fields — and is still
recorded as restricted to confirmation on data generated after the 1h failure, because the 4h scope
was chosen knowing 1h had failed and therefore counts as a prior trial.

Supporting invariants: provenance verbatim and referential integrity (INV-04); secondary evidence
must name the raw source that outranks it (INV-05); no promotion — `ADMITTED_RESEARCH_ONLY` needs
every declared gate PASS *and* a named independent validator (INV-06). The verdict enumeration
contains no value meaning profitable or live-ready, and a test asserts that.

## 4. Tests, static scan, lessons checker

`node scripts/test_research_warehouse_catalog.mjs` — **84 passed, 0 failed.**

| Group | Pass | Proves |
|---|---:|---|
| schema validation | 13/13 | Closed schema, enums, patterns, ISO timestamps, gate maps; the seed validates with zero errors |
| provenance preservation | 6/6 | Paths and `source_of_record` survive verbatim; dangling references and duplicate keys are errors |
| decision/outcome separation | 6/6 | Prefix and disjointness rules; an `ex.`/`oc.` field used as a decision input is rejected |
| rejected-family lineage | 10/10 | Unlinked, partially-linked and blank-linked variants all refused; no-promotion invariant |
| explicit-root-only scanning | 12/12 | Filesystem root, home, home ancestors, normalised paths and secret-looking roots all refused |
| smoke-mode non-mutation | 5/5 | Byte-identical `data/` before and after; `--out`/`--csv` refused with exit 65 |
| determinism | 3/3 | Two builds byte-identical; no embedded timestamp; stable CSV with balanced quoting |
| coverage and queries | 12/12 | All five required questions answered; `MISSING` never counted as coverage |
| static scan | 11/11 | See below |
| lessons checker | 6/6 | See below |

**Static scan** runs over comment-stripped source of all three shipped programs and asserts: every
import is on a five-module allowlist (`node:fs`, `node:path`, `node:url`, `node:os`, plus the local
relative imports); no network, process/service/shell, credential/environment, or
exchange/account/order/position token appears; no runtime state of the trading stack is referenced;
no destructive filesystem call exists; `promising_count` is never set to a nonzero value; the builder
contains exactly two `writeFileSync` and two `mkdirSync` calls, both guarded by explicit `--out`/`--csv`;
the query CLI contains no write call at all; and only the builder may import a write primitive.

There is one audited exemption, and it is visible in the source: a sentinel-fenced region in each
scanned file holds the denylists themselves and the negative-test literals, because a list of
forbidden tokens must necessarily name them. Nothing outside those sentinels may contain any of the
tokens, and that is what the scan checks.

**Lessons checker** asserts every lesson id is well formed; that all eight lessons TASK-021 declares
relevant (003, 005, 011, 013, 016, 017, 019, 021) are linked; that every terminally failed family
carries at least one lesson link; that each link names its ledger path and verification state; and
that an unverified title is never presented as verified. It found two real gaps during development —
`FAM.FAILED_BREAKOUT` and `FAM.ACCOUNT_FORENSICS` had no lesson link — which were fixed by adding
`LESSON-005` and `LESSON-007` links rather than by relaxing the check.

## 5. Exact operator GO required for later activation

Nothing below is authorized by acceptance of this task. Phases are strictly ordered; none is implied
by the previous one.

| # | Phase | GO |
|---:|---|---|
| 0 | Read-only physical inventory of every `DOCUMENTED_UNVERIFIED` path. Write nothing. | `GO-WAREHOUSE-0-INVENTORY` |
| 1 | Provision `/opt/botalin-warehouse` and the `warehouse` user. No data. | `GO-WAREHOUSE-1-PROVISION` |
| 2 | Pilot ingest of one named source. | `GO-WAREHOUSE-2-PILOT-INGEST` |
| 3 | Backfill of an enumerated source list. | `GO-WAREHOUSE-3-BACKFILL` |
| 4 | Legacy `/opt/botalin` SQLite ingest (runners still active). | `GO-WAREHOUSE-4-LEGACY-INGEST` |
| 5 | Install DuckDB, read-only, no server. | `GO-WAREHOUSE-5-DUCKDB` |
| 6 | Enable the localhost read-only query endpoint. First running service. | `GO-WAREHOUSE-6-ENDPOINT` |
| 7 | Automated retention and backup timers. First automated deletion. | `GO-WAREHOUSE-7-RETENTION` |

Phase 0 is the immediate next step and the cheapest: it converts 15 `DOCUMENTED_UNVERIFIED` records
into `VERIFIED_READ_ONLY` or `MISSING`, which is where most current uncertainty sits.

## 6. What this task cannot conclude

1. That any catalogued server path exists, has the stated span, or has the stated schema. Nothing was
   physically verified.
2. That any lesson title is accurate. Eight of twelve are reconstructed and marked unverified.
3. That the seeded trial counts are complete. They are lower bounds; deflation computed from them
   understates the correction actually required.
4. That any mechanism has an edge, that any gap is closable, or that closing a gap would change any
   verdict. A catalogue makes existing evidence findable; it creates none.
5. Anything about paper or live readiness. No gate was evaluated, no metric computed, no candidate
   moved, no `model_id` or `RESET_TS` created.

## 7. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | none — infrastructure task; no candidate state changed |
| Lifecycle state left | none |
| Position in the state machine | The programme remains blocked at `DATA_HEALTH`. This task builds the instrument that makes `DATA_HEALTH` auditable |
| Next permitted transition | none performed. `DATA_HEALTH` → `DISCOVERY` still requires the Data Truth Auditor gate |
| Evidence gate passed / failed | none evaluated — no data was analysed |
| Failure route | not applicable (no candidate assessed) |
| Next queued task and owner | Warehouse Phase 0 read-only inventory under `GO-WAREHOUSE-0-INVENTORY`, owner Claude Code under Codex review. Task selection remains Codex's decision |
| What this task cannot conclude | §6 |
| Files changed | The 8 allowlisted deliverables only |
| Prohibitions respected | No data migrated or copied. No database, server, or service started. No collector, runner, coordinator, approval, KILL, config, `model_id`, `RESET_TS`, or `promising_count` touched. No secret read. No exchange, account, or order endpoint contacted. No network download. SSH was blocked and not worked around. `promising_count` remains `0`. No profitability or live-readiness claim is made |

**Relevant lessons** (source: `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`, **not read by
this task** — titles below are reconstructed from prior task reports and are marked
`DOCUMENTED_UNVERIFIED` in the catalogue):

- **LESSON-003** — INV-03 refuses an unlinked variant of a rejected family outright.
- **LESSON-005** — every result records its segment and axis position, so an in-sample number cannot
  be quoted as out-of-sample.
- **LESSON-011** — results record `n_events`, `n_symbols` and `n_blocks`, making a tiny-N pocket
  visible as such.
- **LESSON-013** — `GAP.OI_LIQ.FINE_GRAIN` records granularity as a first-class blocker.
- **LESSON-016** — the NEWS gap records that `first_seen_at` is the causal timestamp and
  `published_at` is untrusted.
- **LESSON-017** — the wallet-flow family is routed `GUARD_ONLY` with directional use closed.
- **LESSON-019** — `prior_trials_seeded` carries the 116 overfit-lab trials plus 930 AMEL
  combinations into the catalogue so deflation cannot start from zero.
- **LESSON-021** — the FADE family is recorded as failing at ideal fill with clean execution, so no
  execution work can be proposed to rescue it.

No new lesson.

## 8. Commit

Deliverables committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`:

1. `scripts/analysis/build_research_warehouse_catalog.mjs`
2. `scripts/analysis/query_research_warehouse_catalog.mjs`
3. `scripts/test_research_warehouse_catalog.mjs`
4. `reference/BOTALIN_RESEARCH_WAREHOUSE_CONTRACT_2026-08-02.md`
5. `reference/BOTALIN_RESEARCH_WAREHOUSE_ACTIVATION_PLAN_2026-08-02.md`
6. `data/research_warehouse_catalog_schema_2026-08-02.json`
7. `data/research_warehouse_catalog_fixture_2026-08-02.json`
8. `tasks/results/TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0-RESULT.md` (this file)

No other file in the working tree was staged or committed.
