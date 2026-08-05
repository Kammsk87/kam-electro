# TASK-AH-055 Liquidation Cascade & OI Collapse — TRIAGE

**Disposition: `ROUTED_TO_DATA_COLLECTION`. Not built, not run.**
**Both legs of the mechanism are already measured and closed. The genuinely new leg has no data.**

Under Chief Scientist rule R4 a rejected implementation is not silently retried; it becomes a
documented structural variant with new identity, a data-collection request, a guard-only finding,
or a quarantine. This is a data-collection request, and the collection has to happen before any
module is worth writing.

## Leg 1 — the OI collapse — was closed yesterday

`CD.OI_COLLAPSE_REVERSION`, `CLOSED_MEASURED`, decided **2026-08-05**, TASK-AH-052.

Over 283 non-overlapping events on 29 assets, shorting a rising price whose open interest
collapsed returned **−5.80 bps at 5 minutes, t = −1.93**. The price *continued* rather than
reverting. A +16 bps reversion sits **7.3 standard errors** from the measurement. Severity
quintiles are not monotone, and the largest collapses give the *least* reversion.

Its reopen criterion is explicit: *"Re-running the declared primary is a silent retry: its
direction is excluded at 7.3 standard errors."*

**The specification does not propose that direction, and that matters.** It proposes: cascade
liquidates longs → price down → BUY. That is the **mirror** event, which the same closure records
separately at **+9.82 bps at 15 minutes, t = 2.03, se 4.84 — 1.28 standard errors from the 16 bps
floor.** Not refuted. Not established either.

The mirror's stated reopen bar: roughly **140 days** of recorder data rather than the present 25,
which is what brings the standard error from 4.84 to about 2.06 and separates +9.82 from the floor
at t = 3 — *and* a monotone severity profile, which the present sample does not have. The closure
adds that waiting for the recorder's designed 30 days "adds 20 percent and does not qualify."

We have **25 days**. The bar is 5.6× away.

## Leg 2 — the cascade impulse — was closed too

`CD.SWEEP_CONTINUATION`, `CLOSED_MEASURED`, from `LAW.FLOW.SWEEP_CONTINUATION_SATURATES`.

A liquidation cascade *is* a multi-level aggressive parent order. That population is measured
across nine size bands: continuation rises monotonically with within-symbol notional rank and
saturates at **8.27 bps for the largest one in a thousand** — t = 5.7, and **barely half the
audited 16 bps floor.** At no size does it reach the floor. Conditioning further on the depth
response of the side about to be consumed adds nothing: a 5×5 double sort is flat in the depth
dimension at 60 s, 300 s and 900 s, with a maximum reportable cell of 10.27 bps.

## The one genuinely new element — and it has no data at all

The specification conditions on **forced** flow via `isLiquidation`. Neither closed measurement
did. That is a real structural difference: a liquidation is price-insensitive and mechanical in a
way a discretionary sweep is not, and a small forced subset could behave far better than the
population that contains it. The sweep law bounds the population; it does not exclude the subset.

**But the flag does not exist anywhere in the archive.** A search across every script and library
on the research host for `allLiquidation`, `/v5/market/liquidation`, `forceOrder` and any
liquidation topic returns **zero subscriptions**. Nothing has ever recorded it. Bybit publishes
liquidations on WebSocket only — no REST history, no free archive — so, exactly like the L2 book,
this data can only be obtained **forward**.

It is already catalogued: `GAP.OI_LIQ.FINE_GRAIN`, "fine-grained liquidation/open-interest event
stream."

## And the OI cadence is 20–70× too coarse for the stated window

The detector's condition 2 needs ΔOI over a **5–15 second** window. `oi_forward_recorder.mjs`
writes **258 rows per day — one every 5.6 minutes**, 30 symbols. Even if the liquidation flag
existed today, condition 2 could not be evaluated at the resolution the specification names.

## Defects in the module as specified

**No standard deviation is computed anywhere**, though the detector is described as `k·σ` with
k ≥ 3.0. The code tests `totalLiqVol < avgVol * 3.0` where `avgVol = totalVol / windowSec` — a
window sum compared against a per-second rate times three. The units do not match and the
threshold is not a sigma.

**The baseline is drawn from the same batch it judges.** `avgVol` comes from `tradesBatch`, so
the "historical" comparison is in-sample. A cascade raises the baseline it is measured against,
which mechanically suppresses exactly the events the detector exists to find.

**The OI sign is ambiguous and probably inverted.** `oiData.dropPct < this.oiDropPctThreshold`
returns null when the condition fails. If `dropPct` is negative for a drop, then a genuine −0.5 %
collapse satisfies `−0.5 < 0.15` and is **rejected**, while a rising OI passes.

**The acceptance criterion would pass noise.** "Net PnL > 0 **or** t-stat > 2.0" clears on either
limb, so +0.001 bps at t = 0.1 passes on the first. It also compares against zero rather than
against the audited 16 bps floor, and uses t = 2.0 where this programme resolves at t = 3.

## What to collect, if this is to be answerable

1. **Bybit `allLiquidation` WebSocket**, same shape as `ob_recorder.mjs`, appending one JSONL per
   symbol-day. Forward-only; no history exists to backfill.
2. **Open interest at 10 s** rather than 5.6 minutes, if ΔOI over a 5–15 s window is genuinely
   part of the hypothesis.
3. **Then wait.** The mirror event's own reopen criterion asks for ~140 days. Liquidation-flagged
   events will be rarer than the 283 unflagged ones already collected, not more common.

That is a real build with a real deliverable, and unlike a paper runner it creates data that does
not otherwise exist. It is also the honest answer to "what is the blocker": not a missing module,
a missing feed, and then four months of it.

## What this does not say

The payer story is sound. Forced liquidation is one of the few flows in this market with a named,
mechanically-compelled counterparty, and it deserves the feed. What is not sound is writing a
detector today: it would run on no data, and the two nearest measured relatives come in at
**8.27 bps** and **−5.80 bps** against a **16 bps** floor.

## Evidence

- `CD.OI_COLLAPSE_REVERSION` — TASK-AH-052, `reference/B7_OI_COLLAPSE_RECONNAISSANCE_2026-08-05.md`
- `CD.SWEEP_CONTINUATION` / `LAW.FLOW.SWEEP_CONTINUATION_SATURATES` — TASK-AH-051
- `GAP.OI_LIQ.FINE_GRAIN` — catalogued data gap
- Host inspection, read-only: no liquidation subscription exists; `oi_forward` at 258 rows/day
