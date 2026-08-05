# HL_CASCADE funding cutoff — three numbers, 2026-08-05

Read-only stream over the existing archive. Nothing written to the server. No live, paper,
service, collector, config, coordinator, approval, KILL, secret, order, account or position
path. Run before any ticket, to decide whether one should be written.

## Declared before the run

| | |
|---|---|
| universe | top 30 assets by median `dayNtlVlm` — a coverage criterion, never a return one |
| settlements | 00:00, 08:00, 16:00 UTC |
| window | ±30 minutes |
| controls | equally many windows of equal length, ≥2h from any settlement, seeded |
| velocity | change in funding over 30 minutes |
| forward | 60 minutes measured **after** the velocity window closes, so the two never overlap |
| price | `markPx` |
| floor | 16 bps |

Archive: 35,029 snapshots at 60s, 232 assets, 2026-07-11 → 2026-08-05. 73 settlements usable.

## Number 1 — movement at settlement: FAIL

| | n | mean bps | median bps |
|---|---:|---:|---:|
| settlement windows | 2,190 | 60.75 | 35.11 |
| control windows | 2,130 | 64.14 | 36.53 |
| **difference** | | **−3.38** | |

se 2.76, **t = −1.23**.

Settlement windows move if anything *less* than random ones. The rebalancing-window thesis
predicts more — that delta-neutral books are rebalanced around the funding clock and the
resulting flow shows up as movement. It does not.

**Independent recomputation**, BTC alone, different language and different implementation:
settlement 21.98 bps against control 21.14, difference **+0.84 bps**. Opposite sign, equally
indistinguishable from zero. The level differs from the pooled figure because the 30-asset
universe carries far more volatile alts; the conclusion does not.

## Number 2 — orthogonality: PASS

Spearman of funding velocity against |funding| level, within asset:

| assets | mean ρ | median | min | max | share \|ρ\| > 0.5 |
|---:|---:|---:|---:|---:|---:|
| 30 | **+0.073** | +0.085 | −0.152 | +0.259 | **0 %** |

Velocity is genuinely independent of level. It is not funding wearing a different name.

This is the same shape as the Hawkes cutoff: an independent conditioner is a necessary
condition and not a sufficient one.

## Number 3 — amplitude: FAIL, and the sort is degenerate

| q | n | mean bps | median | t |
|---|---:|---:|---:|---:|
| q0 | 5,536 | +2.69 | +2.07 | +1.34 |
| q1 | 1,310 | −6.07 | +0.44 | −0.95 |
| q2 | **21,060** | +0.15 | −1.98 | +0.23 |
| q3 | 1,394 | +1.26 | +0.00 | +0.23 |
| q4 | 5,650 | −1.78 | +0.62 | −0.92 |

q4 − q0 spread **−4.47 bps** against a 16 bps floor. Not monotone. No quintile mean anywhere
near the floor; the largest in absolute terms is 6.07.

**The quintiles are not quintiles.** 60 percent of observations sit in one bucket, at a size
ratio of 16:1.

## The defect behind Number 3, and why it is a finding

The first cut computed velocity as an **endpoint difference**, `f(t) − f(t−30min)`. That
collapsed 63 percent of observations into a single bucket. Diagnosis showed why: funding
updates often — median gap between changes is **1 minute**, with 22 to 69 percent of snapshots
carrying a change depending on asset — but the value is **quantised and mean-reverting**, so it
revisits earlier values and a 30-minute endpoint difference is *exactly zero* for 24 to 74
percent of windows.

Recomputing velocity as a **slope** — mean of the last third minus mean of the first third —
uses the path instead of two points and is robust to quantisation. It left 60 percent ties.

That is not a harness problem any longer. It is the measurement: **at a 30-minute horizon this
funding series has roughly two states, moved and did not move, not five.** The conditioner is
too coarse to sort, and no reparameterisation of the same window fixes that.

## Verdict: CLOSED_MEASURED, and the prediction made yesterday was wrong

Yesterday's stated expectation was `UNDERPOWERED` with a request to keep recording — 25 days,
75 settlements, a small sample. That was wrong, and in the useful direction.

The span is short but the **observation count is not**: 34,950 velocity observations and 2,190
settlement windows. Standard errors run about 2 bps, so a 16 bps effect would sit roughly
**eight standard errors** from what was measured. It is excluded, not unresolved.

Waiting for the archive to reach its designed 30 days on about 10 August would add 20 percent
to a sample that is already large enough to have answered.

## What this closes and what it does not

Closed: funding velocity as a directional conditioner at a 30-minute measurement horizon and a
60-minute forward, and the funding-settlement rebalancing window as a movement event.

Not closed: funding at longer horizons, and the other three fields the recorder carries — open
interest, the oracle/mark gap, and the exchange-reported `premium`, which is a distinct
quantity from the mark-minus-oracle spread. Hypothesis B7, open-interest decay on price rise,
is untouched by this cutoff and is the one the recorder was actually built for: its header
states the design thesis as *"cascade = OI collapse + oracle/mark divergence"*.
