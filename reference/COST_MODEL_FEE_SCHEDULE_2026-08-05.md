# Fee schedule and shared cost model — 2026-08-05

Closes `GAP.COST.FEE_SCHEDULE` and resolves `DC.COST.RESEARCH_FLOOR_IS_FEE_ONLY`.

Read-only. No live, paper, service, collector, config, coordinator, approval, KILL, secret,
order, account or position path. The fee figures are derived from an already-exported ledger
held locally; no account endpoint was contacted.

## Why a measurement rather than a tariff page

A published rate states what *should* have been charged. The schedule below states what *was*.
Where the two disagree the measurement wins, because the measurement is what a backtest has to
clear.

The source is the operator's own closed-position ledger: 1,238 positions, of which 1,220 are
non-liquidated and carry both a fee and an entry notional.

## What was measured

| | |
|---|---:|
| total fees | **$444.30** |
| total notional | $486,643 |
| **notional-weighted round trip** | **9.13 bps** |
| per-position p05 / p25 | 7.21 / 8.02 |
| **per-position median** | **10.45** |
| per-position p75 / p95 | **13.63** / 20.00 |
| mean | 11.64 |

The distribution is not smooth. It clusters:

| centre | n | median hold |
|---:|---:|---:|
| 7.26 bps | 204 | 8.8 min |
| 10.34 | 110 | 4.2 min |
| **13.62** | **407** | 1.3 min |
| 19.98 | 86 | 0.0 min |

Monthly medians move from 13.63 in 2025-11 to 7.74 in 2026-01 and back to 13.60 in 2026-07.

## What could not be determined, and is recorded as such

**Per-leg taker and maker rates cannot be separated from this export.** The closed-PnL record
carries one combined fee and no per-leg order type, so the four clusters are consistent with
different order-type mixes and possibly different instrument classes, and the mapping is not
recoverable. Both fields are `null` in the schedule rather than guessed.

Two further caveats travel with the entry: rates are expressed against **entry** notional while
fees are charged on both legs, so a position whose price moved carries an exit fee on a
different notional; and the monthly drift is a change in behaviour, tariff or instrument mix
that the export cannot distinguish.

## The correction this produces

The audited 16 bps floor is confirmed in composition — **10.45 fee + 5.56 execution**, where the
execution component is the fill forensics figure of 4.46 bps taker slippage plus 1.10 bps
spread over 29 reconciled round trips.

But one thing the audit assumed is now known to be wrong in a way that matters:

> **The superseded 11 bps sat at the median realised fee, not above it.**

It was never conservative even as a fee-only figure. **A quarter of positions paid more than
13.6 bps in fees alone** — more than the entire old floor, before any execution cost.

And 16 bps itself is central rather than conservative. Adding the measured execution component
to the realised fee distribution:

| | all-in bps |
|---|---:|
| median | **16.01** |
| p75 | 19.19 |
| p95 | 25.56 |

A task that wants a conservative floor should say so and take **19.19**, and the module makes
that choice explicit instead of leaving it in a constant nobody re-derives.

## The module

`scripts/analysis/cost_model.mjs`. Three properties are deliberate.

**A floor may not be a bare number.** `requireFloor` returns the value together with its
schedule entry, its fee and execution components and their sources. There is no accessor for
the number alone. The constant `11` was a bare number in six engines and wrong for months.

**`asOf` is required.** Defaulting it to the current date would make every call depend on when
it ran, and this module is used to judge historical measurements. A date before the first entry
throws rather than falling back.

**Entries are appended, never rewritten.** A result computed under an old schedule stays
reproducible by asking for its own date. The review criterion says replace, do not amend.

**The six existing engines are not retrofitted.** Their frozen constants stay as published so
their results remain reproducible; this binds work from 2026-08-05 onward.

## Second venue — the other half of the same question

Checked at the same time, because the standing question was which purchasable dataset would
actually reopen something. Two of the three `DATA_BLOCKED` routes turn out not to need a
purchase.

**Clause (a) of `CD.CROSS_EXCHANGE_LEADLAG` is satisfiable for free.** Binance publishes daily
aggregated-trade archives openly: `BTCUSDT-aggTrades-2026-07-15.zip` returns **HTTP 200 at
13.6 MB**, and the live endpoint carries `T` (millisecond timestamp), `p`, `q` and `m`
(aggressor side). That is a second millisecond-stamped venue stream at no cost.

**Clause (b) is not, and it remains the binding one.** The criterion demands a *measured clock
offset* between the two streams, published with its dispersion. Binance timestamps are
Binance's clock and Bybit's are Bybit's; cross-correlating the two conflates the real lead-lag
with the offset, so the measurement cannot separate them by itself.

The non-circular route is to measure each venue's clock against a common reference — both expose
a server time, and both were observed responding during this check — and to publish the offset
with its stability before any lag is claimed. That is a small task in its own right and it must
come first.

The order is therefore: clock study, then the lead-lag measurement, then the pre-declared spread
expectation above 16 bps. Not a purchase.

**A note on the original inference.** The reasoning was that an exchange sells order-book data
for real money, therefore it is valuable, therefore other things it sells are also worth
analysing. The flaw is that the price is set for a buyer operating at a fraction of a basis
point in costs. At 16 bps we are not that buyer, and information that resolves a 2 bps edge is
worthless to us at any price. The item on the list that changed the most for this programme cost
nothing at all.
