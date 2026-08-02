# Botalin Research Warehouse — Contract v0

**Task:** TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0
**Date:** 2026-08-02
**Status:** read-only foundation. No data was migrated, no service was started, no candidate changed state.

## 0. What this document is

This is the structural contract for a durable research warehouse: what a record must contain, how
provenance is preserved, and which transitions the catalogue refuses. It is **not** evidence, not a
result, and not authorization to read, copy, move, or write any runtime data.

The warehouse exists to answer one class of question reliably: *what do we already know, from which
raw source, and what does that forbid us from repeating?* A programme that has run 30-35 families,
100-150 mechanisms and 1000+ parameter combinations cannot rely on narrative memory. Every number in
a summary document is secondary to the raw source that produced it, and the catalogue is built to
make that ordering machine-checkable rather than cultural.

## 1. Three separate layers

The layers are separate because they have different mutability, different owners, and different
failure modes. Collapsing them is how a research record becomes a trading record by accident.

### Layer 1 — Immutable data lake

Server-resident raw evidence: market bars, order books, ticks, trades, liquidations, open interest,
funding, NEWS, wallet flow, and manual-trade history. The warehouse **never** owns these bytes; it
owns a reference to them.

Every object carries:

| Field | Why it is mandatory |
|---|---|
| `source_id` | Stable identity independent of path churn |
| `evidence_type` | Determines which questions the source may be used to answer |
| `retained_path` | Reference only. Copied verbatim, never rewritten by any tool |
| `path_kind` | File, directory, glob, database file, or stream — different retention semantics |
| `run_id` | Ties an object to the recorder invocation that produced it |
| `time_span_start` / `time_span_end` | Makes temporal-overlap errors detectable instead of silent |
| `symbols`, `timeframes` | Scope of what the source can support |
| `schema_fingerprint` | A source whose shape is unknown is declared unknown, never assumed |
| `write_ownership` | Who is allowed to append. The warehouse is never in this field |
| `read_only_status` | `READ_ONLY`, `APPEND_ONLY_BY_OWNER`, or `MUTABLE_RUNTIME` |
| `verification_status` | Whether the path was physically confirmed, only documented, or missing |
| `evidence_grade` | Raw primary, derived primary, secondary doc, secondary chat, synthetic fixture |
| `fixture_flag` | Immutable label; a synthetic row may never be mistaken for a recording |
| `known_gaps` | What the source cannot support, stated at registration time |
| `source_of_record` | Where the catalogue entry's own information came from |

`verification_status` is the field that keeps this catalogue honest. `DOCUMENTED_UNVERIFIED` means a
document says the path exists and no tool in this task confirmed it. It is not a weaker synonym for
"present"; it is an explicit admission, and every consumer sees it.

### Layer 2 — Research catalogue

One `experiment` record per tested rule, and one `result` record per segment it was evaluated on.

The experiment record separates the three time namespaces physically:

- `decision_time_fields` — prefix `dt.`, readable at decision time `t`
- `execution_time_fields` — prefix `ex.`, known at or after order placement
- `outcome_time_fields` — prefix `oc.`, known only after resolution

The three lists must be pairwise disjoint, and `frozen_rule.decision_inputs` may contain neither an
`ex.` nor an `oc.` field. This is the leak that produces beautiful backtests, so it is enforced by
the builder rather than by review.

The result record carries the two-axis evidence position (`axis_L` lookahead freedom, `axis_X`
execution realism), the gate battery, the verdict, the closure status, the overlap status, the
independent validator identity, and the evidence paths. The verdict enumeration deliberately
contains **no** value meaning profitable or live-ready:

```
INSUFFICIENT_DATA | DATA_REQUEST | HYPOTHESIS_ONLY | NEEDS_MORE_LOGGING |
GUARD_ONLY | DUPLICATE_OR_OVERLAP | QUARANTINED | REJECTED_FAMILY | ADMITTED_RESEARCH_ONLY
```

`ADMITTED_RESEARCH_ONLY` is the ceiling, it requires every declared gate to pass **and** a named
independent validator, and it is still not paper or live authorization.

### Layer 3 — Lessons and lineage graph

`failure_route` records why a family died and where, if anywhere, it may go: exactly one of
`STRUCTURAL_VARIANT`, `DATA_REQUEST`, `GUARD_ONLY`, `QUARANTINE`, `REJECTED_FAMILY`. It names the
`blocking_data_gap_id` when the blocker is data rather than signal, and a `priority` so the queue is
orderable without re-reading prose.

`lesson_link` ties an experiment or family to the lesson it created or applied, and records the
ledger path plus whether that ledger was actually read.

`lineage_edge` records the graph: created/applied lesson, structural variant, duplicate, data
request, guard derivation, supersession.

## 2. The lineage safeguard

The failure mode this warehouse exists to prevent is a rejected family returning under a new name
with filters narrowed on the sample that killed it.

**INV-03.** A `STRUCTURAL_VARIANT_OF` edge whose parent is closed rejected or quarantined is admitted
only when all three of these are present and non-blank:

1. `structural_difference` — what actually changed, in mechanism terms, not in parameter terms;
2. `new_task_id` — a fresh frozen task, so the variant cannot inherit the parent's preregistration;
3. `new_model_identity` — a new identity, so evidence starts from zero.

An edge failing this is not warned about. It is **refused**: it never enters the catalogue, it is
recorded in `rejected_records` with reason `UNLINKED_REJECTED_FAMILY_VARIANT`, and the query CLI's
`variants` command lists it under refused, never under permitted. The seed carries one such edge
deliberately (`LE.FADE_UNLINKED_REVIVAL_BLOCKED`) so that the refusal path is exercised on every run
rather than only in a unit test.

A satisfied linkage is still not permission to conclude anything. The permitted 1h→4h volatility
variant in the seed changes timeframe *and* universe scope, carries a new task id and a new model
identity — and is still restricted to confirmation on data generated after the 1h failure was
recorded, because the 4h scope was chosen with knowledge of that failure and therefore counts as a
prior trial.

## 3. Invariants enforced by the builder

| Id | Rule |
|---|---|
| INV-01 | Time-namespace prefixes are correct for all three field lists |
| INV-02 | The three lists are pairwise disjoint; no `ex.`/`oc.` field is a decision input |
| INV-03 | Variants of closed families require full linkage, else refused |
| INV-04 | Referenced sources and experiments exist; paths and provenance are copied verbatim |
| INV-05 | Secondary evidence must name the raw source that outranks it |
| INV-06 | `ADMITTED_RESEARCH_ONLY` needs all gates PASS plus a validator; `promising_count` is always 0 |
| INV-07 | Only explicitly named roots are scanned; home and filesystem root are refused |
| INV-08 | Smoke mode performs no filesystem write of any kind |

The record schema is **closed**: an unknown field is an error, not an extension point. A field that
matters enough to record is worth versioning.

## 4. Tooling

```
scripts/analysis/build_research_warehouse_catalog.mjs   # validate + build, read-only
scripts/analysis/query_research_warehouse_catalog.mjs   # query, never writes
scripts/test_research_warehouse_catalog.mjs             # tests + static scan + lessons checker
data/research_warehouse_catalog_schema_2026-08-02.json  # versioned record schemas
data/research_warehouse_catalog_fixture_2026-08-02.json # seed metadata + synthetic fixtures
```

Smoke mode is the default and writes nothing:

```bash
node scripts/analysis/build_research_warehouse_catalog.mjs
```

Emitting a catalogue requires both an explicit input and an explicit output:

```bash
node scripts/analysis/build_research_warehouse_catalog.mjs \
  --input-root data --out /tmp/catalog.json --csv /tmp/catalog.csv
```

The five required questions:

```bash
node scripts/analysis/query_research_warehouse_catalog.mjs data --evidence-type ORDERBOOK --timeframe 4h
node scripts/analysis/query_research_warehouse_catalog.mjs mechanism --tag volatility_state_transition
node scripts/analysis/query_research_warehouse_catalog.mjs why-rejected --family FAM.FADE_TOKENIZED
node scripts/analysis/query_research_warehouse_catalog.mjs variants
node scripts/analysis/query_research_warehouse_catalog.mjs blocking-gap --top 3
```

Output is deterministic: no clock, no randomness, no environment variable is read anywhere, and the
catalogue embeds no timestamp. Two builds of the same input are byte-identical, which is what makes
a committed catalogue reviewable as a diff.

## 5. Safety boundary

The builder and the query tool import only `node:fs` (four read primitives, plus `writeFileSync` and
`mkdirSync` in the builder alone), `node:path`, `node:url`, and `node:os`. There is no network
module, no `child_process`, no environment read, and no exchange, account, order, execution, or
position path anywhere in either program. The shipped static scan asserts this on every run, over
comment-stripped source, with a single audited exemption region for the denylists that must
necessarily name the tokens they forbid.

Writes are structurally bounded: exactly two `writeFileSync` calls exist, both guarded by an explicit
`--out`/`--csv`, and smoke mode refuses those flags outright rather than honouring them.

## 6. What this contract cannot conclude

1. That any catalogued path exists. Server-resident sources are `DOCUMENTED_UNVERIFIED`; the
   physical read-only inventory was not performed by this task.
2. That any `schema_fingerprint` is correct. Most are prefixed `unverified:` and are placeholders
   until a source is actually opened.
3. That the recorded time spans are complete. Several sources have unknown boundaries, and the
   builder deliberately does not exclude unknown-span sources from a span query — unknown is not
   "no".
4. That the lesson titles are accurate. Eight of twelve links carry titles reconstructed from task
   reports rather than read from `BOTALIN_LESSONS_LEDGER.md`, and every one of them is marked
   `DOCUMENTED_UNVERIFIED`. They must be reconciled on the first verified read of the ledger.
5. That the seeded trial counts are complete. They are lower bounds, and any deflation computed from
   them understates the correction actually required.
6. Anything about any strategy. No verdict was changed, no gate was evaluated, no metric was
   computed. `promising_count` remains `0`.
