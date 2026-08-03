# TASK-AH-019 — Liquidation Toxic-Flow Fade 1m v0 (Result)

**Task ID:** TASK-AH-019-LIQUIDATION-TOXIC-FLOW-FADE-1M-V0
**Date:** 2026-08-02
**Label:** `DISCOVERY_NOT_PROOF`. Research only.

## 0. Verdict

**`DATA_INADEQUATE`.** All four required decision-time sources are absent from this machine, so no
signal was calculated. Nothing was substituted for them.

```
trades        DATASET_NOT_SUPPLIED   ts, symbol, price, size, side
book          DATASET_NOT_SUPPLIED   ts, symbol, bids, asks
oi            DATASET_NOT_SUPPLIED   ts, symbol, open_interest
liquidations  DATASET_NOT_SUPPLIED   ts, symbol, side, notional
```

`promising_count` remains `0`. No collector, service, runner, coordinator, approval, KILL, config,
`model_id` or `RESET_TS` was touched, and no order, account, position or execution endpoint exists in
the code.

## 1. The finding that matters more than the verdict

The task asked for a fade after liquidation pressure, signed flow imbalance, OI reduction and
same-minute replenishment coincide. Building it surfaced a hard arithmetic fact worth stating
plainly, because it determines what is worth collecting next.

**A shrinking book level is ambiguous, and no amount of order-book snapshot resolution resolves it.**

```
size_next = size_prev - traded_at_price - cancelled + added
=>  net_passive_change (added - cancelled) = size_next - size_prev + traded_at_price
```

A level that goes 100 → 0 was either fully traded through or fully cancelled. Those have **opposite**
directional meaning — absorption implies reversal, withdrawal implies continuation — and the only
term that separates them is `traded_at_price`, which exists solely in the trade tape **with aggressor
side**. A shipped test asserts exactly this: the same 100 → 0 delta classifies as `PULL` with no tape
volume and `CONSUMPTION` with full tape volume.

So the five-layer plan has a strict dependency that is not obvious from the layer list:

| # | Layer | Status |
|---|---|---|
| 1 | Bid/ask dynamics (~2s snapshots) | collected |
| 2 | Aggressive trades / CVD | **unverified — the binding blocker** |
| 3 | Absorption and fake walls | **arithmetically impossible without layer 2** |
| 4 | OI, funding, liquidations | present but 5m OI granularity hides the cascade |
| 5 | Market context | partial; regime yes, NEWS lane is a declared gap |

Layer 3 is not a separate collection job — it falls out of layers 1 and 2 for free, and cannot be
approximated without layer 2. That makes the aggressor-classified tape the single highest-leverage
missing field in the stack.

## 2. The one check worth running first

A tick recorder already exists: `EDGE.DATA.TICKS` at `/opt/botalin-edge/data/ticks/`, written by
`botalin-ob-recorder.service` and described in the warehouse as "tick/trade print recorder output".
Whether it persists the **taker side** per print is `DOCUMENTED_UNVERIFIED` — nobody has confirmed it.

If it does, layers 2 and 3 are unblocked today with no new collector. If it does not, the recorder
needs one additional field and everything downstream waits on that.

This is a read-only inspection of one file's schema; it needs server access, which is unavailable
here. It falls under `GO-WAREHOUSE-0-INVENTORY`.

## 3. What was built

A complete, tested engine that runs the moment those four sources exist:

- **Layer 2** — `signedTradeFlow` (taker buy/sell notional, signed volume, taker-buy ratio, per-price
  traded volume retained for the decomposition) and `cumulativeVolumeDelta` (CVD, chronological).
- **Layer 3** — `classifyLevel` returning six declared states: `ABSORPTION`, `CONSUMPTION`,
  `PULL`, `PULL_UNDER_PRESSURE`, `REPLENISH`, `IDLE`; and `sideLiquidityDelta` aggregating absorbed
  volume, pulled size and depth-within-10bps change per side. A bid is consumed by aggressive sells,
  an ask by aggressive buys.
- **Composite** — `directionalState` answers the question as posed: *are takers really eating one
  side, and is the other side being withdrawn rather than held?* Outputs `BUYERS_ABSORBED` /
  `BUYERS_BREAKING_THROUGH` and their seller mirrors, defaulting to `NO_SIGNAL`.
- **Layer 4** — OI bucketing (last observation wins) and liquidation notional split by side.
- **Execution** — `depthWalk` giving an executable VWAP at $7 / $200 / $1k; a tier deeper than the
  book is `UNSUPPORTED`, never an assumed fill.
- **Detection** — train-only quantile fitting, the frozen four-condition event with its exact mirror,
  chronological 55/20/15/10, 15-minute purge, 60-minute embargo.
- **Validation** — two-sided matched null (≥1,000 samples; same symbol, side, time-of-day ±30min and
  liquidity bucket; empty pool yields `p = null`, never a pass), remove-best symbol/day,
  concentration, double-cost stress, chronologically ordered drawdown.

## 4. The overlap gate blocks a passport regardless of statistics

The event set must be shown distinct from `AMEL_EVENT`, `WICK_RECLAIM`, `FAILED_BREAKOUT`,
`NEWS_DELAYED_REACTION`, `FUNDING_EXTREME`, `WALLET_FLOW` and `LIQUIDITY_GUARD`. Per-trade timestamp
ledgers for those families were not retained, so overlap is `UNAVAILABLE` and blocking, and the ladder
places it **before** any statistic is credited:

```
DATA_INADEQUATE → DUPLICATE_OR_OVERLAP → OOS_FAIL_REJECT_FAMILY
                → ROBUSTNESS_FAIL_DEPRIORITIZE → CANDIDATE_PASSPORT_DRAFT
```

A test constructs a result passing every statistical gate and confirms the verdict is still
`DUPLICATE_OR_OVERLAP`.

## 5. Stated before measurement: the cost floor

At 11 bps roundtrip, a 5-minute fade must clear ~11 bps net to exist. Order-flow imbalance at this
horizon typically predicts far less. The realistic outcomes are therefore: the signal fails at ideal
fill and the family closes; or it survives only as a **guard** on an existing sleeve rather than an
entry; or only at horizons longer than the impulse.

Recorded now so a negative result is a completed test, not a disappointment, and so nobody is tempted
to relax the cost model to rescue it.

## 6. Checks

| Check | Result |
|---|---|
| `node --check` (both scripts) | pass |
| Deterministic unit tests | **68 / 68 pass** |
| Smoke / full replay | pass, exit 0, `DATA_INADEQUATE` with all four datasets named |
| Static no-trading scan (11 assertions) | pass |
| `git diff --check` | clean |
| gitleaks | **NOT RUN — binary not installed, offline** |

Breakdown: data gate 10/10 · aggressive flow 4/4 · absorption vs cancellation 10/10 · directional
state 4/4 · book and execution 5/5 · OI and liquidations 2/2 · detection and statistics 7/7 ·
matched null 4/4 · verdicts 6/6 · determinism 5/5 · static scan 11/11.

Two real defects were caught by the suite during development and fixed rather than worked around: the
import scanner matched a template literal (`from '${...}'`) and needed anchoring to real import
statements; and a depth-walk test asserted a strict VWAP inequality on a notional that exactly filled
the touch — the engine was correct, the test was wrong.

A manual secret scan over the five deliverables returned zero hits. gitleaks itself could not run
offline; if its output is required for acceptance it must be run separately.

## 7. What this task cannot conclude

1. Nothing about the hypothesis. No event was detected and no return computed. `DATA_INADEQUATE` is a
   statement about our data.
2. That the tick recorder lacks aggressor side — only that it is unverified. That check is cheap and
   should come first.
3. That fixing layer 2 is sufficient. Layer 4's 5-minute OI granularity remains a separate blocker:
   at that resolution, event condition 2 measures an average, not an event.
4. That the event set is distinct from the seven comparison families.

## 8. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | none — gated at `DATA_HEALTH` |
| Lifecycle state left | none |
| Position in the state machine | Blocked at `DATA_HEALTH` |
| Next permitted transition | none performed |
| Evidence gate passed / failed | none evaluated — no data was analysed |
| Failure route | `DATA_REQUEST` |
| Next queued task and owner | Read-only schema check of `/opt/botalin-edge/data/ticks/` for aggressor side, under `GO-WAREHOUSE-0-INVENTORY`. Then finer OI/liquidation granularity. Task selection remains Codex's decision |
| What this task cannot conclude | §7 |
| Files changed | The 5 allowlisted deliverables only |
| Prohibitions respected | No network. No server access attempted. No collector, live/paper runner, service, timer, coordinator, approval, KILL, config, `model_id`, `RESET_TS` or runtime data touched. No secrets read. No order, account, position or execution endpoint. CVD was not constructed from OHLCV proxies. `promising_count` remains `0` |

**Relevant lessons** (source `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`, not readable
from this machine; titles unverified):

- **LESSON-013** — the protocol records that 5m OI granularity hides the cascade inside the bucket,
  and refuses to treat a bucket average as an event.
- **LESSON-016** — the aggressor field is validated as a causal taker classification, not accepted
  merely because a `side` column is populated.
- **LESSON-021** — §5 fixes the ideal-fill cost floor before measurement, so no execution work can be
  proposed to rescue a signal that fails there.
- **LESSON-003** — the overlap gate blocks a passport draft ahead of any statistic.
- **LESSON-019** — any p-value here would be uncorrected for the programme's prior-trial count.

No new lesson.

## 9. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`; only the five allowlisted files
were staged. **Push not performed — it requires separate explicit approval.**
