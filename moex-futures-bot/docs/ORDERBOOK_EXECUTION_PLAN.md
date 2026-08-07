# Orderbook And Execution Research Gate

Amended 2026-08-07 under `TASK-MX-003`, resolution variant (A), on explicit
operator authorisation.

## Why this document was amended

The previous version said orderbook collection «is useful only after a strategy
has a frozen `paper_candidate` definition», and listed among its preconditions
that the candidate «survives pessimistic cost assumptions».

Those two clauses could not both be satisfied. Pessimism has no definition on
this venue until the bid-ask spread is measured, and the spread could not be
measured while collection waited on a candidate. The gate made the candidate a
prerequisite for the data that decides whether a candidate is possible.

The error was conflating two different activities behind one gate. They are now
separated.

## Two gates, not one

### Gate 1 — Venue calibration (candidate-independent)

Measuring what the venue's microstructure *is*: bid-ask spread, top-of-book
depth, spread behaviour across sessions and clearing pauses, and the slippage a
given size tier would face. This is a **property of the instrument and the
venue**, not of any hypothesis. It belongs to the venue adapter layer and feeds
`cost_model.py`.

**Status: open**, subject to the safety boundary below.

Requires:

- read-only market data access only;
- no order placement and no order simulation against a live account;
- a pre-registered stopping rule, so collection is not extended until the number
  looks agreeable;
- the resulting figures recorded in the fee schedule with their basis, never as
  bare constants.

Does **not** require a candidate. Tying it to one would force the calibration to
be redone for every new signal on the same instrument, which is both wasteful and
a route to per-candidate cost assumptions — precisely the defect the cost-model
contract exists to prevent.

### Gate 2 — Candidate execution replay (Stage 2)

Replaying a **specific frozen rule** against recorded books at its own decision
times, at declared size tiers, with queue position, latency band, partial fills
and no-fills.

**Status: blocked.** Preconditions unchanged from the original document:

- candidate definition is frozen in a candidate-review report;
- latest holdout was not used during parameter search;
- candidate survives return-stitched or back-adjusted data;
- candidate survives pessimistic cost assumptions — now evaluable, because
  Gate 1 defines what pessimistic means;
- roll-window exclusion does not remove the edge;
- Finam vs MOEX ISS close/session convention is understood;
- user explicitly authorizes paper-mode research.

Gate 1 opening does not open Gate 2, and no amount of collected book data
substitutes for a frozen rule.

## Snapshot scope (Gate 1)

- symbols: BR front and second contracts;
- source: Finam read-only orderbook endpoint, or MOEX ISS `marketdata`
  snapshots if Finam does not serve these instruments;
- depth: top 5 or top 10;
- frequency: no faster than one snapshot per 5 seconds per contract;
- storage: local laptop only, append-only, under
  `data/market/finam/orderbook/`;
- run manually, stopped manually. No systemd unit, no autostart.

## Stopping rule (Gate 1)

Frozen in `tasks/ready/TASK-MX-003-MOEX-QUOTE-AND-SPREAD-MEASUREMENT-V0.md`
before collection began: at least 15 distinct trading days, at least 3 distinct
front-contract expiries, both sessions on at least 10 days, clearing pauses
recorded rather than skipped. No verdict on a partial cohort.

## Metrics

- bid/ask spread in ticks and in bps, median, p75, p90, per 60-minute slot;
- top-of-book depth;
- simulated market-order slippage for one contract and for a size tier the book
  actually supports — a tier it cannot absorb is `UNSUPPORTED`, never an assumed
  fill;
- spread behaviour in the clearing pauses, the evening session, and the front
  leg's final week;
- no-trade windows around roll dates and low-liquidity days;
- whether the cost reserve in the fee schedule is pessimistic enough.

## Unchanged

No live order placement belongs in any phase of this document. Credentials are
obtained through the existing client mechanism and are never logged, printed or
written to any artefact.
