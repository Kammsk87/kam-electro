# Execution gateway — forward replication on a non-overlapping span — RESULT

**Verdict: `REPLICATES_BUT_SHORT_OF_THE_PRE-REGISTERED_BAR`.**
**Law status unchanged: `observed`. promising_count: 0.**

The effect reproduces almost exactly on data it has never seen. The law is still not promoted,
and §6 says why that is the correct call rather than a cautious one.

## The step that turned out not to be needed

The proposed plan opened with "write a live WebSocket collector." That module already exists and
has been running for a week. `ob_recorder.mjs` on the research host has been up since 2026-07-29,
polling Bybit `/v5/market/orderbook` (limit 50) and `/v5/market/recent-trade` on a **10,000 ms**
cycle across 40 symbols, appending one JSONL file per symbol-day.

The in-sample archive ends **2026-08-01 23:59**. That was the boundary of the earlier pull, not
the end of collection. Days 02 through 05 August were already on disk. The out-of-sample span did
not have to be created — only fetched.

**Two design points in the proposed plan would have destroyed the measurement:**

*The 100–500 ms snapshot cadence.* The archive cadence is 10,000 ms, median exactly. The frozen
policy is `cap = 3 snapshots`, which on that grid means 30 seconds. On a 100 ms grid the same
three snapshots are **300 milliseconds** — a different policy under the same name. The +0.0588
bps figure and the saturation between 30 s and 60 s are both properties of the 10 s grid.
Changing it would not have tested the law; it would have silently substituted the object and made
any disagreement uninterpretable.

*Building steps 2–4 as a live service.* The gateway's decision is **causal**: it reads snapshot
`i` and looks forward only within the cap, never beyond. An offline replay of a recorded feed
therefore produces bit-identical decisions to a live service. A live service adds exactly one
thing — evidence that the decision fits inside a latency budget — and that is a separate one-off
measurement. Against it: eight harness defects have been found in this programme, two of them in
this very gateway. A new async service with timers would probably contribute a ninth, and a
disagreement with the archive would then be indistinguishable between "the law failed" and "the
new service is broken." Replaying the **unchanged** binary removes that fork. Only the dates move.

## Result

Same reduction (`guard.awk`, byte-identical), same code (`execution_gateway.mjs`, unchanged), same
nine symbols, disjoint and adjacent days.

| cap | in-sample Jul 10 – Aug 01 | forward Aug 02 – Aug 05 |
|---|---|---|
| 1 | 0.0492 (t = 34.0) | 0.0485 (t = 19.6) |
| **3** | **0.0593 (t = 37.4)** | **0.0591 (t = 21.8)** |
| 6 | 0.0596 (t = 37.5) | 0.0592 (t = 21.8) |

**Difference at the frozen cap: −0.0002 bps, t = −0.05.**

n = 401,773 forward against 2,222,387 in-sample. Every secondary statistic tracks as well:

| | in-sample | forward |
|---|---:|---:|
| wait rate | 15.50 % | 15.57 % |
| mean wait | 11,242 ms | 11,101 ms |
| forced at cap | 0.0415 % | 0.0441 % |
| share improved | 4.82 % | 4.72 % |
| on waited | 0.3813 | 0.4059 |
| random-wait control | −0.0021 | +0.0002 |

**Nine of nine symbols positive.**

## What replicates, and what does not

**The pooled effect replicates to within 0.4 percent.** The policy's whole operating shape — how
often it waits, how long, how often it gives up — reproduces on data collected after the law was
written.

**The per-symbol magnitudes do not.** BILLUSDT, the strongest symbol in-sample at 0.128, comes
back at 0.068. AMATUSDT falls from 0.0125 to 0.0019. AAVEUSDT and ADAUSDT roughly double, 0.047
to 0.077 and 0.041 to 0.077.

That combination is informative rather than disappointing: **the effect is a property of the
population, not of individual symbols.** Anyone concentrating capital on the best in-sample
symbol would have picked BILL and received half. It is a direct, measured argument against the
symbol-selection step that any live deployment would be tempted to add.

## The comparison was composition-matched, because AERGO left

`AERGOUSDT` returns nothing after 2026-07-25 — it stopped being collected because it stopped
being quoted. It is absent from the forward span.

That matters more than a missing row usually would. AERGO was the one symbol whose control
(0.0340) came close to its own measurement (0.0461) — the weakest evidence in the set. Dropping
it makes the forward sample cleaner by composition rather than by fact. So the in-sample figure
quoted above is **recomputed on the same nine symbols**, not the published ten-symbol 0.0588.
On matched composition the in-sample value is 0.0593 and the difference is the t = −0.05 above.

## An error in the previous document, exposed by this run

The earlier result claimed "the gate beats its control by a factor of 39." That statistic does
not survive. Its denominator is consistent with zero, so the ratio is unstable in magnitude and
in sign: recomputed on these nine symbols the in-sample control is **−0.0021** and the same
arithmetic yields **−28**.

The defensible claim was always the simpler one — the control cannot be distinguished from zero
and the effect can — and it is now what both documents say. The number changed nothing about the
conclusion, which is precisely why it should not have been printed as if it were evidence.

## Why the law is still `observed`

Its pre-registered `review_criterion` reads: *promote to replicated only on a second,
non-overlapping archive span of **at least 10 days** per out-of-sample segment.*

This span is **3.5 days**. It does not meet the bar under any reading of it.

The result is as favourable as a replication can be, which is exactly the circumstance in which a
criterion gets quietly reinterpreted. A bar that is relaxed the moment the answer comes back
pleasing is not a bar. Status stays `observed`; the run is recorded in the law's `oos` and
`tested_variants` as evidence *toward* the criterion.

There is also a real methodological limit here, independent of the day count. The forward span is
**adjacent** — it begins one minute after the in-sample span ends. It tests whether the law holds
on new data from the same generating process. It does not test a different volatility regime, a
different venue, or a different symbol set. Those remain untested, as `temporal_stability` says.

## What this costs to finish

**Nothing, and six and a half days.**

The recorder has been running continuously since 2026-07-29 and needs no change. On or after
**2026-08-12** the second span reaches 10 days, and the check is re-running one reduction and one
unchanged binary. No new module, no live service, no deployment.

If the effect is still ~0.059 bps at that point, the law is promotable on its own terms rather
than on a relaxed reading of them.

## Files

- `data/execution_gateway_forward_replication_2026-08-05.{csv,json}`
- `data/research_warehouse_catalog_fixture_2026-08-02.json` — law `oos`, `temporal_stability`,
  `review_criterion`, `tested_variants`, `notes` updated; status deliberately not
- `tasks/results/EXECUTION-GATEWAY-PAIRED-ENTRY-RESULT.md` — corrected
