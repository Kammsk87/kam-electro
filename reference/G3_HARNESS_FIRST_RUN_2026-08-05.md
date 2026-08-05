# G3 guard harness — build and first run, 2026-08-05

Read-only over locally held aggregates. No network, live, paper, service, collector, config,
coordinator, approval, KILL, secret, order, account or position path.

The harness implements `docs/BOTALIN_G3_PROTOCOL_FOR_GUARDS_2026-08-05.md`. This document records
what it measures, the two defects it exposed in itself, and the one arithmetic correction it
forces on the register.

## What was built

| requirement | implementation |
|---|---|
| exhaustive synthetic intent stream | both directions at every snapshot, no selection |
| staleness as an axis | `delta_axis_ms = [0, 1000, 2500, 5000, 7500, 10000]`, no retention figure compiled in |
| paired replay | run B sends everything, run G withholds vetoes, identical mechanics |
| metric per executed intent | never total, never PnL |
| control 1 | random veto at the measured rate, seeded, 200 draws |
| control 2 | ALLOW-set drift limit at 0.50 bps |

Execution mechanics applied to both runs: **spread crossing** at the recorded half-spread, a
**depth check** turning an oversized intent into a no-fill rather than a fill at a price the
book could not supply, and tick-resolution entry so a sub-interval offset can be expressed at
all. The predicate is **imported** from `ah047_execution_policy_guard.mjs`, never reimplemented.

## The correction this forces on the register

The protocol demanded the metric be **per executed intent**, not the ALLOW-versus-VETO
separation. Building it made the reason explicit:

```
per_executed_gain = mean(ALLOW) − mean(ALL) = veto_rate × (mean(ALLOW) − mean(VETO))
```

A separation of *s* at a veto rate of *v* is worth **v·s** on a trade, not *s*. A test pins the
identity.

The veto rate measured here is **18.8 percent**. So `LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`'s
headline separation of 0.715 bps is worth about **0.134 bps per executed intent**, and after
the staleness retention measured below, roughly **0.036 bps**.

The register currently states +0.715, and about +0.4 after staleness. **Both overstate what a
guard delivers on a trade — the first by 1/v, the second by roughly twentyfold.** The register
is corrected accordingly.

## First run

One symbol-day, `AAVEUSDT` on 2026-07-15 — the only span holding both a guard-snapshot stream
and a tick stream. 16,506 filled intents of 385,000 evaluated; the rest were rejected for lack
of a price inside the tolerance, which is what the coverage gap looks like when it is handled
rather than hidden.

| δ declared | median staleness | separation | t | detectable @ t=3 | retained | **per executed** |
|---:|---:|---:|---:|---:|---:|---:|
| 0 ms | 3,030 ms | 0.2736 | 1.60 | 0.514 | 100 % | **0.0515** |
| 1,000 | 4,135 | 0.2029 | 1.18 | 0.518 | 74 % | 0.0381 |
| 2,500 | 5,784 | 0.1953 | 1.13 | 0.517 | 71 % | 0.0367 |
| **5,000** | **8,310** | **0.0730** | **0.42** | 0.518 | **27 %** | **0.0137** |
| 7,500 | 10,477 | 0.0131 | 0.08 | 0.521 | 5 % | 0.0025 |
| 10,000 | 13,045 | **−0.0209** | −0.12 | 0.515 | −8 % | −0.0039 |

**Verdict: `G3_FAIL_UNRESOLVED`.**

Note the first column: a *declared* offset of zero carries a **median staleness of 3,030 ms**,
because ticks do not arrive at snapshot boundaries. The zero row is already three seconds stale,
so the true decay is steeper than the axis suggests.

At the protocol's 50 percent offset the separation retains **27 percent**, not the 54 percent
the one-symbol pilot indicated. By 10 seconds it is negative.

Control 2 passes: the ALLOW mean is −0.499 bps, comfortably inside the 0.50 limit, so the
predicate is suppressing bad states rather than picking direction. The veto rate of 18.8 percent
is inside its declared bounds.

## What this does and does not establish

**Not established: that the guard fails G3.** Nothing on the axis is resolvable — even at zero
offset, t = 1.60 against a required 3, and the sample resolves 0.514 bps while the quantity is
0.274 at best. This is **one symbol and one day**, 16,506 intents against the 779,540 behind the
producing law.

**Established: the harness works, and G3 cannot be concluded on the data currently held.** Guard
snapshots exist for 10 symbols over 26 days; ticks exist for one symbol-day. The gate needs both
streams over the same span, and the blocking condition is a tick extraction, not a wait.

**Established: the decay is steep and the per-trade value is small.** Whatever the full run
returns, it will be read against a per-executed figure in the hundredths of a basis point, not
the tenths the register previously implied.

## Two defects the harness found in itself

**A price matched days later.** The price source returns the first print at or after the request.
Snapshots outside tick coverage matched prints days away, and the first run reported a median
staleness of **142,893,677 ms — 39 hours** — alongside a `G3_STAGE_PASS`. The verdict was
meaningless. Fixed with an explicit tolerance; the rejection is now counted by reason.

Caught by reading the diagnostic, not the headline. The staleness field existed only because the
protocol asked for it.

**A gate that tested a sign.** The kill condition read `separation > 0`, so 0.0730 bps at t = 0.42
passed. That is the same defect class as AH-050's one-sided power check: a threshold with no
resolvability. The gate now requires the separation at the 50 percent offset to be distinguishable
from zero at t = 3, and reports the t and the detectable size on every row.

Six harness defects across seven tasks now, and not one found by reading the implementation.

## Next

A tick extraction for the 10 symbols over the 26-day guard span, matching what was already done
for the sweep work. Until then G3 has a working harness and no conclusion, which is the honest
state to be in.
