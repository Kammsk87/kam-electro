# Multi-Strategy Candidate Lifecycle

## Purpose

This is the permanent research loop for Botalin. It keeps the search moving until a multi-strategy portfolio has independently verified sleeves, but it never auto-starts paper or live trading.

The objective is not to force a positive backtest. The objective is to repeatedly convert raw observations into increasingly realistic evidence, retain only mechanisms that survive independent checks, and assemble a router only from sleeves that have earned that right.

## State machine

```text
DATA_HEALTH
  -> DISCOVERY
  -> CANDIDATE_PASSPORT
  -> IDEAL_FILL_AND_OOS
  -> EXECUTION_REPLAY
  -> QUARANTINED_PAPER_OBSERVER
  -> MICRO_LIVE_MECHANICS
  -> FORWARD_RETENTION
  -> ROUTER_ADMISSION
  -> PORTFOLIO_FORWARD
```

Every transition is one-way for a specific `model_id` and `RESET_TS`. A changed rule is a new candidate, not a repair of history.

## Stages and gates

| Stage | Owner | Required evidence | Next state if it passes | Failure route |
|---|---|---|---|---|
| `DATA_HEALTH` | Data Truth Auditor | Source provenance, timestamp semantics, freshness, no look-ahead, no fixture confusion | `DISCOVERY` | Repair data or log more |
| `DISCOVERY` | Alpha Hunter | Payer thesis, causal event/regime, non-duplicate family, enough raw coverage | `CANDIDATE_PASSPORT` | New axis search or guard-only |
| `CANDIDATE_PASSPORT` | Orchestrator | Frozen entry, exit, universe, timeframe, cost, benchmark, kill test | `IDEAL_FILL_AND_OOS` | Clarify or reject |
| `IDEAL_FILL_AND_OOS` | Skeptic | Positive median and mean net of base cost, matched null, walk-forward holdout, neighbor robustness, remove-best checks | `EXECUTION_REPLAY` | Structural variant, data request, or quarantine |
| `EXECUTION_REPLAY` | Execution Realism | At-event executable price, spread/depth, no-fill, size-tier slippage, cost remains positive | `QUARANTINED_PAPER_OBSERVER` | Execution redesign, venue/size restriction, or reject |
| `QUARANTINED_PAPER_OBSERVER` | Claude Code + Auditor | New immutable forward cohort, independent day clusters, no promotion from paper alone | `MICRO_LIVE_MECHANICS` nomination | Continue, freeze, or reject |
| `MICRO_LIVE_MECHANICS` | Operator only | Fresh explicit GO, bounded 1-3 fills, trace, flat verification, no auto-rerun | `FORWARD_RETENTION` only if mechanics pass | Fix execution or return to prior stage |
| `FORWARD_RETENTION` | Orchestrator + Skeptic | Sufficient clean fills and replay-supported expectation; edge retention rather than small-account PnL | `ROUTER_ADMISSION` | Continue sampling, redesign, or quarantine |
| `ROUTER_ADMISSION` | Router Architect + Correlation Auditor | Regime-specific evidence, sleeve independence, conflict policy, risk budget | `PORTFOLIO_FORWARD` | Keep sleeve independent or reject |
| `PORTFOLIO_FORWARD` | Operator + Roadmap Controller | Forward router results, drawdown and correlation controls, unchanged evidence rules | Review or controlled expansion | Reduce/disable sleeve; never auto-scale |

## Continuous queues

The Orchestrator maintains four queues at all times:

1. **Data queue**: missing fields, event logging, source truth, venue and execution coverage.
2. **Discovery queue**: new mechanism axes, structural variants of failures, and regime/timeframe coverage gaps.
3. **Validation queue**: ideal-fill, OOS, null, family-wise, execution replay, and audit tasks.
4. **Forward queue**: paper cohorts, explicitly approved micro-live mechanics, and post-run retention reviews.

A negative result never terminates the entire program. It routes the specific idea into exactly one of: `STRUCTURAL_VARIANT`, `DATA_REQUEST`, `GUARD_ONLY`, `QUARANTINE`, or `REJECTED_FAMILY`. No idea may be repeated unchanged merely to seek a different outcome.

## Router rules

The router is initially a research object, not a trading engine.

- A sleeve must earn admission independently before any portfolio combination is evaluated.
- Guards can suppress a sleeve but cannot create a directional sleeve.
- A regime feature must exist at decision time and be stable across train, validation, and holdout.
- Allocation is forbidden until at least two independently surviving sleeves exist.
- Correlation is measured on overlapping forward/out-of-sample windows; different names do not prove different risk.
- `NO_TRADE` is a valid and often preferred router output.

## Automation boundary

Research and validation can continue automatically through the data, discovery, and replay queues. Paper start, live start, coordinator enablement, approval creation, capital changes, and any rerun involving real orders always require a fresh explicit operator GO.

## Required task footer

Every result report must state:

- lifecycle state entered and left;
- evidence gate passed or failed;
- exact failure route if applicable;
- next queued task and owner;
- what the task cannot conclude;
- relevant lessons from `reference/BOTALIN_LESSONS_LEDGER.md`.
