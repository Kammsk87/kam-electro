# TASK-MX-005 - MOEX Execution Adapter And Clearing Guard v0

## Lifecycle

- Stage: infrastructure. Creates no candidate, tests no rule.
- **Status: PARTIALLY BLOCKED.** Two of the three components can be built now;
  the fill engine cannot be built as specified. See below.

## The fill engine cannot be an L2 engine, and this must be settled first

The specification asks for a «Mock L2 Fill Engine» built on the Track A quote
stream. That stream cannot support one, as a matter of fact rather than
preference. Established by
`data/reports/mx003_phase0_quote_source_probe_20260807.md`:

- **MOEX ISS returns no depth at all.** `BIDDEPTH`, `OFFERDEPTH`, `BIDDEPTHT`,
  `OFFERDEPTHT`, `NUMBIDS`, `NUMOFFERS` are null on every call. There are no
  levels below the top of book, so there is nothing to walk.
- **There is no ISS L2 endpoint for FORTS.** The URL returns a non-JSON
  response.
- **The feed is delayed 900 seconds.** A fill engine driven by it cannot claim
  any quote was visible at a decision time.
- **The cohort has zero valid days.** 2026-08-06 is a start-up fragment and
  2026-08-07 is `INVALID_DAY_INCOMPLETE_COVERAGE`; the register is
  `data/market/moex_iss/quotes/COHORT_VALIDITY.json`.

What can be built instead is a **top-of-book fill approximation**: given a
recorded best bid and ask, decide whether a marketable order would have crossed,
at the quoted price, for a size the book was never shown to absorb. That is a
strictly weaker object and it must not be named `L2`, or a later reader will
take it for execution replay and credit it with evidence it does not carry.

**Required naming and labelling.** The class is `TopOfBookFillApproximation`. It
carries `depth_basis: "UNSUPPORTED"`, `delay_seconds: 900`, and a size ceiling of
one contract. Any size above one returns `UNSUPPORTED`, never an assumed fill.
Gate 2 in `docs/ORDERBOOK_EXECUTION_PLAN.md` remains blocked; nothing here
approaches it.

## Buildable now

### 1. Clearing schedule guard

Pure function of the clock. No data dependency.

- block order submission 13:55–14:05 and 18:45–19:05 MSK;
- cancel resting limit orders 2 minutes before each clearing;
- the guard's decision is `BLOCK` or `ALLOW` with a named reason; it never
  silently passes.

**Boundaries are venue schedule, not preference**, and must be sourced in a
comment. If the venue changes them, that is a schedule change and a new dated
constant, not an edit of the old one.

### 2. Spread intent translator

`ENTER_SPREAD_LONG` → `BUY F1` at best ask, `SELL F2` at best bid, and the
inverse. Two properties the tests must pin:

- **Leg identity is resolved by expiry, never by alphabetical secid.** BRQ6 sorts
  before BRU6 and BRV6 alphabetically and its expiry ordering happens to agree;
  BRF7 and BRZ6 do not agree. This has already been a live defect once in this
  project.
- **The pair is emitted atomically or not at all.** A translator that can emit
  one leg produces an outright position while claiming to be a spread. There is
  no partial intent.

### 3. Evening spread filter

Blocks entry when the quoted spread exceeds N ticks. **N is not chosen here.**
The breakeven spreads frozen in `TASK-MX-002` are 1.90 ticks per leg at 1d, 4.08
at 3d, 4.29 at 5d and 5.94 at 10d; the filter takes N as a required argument and
the caller declares it from that table. A default would be a parameter selected
without a preregistration.

## Safety boundary

- **Simulation only. No order is placed, routed, or sent anywhere.** No account,
  position, balance or execution endpoint. No credential.
- The adapter has no code path that reaches a broker, and a static scan must
  prove it.
- `check_paper_gate.py` untouched and still blocked.

## Acceptance

- Tests prove: the guard blocks inside both clearing windows and at their
  boundaries; legs are ordered by expiry and a deliberately misordered input is
  refused; a partial pair raises; the fill approximation returns `UNSUPPORTED`
  above one contract; `delay_seconds` and `depth_basis` travel with every fill
  verdict; the evening filter refuses to run without an explicit N.
- The result states plainly that no L2 engine was built and why.
- Existing suites still pass: lifecycle 21, cost model 33.

## Allowlisted deliverables

1. `moex-futures-bot/src/moex_futures_bot/execution/__init__.py`
2. `moex-futures-bot/src/moex_futures_bot/execution/clearing_schedule.py`
3. `moex-futures-bot/src/moex_futures_bot/execution/moex_execution_adapter.py`
4. `moex-futures-bot/tools/test_execution_adapter.py`
5. `tasks/results/TASK-MX-005-MOEX-EXECUTION-ADAPTER-AND-CLEARING-GUARD-V0-RESULT.md`
