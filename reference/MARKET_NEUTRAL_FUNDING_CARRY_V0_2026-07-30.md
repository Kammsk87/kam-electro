# AH-010 — Market-Neutral Funding Carry, Stage 0 Protocol

**Task:** TASK-AH-010-MARKET-NEUTRAL-FUNDING-CARRY-V0
**Date:** 2026-08-03 (contract dated 2026-07-30)
**Label:** `DISCOVERY_NOT_PROOF`. Research only. **Closed at Stage 0.**

## 0. The gate order is the finding

```
GATE 1  HEDGEABILITY   an asset with no tradeable spot cannot carry, at any premium
GATE 2  ECONOMICS      does funding net of basis drift cover the two-leg cost floor
GATE 3  CONCENTRATION  is the result carried by one asset
GATE 4  INDEPENDENCE   how many of the claimed observations actually are
```

Hedgeability comes first because **premium and hedgeability are not independent**. Where the
premium is large the hedge is usually absent, and that is frequently *why* the premium is large:
nobody can arbitrage it away. Measuring the premium before checking the hedge produces an
attractive number about a trade that cannot be put on.

This ordering was learned the hard way during this task. The first measurement found +7.06 bps
net at a 20% annualised threshold and looked like the first Stage 0 pass of the programme. It was
carried entirely by CASHCAT, an asset with no spot market.

## 1. Frozen elements

| Element | Value |
|---|---|
| Structure | short perp, long spot |
| Thresholds | 10%, 20%, 50% annualised, from the documented 10–12% carry floor |
| Holds | 24h, 72h (primary), 168h |
| Cost floor | 22 bps, two legs, each a round trip |
| Double-cost stress | 44 bps |
| Concentration cap | 25%, the programme standard |
| Splits | train 55%, sealed remainder never read |

## 2. Why the oracle is not a hedge leg

`hl_cascade` carries `oraclePx`, the Hyperliquid index. It is exactly right for *measuring* basis
and useless as a *tradeable* leg: an index cannot be bought. The harness declares
`oracle_is_not_tradeable: true` and derives the hedgeable universe from a source of real spot
quotes, not from the index.

## 3. Guarantees the harness enforces

- An unhedgeable asset is removed from the universe, not flagged. A shipped test gives an
  unhedgeable asset enormous funding and asserts it cannot change the verdict.
- Funding accrues hour by hour and is dropped, not extrapolated, if any hour inside the hold is
  missing.
- Basis P&L is minus the change in basis, so a widening basis costs the short perp. Asserted by test.
- Concentration share is reported even when it exceeds 100%, which happens when the rest of the
  book is net negative. That is the finding, not an error to clamp away.
- Overlap is computed explicitly. A 168-hour hold entered hourly over 301 train hours yields one
  non-overlapping observation per asset. The naive t and the overlap-adjusted t are printed
  together so the first cannot be quoted alone.

## 4. Result

Closed at Stage 0. See the task result for the numbers.

Of 232 Hyperliquid assets, 16 have a tradeable spot leg. On those, no frozen threshold and hold
clears the 22 bps floor with a positive median and concentration inside the cap. Above 20%
annualised there are 29 events in 12.5 days of train; above 50% there are five.

## 5. What this protocol cannot conclude

1. That funding carry is impossible generally. It concludes that in this 232-asset universe the
   pairing of a harvestable premium with a hedgeable asset does not occur often enough to trade.
2. That a different spot venue would not change the answer. The hedgeable set here comes from one
   venue's spot listings; a wider set of venues would widen the universe and should be checked
   before the family is considered permanently closed.
3. Anything about unhedged funding shorts. That is a directional position, outside this contract.
