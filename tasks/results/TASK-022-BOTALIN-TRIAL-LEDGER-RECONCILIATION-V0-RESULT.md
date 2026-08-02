# TASK-022 — Botalin Trial Ledger Reconciliation v0 (Result)

**Task ID:** TASK-022-BOTALIN-TRIAL-LEDGER-RECONCILIATION-V0
**Date:** 2026-08-02
**Type:** read-only research-memory extension of the warehouse. No strategy search, no parameter sweep, no promotion.
**Status of this document:** a reconciliation of counts already documented in this repository. It is not evidence and creates no new measurement.

## 0. Headline

**Documented lower bound: 1066 trials.** Of those, **20 are individually recorded** (20 ledger
entries, one trial each) and **1046 exist only as aggregate batches** (4 ledger entries). A further
**8 entries are attacks, null controls, replays and diagnostics that deliberately count as zero.**

Only 1.9% of the programme's documented trials have an individual record. That is the finding.

| Check | Result |
|---|---|
| Syntax (3 `.mjs`) + JSON parse (2 files) | pass |
| Full deterministic suite | **116 / 116 pass** (84 from TASK-021, all still green, + 32 new) |
| Static scan (11 assertions) | pass over the extended code |
| Lessons checker (6 assertions) | pass |
| Count conservation | 17/17 experiments |
| Smoke mode + smoke queries | exit 0, zero filesystem writes |
| `git diff --check` | clean |

## 1. Two integrity defects in the TASK-021 seed, corrected

**Defect 1 — the 930 was attached to the wrong experiment.** TASK-021 recorded
`prior_trials_seeded: 930` on `EXP.WICK_RECLAIM_SWEEP`. The 930 event/regime/liquidity combinations
belong to AMEL second-order mining (inventory row 19), a different activity from the wick-reclaim
mechanism evaluation (row 16). Conflating them made one mechanism look like it had consumed 930
trials while the actual 930-combination sweep had no parent at all.

Corrected by splitting out `EXP.AMEL_SECOND_ORDER_COMBINATIONS` as its own experiment with its own
result and failure route. `EXP.WICK_RECLAIM_SWEEP` now declares 1 trial.

**Defect 2 — ten of the sixteen counts were narrative estimates presented as facts.** Only two
numbers in the seed are printed in any local artefact: 930 (with 745 duplicates) and 116 (with 15
train-positive). The values 12, 6, 20, 8, 5, 9, 3, 4, 2 and 1 were plausible readings of prose that
no document states. They summed to a headline of 1116 trials that could not be traced.

Corrected by rebuilding every count from named documented runs. Where the artefacts describe a
distinct evaluation, it became an individual ledger entry; where they give only an aggregate, it
became an aggregate batch; where they imply further variants without a number, that number is
recorded as **unknown**, never guessed and never zeroed.

Net effect on individual experiments:

| Experiment | TASK-021 | Now | Why |
|---|---:|---:|---|
| `EXP.FADE_TOKENIZED_TREND_US_HOURS` | 12 | 5 | Five named live/DC series in handoff §5.1–5.4 and inventory row 5 |
| `EXP.HTF_MA_DISTANCE_REVERSION` | 20 | 2 | Two documented timeframe formulations, 1h and 4h |
| `EXP.WICK_RECLAIM_SWEEP` | 930 | 1 | The 930 moved to its real parent |
| `EXP.HTF_MEAN_REVERSION_REDISCOVERY` | 0 | 1 | A rediscovery run consumed the same data; zero was wrong |
| `EXP.AMEL_MOMENTUM_IMPULSE_5M` | 0 | 1 | The active-event baseline was an evaluation |
| `EXP.BYBIT_ACCOUNT_FORENSICS` | 1 | 2 | The forensic classification and the low-leverage subset are separate |
| `EXP.AMEL_SECOND_ORDER_COMBINATIONS` | — | 930 | New parent, as two aggregate batches |
| `EXP.OVERFIT_LAB_SINGLE_STRATEGIES` | 116 | 116 | Artefact-stated; unchanged |
| six others | 6, 8, 5, 9, 3, 4, 2 | 1, 1, 1, 1, 2, 1, 1 | Reduced to the documented evaluations |

The total moved from an untraceable 1116 to a traceable 1066. Every one of the 1066 now cites a line
in a local document, and the suite asserts that: `trials_with_unknown_count_grade === 0`.

## 2. The two large batches, kept as batches

Per the safety boundary, an aggregate count is never expanded into individual variants.

| Batch | Trials | Representation | Fingerprint | Missing-child evidence |
|---|---:|---|---|---|
| `TL.AMEL_2ND.DUPLICATE_BATCH` | 745 | `AGGREGATE_ONLY` | `null` | `TE.AMEL_2ND.DUPLICATE_CHILDREN` (745 known children) |
| `TL.AMEL_2ND.NON_DUPLICATE_BATCH` | 185 | `AGGREGATE_ONLY` | `null` | `TE.AMEL_2ND.NON_DUPLICATE_CHILDREN` (185, derived as 930−745) |
| `TL.OVERFIT.TRAIN_POSITIVE_BATCH` | 15 | `AGGREGATE_ONLY` | `null` | `TE.OVERFIT.TRAIN_POSITIVE_CHILDREN` (15 known children) |
| `TL.OVERFIT.NON_POSITIVE_BATCH` | 101 | `AGGREGATE_ONLY` | `null` | `TE.OVERFIT.NON_POSITIVE_CHILDREN` (101, derived as 116−15) |

Each batch counts its full weight toward multiplicity — a duplicate combination still consumed the
shared evidence — while carrying no invented per-variant record. The builder refuses an aggregate
that tries to carry a parameter fingerprint, and refuses an `INDIVIDUAL` entry claiming a count above
one; both refusals are tested.

## 3. Attacks do not add trials

Eight entries are recorded and deliberately excluded from the total: the FADE ideal-fill recheck and
stale-signal diagnosis, two remove-best attacks on the 1h MA-distance point, the 4h volatility
matched null, the failed-breakout fresh replay, the overfit-lab attack suite against the 15
train-positive variants, and the 24h router replay.

Re-examining an existing parameter point is not a new independent trial, and counting it as one
would inflate the deflation base while making the search look broader than it was. The builder
structurally bars `ROBUSTNESS_ATTACK`, `NULL_CONTROL` and `REPLAY` from counting and requires each to
name the trial it attacks, under the same parent.

## 4. Reconciliation coverage and the recovery sources

**17 entries reconciled, 15 pending.** Every pending entry names an existing `trial_evidence` record
stating the exact artefact that would resolve it, a location hint, its verification state, the
recoverable child count **or `null` where genuinely unknown**, and the operator GO phase that
unlocks it.

Four sources have known child counts (745, 185, 101, 15 — the 1046 aggregate trials). Eleven record
an explicitly unknown number of further variants: the FADE session roster, the FADE VWAP variant
roster, the MA-distance parameter grid, the non-AMEL factory candidate list, the 4h volatility
parameter sweep behind "many params positive", the 1h atlas rows, the failed-breakout atlas rows, the
wick-reclaim exit grid, the forced-flow tested variants, the wallet directional variants, and the
Bybit stop/target grid.

None of these was accessed. Every location hint points at a server path or artefact whose existence
is `MISSING` or `DOCUMENTED_UNVERIFIED`, and all fifteen are routed to Phase 0b, which runs only
after Phase 0 has physically verified the paths.

## 5. Count conservation

`INV-09` requires each experiment's `prior_trials_seeded` to equal the sum of its counting ledger
entries. **17/17 experiments conserve**, including the synthetic fixture. The builder fails the whole
run on any mismatch, so the declared count and the ledger cannot drift apart.

Supporting invariants, all newly added and all tested:

| Id | Rule |
|---|---|
| INV-09 | Count conservation, and every entry names an existing parent of the matching family |
| INV-10 | Unique dedup keys among counting entries; a recovered child of a batch is forced non-counting |
| INV-11 | Real evidence link required; aggregates carry no fingerprint; self-declared derived fingerprints refused |
| INV-12 | Every pending reconciliation names an existing `trial_evidence` record |
| INV-13 | Attacks, null controls and replays never count and must name their target |

## 6. Query CLI

Three new read-only commands, none of which writes anything:

```bash
node scripts/analysis/query_research_warehouse_catalog.mjs trial-summary
node scripts/analysis/query_research_warehouse_catalog.mjs trials --representation AGGREGATE_ONLY
node scripts/analysis/query_research_warehouse_catalog.mjs trials --experiment EXP.HTF_MA_DISTANCE_REVERSION --include-non-counting
node scripts/analysis/query_research_warehouse_catalog.mjs trial-lineage --family FAM.OVERFIT_LAB
```

`trials` lists individual rows and aggregate batches, hiding non-counting entries unless asked.
`trial-summary` reports the lower bound, the individual/aggregate split, independent experiment
count, conservation coverage, and every missing-evidence source. `trial-lineage` walks parent
experiment → trials → outcome → failure route → lessons, exposing attack chains and unrecovered
children without counting them.

## 7. Tests

**116 passed, 0 failed.** The 84 TASK-021 tests are unchanged and still green; 32 are new.

| Group | Pass |
|---|---:|
| schema validation | 13/13 |
| provenance preservation | 6/6 |
| decision/outcome separation | 6/6 |
| rejected-family lineage | 10/10 |
| explicit-root-only scanning | 12/12 |
| smoke-mode non-mutation | 5/5 |
| determinism | 3/3 |
| coverage and queries | 12/12 |
| **trial ledger** | **32/32** |
| static scan | 11/11 |
| lessons checker | 6/6 |

The trial-ledger group proves count conservation in both directions, parent and family linkage,
aggregate/child exclusivity (a recovered child must be non-counting), dedup uniqueness, refusal of
entries with no evidence link, refusal of fabricated fingerprints, that an `INDIVIDUAL` entry cannot
claim 116 trials, that attacks and null controls never count, that unknown child counts stay `null`
rather than becoming zero, determinism of the ledger summary, and the three query commands.

One real bug was caught by these tests during development: the fabricated-fingerprint regex used
`\b`, which does not fire before an underscore, so `inferred_from_batch` passed. Fixed with an
explicit `(?![A-Za-z0-9])` lookahead. A second was caught by the builder itself — a dangling
`EDGE.AMEL.REGIME` reference — fixed by cataloguing that source rather than dropping the reference.

The static scan runs unchanged over the extended code: allowlisted imports only, no network,
credential, environment, process, service, exchange/account/order, or runtime-state path, no
destructive filesystem call, exactly two guarded writes in the builder, and none in the query tool.

## 8. What this task cannot conclude

1. That 1066 is the trial count. It is a documented floor that is **known** to be too low: fifteen
   entries declare further variants of unknown size, and the two large sweeps were themselves only
   summarised.
2. That the four aggregate batches contain exactly 745/185/101/15 children. Those figures come from
   two inventory rows and were not confirmed against any miner or lab output.
3. That the 20 individual entries are the only individually-documented trials. They are the ones
   this repository names; the server may record more.
4. That any deflation computed from these numbers is adequate. It is a lower bound on the correction
   required, and §7 item 8 of the TASK-006 contract still stands.
5. Anything about any strategy. No verdict changed, no gate was evaluated, no metric computed.

## 9. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | none — research-memory task; no candidate state changed |
| Lifecycle state left | none |
| Position in the state machine | Blocked at `DATA_HEALTH`. This task makes the multiplicity input to every later gate auditable |
| Next permitted transition | none performed |
| Evidence gate passed / failed | none evaluated — no data was analysed |
| Failure route | not applicable |
| Next queued task and owner | Warehouse Phase 0 (`GO-WAREHOUSE-0-INVENTORY`), then Phase 0b (`GO-WAREHOUSE-0B-RECONCILE`), owner Claude Code under Codex review. Task selection remains Codex's decision |
| What this task cannot conclude | §8 |
| Files changed | The 8 allowlisted deliverables only |
| Prohibitions respected | No server access; SSH remained blocked and was not attempted. No network, no secret, no exchange/account/order/execution/position endpoint. No database, service, collector, or process started. No raw data moved, copied, ingested, or relabelled. No coordinator, approval, KILL, config, `model_id`, or `RESET_TS` touched. `promising_count` remains `0`. No individual variant was invented from an aggregate count |

**Relevant lessons** (source: `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`, **not read by
this task**; titles remain `DOCUMENTED_UNVERIFIED` in the catalogue):

- **LESSON-019 (unrecorded trials invalidate the family statistics)** — the direct subject of this
  task. The ledger now separates 1046 aggregate trials from 20 individual ones instead of hiding both
  inside a single field.
- **LESSON-011 (tiny-N and one-symbol pockets are not evidence)** — the 185 non-duplicate AMEL
  combinations are recorded with their "tiny-N, one-symbol or overlapping" outcome attached.
- **LESSON-003 (do not revive a rejected family by cherry-pick)** — reinforced structurally: the
  ledger makes the number of prior attempts on a family visible before a variant is proposed.
- **LESSON-005 (OOS and remove-best decide, not in-sample fit)** — remove-best attacks are recorded
  as attacks on a named point, so they can never be presented as independent confirmations.

No new lesson.

## 10. Commit

Deliverables committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`:

1. `scripts/analysis/build_research_warehouse_catalog.mjs`
2. `scripts/analysis/query_research_warehouse_catalog.mjs`
3. `scripts/test_research_warehouse_catalog.mjs`
4. `reference/BOTALIN_RESEARCH_WAREHOUSE_CONTRACT_2026-08-02.md`
5. `reference/BOTALIN_RESEARCH_WAREHOUSE_ACTIVATION_PLAN_2026-08-02.md`
6. `data/research_warehouse_catalog_schema_2026-08-02.json`
7. `data/research_warehouse_catalog_fixture_2026-08-02.json`
8. `tasks/results/TASK-022-BOTALIN-TRIAL-LEDGER-RECONCILIATION-V0-RESULT.md` (this file)

No other file in the working tree was staged or committed.
