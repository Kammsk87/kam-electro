# Exit-route differential — BR calendar spread

Date: 2026-08-06. Belongs to `TASK-MX-002` step 4. Computed while the task is
`BLOCKED_ON_OPERATOR`, because this measurement needs neither of the two blocked
documents: it is fully determined by ISS contract params already retained in
`data/market/moex_iss/params/`.

## Why this matters here

`TASK-MX-001` found the front/second spread dispersion concentrated **4.1x in
the near leg's final week** (median 517 ₽ at 0–5 days to expiry against 125 ₽ at
16+ days). A contour that harvests that dispersion is holding the near leg into,
or close to, its expiry. At that point the exit route stops being a detail: the
near leg can be traded out, or it can be allowed to settle.

MOEX charges these differently.

## Measured fees, ISS params

| security | buysellfee | exercisefee | negotiatedfee |
|---|---:|---:|---:|
| BRQ6 | 8.99 | 3.00 | 2.99 |
| BRU6 | 8.87 | 2.95 | 2.96 |
| BRV6 | 8.75 | 2.92 | 2.92 |
| GDU6 | 41.79 | 13.93 | 13.93 |
| GLDRUBF | 1.34 | **10.09** | 0.45 |

Settlement on a BR contract costs roughly **a third** of trading out of it.

Note the outlier: GLDRUBF inverts the relationship — its exercise fee is 7.5x its
trading fee. Any future GLDRUBF work must not carry over the BR intuition.

## Two-leg round trip, fee component

Conservative rate (8.99 ₽), both legs entered by trading:

| route | fee | vs TRADE_OUT |
|---|---:|---:|
| `TRADE_OUT` — both legs traded out | 35.96 ₽ | — |
| `EXPIRY_SETTLE` — near leg settles, far leg traded out | 29.92 ₽ | −6.04 ₽ (−17% of fees) |

## Effect on the Stage 0 all-in headroom

Funding and the one-tick execution assumption carried unchanged from
[stage0_br_calendar_feasibility_20260806.md](stage0_br_calendar_feasibility_20260806.md).
Broker commission still absent from both columns.

| horizon | median move | TRADE_OUT | headroom | EXPIRY_SETTLE | headroom |
|---|---:|---:|---:|---:|---:|
| 1d | 78 ₽ | 72.6 ₽ | +6.9% | 66.6 ₽ | **+14.6%** |
| 3d | 133 ₽ | 113.6 ₽ | +14.6% | 107.6 ₽ | +19.1% |
| 5d | 157 ₽ | 155.6 ₽ | +0.9% | 149.6 ₽ | **+4.7%** |
| 10d | 235 ₽ | 259.6 ₽ | −10.5% | 253.6 ₽ | −7.9% |

The route roughly doubles the 1d headroom and lifts 5d off the breakeven line,
but it does not rescue 10d. It is a real improvement and a small one: 6 ₽ against
a funding term that reaches 208 ₽.

## What this does not authorise

The saving is not free, and none of the following is measured here:

- **Settlement price risk.** A cash-settled leg fixes at the final settlement
  price, not at a price the position chose. The Stage 0 dispersion was measured
  on last-trade closes, so the settlement fixing is an unmodelled basis.
- **Loss of exit timing.** `EXPIRY_SETTLE` cannot be exercised early or late; the
  position surrenders the choice of when to close, which is exactly the choice a
  mean-reverting spread relies on.
- **Residual outright exposure.** Once the near leg settles the position is no
  longer market-neutral — what remains is an outright far leg until it too is
  closed. The far-leg exit fee is counted above; its price risk is not.
- **Final-week liquidity.** The near leg's final week is when roll flow is
  heaviest. The one-tick execution assumption is least defensible precisely
  there.

`EXPIRY_SETTLE` is therefore not the default in any cost call and must be
claimed explicitly, in the same way the scalper rate must be. It changes the
risk profile of the contour, not only its fee.

## Status

This does not unblock `TASK-MX-002`. The verdict still turns on the broker
tariff and the inter-contract margin discount, neither of which is present. It
narrows one input that was previously unmeasured, using data already held.
