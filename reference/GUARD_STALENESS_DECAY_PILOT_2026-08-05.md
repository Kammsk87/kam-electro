# Guard staleness decay — pilot against G3 §4, 2026-08-05

Read-only over locally held aggregates. No network, no server, no live, paper, service,
collector, config, coordinator, approval, KILL, secret, order, account or position path.

## What could not be done as proposed

The test was to shift the guard decision by +1, +3, +5 and +8 seconds from the snapshot. **That
cannot be built from the book stream.** Measured cadence on `AAVEUSDT.guard.txt`:

| p05 | p25 | p50 | p75 | p95 |
|---:|---:|---:|---:|---:|
| 9,060 ms | 9,705 ms | **10,000 ms** | 10,272 ms | 10,950 ms |

0.0 percent of intervals are under 5 seconds and 0.1 percent under 8. The finest staleness the
book alone can express is one whole interval.

It **can** be built from the tick stream, which is millisecond-stamped. Guard state is taken
from snapshot `i`, knowable at `T_i`; the position is entered at the first tick at or after
`T_i + delta` and closed at the first tick at or after entry + 60 s. Strictly causal at every
delta. The tested predicate `guardState` was imported, not reimplemented.

## Scope, and why the numbers must be read relatively

One symbol, one day — `AAVEUSDT`, 2026-07-15, 111,140 ticks, 8,630 snapshots, 17,260
intent-evaluations. TASK-AH-047's headline of +0.715 bps at t = 20.1 rests on **779,540**
observations across 10 symbols and 26 days.

This pilot is roughly two percent of that. **Decay is therefore read against this pilot's own
delta = 0, never against the headline.** Entry and exit use last-trade prices rather than the
book mid, which adds bid-ask bounce; the bounce is common to all five rows and so affects the
level more than the shape.

## Result

| delta | separation (bps) | t | retained |
|---:|---:|---:|---:|
| 0 s | 0.333 | 1.92 | 100 % |
| 1 s | 0.274 | 1.58 | 82 % |
| 3 s | 0.271 | 1.56 | 81 % |
| 5 s | 0.181 | 1.04 | **54 %** |
| 8 s | 0.103 | 0.59 | 31 % |

Veto rate is 18.6 percent at every delta, as it must be — only the outcome window moves, not
the state.

### The mechanism is visible in the two sides

| delta | ALLOW mean | VETO mean |
|---:|---:|---:|
| 0 s | +0.06 | **−0.27** |
| 5 s | +0.03 | −0.15 |
| 8 s | +0.02 | −0.08 |

The separation is carried by the VETO side, and the VETO side **rises toward zero** as the
delay grows. The adverse move the guard detects is largely consumed within the first few
seconds; by eight seconds most of it has already happened. That is a physically sensible decay
rather than a statistical artifact, and it is consistent with
`LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`, which describes a state followed by an
immediate adverse move.

## Reading against the decision rule that was set in advance

Neither branch fires cleanly:

- it does **not** collapse to zero by 2 seconds, so this is not an outright infrastructure
  closure;
- it does **not** hold to 5–7 seconds, so the guard is not clearly viable on the present feed.

At a 10-second cadence an intent arriving uniformly within the interval carries a mean
staleness near 5 seconds, where **roughly half the separation is retained**. The half-life of
the effect is of the same order as the book cadence itself. That is the least convenient
possible relationship: staleness is neither negligible nor fatal, and G3 will turn on it.

Which is the reason §4 of the G3 protocol was written before the archive completed rather than
after.

## What this does not establish

Even at delta = 0 the pilot's t is 1.92, so **no single row here is individually resolvable**.
The five rows also share the same snapshots and the same guard states — only the outcome window
moves — so they are heavily dependent and the monotonic ordering is not five independent draws.

This is a shape indication on a pilot, not a measurement. It is enough to say the decay is
smooth, substantial and centred near the cadence; it is not enough to quote 0.333 → 0.103 as an
established curve.

## Consequence

G3 §4 stands as written and gains a concrete expectation: the offsets it requires are the right
ones, and the 50-percent offset is where the answer will be decided.

The pilot also sharpens the data request that a failure would produce. A direct L2 feed would
not merely be "faster"; it would move the mean staleness of a real decision from about five
seconds to about zero, which on this curve is roughly a doubling of the retained effect.
