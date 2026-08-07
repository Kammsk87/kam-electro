# TASK-MX-003 phase 0 — quote source probe

Date: 2026-08-07. Tool: `tools/probe_finam_orderbook.py`.
Purpose: decide whether a collector can be built at all, before building one.

## Result

| source | status |
|---|---|
| Finam `/v1/instruments/{symbol}/orderbook` | `NO_CREDENTIAL` — `FINAM_SECRET_TOKEN` is absent or still the placeholder. Not an error; the endpoint was never reached. |
| MOEX ISS `marketdata` | **works** for BRU6 and BRV6 |
| MOEX ISS L2 orderbook endpoint | **does not exist** for the FORTS market; the URL returns a non-JSON response |

No credential was read, printed or written. The script reports the state of the
variable, not its value.

## What ISS marketdata gives, and what it does not

Fields returned per contract include `BID`, `OFFER`, **`SPREAD`**, `LAST`,
`SETTLEPRICE`, `OPENPOSITION`, `VOLTODAY`, `SWAPRATE`, `UPDATETIME`, `SYSTIME`.

**Depth is not returned.** `BIDDEPTH`, `OFFERDEPTH`, `BIDDEPTHT`, `OFFERDEPTHT`,
`NUMBIDS`, `NUMOFFERS` were all `None` on every call.

Consequence for the task as written:

| TASK-MX-003 requirement | ISS-only |
|---|---|
| 3 — bid-ask in ticks and bps, per 60-minute slot | **supported** — `SPREAD` is a native field |
| 4 — spread in clearing pauses, evening session, front leg's final week | **supported** |
| 5 — slippage for one contract and for a size tier | **UNSUPPORTED** — no depth, no queue, no levels |
| 6 — replace `TICK_FLOOR` with a `MEASURED` execution basis | **partially**: the spread term becomes measured, the size-impact term stays unmeasured |

So ISS closes the binding unknown from `TASK-MX-002` — the assumed one-tick
spread — but cannot close size impact. A `MEASURED` basis built from ISS must
say that it prices the spread and not the fill.

## First observations — NOT a verdict

Two snapshots, one evening session, one day. The frozen stopping rule requires 15
trading days across 3 front-contract expiries. **No horizon verdict may be issued
from this**, and none is issued here. Recorded only because it sets expectations.

| contract | BID | OFFER | spread |
|---|---:|---:|---:|
| BRU6 (front) | 82.67 | 82.68 | 1 tick |
| BRU6, one minute later | 82.66 | 82.68 | 2 ticks |
| BRV6 (second) | 80.76 | 80.79 | 3 ticks |

For scale against the thresholds frozen in `TASK-MX-002`: the wider leg would
need to sit under 1.90 ticks for the 1d horizon and under 4.08 for 3d. A second
leg quoting 3 ticks in the evening session is consistent with 1d being the
horizon at risk, which is what the frontier predicted before any quote existed.
It is one observation and it proves nothing.

Timestamps also need pinning: the call on 2026-08-07 returned
`TRADEDATE: 2026-08-06` with `SYSTIME 22:03:30`. The session-boundary convention
must be resolved before slots are labelled, or evening-session data will be
attributed to the wrong day. The project already has a documented Finam-vs-ISS
session convention issue; this is the same class of problem.

## Decision required before phase 1

The collector cannot be designed until this is settled:

- **(A) ISS-only.** Costs nothing, needs no credential, starts immediately.
  Delivers the spread. Leaves slippage and size impact permanently unmeasured,
  so any Stage 1 protocol must restrict itself to a size the book was never shown
  to absorb — one contract, declared as an assumption.
- **(B) Restore the Finam credential** and probe the L2 endpoint. Delivers depth
  and levels if the endpoint serves FORTS futures to this account, which has
  never been demonstrated: `data/market/finam/orderbook/` is empty and the reason
  was never recorded. May fail, in which case (A) is the outcome anyway.
- **(C) Both.** ISS collection starts now while the credential question is
  resolved in parallel. The 15-day clock starts today rather than after.

(C) is recommended: the stopping rule is measured in calendar days and nothing is
gained by leaving them unspent.

## Phase 1 finding — the ISS public feed is delayed by exactly 15 minutes

Found in the first 16 records the collector wrote, 2026-08-06 22:07 MSK.

`SYSTIME` and `UPDATETIME` advance together, second by second, separated by a
constant offset:

| SYSTIME | UPDATETIME | offset |
|---|---|---|
| 22:07:03 | 21:52:02 | 15:01 |
| 22:07:31 | 21:52:30 | 15:01 |
| 22:07:51 | 21:52:50 | 15:01 |

The feed is live but **published 15 minutes late**. The quotes are real; they are
not current.

What this changes:

- **Cost-model calibration is unaffected.** The task measures the distribution of
  the spread on this instrument. A spread that existed fifteen minutes ago is a
  real observation of that distribution.
- **Any decision-time or execution claim is impossible from this source.** No
  rule can claim it would have seen this quote when it decided. This is a second,
  independent reason why `TASK-MX-003` cannot unlock Stage 2 — the first being
  that no rule is frozen.
- The `MEASURED` execution basis built from this data must record
  `delay_seconds: 900` alongside its numbers, so a later reader cannot mistake it
  for a decision-time quote.

## Phase 1 finding — STEPPRICE has moved 3.2% since the schedule was frozen

`STEPPRICE` for BR read **7.83987** in the params retained in July 2026 and reads
**8.09293** today. The rouble value of one tick tracks the currency; it is not a
constant, and the fee schedule's `rub_per_price_point: 783.987` is now stale.

Under the schedule's own `review_criterion` — «replace on a change of published
venue params» — a new dated entry is due. The effect on the Stage 0 arithmetic is
small and favourable: the execution term and the spread moves both scale with
STEPPRICE and cancel, while the flat rouble exchange fee does not scale, so it
becomes relatively smaller. It is not a reason to revisit the verdict, but it is
a reason to append an entry rather than let a stale constant sit in the file.

The collector records `stepprice` and `rub_per_price_point` on every snapshot for
this reason.

## Status

`TASK-MX-003` is at phase 1, track A. The ISS collector is running. Track B
awaits a Finam credential. No verdict issued; the frozen stopping rule needs 15
trading days across 3 front-contract expiries. `check_paper_gate.py` returns
`blocked`.
