# TASK-AH-046 - Parent Order Flow Imbalance v0

## Objective

Test whether aggressive order-flow imbalance explains near-term direction once child
fills are collapsed into the parent decisions that produced them. An exploratory probe
on one symbol-day found that 111,140 child prints correspond to 26,263 parent orders,
that 23% of parents are multi-level sweeps carrying 74.5% of notional, and that the
signed imbalance of all parent orders over a five-minute bucket had a mean forward move
of +1.96 bps against an 11 bps cost floor. That probe is not evidence: one symbol, one
day, n=288, t=1.74, no splits, no null, no multiplicity control. This task runs the same
frozen rule over the full archive with the complete gate battery.

Research only. No network beyond read-only reads of the existing archive, no parameter
search, no live/paper, services, collectors, configs, coordinator, approval, KILL,
secrets, orders, accounts, or positions.

## Lifecycle

Stage: `DISCOVERY`. Next permitted transition is `CANDIDATE_PASSPORT` only if every gate
below passes. Otherwise the result is one of `DATA_INADEQUATE`,
`OOS_FAIL_REJECT_FAMILY`, `ROBUSTNESS_FAIL_DEPRIORITIZE`, or `DUPLICATE_OR_OVERLAP`.

Relevant lessons: LESSON-003, LESSON-005, LESSON-011, LESSON-013, LESSON-016,
LESSON-019, LESSON-021.

## Frozen before any full-sample look

These values are fixed by this contract. They must not be changed after any result is
seen; a change makes a new task with a new identity.

1. Parent reconstruction: consecutive child prints, same aggressor side, gap at most
   `100 ms`, and price not moving against the aggressor. Two fixed neighbours at `50 ms`
   and `200 ms`, evaluated on validation only.
2. Bucket and horizon: five-minute UTC buckets; the signal is read at bucket close and
   the outcome is the mid-to-mid move over the next five-minute bucket.
3. Signal: `sign(sum(parent buy notional) - sum(parent sell notional))` over all parent
   orders in the bucket. Not the large-parent subset: the probe found the top 1% of
   parents carry no directional information at all (t=0.08).
4. Costs: 11 bps round trip, and a 22 bps double-cost stress.
5. Splits: chronological 55/20/15/10 by bucket, purge one bucket, embargo three buckets.
6. Matched null: 1,000 samples, same symbol, same time-of-day bucket, same direction,
   fixed seed, two-sided.

## Mandatory data gate

Per symbol, inventory decision-time coverage before any signal is computed:

1. Aggressor-classified trade prints with `ts`, `px`, `qty`, `side`. Candle direction,
   close-to-close return, tick-rule inference and OHLCV volume splits are refused.
2. Book snapshots sufficient to price a mid at each bucket boundary.
3. A causally usable next-bucket mid reference.

Exclude every incomplete bucket and report why. If any required field is absent, or the
independent sample cannot meet the gates below, return `DATA_INADEQUATE`.

## Acceptance

`CANDIDATE_PASSPORT_DRAFT` requires all of: holdout and forward each at least 100
buckets across at least 5 symbols and at least 10 days; positive net mean and median
after 11 bps in both; non-negative median at 22 bps; two-sided null p < 0.05; positive
after remove-best-symbol and after remove-best-day; no symbol above 25% of absolute
contribution; both neighbour burst gaps non-negative on validation; and an exact ledger
overlap measured against the rejected raw-momentum, breakout, wick, AMEL and liquidity
guard families. An unmeasured overlap blocks the draft.

The report must state the measured gap to the cost floor explicitly, and must not
describe a sub-cost edge as a candidate.

## Deliverables

1. `scripts/analysis/ah046_parent_order_flow_imbalance.mjs`
2. `scripts/test_ah046_parent_order_flow_imbalance.mjs`
3. `reference/AH046_PARENT_ORDER_FLOW_IMBALANCE_PROTOCOL_2026-08-03.md`
4. `data/ah046_parent_order_flow_imbalance_2026-08-03.{csv,json}`
5. `tasks/results/TASK-AH-046-PARENT-ORDER-FLOW-IMBALANCE-V0-RESULT.md`

Run syntax, deterministic unit tests, static no-trading scan, the full replay where the
data gate permits, and `git diff --check`. Commit only the allowlisted deliverables.
Push requires separate explicit approval.
