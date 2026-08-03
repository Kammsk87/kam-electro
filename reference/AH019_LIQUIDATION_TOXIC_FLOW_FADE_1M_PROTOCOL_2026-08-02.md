# AH-019 — Liquidation Toxic-Flow Fade 1m, Protocol v0

**Task:** TASK-AH-019-LIQUIDATION-TOXIC-FLOW-FADE-1M-V0
**Date:** 2026-08-02
**Label:** `DISCOVERY_NOT_PROOF`. Research only. No paper, no live, no candidate.

## 0. The measurement this protocol exists to make possible

The programme currently collects order-book snapshots every ~2 seconds. That answers *"is the
book skewed?"* It cannot answer *"who is moving it?"*, and the gap is not a matter of resolution.

A resting level that shrinks between two snapshots may have been **traded through** or
**cancelled**. Those have opposite directional meaning:

- traded through and refilled → the wall is real, the aggressor is being absorbed → likely reversal;
- withdrawn without trading → the wall was never going to fill → likely continuation through it.

**No sequence of book snapshots can separate these two.** The identity that does is:

```
size_next = size_prev - traded_at_price - cancelled + added
=>  net_passive_change (added - cancelled) = size_next - size_prev + traded_at_price
```

`traded_at_price` exists only in the trade tape **with aggressor side**. That single field is the
difference between a skew observation and a directional read, which is why the data gate treats it
as binding and why candle direction, close-to-close return, later price moves, OHLCV volume splits
and tick-rule inference are all refused as substitutes.

## 1. The five layers, and where the programme actually stands

| # | Layer | Status | Source |
|---|---|---|---|
| 1 | Bid/ask dynamics over time | **collected** (~2s snapshots) | `EDGE.DATA.OB`, `EDGE.AMEL.ORDERBOOK` |
| 2 | Aggressive trades (taker buy/sell, CVD) | **unverified** — a tick recorder exists but the aggressor field is unconfirmed | `EDGE.DATA.TICKS` |
| 3 | Absorption and fake walls | **blocked on layer 2** — arithmetically undecidable without it | derived |
| 4 | Leverage and liquidations (OI, funding, liquidation tape) | **too coarse** — 5m OI granularity hides the cascade | `GAP.OI_LIQ.FINE_GRAIN`, `LEGACY.LIQUIDATIONS_DB` |
| 5 | Market context (BTC/ETH, news, volatility regime) | **partial** — regime yes, NEWS lane is a declared gap | `EDGE.AMEL.REGIME`, `GAP.NEWS.TAGGER_V2` |

Layer 3 is not a separate collection problem. It falls out of layers 1 and 2 for free, and is
impossible without layer 2. That makes the aggressor-classified tape the single highest-leverage
missing field in the whole stack.

## 2. Level classification

`classifyLevel(prevSize, nextSize, traded)` returns one of six declared states:

| State | Condition | Directional reading |
|---|---|---|
| `ABSORPTION` | traded > 0 and net passive change ≥ 0.5 × traded | Wall held and refilled → aggressor absorbed → reversal candidate |
| `CONSUMPTION` | traded > 0 and net passive change ≈ 0 | Eaten, not refilled → neutral, liquidity simply removed |
| `PULL_UNDER_PRESSURE` | traded > 0 and net passive change ≤ −0.5 × traded | Eaten **and** withdrawn → strongest continuation signal |
| `PULL` | traded ≈ 0 and size fell | Cancelled without trading → fake wall |
| `REPLENISH` | traded ≈ 0 and size grew | Passive building |
| `IDLE` | no trading, no change | Nothing happened |

A bid is consumed by aggressive **sells**; an ask by aggressive **buys**. The shipped tests assert
the identity holds for every case, and that the same observed book delta (100 → 0) classifies as
`PULL` with no tape volume and `CONSUMPTION` with full tape volume — the whole point.

## 3. Composite directional state

`directionalState(flow, bidDelta, askDelta)` turns the question from *"is the book skewed?"* into
*"are takers really eating one side, and is the other side being withdrawn rather than held?"*

- taker buy ratio > 0.5 → buyers are the aggressor, the **ask** is the consumed side;
- consumed side mostly `ABSORPTION` → `BUYERS_ABSORBED`, `continuation: false`;
- consumed side mostly `PULL`/`PULL_UNDER_PRESSURE` and the resting side is not thinning →
  `BUYERS_BREAKING_THROUGH`, `continuation: true`;
- anything else, or no tape → `NO_SIGNAL`. The default is always `NO_SIGNAL`; it never guesses.

The seller cases are exact mirrors.

## 4. Mandatory data gate

Required decision-time inputs. Missing any one is `DATA_INADEQUATE`, with every missing field named:

```
trades        ts, symbol, price, size, side   (side = explicit taker aggressor, BUY or SELL)
book          ts, symbol, bids[[price,size]], asks[[price,size]]
oi            ts, symbol, open_interest
liquidations  ts, symbol, side (LONG/SHORT), notional
```

The aggressor column is additionally validated, not merely presence-checked. It is refused when it
is not a `BUY`/`SELL` label, when every trade carries the same side (which cannot be a real tape), or
when `side_source` names any refused substitute.

All fields are aligned to a common UTC one-minute bucket. Maximum permitted staleness is declared per
source before outcomes are read: book 4s, trades 60s, OI 300s, liquidations 60s. Incomplete buckets
are excluded and counted.

## 5. Frozen event definition

Quantiles are fitted on the **train segment only**, per symbol. Splits are chronological
55 / 20 / 15 / 10, with a 15-minute purge and a 60-minute embargo.

Long fade at completed minute `t`, all four required together:

1. signed aggressive sell volume ≤ train-only 5th percentile;
2. 5-minute OI change ≤ train-only 10th percentile;
3. long-liquidation notional ≥ train-only 95th percentile;
4. bid depth within 10 bps ≥ 150% of the minute's minimum, and best bid recovered to within 5 bps.

The short fade is the exact mirror. A missing OI observation blocks detection rather than defaulting
to zero. Entry is `NEXT_MINUTE_BOOK_REFERENCE_ONLY` with a depth-walk executable VWAP, never a candle
close. Primary exit is 5 completed minutes; predeclared neighbours are 3 and 15 minutes.

## 6. Economics and validation

- Ideal reference outcome is reported separately from executable VWAP at $7 / $200 / $1k. A tier the
  book cannot absorb is `UNSUPPORTED`, never an assumed fill.
- Costs 11 bps roundtrip, 22 bps double-cost stress.
- Matched null: ≥1,000 same-symbol, same-time-of-day (±30 min), same-direction, liquidity-matched
  non-event minutes; fixed seed; **two-sided** p-value. An empty matched pool yields `p = null`,
  never a pass.
- Reported per OOS split and combined: N, days, symbols, gross/net mean and median, win rate, p5/p95,
  cost tiers, null, remove-best symbol / day, concentration.
- Drawdown is accumulated in bucket order, never input order.

## 7. Overlap gate

The event set must be shown distinct from `AMEL_EVENT`, `WICK_RECLAIM`, `FAILED_BREAKOUT`,
`NEWS_DELAYED_REACTION`, `FUNDING_EXTREME`, `WALLET_FLOW` and `LIQUIDITY_GUARD`.

Per-trade timestamp ledgers for those families were not retained, so exact overlap is
`UNAVAILABLE` and **blocking**. The verdict ladder places the overlap gate before any statistic is
credited:

```
DATA_INADEQUATE → DUPLICATE_OR_OVERLAP → OOS_FAIL_REJECT_FAMILY
                → ROBUSTNESS_FAIL_DEPRIORITIZE → CANDIDATE_PASSPORT_DRAFT
```

`CANDIDATE_PASSPORT_DRAFT` additionally requires ≥100 events across ≥5 symbols and ≥30 days in
**each** of holdout and forward.

## 8. The honest economic constraint

At an 11 bps roundtrip cost, a 5-minute fade must clear roughly 11 bps net to exist at all. Order-flow
imbalance signals at this horizon typically predict far less than that, so the realistic outcomes are:

1. the signal fails at ideal fill and the family closes (per LESSON-021, no execution work rescues it);
2. it survives only as a **guard** — a no-trade filter on an existing sleeve rather than an entry;
3. it survives only at horizons longer than the impulse.

This is stated before measurement so that a negative result is a completed test rather than a
disappointment, and so no one is tempted to relax the cost model to rescue it.

## 9. Usage

```bash
# Gate-only: names every missing input, writes nothing without --out
node scripts/analysis/ah019_liquidation_toxic_flow_fade_1m.mjs

node scripts/analysis/ah019_liquidation_toxic_flow_fade_1m.mjs \
  --trades <aggressor-classified tape> --book <L2 snapshots> \
  --oi <open interest> --liquidations <liquidation tape> \
  --out data/ah019_liquidation_toxic_flow_fade_1m_2026-08-02
```

## 10. What this protocol cannot deliver

1. It cannot create the aggressor field. If the tick recorder does not persist taker side, layers 2
   and 3 stay impossible regardless of how long layer 1 collects.
2. It cannot fix OI granularity. At 5 minutes the cascade is inside the bucket; condition 2 of the
   event definition is measuring an average, not an event.
3. It cannot clear the overlap gate without retained per-trade ledgers.
4. It cannot promote anything. A passing member reaches `CANDIDATE_PASSPORT_DRAFT`, a research state.
