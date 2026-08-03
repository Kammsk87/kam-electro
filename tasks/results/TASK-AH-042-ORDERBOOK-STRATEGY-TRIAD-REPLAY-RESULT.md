# TASK-AH-042 Orderbook Strategy Triad Replay Result

Status: `REJECT` for OB-001 and OB-002; `NO_USEFUL_GUARD` for OB-003.
No paper or live action was created.

## Data And Entry Contract

- Completed AMEL run: `amel-1785215500081`, 23 symbols, 26,570 book snapshots.
- One-time public Bybit backfill: 46 files, 195,661 bars, 1m and 5m, no API errors
  and no intrafile gaps.
- Entry is the open of the first complete 1m bar strictly after `snapshot_ts`.
- Costs are 11 bps round trip plus calculated 200 USD top-10-book impact.
- Bars that touch stop and target in the same minute count as stop first.
- No same-symbol overlap is allowed inside the tested holding horizon.
- Split is frozen chronologically: 55 percent train, 20 percent validation,
  15 percent holdout, 10 percent forward.

## OB-001 Liquidity Vacuum Continuation

The strong same-direction imbalance continuation does not clear cost.

| Segment | N | Net mean | Net median | Win rate |
| --- | ---: | ---: | ---: | ---: |
| Holdout | 108 | -0.1241% | -0.1106% | 9.3% |
| Forward | 72 | -0.0973% | -0.1062% | 18.1% |

Double-cost, remove-best-symbol, and shuffled-sign null also fail. Verdict:
`REJECT`.

## OB-002 Absorption Reversal

The deep opposite-book reversal is negative and concentrated.

| Segment | N | Net mean | Net median | Max symbol share |
| --- | ---: | ---: | ---: | ---: |
| Holdout | 52 | -0.1013% | -0.1312% | 50.8% |
| Forward | 35 | -0.1349% | -0.1484% | 56.5% |

Verdict: `REJECT`.

## OB-003 Balanced-Book Guard

The guard is not useful as a standalone signal. Passing its filter is slightly
less negative than blocking in holdout, but both branches remain negative after
costs and the relation is not promotion evidence.

| Branch | Holdout net mean | Forward net mean |
| --- | ---: | ---: |
| Pass | -0.1045% | -0.1023% |
| Block | -0.1142% | -0.1068% |

Verdict: `NO_USEFUL_GUARD`; do not attach it to a paper strategy.

## Decision

The first seven-day top-10 orderbook snapshot set does not support a directional
continuation, absorption fade, or balanced-book guard after executable costs.
The raw backfill and manifest remain useful research data. A future orderbook
candidate must use a distinct mechanism, such as multi-snapshot replenishment
or cancellation dynamics, rather than threshold tuning of this triad.
