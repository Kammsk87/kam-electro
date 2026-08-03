# TASK-AH-048 - Large Sweep Forced-Flow Fade v0

## Why this hypothesis and not another

Every directional family this programme has tested belongs to a category that does not
contain direction: a pattern in past prices. Order flow, momentum, mean reversion, breakout
and compression all infer where price will go from where it has been. TASK-AH-046 measured
the cost of that: parent-order imbalance carries +0.073 bps out of sample at t = 0.50 over
56,073 observations. A record of repricing is not a forecast of it.

Direction has three sources: information held before others, flow that is forced regardless
of price, and a premium paid for holding what others will not. This task tests the second,
using the only forced-flow event our current data can define without new collection.

## The frozen event, declared before any outcome is inspected

An **event** is a single parent aggressive order that satisfies both:

1. it crosses more than one price level — a sweep, as defined and tested in
   `ah046_parent_order_flow_imbalance.mjs:reconstructParents` at the frozen 100 ms burst gap;
2. its notional is at or above the **train-only, per-symbol 99th percentile** of all parent
   order notionals. The threshold is fitted on the train segment alone and never refitted.

**Pre-declared direction: FADE.** Entry is opposite to the sweep side. The mechanism claim is
that a participant who must transact regardless of price pays for immediacy and pushes price
away from fair value; the provider of that immediacy is compensated as it reverts. This is the
forced-flow thesis, and it is stated before measurement precisely so that a continuation result
counts as a refutation rather than a rediscovery.

**Entry:** the mid at the completion of the sweep, labelled `SWEEP_COMPLETION_MID_REFERENCE`.
The entry is a taker crossing and pays the full round trip.

**Exit:** three pre-declared horizons, 60s, 300s and 900s from sweep completion. 300s is
primary; the other two are the fixed neighbours.

**Costs:** 11 bps round trip, 22 bps double-cost stress. Both are taker.

## Stage 0 gate — run first, on train only

Before any implementation of the full evaluation, measure on the **train segment only**:

1. the distribution of the post-sweep move in the faded direction at each horizon;
2. the share of events whose move exceeds the 11 bps round trip;
3. the event count per symbol and per day.

**Kill condition:** if the train-only mean faded move is below the round-trip cost, or the
event count cannot reach 30 per out-of-sample segment, the hypothesis is closed at Stage 0 and
no Stage 1 implementation is written.

This gate exists because the arithmetic favours it. At a 5-minute dispersion of 19.5 bps, an
effect of 11 bps needs roughly 30 events to detect at t = 3, and an effect of 5 bps needs about
140. A genuinely tradeable forced-flow effect is therefore visible on a small sample; a large
sample requirement is itself evidence the effect is too small to trade.

## Safety boundary

Read-only. No network beyond read-only reads of the existing archive, no parameter search, no
live/paper, services, collectors, configs, coordinator, approval, KILL, secrets, orders,
accounts or positions. Nothing written to the server. No raw market data committed.

The percentile threshold, the burst gap, the direction, the entry reference and the three
horizons are all frozen above. Searching over any of them is a parameter search and requires a
new task with a new identity.

## Acceptance

If Stage 0 passes, Stage 1 requires: chronological 55/20/15/10 splits with purge and embargo;
holdout and forward each at least 30 events across at least 5 symbols; positive net mean and
median after 11 bps in both; non-negative median at 22 bps; two-sided matched null at
p < 0.05; survival of remove-best-symbol and remove-best-day; no symbol above 25% of
contribution; both neighbour horizons non-negative; and a measured exact ledger overlap
against the rejected families. An unmeasured overlap blocks any passport draft.

If Stage 0 fails, the result is `STAGE_0_INFEASIBLE` and the family closes with the measured
gap to the cost floor stated explicitly.

## Deliverables

1. `scripts/analysis/ah048_large_sweep_forced_flow_fade.mjs`
2. `scripts/test_ah048_large_sweep_forced_flow_fade.mjs`
3. `reference/AH048_LARGE_SWEEP_FORCED_FLOW_FADE_PROTOCOL_2026-08-03.md`
4. `data/ah048_large_sweep_forced_flow_fade_2026-08-03.{csv,json}`
5. `tasks/results/TASK-AH-048-LARGE-SWEEP-FORCED-FLOW-FADE-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, the replay the gate permits, and
`git diff --check`. Commit only the allowlisted deliverables. Push requires separate approval.
