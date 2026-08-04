# TASK-AH-051 — Sweep × Depth-Response Double Sort v0 — RESULT

**Verdict: `STAGE_0_INFEASIBLE`.**
**Lifecycle stage: DISCOVERY. Next permitted transition: closure.**
**promising_count: 0.** No Stage 1 implementation was written, as the contract requires.

## One-line summary

The double sort returned a clean negative: post-sweep continuation rises with sweep size but
saturates at roughly 8 bps, far below the 16 bps floor, and the pre-sweep depth response
carries no ordering at any size or horizon.

## Data

553,615 parent sweeps across 10 symbols and 13 days, each joined to the order-book snapshot
interval ending at or before its completion. Match rate 99.997 percent. Restricted to the
train-only per-symbol top decile of parent notional: **30,454 train events, 24,393 sealed and
untouched.**

## The grid, 60s primary

Rows are within-symbol notional rank, n4 largest. Columns are the pre-sweep depth response on
the consumed side, c0 the strongest withdrawal. Cells are mean continuation in bps, 1,208
events each.

| | c0 | c1 | c2 | c3 | c4 | row |
|---|---:|---:|---:|---:|---:|---:|
| n4 | 7.35 | 6.98 | 8.45 | 7.16 | 6.86 | **7.36** |
| n3 | 7.07 | 6.37 | 6.75 | 5.95 | 7.21 | 6.67 |
| n2 | 8.21 | 7.89 | 8.07 | 6.62 | 7.55 | 7.67 |
| n1 | 6.00 | 6.63 | 5.66 | 5.49 | 6.04 | 5.96 |
| n0 | 7.27 | 7.52 | 7.02 | 5.54 | 6.59 | 6.79 |

**Extreme cell: 7.35 bps against a 16 bps floor — a shortfall of 8.65 bps.** It is well
resolved (t = 8.96, detectable 2.46 bps), so this is a measured shortfall and not a power
problem. The conditioner is not monotone in the top row.

**The maximum of all 75 reportable cells across all three horizons is 10.27 bps.** Nothing in
the grid approaches the floor.

## Both dimensions fail, for different reasons

**The conditioner carries nothing.** The rows are flat in the conditioner at every notional
level and at all three horizons. Column means of the conditioner run −0.410, −0.128, +0.013,
+0.322, +14.228, so the sort has enormous range and still orders nothing. The pre-sweep state
of the book on the side about to be consumed does not tell you how far the price will continue.

**The size dimension is real but saturates below the floor.** Measured directly over the full
notional range rather than inside the decile, on the same train segment:

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
| **99.9–100 %** | **301** | **8.27** | **5.7** |

Monotone across nine bands, and it flattens as it climbs. **Even the largest one-in-a-thousand
sweep continues only 8.27 bps.** Doubling the event size buys well under a basis point. There
is no size at which this pays 16 bps.

## What this closes

The conditioning route on AH-048 is closed. The instrument was the right one — a double sort
is exactly how the literature separated crypto momentum by size — and it returned a negative
that is measured rather than underpowered.

The paying tail from AH-048 is real: 32 percent of its events at 900s exceeded 11 bps. This
task establishes that **that tail is not identifiable in advance by size or by the pre-sweep
state of the consumed book side.** It is dispersion, not a conditional mean.

## Engine defect found and fixed mid-run

The first cut sorted the first dimension on **raw notional pooled across symbols**. Symbol
notional scales differ by orders of magnitude, so that sort ranked symbols rather than events:
the "largest" bucket filled with whichever names trade in size. The resulting grid ran
*backwards*, showing continuation falling with size — the opposite of the direct per-symbol
measurement of the same data.

It was caught by checking the grid against a direct percentile measurement rather than
trusting it. Both sorts now run on within-symbol percentile rank, pinned by a regression test
using two symbols on disjoint notional scales where a pooled sort provably cannot recover the
planted relation.

**This is the second gate defect in two tasks** — AH-050's power check applied to only one sign,
and this one pooled across symbols. Both were found by testing the harness against an
independent computation rather than by reading it.

## Limitations

1. Ten symbols, thirteen days. The size relation has large t values but rests on one archive.
2. The conditioner is the state *entering* the sweep, not the book's response to it. A
   post-completion snapshot would sit up to ten seconds inside the 60-second outcome window
   and leak it. A faster book feed would permit the stronger quantity; ours does not.
3. The continuation direction was learned from AH-048's train segment, so a positive result
   here would have needed sealed-data confirmation. The result is negative, so this does not
   arise — but it is why the sealed segment was left untouched.

## Deliverables

1. `scripts/analysis/ah051_sweep_depth_double_sort.mjs`
2. `scripts/test_ah051_sweep_depth_double_sort.mjs` — 31/31 passing
3. `reference/AH051_SWEEP_DEPTH_DOUBLE_SORT_PROTOCOL_2026-08-04.md`
4. `data/ah051_sweep_depth_double_sort_2026-08-04.{csv,json}`
5. This result file

## Safety

Read-only throughout. No network, no live, paper, service, collector, config, coordinator,
approval, KILL, secret, order, account or position path. Nothing written to the server. No raw
market data committed — only the aggregate grid. Sealed segments untouched.
