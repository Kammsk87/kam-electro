# TASK-AH-043 Orderbook And Indicator Map Result

Verdict: `DESCRIPTIVE_ONLY_NOT_A_PAPER_DECISION`.

## Scope

The map uses 26,093 valid orderbook observations from completed AMEL run
`amel-1785215500081`. Indicators use only completed one-minute bars before
the snapshot. Entry is the next complete one-minute open and the target is the
15-minute directional return after 11 bps round-trip taker cost plus recorded
top-10 book impact.

## Factor Stability

No factor is stable across chronological partitions. For example, EMA gap,
ATR percent, and prior five-minute return have material correlation in holdout
(`0.2377`, `0.2876`, `0.2277`) but nearly vanish or reverse in forward
(`-0.0167`, `0.1049`, `0.0075`). Book imbalance itself is weak and unstable
(`-0.0125`, `-0.0200`, `0.0607`, `0.0327` in train through forward).

This is insufficient evidence for a strategy. Selecting thresholds from the
holdout-only values would be data mining.

## Fixed Candidate Screens

All three preregistered combinations are net-negative:

| Candidate | Holdout net mean | Forward net mean | Decision |
| --- | ---: | ---: | --- |
| Trend-aligned imbalance | -0.0404% | -0.0728% | Reject |
| Pullback-aligned imbalance | -0.0719% | -0.0192% | Reject |
| Volume-confirmed imbalance | -0.0131% | -0.0347% | Reject |

## Next Mechanism

Do not tune this static-snapshot plus indicator family. The active 2-second
orderbook dynamics collector is the next evidence source. A new candidate may
only test time-series mechanics that static snapshots cannot observe: liquidity
withdrawal, replenishment, persistence, and failure of displayed walls.
