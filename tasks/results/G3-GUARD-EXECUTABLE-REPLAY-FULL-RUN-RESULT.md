# G3 executable replay — full archive run — RESULT

**Verdict: `G3_STAGE_PASS`.**
**Label: `EXECUTION_REPLAY_NOT_A_PASSPORT`. promising_count: 0.**

**This is the first G3 pass in the programme's history.** No family had previously reached it,
partly because the gate as written was unpassable for a guard — it asked for expectancy, and a
guard has none.

Read §4 before treating this as replication. It is not.

## The run

10 symbols, 2026-07-10 → 2026-08-01, **2,122,951 filled intents** at the zero offset from
1.56 million snapshots evaluated in both directions. Execution applies spread crossing at the
recorded half-spread and a depth check that turns an oversized intent into a no-fill.

| δ declared | median staleness | separation | t | detectable @ t=3 | retained | **per executed intent** |
|---:|---:|---:|---:|---:|---:|---:|
| 0 ms | 5,664 ms | 0.5235 | **18.94** | 0.083 | 100 % | **0.0855** |
| 1,000 | 6,677 | 0.4338 | 15.63 | 0.083 | 83 % | 0.0706 |
| 2,500 | 8,173 | 0.3683 | 13.24 | 0.084 | 70 % | 0.0595 |
| **5,000** | **10,634** | **0.2813** | **10.11** | 0.084 | **54 %** | **0.0451** |
| 7,500 | 13,098 | 0.2128 | 7.65 | 0.084 | 41 % | 0.0339 |
| 10,000 | 15,649 | 0.1529 | 5.51 | 0.083 | 29 % | 0.0237 |

**Every point on the axis is resolved**, from t = 18.94 down to t = 5.51. The one-symbol run
that preceded this resolved nothing.

Both controls pass. The ALLOW mean is **−1.614 bps**, far inside the +0.50 limit and negative
as the mechanism requires — the predicate suppresses bad states rather than picking direction.
The veto rate is **16.2 percent**, inside its declared bounds and stable across the axis.

## The decay, and a pilot vindicated

At the protocol's 50 percent offset the separation retains **54 percent**.

The one-symbol pilot of the same day put it at 54 percent and was labelled a shape indication
rather than a measurement, at t = 1.92 on 17,260 evaluations. On 2.1 million it lands on the
same number. The pilot was underpowered and right, and it was correct to refuse to compile that
figure into the harness.

Note the staleness column: a *declared* offset of zero carries **5,664 ms** of median staleness,
because ticks do not arrive at snapshot boundaries. The zero row is already more than five
seconds stale, so the real curve is steeper than the axis labels suggest.

## What the guard is worth, measured rather than inferred

At the realistic offset the guard delivers **0.0451 bps per executed intent** — **0.282 percent
of one 16 bps round trip**.

The arithmetic chain, now closed with measurements at every link:

| | |
|---|---:|
| separation at ideal fill, `LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE` | 0.715 bps |
| separation under execution mechanics at zero offset | 0.5235 bps |
| × veto rate 16.2 % → per executed intent | 0.0855 bps |
| × 54 % staleness retention at realistic decision age | **0.0451 bps** |

The register's original figure was 0.715, then corrected to about 0.04 on the one-symbol run.
**The full run confirms 0.045.** The correction was right and the magnitude stands: the honest
execution formula is

```
Net = Signal − 16.00 bps + 0.045 bps
```

## What this pass does not establish

**It is not replication.** The run uses the **same 26-day archive** that produced
`LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`. Passing G3 here establishes that the effect
survives executable mechanics — spread crossing, depth limits, tick-resolution entry and
realistic staleness — on the data it was found in. It says nothing about whether it recurs.

The law's own review criterion is unchanged and unmet:

> Promote to replicated only on a SECOND, non-overlapping archive span of at least 10 days per
> out-of-sample segment.

**The second span remains the blocking condition**, and it is still accumulating.

**It is not an economic case either.** 0.045 bps a trade is real, resolved, and tiny. It cannot
rescue a signal that does not clear its own floor, and the register records that arithmetic.

## What changed in the harness to get here

Two defects, both found on the one-symbol run and both fixed before this one:

- the price source matched prints days later for snapshots outside tick coverage, producing a
  median staleness of 39 hours beside a passing verdict. A tolerance now rejects them by reason.
- the gate tested only the sign of the separation, so 0.073 bps at t = 0.42 passed. It now
  requires resolvability at t = 3 and reports the t and detectable size on every row.

Both were caught by reading the diagnostics rather than the headline, which is the only reason
this run's pass can be believed.

## Data

Tick archive reduced server-side to `ts px` pairs by a read-only stream filter — 318 MB
compressed on the server became **25 MB** transferred, at 1.58 bytes per tick. Nothing was
written on the server.

## Next

The second archive span, per the law's review criterion. Until it exists, the guard has a
passed executable replay on one archive and no replication, which is the honest state.
