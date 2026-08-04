# Hawkes reopen cutoff against CD.SWEEP_CONTINUATION — 2026-08-05

Research only. Read-only over locally held sweep aggregates. No network, no server, no live,
paper, service, collector, config, coordinator, approval, KILL, secret, order, account or
position path. Train segment only; the sealed segment was not touched, because a diagnostic has
no licence to spend data a successor task will need.

## Why this ran, and why it ran cheaply

`CD.SWEEP_CONTINUATION` closed the family `CLOSED_MEASURED` with this reopen criterion:

> Only on a round-trip cost position below roughly 8 bps, **or on a new conditioner that is not
> derived from the pre-sweep book state AND orders the top notional row monotonically.** A
> different percentile cut on the same conditioner is a parameter search and does not qualify.

Hawkes self-excitation intensity is computed from the sweep **arrival stream**, not from the
book. It therefore had a claim on the first clause, which made a reopen legitimate under the
registry's own rules rather than a silent retry.

The criterion has two conjuncts, so the cheap question comes first: **does intensity identify a
different subset of sweeps than notional rank does?** If the two rank together, the conditioner
is size wearing a different name and the vector closes before any task is written.

## Method

Exponential-kernel intensity at each sweep, excluding the event itself:

```
lambda(t_i) = sum_{j<i} exp(-(t_i - t_j)/tau)
```

computed by the O(n) recursion `lambda_i = (lambda_{i-1} + 1) * exp(-(t_i - t_{i-1})/tau)`, so
it is strictly causal — only prior arrivals contribute.

Three decay constants declared before the run and all reported: **tau = 1s, 10s, 60s**. Both
sort keys ranked **within symbol**, never pooled — the defect found in AH-051.

304,494 train sweeps across 10 symbols, 55 percent chronological train fraction.

## Result 1 — the conditioner is genuinely independent

Spearman of intensity rank against notional rank, within symbol:

| tau | mean | min | max |
|---|---:|---:|---:|
| 1s | **−0.038** | −0.120 | +0.086 |
| 10s | **−0.045** | −0.128 | +0.078 |
| 60s | **−0.049** | −0.114 | +0.053 |

Essentially zero, and faintly negative — high-intensity moments carry slightly *smaller*
sweeps, which is what a cascade of many small orders should look like.

**The first clause is satisfied.** This is not notional under another name.

## Result 2 — it does not order the top notional row

The strict test the criterion actually names. Rows are within-symbol notional quintiles, n4
largest; columns are intensity quintiles within each row, c4 highest. Cells are mean 60-second
continuation in bps, 12,182 events each.

| tau | c0 | c1 | c2 | c3 | c4 | monotone? |
|---|---:|---:|---:|---:|---:|---|
| 1s | 6.33 | 6.35 | 6.42 | 6.17 | 6.44 | **no** |
| 10s | 6.39 | 6.38 | 6.57 | 6.26 | 6.11 | **no** |
| 60s | 6.65 | 6.35 | 5.97 | 6.80 | 5.94 | **no** |

Flat at all three constants and monotone at none. Top-row t values run 20.6 to 40.2, so these
cells are well resolved — this is a measured absence of ordering, not a power problem. The
largest cell anywhere in the row is **6.80 bps against the 16 bps floor**.

**The second clause fails. The reopen does not qualify.**

## Result 3 — pooled, the relation runs the wrong way

Across all notional levels, continuation by intensity quintile:

| tau | q0 | q1 | q2 | q3 | q4 |
|---|---:|---:|---:|---:|---:|
| 1s | 4.95 | 4.99 | 4.78 | 4.92 | **4.31** |
| 10s | 4.91 | 5.06 | 5.01 | 4.77 | **4.20** |
| 60s | 5.07 | 4.87 | 4.90 | 4.82 | **4.30** |

t between 34.7 and 76.0. The highest-intensity sweeps continue **less**, not more.

The self-excitation thesis is that a cascade generates its own micro-trend, so intensity should
predict *more* continuation. Measured, it predicts slightly less. That is a refutation of the
cascade story rather than an absence of evidence for it.

## Disposition

`CD.SWEEP_CONTINUATION` remains `CLOSED_MEASURED`. The refused reopen is recorded in the
decision's own notes and as two tested variants on
`LAW.FLOW.SWEEP_CONTINUATION_SATURATES`, so that a future attempt sees the attempt rather than
repeating it.

**A further attempt on the same conditioner at a different decay constant is a parameter search
and does not qualify.** Three were declared and all three agree.

## Cost of this answer

One diagnostic script, one pass over already-collected data, no new task, no new collection.
That is the intended use of a recorded reopen criterion: it makes "is this worth a ticket?"
answerable before the ticket is written.
