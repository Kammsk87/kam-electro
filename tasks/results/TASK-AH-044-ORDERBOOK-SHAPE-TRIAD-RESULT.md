# TASK-AH-044 Orderbook Shape Triad Result

Verdict: `REJECT_STATIC_BOOK_SHAPE_FAMILY`.

This fixed replay tests book shape rather than the previously tested aggregate
imbalance or technical indicators. It uses the completed AMEL seven-day log,
snapshots taken within five seconds of event detection, next-minute entry,
15-minute exit, 11 bps round-trip cost, and top-10 book impact.

| Mechanism | Holdout net mean | Forward net mean | Finding |
| --- | ---: | ---: | --- |
| Microprice continuation | -0.1100% | -0.1546% | Reject |
| Opposing best-level wall fade | -0.8830% (N=2) | -0.5506% (N=2) | Sparse and reject |
| Near/far book convexity continuation | -0.0286% | -0.0589% | Reject |

No parameter was selected after examining holdout or forward performance. The
slightly less-negative convexity result is not a candidate: its median remains
negative in both segments and it loses after cost.

The completed static top-10 snapshot set has now tested aggregate imbalance,
technical-indicator combinations, and local book shape. Further threshold
tuning is prohibited. The active dynamics collector is needed for a distinct
time-series mechanism: withdrawal, replenishment, persistence, and fake walls.
