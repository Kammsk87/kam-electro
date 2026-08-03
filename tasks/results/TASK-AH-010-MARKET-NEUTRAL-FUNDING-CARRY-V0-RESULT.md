# TASK-AH-010 — Market-Neutral Funding Carry v0 (Result)

**Task ID:** TASK-AH-010-MARKET-NEUTRAL-FUNDING-CARRY-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. Verdict

**`STAGE_0_INFEASIBLE`** — closed. No Stage 1 written. Sealed segments never read.

`promising_count` remains `0`.

## 1. The result in one table

Of **232** Hyperliquid assets, **16** have a tradeable spot leg. On those, train only:

| Threshold | Hold | n | gross bps | **net bps** | median | top share |
|---|---|---:|---:|---:|---:|---:|
| 10% | 24h | 3,508 | 3.09 | **−18.91** | −19.00 | 3% |
| 10% | 72h | 3,508 | 7.57 | **−14.43** | −14.19 | 4% |
| 10% | 168h | 3,508 | 14.88 | **−7.12** | −5.81 | ~0% |
| 20% | 24h | **29** | 13.00 | −9.00 | −8.65 | 34% |
| 20% | 72h | **29** | 20.52 | −1.48 | −1.33 | 4% |
| 20% | 168h | **29** | 31.22 | +9.22 | +11.07 | **64%** |
| 50% | any | **5** | — | — | — | — |

Cost floor 22 bps, two legs.

**The fork closes from both sides.** Where the premium exists — 216 unhedgeable assets — there is
no hedge. Where the hedge exists — 16 assets — the premium does not: above 20% annualised there
are 29 events in 12.5 days, above 50% there are five.

The single positive cell, 20% at 168h, rests on 29 heavily overlapping observations with one
asset carrying 64% against a 25% cap.

## 2. Three corrections I made to myself, in order

**First: I measured the wrong thing.** The initial cut took the unconditional mean across all 232
assets: 0.17 bps gross at 8h. That is not carry — funding is roughly symmetric, so longs and
shorts cancel and the answer is zero by construction. Carry means shorting *where funding is high*.

**Second: the conditional version looked like a pass.** With a 20% threshold: +7.06 bps net at
24h, +44.9 at 72h, +103.5 at 168h. This would have been the first Stage 0 pass of the session.

**Third: concentration killed it.** One asset, CASHCAT, contributed 10,577 bps of a 6,999 bps
total — **151%**, because everything else was net negative. Removing it took the mean from +7.06
to **−4.48**. The median was −4.8 and 63% of trades lost.

And CASHCAT has no spot market. The apparent carry was an unhedged short of an illiquid asset.

## 3. The overlap inflation

The t-statistics of 25–27 I nearly reported are computed as though hourly entries with multi-hour
holds were independent:

| Hold | claimed n | effective n | inflation |
|---|---:|---:|---:|
| 24h | 991 | 600 | 1.7× |
| 72h | 991 | 200 | 5.0× |
| **168h** | **991** | **50** | **19.8×** |

A weekly hold entered every hour overlaps its 167 neighbours. Over 12.5 days of train there is
**one** independent observation per asset at that horizon. The harness now prints the naive and
overlap-adjusted t together so the first cannot be quoted alone.

This is the same class of error as the net-versus-gross t-statistic found in AH-046.

## 4. What was built to stop it recurring

Hedgeability is **gate 1 in the code**, and an unhedgeable asset is removed from the universe
rather than flagged. A shipped test gives an unhedgeable asset enormous funding and asserts it
cannot change the verdict. The ordering can no longer be got wrong by accident.

## 5. Checks

| Check | Result |
|---|---|
| `node --check` (both scripts) | pass |
| Deterministic unit tests | **30 / 30 pass** |
| Static no-trading scan (11 assertions) | pass |
| Stage 0 replay, 127,368 hourly observations, 232 assets, 549 hours | pass |
| `git diff --check` | clean |
| gitleaks | **NOT RUN — binary not installed, offline** |

Data came from `EDGE.DATA.HL_CASCADE`, verified this session: a 60-second poll carrying OI, mark,
oracle and funding with our own timestamp. The hedgeable set came from `axisA`, which holds real
Bybit spot and a `(perp-spot)/spot` basis for 18 symbols. Extraction was read-only server-side;
nothing was written there and no raw market data was committed.

## 6. What this task cannot conclude

1. That funding carry is impossible generally — only that in this 232-asset universe a
   harvestable premium and a hedgeable asset rarely coincide.
2. That another spot venue would not widen the hedgeable set. That should be checked before the
   family is called permanently closed.
3. Anything about unhedged funding shorts, which are a directional position and outside this
   contract.
4. Anything out of sample. Nothing out of sample was read.

## 7. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | `DISCOVERY` |
| Lifecycle state left | `CLOSED` at Stage 0 |
| Evidence gate | gate 1 (hedgeability) and gate 2 (economics) both fail on the hedgeable universe |
| Failure route | `DATA_REQUEST` — a wider spot-venue universe would reopen it; nothing else would |
| Next queued task and owner | Operator/Codex |
| What this task cannot conclude | §6 |
| Files changed | The 5 files AH-010 allows |
| Prohibitions respected | Existing data only; read-only server reads; nothing written to the server; no network, keys, exchange endpoints, paper/live, runner, service, coordinator, approval, KILL, configuration, model-ID or RESET_TS. `promising_count` remains `0` |

**Candidate new lesson:** risk premium and hedgeability are not independent variables. Where the
premium is large the hedge is usually absent, and that is often why it is large. Check the second
leg before measuring the first — otherwise you produce an attractive number about a trade that
cannot be put on.

## 8. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`. **Push not performed.**
