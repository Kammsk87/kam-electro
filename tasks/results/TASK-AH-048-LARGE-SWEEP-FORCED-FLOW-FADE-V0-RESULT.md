# TASK-AH-048 — Large Sweep Forced-Flow Fade v0 (Result)

**Task ID:** TASK-AH-048-LARGE-SWEEP-FORCED-FLOW-FADE-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. Verdict

**`STAGE_0_INFEASIBLE`** — the family is closed. No Stage 1 evaluation was written, as the
contract requires. **Holdout and forward were never touched**; 2,732 sealed events remain
available to a successor task.

`promising_count` remains `0`.

## 1. The pre-declared thesis is refuted

The contract declared **FADE** before any data was inspected: a participant forced to transact
pays for immediacy, pushes price away from fair value, and the provider is compensated as it
reverts.

Measured on the train segment only — 3,050 events, 10 symbols, 13 days:

| Horizon | n | FADE mean | t | mirror (continuation) | clears 11 bps? |
|---|---:|---:|---:|---:|---|
| 60s | 3,050 | **−7.56** | −15.27 | +7.56 | no, either way |
| 300s | 3,050 | **−6.80** | −7.18 | +6.80 | no, either way |
| 900s | 3,050 | **−8.94** | −5.26 | +8.94 | no, either way |

The fade loses at every horizon, strongly and significantly. **The forced-flow thesis is wrong
for this event definition.** This is a clean refutation, and it is worth exactly as much as a
confirmation would have been — which is the entire point of declaring the direction first.

## 2. What the refutation actually tells us

Price **continues** after a large sweep; it does not revert.

That is the signature of **informed flow**, not forced flow. Someone who must sell regardless of
price pushes the market and the push decays. Someone who knows something pushes the market and it
stays pushed.

So the useful conclusion is not "sweeps don't work". It is:

> **Large sweeps are not a usable proxy for forced flow in this market.** They belong to the
> information category, not the forced-flow category.

To test forced flow properly we need the actual constraint being observed — the liquidation feed,
index rebalance schedules, expiries — not a size filter on aggressive orders.

## 3. Why the mirror does not rescue it

A negative fade is arithmetically a positive continuation: +7.56, +6.80, +8.94 bps. That is the
closest anything in this programme has come to the cost floor. It is still short of it.

| Horizon | continuation gross | cost | net |
|---|---:|---:|---:|
| 60s | +7.56 | 11 | **−3.44** |
| 300s | +6.80 | 11 | **−4.20** |
| 900s | +8.94 | 11 | **−2.06** |

A gap of 1.2× at 900s, against 150× in AH-046. Genuinely closer — and still losing.

Two disciplines apply here and both point the same way. First, the direction was declared FADE;
inverting after seeing the result would be relabelling a refutation as a discovery. Second, even
taken at face value on its own training data, it does not pay. Spending the sealed segments on a
hypothesis that fails where it was fitted would be waste.

## 4. Data

553,632 sweeps extracted across 10 symbols over 26 days. The train-only 99th-percentile notional
threshold ranges from $2,662 (B3USDT) to $89,361 (ADAUSDT), fitted per symbol as frozen.

Extraction reused the validated server-side `awk` pattern: read-only, nothing written to the
server, no raw market data copied into the repository. Forward mids were attached during
extraction so that the local harness never needed the raw tape.

## 5. Checks

| Check | Result |
|---|---|
| `node --check` (both scripts) | pass |
| Deterministic unit tests | **30 / 30 pass** |
| Static no-trading scan (11 assertions) | pass |
| Stage 0 replay, 553,632 sweeps | pass |
| `git diff --check` | clean |
| gitleaks | **NOT RUN — binary not installed, offline** |

The suite asserts the seal directly: it plants a 900-fold favourable move in the sealed half and
requires every reported statistic to be unchanged. It also asserts that sealed-segment events
cannot move the train-fitted threshold, and that a symbol absent from train gets no threshold
rather than a borrowed one.

One test defect was found and corrected: a boundary assertion tried to construct a move of
exactly 11 bps, which floating point renders as 11.000000000001. The engine's strict comparison
was correct; the test was rewritten to assert either side of the floor.

## 6. What this task cannot conclude

1. That large sweeps carry no information. They clearly do — continuation is significant on
   train. It is simply too small to pay an 11 bps round trip.
2. That forced flow is absent from this market. Only that sweeps do not proxy it.
3. Anything about horizons beyond 900s, or about any subset of these events. Both would be
   parameter searches requiring a new frozen contract.
4. Anything on out-of-sample data. Nothing out of sample was read.

## 7. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | `DISCOVERY` |
| Lifecycle state left | `CLOSED` at Stage 0 |
| Next permitted transition | none. A successor must be a new task with a new identity |
| Evidence gate | Stage 0 kill condition met: neither direction clears the round trip on train |
| Failure route | `REJECTED_FAMILY` for the fade; the continuation observation is a train-only signal, not a result |
| Next queued task and owner | Operator/Codex. The evidence points at the actual liquidation feed rather than at sweeps as a proxy |
| What this task cannot conclude | §6 |
| Files changed | The 6 allowlisted deliverables only |
| Prohibitions respected | Read-only server reads; nothing written to the server; no raw market data in the repository; no parameter search; sealed segments untouched; no live/paper, services, collectors, configs, coordinator, approval, KILL, secrets, orders, accounts or positions. `promising_count` remains `0` |

**Relevant lessons:**

- **LESSON-003** — the direction was frozen before inspection, so the continuation observation
  cannot be relabelled as a discovery without a new task and a new identity.
- **LESSON-021** — the gate is the ideal-fill economics, and no execution work is proposed to
  close a gap that exists before execution is considered.
- **LESSON-019** — 3,050 events were consumed on this test and belong in the trials ledger.

**Candidate new lesson:** an event's *category* is testable. Reversion after an event indicates
forced flow; continuation indicates information. Measuring which one occurs is cheaper than
assuming, and it redirects the search rather than merely closing it.

## 8. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`; only the allowlisted files
were staged. **Push not performed — it requires separate explicit approval.**
