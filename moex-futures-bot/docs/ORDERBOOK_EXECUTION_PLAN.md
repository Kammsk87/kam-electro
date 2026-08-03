# Orderbook And Execution Research Gate

Orderbook collection is useful only after a strategy has a frozen
`paper_candidate` definition. Current status: `blocked`.

## Gate

Before collecting orderbook snapshots for execution modeling:

- candidate definition is frozen in a candidate-review report;
- latest holdout was not used during parameter search;
- candidate survives return-stitched or back-adjusted data;
- candidate survives pessimistic cost assumptions;
- roll-window exclusion does not remove the edge;
- Finam vs MOEX ISS close/session convention is understood;
- user explicitly authorizes paper-mode research.

## Planned Snapshot Scope

Initial target after gate opens:

- symbol: candidate symbol only;
- source: Finam read-only orderbook endpoint;
- depth: top 5 or top 10;
- frequency: no faster than every 5 seconds;
- duration: start with one trading day, then expand to 14 days;
- storage: local laptop only under `data/market/finam/orderbook/`.

## Metrics

Execution review should estimate:

- bid/ask spread in ticks and bps;
- top-of-book depth;
- simulated market-order slippage for one contract;
- no-trade windows around roll dates and low-liquidity days;
- whether the backtest cost reserve is pessimistic enough.

No live order placement belongs in this phase.
