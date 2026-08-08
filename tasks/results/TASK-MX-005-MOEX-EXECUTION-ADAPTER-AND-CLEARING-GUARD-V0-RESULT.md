# TASK-MX-005 Result — MOEX Execution Adapter And Clearing Guard

Date: 2026-08-08
Deliverables: `src/moex_futures_bot/execution/clearing_schedule.py`,
`src/moex_futures_bot/execution/moex_execution_adapter.py`,
`tools/test_execution_adapter.py` — 22/22 passing

## Lifecycle footer

- Infrastructure. Creates no candidate, tests no rule, consumes no multiplicity.
- Gate 1 of `ORDERBOOK_EXECUTION_PLAN.md` (venue calibration) is open; **Gate 2
  (candidate execution replay) remains blocked** and nothing here approaches it.
- `check_paper_gate.py` returns `blocked`.

## No L2 engine was built, and that is the result

The task asked for a «Mock L2 Fill Engine» on the Track A quote stream. It cannot
exist. Established by `mx003_phase0_quote_source_probe_20260807.md`: MOEX ISS
returns `BIDDEPTH`, `OFFERDEPTH`, `NUMBIDS` and `NUMOFFERS` as null on every call,
there is no ISS L2 endpoint for FORTS, the feed is delayed 900 seconds, and the
cohort has zero valid days. There are no levels below the touch to walk.

What was built is `TopOfBookFillApproximation`, which answers one question:
would a marketable order have crossed at the quoted price. Every verdict carries
`depth_basis="UNSUPPORTED"`, `delay_seconds=900`, and the phrase «NOT an L2
replay» in its citation string. Any size above one lot returns `UNSUPPORTED`
rather than an assumed fill, because one lot is the edge of what the data
supports — not a risk limit.

The naming is the deliverable as much as the code. A class called `L2FillEngine`
would, in six months, be credited with evidence it never had.

## Three properties the tests pin

**A spread is emitted whole or not at all.** Accepting the fillable leg would
leave an outright directional position wearing a spread's name. `submit` refuses
the package when either leg is unmarketable and returns `LEG_RISK` with both leg
citations attached.

**Legs are ordered by the venue's expiry, never by secid.** BRF7 sorts before
BRZ6 as a string and after it by expiry. A deliberately misordered pair raises
`LEG_ORDER_WRONG`. This class of defect has already occurred once in this
project, in the Stage 0 script.

**The entry spread ceiling has no default.** The caller passes the tick threshold
from the frozen `TASK-MX-002` breakeven table for the horizon it trades — 1.90 at
1d, 4.08 at 3d, 4.29 at 5d, 5.94 at 10d. A default would be a parameter selected
without a preregistration. A test drives the point home with the second leg
quoted at 3 ticks, exactly as first observed: blocked at the 1d threshold,
accepted at the 3d one.

## The clearing guard

`SCHEDULE_2026_08`, id `MOEX.FORTS.SCHEDULE.2026-08`, with `effective_from`.
Replaced by a new dated constant on any venue change, never edited, so a run made
under the old schedule stays reproducible.

The block lead and the cancel lead are **different numbers and must not be
collapsed**: entries stop 5 minutes before a clearing window, resting limit
orders are pulled at 2. Boundaries are half-open, so 14:05 is already the main
session again. Every verdict carries a reason; there is no bare boolean.

## Safety

Simulation only. No broker client, no account, position, balance or execution
endpoint, no credential. A test reads the module's own source and asserts none of
those paths appear in it.

## What this cannot do

- It does not unlock Stage 2. Execution replay needs recorded books at a frozen
  rule's decision times; this has neither books nor, at the time of writing, a
  surviving rule.
- It measures no spread. It consumes one.
- A fill verdict from a 900-second-delayed quote is not a claim that the price
  was visible at a decision time, and the field travels with every verdict so
  that nobody can later forget it.
