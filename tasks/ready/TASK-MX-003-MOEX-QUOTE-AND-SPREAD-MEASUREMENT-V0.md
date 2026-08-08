# TASK-MX-003 - MOEX Quote And Spread Measurement v0

## Lifecycle

- Current stage: `DATA_HEALTH`
- Entered from: `TASK-MX-002`, which passed Stage 0 on a cost floor whose
  execution component is assumed rather than measured.
- Next permitted transition: a Stage 1 protocol for the BR calendar contour on
  the horizons that survive the measured spread; or closure of the horizons that
  do not.
- No candidate. No paper. No live. No order of any kind.

## Blocking governance conflict — resolve before starting

`docs/ORDERBOOK_EXECUTION_PLAN.md` states:

> «Orderbook collection is useful only after a strategy has a frozen
> `paper_candidate` definition. Current status: `blocked`.»

and lists among its preconditions that the candidate «survives pessimistic cost
assumptions».

That precondition cannot be evaluated. Pessimism has no definition on this venue
until the bid-ask spread is measured, and the spread cannot be measured while
collection is blocked pending a candidate. The gate as written makes the
candidate a prerequisite for the data that decides whether a candidate is
possible.

**This task does not override that document.** It requires one of:

- **(A)** the operator amends `ORDERBOOK_EXECUTION_PLAN.md` to separate two
  different activities that it currently conflates — *cost-model calibration*
  (measuring what the venue's spread is, candidate-independent) from *candidate
  execution modelling* (replaying a specific frozen rule against recorded books).
  Only the second belongs behind the candidate gate; or
- **(B)** the operator grants an explicit, scoped authorisation for this task
  alone, recorded in the result.

Until (A) or (B), this task is `BLOCKED_ON_GOVERNANCE` and no collector runs.
The recommendation is (A), because the conflict will recur for every future
instrument otherwise.

## Objective

Replace the assumed one-tick bid-ask in the cost model with a measured figure,
and decide which BR calendar horizons survive it.

## Pre-registered decision thresholds

**Already frozen.** These are the breakeven spreads computed in
`TASK-MX-002-...-RESULT.md` before any quote was collected. They are not
re-derived after seeing data.

| horizon | maximum bid-ask spread, ticks per leg |
|---|---:|
| 1d | **1.90** |
| 3d | 4.08 |
| 5d | 4.29 |
| 10d | 5.94 |

**Unit, stated precisely to prevent a factor-of-two error.** The cost model's
`TICK_FLOOR` basis charges one tick per leg for a complete round trip — the
half-spread-each-way convention. So the number above is the **bid-ask width in
minimum price steps**, directly comparable to a measured quote. One tick on BR is
0.01 price points = 7.84 ₽.

**Verdict rule.** For each horizon, compare against the **median** measured
spread of the wider of the two legs, and separately against **p75**:

- median spread above the threshold → that horizon is closed, `SPREAD_UNFEASIBLE`;
- median below but p75 above → that horizon is `CONDITIONAL` and any Stage 1
  protocol on it must declare a spread filter as part of the frozen rule, not as
  a later fix;
- both below → the horizon survives and may carry a Stage 1 protocol.

A horizon closed here does not reopen by re-measuring in a calmer week.

## The measurement cannot be backfilled — read this before planning

Order book state is not retained by anyone we can query. Whatever is collected
starts on the day the collector starts. Two consequences that must appear in the
result:

1. **Regime mismatch.** The Stage 0 dispersion was measured on 2024-01 to
   2026-07. The spread will be measured from 2026-08 onward. Applying a spread
   measured in one period to dispersion measured in another is an assumption, and
   the result must state it rather than let the two tables sit side by side as if
   they were contemporaneous.
2. **Calendar time.** The stopping rule below takes the days it takes. It cannot
   be shortened by sampling harder within a day; intraday samples from one
   session are not independent observations of the spread regime.

## Pre-registered stopping rule

Declared before collection starts:

- at least **15 distinct trading days**;
- covering at least **2 distinct front-contract expiries** (amended, see below);
- both the main and the evening session represented on at least 10 of those days;
- clearing pauses recorded rather than skipped, so their spread behaviour is
  measurable instead of assumed.

No verdict is issued on a partial cohort. If collection is interrupted, the
result reports coverage and stops.

### What «represented» means — declared 2026-08-09, at zero valid days

The stopping rule requires both sessions «represented» on at least 10 days and
never said what that meant. Defined now, while the count of qualifying days is
**zero**, so no threshold can be fitted to which days would pass.

A **session is covered** on a day when both hold:

- at least **90% of its 5-minute buckets** contain at least one snapshot, and
- **no single gap exceeds 15 minutes**.

A **day is valid** when MAIN and EVENING are both covered. Sessions are the
boundaries in `execution/clearing_schedule.py`, `MOEX.FORTS.SCHEDULE.2026-08`:
main 10:00–18:50 MSK excluding the 14:00–14:05 clearing, evening 19:05–23:50.

Two thresholds and the reason for each. The 90% bucket rule tolerates the
scattered single-snapshot losses that transient `URLError` retries produce. The
15-minute gap rule exists because the 90% rule alone would pass a day that lost
one continuous 45-minute block — and a 45-minute hole in the evening session is
exactly where the spread widens, so a day that loses it would report an
optimistic median while satisfying the letter of the coverage test.

Enforced by `tools/check_quote_cohort.py`, which regenerates
`data/market/moex_iss/quotes/COHORT_VALIDITY.json`. The register is derived, not
hand-maintained: a hand-written one does not notice that two months produced no
qualifying day.

### Amendment record — 3 expiries reduced to 2

Amended 2026-08-07 on operator decision, **before any final-week data existed**.
Exact state of the sample at the moment of amendment, so this can be audited:
134 records, all from the evening session of 2026-08-06, covering BRU6 and BRV6
only, with no observation inside any contract's final week. The amendment
concerns final-week coverage, and no final-week observation had been made.

**What changes.** Three front-contract expiries would require collection to run
to BRX6's expiry on 2026-11-02. Two require running to **BRV6's last trading day,
2026-10-01** — the front leg becomes BRV6 after BRU6 expires on 2026-08-31, so
the two observed final weeks are BRU6's (roughly 2026-08-25 to 08-31) and BRV6's
(roughly 2026-09-24 to 10-01). Collection ends on 2026-10-01 rather than
2026-11-02.

The 15-day minimum is not the binding constraint and never was: fifteen trading
days from 2026-08-07 completes around 2026-08-27. The expiry-count rule sets the
end date.

**What it costs, recorded rather than glossed.** The original rule asked for
three expiries because `TASK-MX-001` found the front leg's final week carries
4.1x the dispersion of ordinary days, and a regime that matters that much should
not be characterised from a single instance. Two instances is better than one and
is still a very small sample. With n=2 it is not possible to separate «the final
week is systematically wider» from «one of those two weeks was unusual».

Consequences that must be carried forward into any result built on this data:

- the final-week spread figure is a **two-sample observation** and must be
  reported as such, with both weeks shown separately rather than pooled into a
  single median;
- any Stage 1 protocol that trades the final-week window inherits this weakness
  and must declare it in its own preregistration;
- if the two observed final weeks disagree materially, that is not a reason to
  collect a third opportunistically. It is a reason to report the disagreement
  and treat the final-week regime as uncharacterised.

This amendment may not be revisited once final-week data begins to arrive.

## Required work

1. **Feasibility probe first, before building anything.** `finam_client.py`
   already exposes `orderbook(symbol)` against
   `/v1/instruments/{symbol}/orderbook`. Confirm, in a single bounded read-only
   call per contract, that it returns usable bid/ask for the BR front and second
   contracts. If it does not, this task is `DATA_INADEQUATE` at the source and
   the fallback is MOEX ISS `marketdata` snapshots at whatever cadence it
   permits. Do not build a collector against an endpoint that has not been shown
   to serve these instruments — `data/market/finam/orderbook/` is empty today and
   the reason was never recorded.
2. Build a read-only snapshot collector inheriting the scope already written in
   `docs/ORDERBOOK_EXECUTION_PLAN.md`: top 5-10 depth, **no faster than one
   snapshot per 5 seconds**, local storage under
   `data/market/finam/orderbook/`, front and second BR contracts only.
   Append-only. It records; it does not decide anything.
3. Measure, per 60-minute slot and per leg: bid-ask in ticks and in bps, depth at
   best, and the share of slots with a crossed or empty book. Report median, p75
   and p90.
4. Measure the two regimes that the assumed one-tick figure is least likely to
   survive: the **clearing pauses** and the **evening session**, and the front
   leg's **final week**, where `TASK-MX-001` located 4.1x the dispersion.
5. Estimate slippage for one contract and for a size tier the depth actually
   supports. A tier the book cannot absorb is reported `UNSUPPORTED`, never as an
   assumed fill.
6. Add a `MEASURED` execution basis to the fee schedule as a new dated entry, and
   make `cost_model.py` stop raising on it. The `TICK_FLOOR` bases stay, so prior
   results remain reproducible.
7. Re-run `tools/stage0_br_calendar_feasibility.py` **unchanged** and apply the
   frozen thresholds above.

## Safety boundary

- Read-only market data only. **No order placement, no order simulation against
  a live account, no account, position, balance or execution endpoint.**
- The collector obtains its credential through the existing client mechanism. It
  must never log, print, echo or write the token; `finam_client.redact` exists
  for this. No task step reads or displays `.env`.
- Rate limiting is a safety property here, not politeness: no faster than one
  snapshot per 5 seconds per contract, and the collector stops on repeated
  errors rather than retrying in a tight loop.
- No systemd unit, no service, no autostart. The collector is run manually and
  stopped manually in this version.
- Do not modify `tools/stage0_br_calendar_feasibility.py`, the 2026-08-06
  schedule, or the 2026-08-06_rev2 schedule.
- `check_paper_gate.py` returns `blocked` throughout and is not touched.

## What this task will not deliver

State plainly in the result, because the temptation to overclaim here is real:

- **It does not unlock Stage 2.** Execution replay needs recorded books at the
  decision times of a frozen rule. This collects books going forward, with no
  rule frozen. It begins the record that a future Stage 2 would need; it is not
  that stage.
- **It does not make 60-minute bars adequate for tick-level fill claims.** Under
  `reference/BOTALIN_RESEARCH_PIPELINE_PROTOCOL_2026-08-03.md` a decision taken
  on an hourly bar remains a `BAR_RESOLUTION_PROXY` regardless of how well the
  spread is measured.
- **It says nothing about edge.**

## Acceptance

- The governance conflict is resolved by (A) or (B) and the resolution is
  recorded, or the task reports `BLOCKED_ON_GOVERNANCE` and stops.
- No credential is read, printed or written anywhere.
- No order, account or execution path exists in any deliverable; a static scan
  proves it.
- The stopping rule is met in full, or the result reports coverage and issues no
  verdict.
- Every horizon receives one of `survives`, `CONDITIONAL`, `SPREAD_UNFEASIBLE`
  by the frozen thresholds.
- The regime mismatch between the dispersion window and the spread window is
  stated.
- The self-check suite passes, including the checks frozen in TASK-MX-001 and
  TASK-MX-002.

## Multiplicity

Contour record. No multiplicity budget consumed: no signal tested, no parameter
selected.

## Allowlisted deliverables

1. `moex-futures-bot/tools/probe_finam_orderbook.py`
2. `moex-futures-bot/tools/collect_finam_orderbook.py`
3. `moex-futures-bot/tools/measure_br_spread.py`
4. `moex-futures-bot/src/moex_futures_bot/cost_model.py` (extend)
5. `moex-futures-bot/tools/test_cost_model.py` (extend)
6. `moex-futures-bot/configs/costs/moex_forts_fee_schedule_<new date>.json`
7. `tasks/results/TASK-MX-003-MOEX-QUOTE-AND-SPREAD-MEASUREMENT-V0-RESULT.md`
