# TASK-AH-046 — Parent Order Flow Imbalance v0 (Result)

**Task ID:** TASK-AH-046-PARENT-ORDER-FLOW-IMBALANCE-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. Verdict

**`DATA_INADEQUATE`** — the archive is too short for the frozen split requirement.

The signal was nonetheless measured on 56,073 out-of-sample observations across 36
symbols, and it has **no directional information**. The exploratory probe that motivated
this task did not survive the full sample.

`promising_count` remains `0`.

## 1. Result

| Split | n | symbols | days | **gross mean bps** | **gross t** | net mean bps |
|---|---:|---:|---:|---:|---:|---:|
| Train | 96,716 | 40 | 13 | +0.007 | 0.06 | −10.99 |
| Validation | 45,359 | 37 | 6 | +0.218 | 1.18 | −10.78 |
| **Holdout** | 33,437 | 36 | 4 | **−0.094** | −0.45 | −11.09 |
| **Forward** | 22,636 | 36 | 3 | **+0.320** | 1.71 | −10.68 |
| Combined OOS | 56,073 | 36 | 6 | **+0.073** | 0.50 | −10.93 |

Cost floor is 11 bps round trip. The combined out-of-sample gross mean of **+0.073 bps is
roughly 150× short of it**, and the holdout gross mean is negative. Nothing here is a
candidate.

Two-sided matched null: observed median −11.000 against a null median of −11.000,
**p = 1.000**. The observed result sits exactly at the centre of its own null.

Robustness, for completeness: removing the best symbol (`AMATUSDT`) or the best day
(2026-07-27) leaves the total more negative; concentration is low at 7.3% across 36
symbols; both frozen neighbour burst gaps reproduce the same non-result on validation
(50 ms → +0.219 gross, t = 1.19; 200 ms → +0.218, t = 1.19).

### Why the formal verdict is DATA_INADEQUATE rather than an OOS rejection

The frozen contract requires at least 10 days in **each** of holdout and forward. The
archive covers ~26 days; a 55/20/15/10 split gives holdout 4 days and forward 3. That gate
cannot be met by this archive at this split, so the data gate fires first and correctly.

The contract was not relaxed to let the result through. Had the day count passed, the
verdict would have been `OOS_FAIL_REJECT_FAMILY` on the negative holdout.

## 2. The probe did not survive

| | one symbol-day (AAVEUSDT) | full archive OOS |
|---|---:|---:|
| n | 288 | 56,073 |
| gross mean | +1.96 bps | **+0.073 bps** |
| t | 1.74 | **0.50** |
| gap to cost floor | 6× | **150×** |

The probe's t of 1.74 was already below significance, and it is now clear that +1.96 bps
was sampling noise on 288 observations. This is the outcome the protocol pre-registered as
most likely, and the number is now measured rather than argued.

## 3. What the parent reconstruction did establish

Collapsing child prints into parent decisions is a real and correct change of unit, even
though the signal built on it failed. On AAVEUSDT 2026-07-15:

| | value |
|---|---|
| child prints | 111,140 |
| parent orders | 26,263 (4.2 fills each) |
| multi-level sweeps | 23.1% of parents, **74.5% of notional** |
| median parent notional | $31 |
| top 5% of parents | 63.6% of flow |

Three quarters of aggressive notional comes from orders crossing more than one level, and
that population is invisible in the raw print count. Any future flow statistic should be
computed on parents; `reconstructParents` is exported and tested for reuse.

## 4. A reporting defect found and fixed mid-run

The first full run reported t-statistics of −101, −75 and −53 across splits, which looks
overwhelmingly significant and means nothing: those were t-statistics on the **net** mean,
which carries the constant −11 bps cost. Testing whether −11 differs from zero grows more
"significant" with every added observation regardless of signal quality.

Fixed by computing precision on the **gross** mean and leading both the CSV and the summary
with `gross_mean_bps` and `gross_t_stat`. A shipped test constructs a deliberately
worthless signal and asserts `|gross_t| < 1` while `|net_t| > 10`, so the confusion cannot
recur silently.

This is worth flagging beyond this task: any earlier AH result quoting a t-statistic or
significance on a cost-inclusive mean is subject to the same distortion.

## 5. Method notes

**Server-side reduction.** Transferring the raw archive was infeasible — measured
throughput put ~3 GB of ticks at hours, and a first attempt stalled. The reducer was
reimplemented in `awk` and run as a read-only stream filter over SSH, writing nothing to
the server and creating no files there, returning only bucket aggregates. This cut a
symbol from 72 MB to 950 KB and from minutes to 17 seconds.

Before it was trusted, the `awk` reducer was validated against the already-tested Node
implementation on an identical symbol-day: **864 buckets across all three burst gaps,
zero mismatches**. No raw market data was copied into the repository.

**Aggregation safety.** Because extraction reduces before the engine sees the data, two
defences are shipped: `rehydrateBuckets` recomputes imbalance and direction from the buy
and sell totals and ignores any direction the extractor supplies, and a test runs the same
synthetic panel through both the raw-print and pre-aggregated paths asserting every split
statistic and the verdict match exactly.

## 6. Checks

| Check | Result |
|---|---|
| `node --check` (both scripts) | pass |
| Deterministic unit tests | **58 / 58 pass** |
| Static no-trading scan (11 assertions) | pass |
| Full replay over 40 symbols | pass, exit 0 |
| `awk` reducer vs Node reducer | 864 buckets, 0 mismatches |
| `git diff --check` | clean |
| gitleaks | **NOT RUN — binary not installed, offline** |

Suite: parent reconstruction 9/9 · signal 8/8 · chronology 4/4 · statistics 7/7 ·
matched null 4/4 · verdicts 5/5 · end to end 10/10 · static scan 11/11.

## 7. What this task cannot conclude

1. That parent-order imbalance has no information at any horizon. It has none at 5 minutes
   on this archive. Longer horizons were not tested here.
2. That a longer archive would change the answer. It would fix the day-count gate, but the
   holdout gross mean is negative and the combined OOS t is 0.50 — more data would most
   likely sharpen the same zero.
3. That the signal is distinct from the rejected families. Overlap remains `UNAVAILABLE`
   and blocking; per-trade ledgers were never retained.
4. Anything about paper or live readiness. No candidate was created.

## 8. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | `DISCOVERY` |
| Lifecycle state left | `DISCOVERY` — no transition |
| Position in the state machine | Remains at `DISCOVERY`; no passport drafted |
| Next permitted transition | none performed |
| Evidence gate passed / failed | Data gate failed on day count; the signal separately showed no edge |
| Failure route | `DATA_REQUEST` for the day count; the 5-minute formulation itself is closed |
| Next queued task and owner | Operator/Codex decision. The defensible options are a longer horizon (15 min+), guard-only use where no cost floor applies, or maker-fill execution — each a separate task |
| What this task cannot conclude | §7 |
| Files changed | The 6 allowlisted deliverables only |
| Prohibitions respected | Read-only server reads; nothing written to the server and no file created there; no raw market data copied into the repository; no parameter search — all thresholds frozen in the contract before the full-sample look; no live/paper, services, collectors, configs, coordinator, approval, KILL, secrets, orders, accounts or positions. `promising_count` remains `0` |

**Relevant lessons** (source `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`, not
readable from this machine; titles unverified):

- **LESSON-005** — a one-symbol-day probe at t = 1.74 became +0.073 bps at t = 0.50 out of
  sample. Out-of-sample decided, as it was always going to.
- **LESSON-011** — the probe's n was 288. The full sample is 56,073, and the pocket vanished.
- **LESSON-019** — the reported p is uncorrected for the programme's prior-trial count; it
  would only be worse after deflation.
- **LESSON-021** — the gap to the cost floor is reported as a multiple, and no execution
  work is proposed to close a 150× shortfall.

No new lesson, but a process note worth carrying: quoting significance on a cost-inclusive
mean manufactures impressive t-statistics from nothing.

## 9. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`; only the six
allowlisted files were staged. **Push not performed — it requires separate explicit
approval.**
