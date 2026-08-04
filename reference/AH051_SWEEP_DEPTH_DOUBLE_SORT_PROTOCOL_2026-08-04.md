# AH-051 — Sweep × Depth-Response Double Sort, Stage 0 protocol

Research only. Read-only. No network, service, credential, exchange, account, order, execution
or position path. Nothing written to the server.

## The frozen specification

| | |
|---|---|
| Event | parent sweep at the frozen 100 ms burst gap, multi-level |
| Event set | train-only per-symbol **top decile** of parent notional |
| Direction | **CONTINUATION**, declared |
| Entry | mid at sweep completion, taker |
| First sort | within-symbol percentile rank of parent notional, quintiles |
| Second sort | within-symbol rank of the pre-sweep depth response on the consumed side, quintiles, **applied within each notional bucket** |
| Horizons | 60s primary; 300s and 900s fixed neighbours |
| Costs | 16 bps round trip, 32 bps stress; 11 bps reported for comparison only |
| Splits | chronological, train = first 55 percent by time; remainder sealed |
| Reporting minimum | 30 events per cell |
| Power target | t = 3 |

## Why the conditioner is a pre-sweep quantity

The mechanically interesting question is how the book *responds* to the sweep. That quantity
cannot be used. The order-book cadence is roughly ten seconds, so the first snapshot after
completion sits up to ten seconds inside a sixty-second outcome window and leaks it.

The conditioner is therefore the depth change over the interval **ending at or before**
completion — the state the aggressor walks into. Weaker, and causal.

## Why not the guard predicate

`guardState` from AH-047 was the obvious candidate and is wrong here on mechanical grounds.
Its flow term is net aggressive notional over the snapshot interval; during a large sweep that
term is dominated by the sweep itself, so the predicate is near-constant across the event set
and carries almost no variation to sort on.

## Data

553,615 sweeps over 10 symbols and 13 days, joined to the guard/book snapshot stream. Match
rate 99.997 percent, join tolerance 30 s. Train events after the decile cut: 30,454. Sealed and
untouched: 24,393.

## Result

**`STAGE_0_INFEASIBLE`.** Extreme cell 7.35 bps against a 16 bps floor, shortfall 8.65 bps,
t = 8.96 with 2.46 bps detectable — a measured shortfall, not a power problem. Conditioner not
monotone in the top row. Maximum of all 75 reportable cells across three horizons: 10.27 bps.

Grids for all three horizons are in `data/ah051_sweep_depth_double_sort_2026-08-04.csv`, one
row per cell.

### The conditioner orders nothing

Column means of the conditioner in the top notional row run −0.410, −0.128, +0.013, +0.322,
+14.228. The sort has enormous range. The continuation across those same columns runs 7.35,
6.98, 8.45, 7.16, 6.86 — flat. The same holds at every notional level and at 300s and 900s.

### The size relation is real and saturates below the floor

Measured directly across the full notional range on the train segment, outside the decile cut:

| within-symbol percentile | n | continuation 60s | t |
|---|---:|---:|---:|
| 0–50 % | 152,246 | 4.40 | 72.7 |
| 50–80 % | 91,349 | 4.40 | 53.3 |
| 80–90 % | 30,448 | 6.08 | 41.2 |
| 90–95 % | 15,225 | 6.68 | 30.5 |
| 95–98 % | 9,135 | 7.01 | 25.8 |
| 98–99 % | 3,045 | 7.10 | 13.9 |
| 99–99.5 % | 1,523 | 7.31 | 11.4 |
| 99.5–99.9 % | 1,216 | 7.63 | 8.7 |
| 99.9–100 % | 301 | 8.27 | 5.7 |

Monotone across nine bands and flattening as it climbs. The largest one-in-a-thousand sweep
continues 8.27 bps. There is no size at which this pays a 16 bps round trip.

## Engine defect found and fixed mid-run

The first cut sorted the first dimension on raw notional **pooled across symbols**. Notional
scales differ by orders of magnitude between symbols, so that sort ranked symbols rather than
events and the grid ran backwards — continuation appeared to *fall* with size, contradicting a
direct per-symbol measurement of the same data.

Caught by checking the grid against an independent computation rather than by reading the code.
Both sorts now run on within-symbol percentile rank, pinned by a regression test using two
symbols on disjoint notional scales where a pooled sort provably cannot recover the planted
relation.

## What this closes

The conditioning route on AH-048 closes. The paying tail is real — 32 percent of AH-048's
events at 900s exceeded 11 bps — but it is dispersion rather than a conditional mean, and it is
not identifiable in advance by size or by the pre-sweep state of the consumed book side.
