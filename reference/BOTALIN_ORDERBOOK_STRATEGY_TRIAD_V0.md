# Botalin Orderbook Strategy Triad v0

Status: `RESEARCH_CANDIDATES_ONLY`. This document defines three distinct
orderbook mechanisms from AMEL run `amel-1785215500081`. It is not a
backtest, a paper configuration, or a trading instruction.

## Data Contract

Source snapshot: 26,570 event-time orderbook observations across 23 symbols,
2026-07-28 through 2026-08-02. Each observation has top-10 bids and asks,
spread, executable depth, and an AMEL event context.

Derived values:

- `imbalance_10 = (bid_notional_10 - ask_notional_10) / (bid_notional_10 + ask_notional_10)`
- strong imbalance: `abs(imbalance_10) >= 0.22` (empirical 90th percentile)
- thin depth: `depth_usd_10bps < 68,492` (empirical 25th percentile)
- deep depth: `depth_usd_10bps >= 333,664` (empirical 75th percentile)
- wide spread: `spread_bps > 3.59` (empirical 90th percentile)

The stored AMEL outcomes begin at the candle event timestamp while each
orderbook snapshot is later. They are therefore forbidden for evaluating this
triad. A future replay must use a bar or trade strictly after `snapshot_ts`.

## OB-001: Liquidity Vacuum Continuation

Mechanism: a directional AMEL impulse coincides with little opposing displayed
liquidity. The next short move may continue while the depleted side refills.

- Universe: only BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, DOGEUSDT, AVAXUSDT,
  LINKUSDT, LTCUSDT, ADAUSDT, ARBUSDT, NEARUSDT, SUIUSDT, ONDOUSDT, WLDUSDT,
  HYPEUSDT, ENAUSDT, AAVEUSDT, BNBUSDT.
- Setup: `MOMENTUM_IMPULSE_1M`, `VOLUME_BURST_1M`, or
  `VOL_EXPANSION_5M`; event direction agrees with the sign of
  `imbalance_10`; `abs(imbalance_10) >= 0.22`; non-wide spread.
- Entry: first executable quote after `snapshot_ts`, in event direction.
- Exit hypothesis: time exit at 5 minutes; protective stop at 0.35 percent;
  target at 0.50 percent. Use the first touched barrier, not the best price.
- Rejection conditions: snapshot older than 1 second, failed executable
  $200 depth, a second signal for the same symbol within 15 minutes, or wide
  spread.
- Payer thesis: aggressive flow keeps consuming the sparse opposing book.

## OB-002: Absorption Reversal

Mechanism: an impulse reaches a very deep opposite-side book but cannot move
through it. The displayed liquidity may absorb the final aggressive flow and
produce a short reversal.

- Universe: the same liquid 18-symbol universe as OB-001.
- Setup: `FAILED_BREAKOUT_1M` or `WICK_REJECTION_5M`; event direction is
  opposite to the sign of `imbalance_10`; `abs(imbalance_10) >= 0.22`; deep
  depth; non-wide spread.
- Entry: first executable quote after `snapshot_ts`, opposite to event
  direction.
- Exit hypothesis: time exit at 10 minutes; protective stop at 0.40 percent;
  target at 0.45 percent. Use the first touched barrier.
- Rejection conditions: a cascade event, BTC and ETH both move with the
  original impulse, snapshot age over 1 second, or a new low/high through the
  event bar after entry.
- Payer thesis: trapped late entrants close as the absorbing limit side holds.
- Overlap rule: this is distinct only when the orderbook absorption condition
  is present. Otherwise it belongs to previously rejected price-only fades.

## OB-003: Balanced Book No-Trade Guard

Mechanism: when the book is balanced, there is no immediate liquidity reason
to prefer either direction. It is deliberately a selective guard, not a
directional alpha claim.

- Universe: all 23 AMEL symbols with an executable $200 snapshot.
- Setup: any 1-minute or 5-minute AMEL event with
  `abs(imbalance_10) < 0.066` (empirical 25th percentile) or wide spread.
- Action: reject the underlying directional event for a 15-minute cooldown.
- Evaluation: compare the net outcome of excluded events with the same
  families that pass the guard. Costs, symbol concentration, day split, and
  a shuffled-sign null are required.
- Payer thesis: none. This candidate reduces adverse selection rather than
  predicting price direction.

## Mandatory Evaluation Contract

Before any status beyond `RESEARCH_CANDIDATES_ONLY`, each candidate needs:

1. Historical 1-minute bars or trades covering every `snapshot_ts` plus the
   largest exit horizon, with entry after the snapshot.
2. Frozen chronological split: first 55 percent train, next 20 percent
   validation, next 15 percent holdout, final 10 percent forward.
3. Net results after 11 bps taker cost per round trip plus recorded orderbook
   slippage, first-touch stops/targets, and no overlapping positions per
   symbol.
4. OOS, holdout, forward, double-cost, shuffled-sign null, remove-best-symbol,
   and concentration checks.
5. A verdict limited to `PREREG_BACKTEST_CANDIDATE`, `NEEDS_MORE_LOGGING`,
   `REJECT`, `DATA_BAD`, or `DUPLICATE_OR_OVERLAP`.

No candidate may enter paper or live trading from this document.
