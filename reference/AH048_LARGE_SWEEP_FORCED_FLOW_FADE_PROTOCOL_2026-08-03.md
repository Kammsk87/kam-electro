# AH-048 — Large Sweep Forced-Flow Fade, Protocol v0

**Task:** TASK-AH-048-LARGE-SWEEP-FORCED-FLOW-FADE-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only. **Closed at Stage 0.**

## 0. Why this hypothesis

Every directional family this programme has tested belongs to a category that does not contain
direction: a pattern in past prices. TASK-AH-046 measured the cost of that — parent-order
imbalance carries +0.073 bps out of sample at t = 0.50 over 56,073 observations. A record of
repricing is not a forecast of it.

Direction has three sources: information held before others, flow that is forced regardless of
price, and a premium paid for holding what others will not. This task tested the second, using
the only forced-flow event the current archive can define without new collection.

## 1. The frozen event

Declared in the task contract before any outcome was inspected:

| Element | Value |
|---|---|
| Event | a parent aggressive order crossing more than one price level |
| Size filter | notional at or above the **train-only, per-symbol 99th percentile** |
| Burst gap | 100 ms, inherited from AH-046 |
| **Direction** | **FADE** — enter opposite the sweep |
| Entry | mid at sweep completion, `SWEEP_COMPLETION_MID_REFERENCE`, taker |
| Horizons | 60s, 300s (primary), 900s |
| Costs | 11 bps round trip, 22 bps stress, both taker |

The direction was frozen deliberately so that a continuation result counts as a **refutation of
the forced-flow thesis**, not as a discovery to be relabelled after the fact.

## 2. Stage 0, and why it comes first

Stage 0 asks whether the post-event move, in the declared direction, can pay the round trip at
all. It runs on the **train segment only**, so holdout and forward stay sealed for any successor.

The arithmetic justifies putting it first. At a 5-minute dispersion of 19.5 bps, detecting an
11 bps effect at t = 3 needs roughly 30 events; a 5 bps effect needs about 140. A genuinely
tradeable forced-flow effect is therefore visible on a small sample. Needing tens of thousands
of observations is itself evidence the effect is too small to trade.

## 3. Guarantees the harness enforces

- The percentile threshold is fitted on train alone, per symbol, and never refitted. A shipped
  test plants enormous sealed-segment events and asserts they do not move the threshold.
- A symbol with no train events gets no threshold and produces no events, rather than borrowing
  one from another symbol.
- A sealed-segment move can never enter a reported statistic. A shipped test gives the sealed
  half a 900-fold favourable move and asserts no horizon statistic changes.
- The mirror of the declared direction is reported, because a negative fade is by construction a
  positive continuation — but it is labelled an observation on train, never a result.
- The cost floor is a strict threshold. Exact equality is not expressible in floating point, so
  the boundary is asserted either side of it.

## 4. Result

Closed at Stage 0. See the task result for the measured numbers.

The declared fade is refuted at all three horizons. Its mirror, continuation, is positive but
does not clear the round trip either, so the gate closes both directions without spending the
sealed segments.

## 5. What this protocol cannot conclude

1. That large sweeps carry no information. They clearly do — the continuation direction is
   significant on train. It is simply too small to pay an 11 bps round trip.
2. That forced flow is absent from this market. It concludes that **large sweeps are not a
   usable proxy for forced flow**, because forced flow should revert and these continue.
3. Anything about longer horizons. 900s was the best of the three and still short of cost.
   Testing further out requires a new task with a newly frozen horizon.
4. Anything about a subset of the events. Searching within them for a tradeable slice is a
   parameter search and is out of scope by contract.
