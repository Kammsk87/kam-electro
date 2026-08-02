# Botalin Research Warehouse — Server Activation and Migration Plan

**Task:** TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0
**Date:** 2026-08-02
**Status:** PLAN ONLY. Nothing in this document was executed.

> **Nothing here is authorized.** DuckDB was not installed. No database was created. No service,
> socket, timer, or endpoint was enabled. No data was copied, moved, converted, or relabelled. Every
> phase below requires the explicit operator GO recorded in §8, and the phases are strictly ordered.

## 1. Why a lake at all

The current evidence is spread across JSONL recorder output, two legacy SQLite databases, git-tracked
JSON, untracked snapshot directories, Markdown reports, and Telegram summaries. Queries that should
be cheap — *which order-book events cover this candidate's event times?* — are currently manual,
which is why the same families keep getting re-tested from narrative memory.

The target is a read-only analytical layer **beside** the recorders, never in their write path.

## 2. Proposed layout

Warehouse root: `/opt/botalin-warehouse` — a new path, deliberately not inside `/opt/botalin-edge`
(the research fork) and never inside `/opt/botalin` (the legacy live/paper stack), so that no
warehouse operation can be confused with a runtime write.

```
/opt/botalin-warehouse/
  raw/                      # append-only landing zone, Parquet, one dir per source_id
    <source_id>/venue=<v>/symbol=<s>/date=<YYYY-MM-DD>/part-<run_id>-<seq>.parquet
  catalog/                  # the JSON/CSV catalogue this task's builder emits
  manifests/                # per-ingest manifests: hashes, row counts, spans, tool version
  derived/                  # rebuildable views; safe to delete at any time
  quarantine/               # rejected ingests, never silently dropped
  logs/                     # warehouse-owned logs only
```

`raw/` and `derived/` are separated so the question "can this be regenerated?" is answered by the
path, not by memory. `derived/` is disposable by construction; `raw/` never is.

### Partitioning

`source_id / venue / symbol / date` for market-shaped sources; `source_id / run_id / date` for
event-recorder output where the run is the natural unit. Date partitioning is by **ingest date**, not
value date, because ingest date is what makes an append-only lake immutable — a late-arriving row
lands in today's partition with its own `value_ts`, rather than mutating a historical file.

Every Parquet file carries per row: `value_ts`, `ingest_ts`, `ingest_ts_provenance`
(`recorded` | `reconstructed` | `synthesised`), `source_id`, `source_row_id`, `run_id`,
`fixture_flag`, and `code_version_hash`. A row without `ingest_ts_provenance` is not ingestible.
`synthesised` rows are barred from validation, holdout, and forward use.

### Hashes

Three levels, all recorded in `manifests/`:

1. **File** — SHA-256 of each Parquet part, written at ingest, verified on read.
2. **Partition** — Merkle root over the sorted part hashes of a partition.
3. **Ingest** — manifest hash covering source, run, span, row count, schema fingerprint, converter
   version, and the source-file hash of the original JSONL/SQLite object.

Level 3 is what makes the conversion auditable: the lake can always be tied back to the exact bytes
it was derived from, which is the property that lets a future result cite a lake path without
weakening its provenance.

## 3. Append-only raw ingestion

- Ingest is **copy-forward only**: read the source, write a new part, never modify the source.
- Parts are immutable once written. A correction is a new part plus a tombstone record in the
  manifest, never an edit or a delete.
- Re-ingesting a run is idempotent by `(source_id, run_id, source_row_id)`; duplicates are counted
  and dropped at read time, never de-duplicated destructively on disk.
- A schema change mints a new `schema_fingerprint` and a new partition generation. Old parts are
  never rewritten to the new shape.
- Any ingest failing hash, schema, or provenance validation lands in `quarantine/` with the reason.
  Silent skipping is prohibited: a dropped row that nobody counted is a dataset defect.
- The ingester never runs against `/opt/botalin` (legacy live/paper) while its runners are active.
  That stack is `MUTABLE_RUNTIME`; it requires its own GO and a consistent read strategy.

## 4. Retention

| Class | Retention | Rationale |
|---|---|---|
| `raw/` market, event, order-book, funding | Indefinite | It is the evidence; regenerating it is impossible |
| `raw/` tick-level | 18 months hot, then cold archive | Volume-driven; archive keeps the hash chain intact |
| `manifests/`, `catalog/` | Indefinite | Tiny, and they are the audit trail |
| `derived/` | 90 days | Rebuildable by definition |
| `quarantine/` | 12 months | Long enough to diagnose an ingest defect |
| `logs/` | 90 days | Warehouse-owned only |

Nothing is deleted by a timer in phase 1. Retention is a documented policy first and an automated
job only after a separate GO, because an automated deleter pointed at a lake is a one-way risk.

## 5. Access control

- Dedicated unix user `warehouse`, owning `/opt/botalin-warehouse`.
- `warehouse` has **read-only** access to every source path and **no** membership in the groups that
  can write `/opt/botalin-edge/data`, `/opt/botalin-edge/logs`, or anything under `/opt/botalin`.
- Mount or bind sources read-only where the platform allows it, so the boundary is enforced by the
  kernel rather than by the ingester's good behaviour.
- No exchange key, no `/etc/botalin*.env`, no token reaches this user. The warehouse has no reason
  to authenticate to anything.
- The query endpoint (§7) runs as a third, even less privileged user with read access to
  `/opt/botalin-warehouse` only.
- File ownership stays `warehouse:warehouse`; root-owned files inside a service tree have already
  caused `EACCES` breakage on this server and must not recur.

## 6. Backup

- Nightly restic/borg snapshot of `raw/`, `manifests/`, `catalog/` to off-host storage; `derived/` is
  excluded as rebuildable.
- Restore is **verified**, not assumed: a monthly drill restores one random partition to a scratch
  path and re-verifies its Merkle root. An unverified backup is a hope.
- Backup credentials live outside the warehouse user's reach and are never read by any agent.

## 7. Read-only query endpoint

- DuckDB in **read-only** mode over the Parquet tree. DuckDB is a library here, not a server: there
  is no persistent mutable database file to corrupt.
- A thin HTTP endpoint bound to `127.0.0.1` only, never a public interface, exposing: catalogue
  lookup, coverage by source/symbol/timeframe/span, experiment and result lookup, failure routes,
  and lineage. It exposes **no** write verb.
- Hard guards: statement timeout, row cap, no `ATTACH`, no `COPY ... TO`, no `INSTALL`/`LOAD` of
  extensions, no filesystem access outside the warehouse root.
- Every response carries the catalogue hash it was served from, so a quoted number can always be
  traced to a specific catalogue build.
- The endpoint has no path to the coordinator, to approval state, to any KILL switch, to any runner,
  or to any configuration — by construction, not by policy.

## 8. Phases, and the exact GO each requires

Phases are strictly ordered. Each needs its own explicit operator GO; none is implied by the
previous one, and none is implied by acceptance of this task.

| # | Phase | Exact GO required |
|---:|---|---|
| 0 | **Read-only physical inventory.** Confirm every `DOCUMENTED_UNVERIFIED` path, its size, span, row count and schema fingerprint. Write nothing. | `GO-WAREHOUSE-0-INVENTORY` — read-only shell access to `167.233.205.87`, `ls`/`stat`/`head` only, no writes, no service commands |
| 1 | **Provision root.** Create `/opt/botalin-warehouse`, the `warehouse` user, read-only source access. No data. | `GO-WAREHOUSE-1-PROVISION` — permission to create one user and one directory tree |
| 2 | **Pilot ingest.** One source, one run, into `raw/`, with full hashes and manifests. Source untouched. | `GO-WAREHOUSE-2-PILOT-INGEST` — names the single `source_id` authorized |
| 3 | **Backfill.** Remaining research-fork sources, source by source, each with its own manifest. | `GO-WAREHOUSE-3-BACKFILL` — enumerates the authorized `source_id` list |
| 4 | **Legacy ingest.** `/opt/botalin` SQLite databases, read-only, with a consistency strategy for a live-written file. | `GO-WAREHOUSE-4-LEGACY-INGEST` — separate because the legacy runners are still running |
| 5 | **DuckDB install + read-only query.** Install the library, no server, no persistent database. | `GO-WAREHOUSE-5-DUCKDB` |
| 6 | **Localhost query endpoint.** Enable the read-only endpoint and its systemd unit. | `GO-WAREHOUSE-6-ENDPOINT` — the first phase that creates a running service |
| 7 | **Automated retention/backup timers.** | `GO-WAREHOUSE-7-RETENTION` — the first phase that authorizes automated deletion |

Phase 0 is the immediate next step and is the cheapest: it converts every
`DOCUMENTED_UNVERIFIED` record in the catalogue into `VERIFIED_READ_ONLY` or `MISSING`, which is
where most of the current uncertainty sits.

## 9. What activation would still not buy

1. **No evidence.** A queryable lake makes existing evidence findable. It creates none, upgrades no
   verdict, and moves no candidate.
2. **No coverage.** Migration cannot manufacture the 30 matched order-book events the volatility
   family needs, the sub-minute liquidation stream the forced-flow family needs, or the tagger-v2
   NEWS lane. Those remain data-collection requests, each with its own separate GO.
3. **No provenance repair.** If a historical source cannot supply a `recorded` `ingest_ts`, storing
   it in Parquet does not fix that. The affected spans stay unusable for validation, holdout and
   forward work, and the lake makes that visible rather than curing it.
4. **No paper, no live, no promotion.** `promising_count` stays `0` throughout every phase above.
