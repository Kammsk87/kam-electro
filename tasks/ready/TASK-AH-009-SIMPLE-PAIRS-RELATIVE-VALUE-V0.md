# TASK-AH-009: Simple Pairs Relative-Value v0

## Objective

Test whether a small set of preselected, economically similar crypto pairs has
a causal, net-of-cost relative-price convergence effect.

## Lifecycle

`DISCOVERY -> IDEAL_FILL_AND_OOS` only. No paper/live transition.

## Preconditions

- AH-005A must report `DATA_READY_FOR_FROZEN_AH005`.
- Read governance, lifecycle, the rejection inventory, and the AH-008 result.
- This is not a revival of rejected BTC-beta residual re-anchor: it must use
  explicit pair selection and simultaneous long/short legs.

## Frozen Pair Selection

Pairs may be selected only on the training section from liquid, non-tokenized
perps using one of: same-sector membership or minimum normalized-price distance.
Freeze at most 10 pairs before validation. Candidates must have sufficient
simultaneous bars and both legs tradable.

## Frozen Trade Rule

At a weekly decision time, normalise both pair prices from a causal 60-day
reference. If their relative gap exceeds a training-selected threshold from
{1.5%, 2.5%, 4.0%}, long the laggard and short the leader in equal dollar legs.
Exit at convergence, 10 trading days, or a fixed adverse-gap stop. No indicators,
no coin-specific narrative after results, and no re-selection after validation.

## Validation

- Chronological train 55%, validation 20%, holdout 15%, forward 10%.
- Costs on both legs; repeat at double costs.
- Matched pair/time null, remove-best-pair/month, concentration, BTC beta,
  pair turnover, and correlation-break checks.
- Pass only if holdout and forward mean+median are positive after double cost,
  >=5 pairs, >=100 events, and removing the best pair remains positive.

## Allowed Files

- `scripts/analysis/simple_pairs_relative_value_v0.mjs`
- `scripts/test_simple_pairs_relative_value_v0.mjs`
- `reference/SIMPLE_PAIRS_RELATIVE_VALUE_V0_2026-07-30.md`
- `data/simple_pairs_relative_value_v0_2026-07-30.{json,csv}`
- `tasks/results/TASK-AH-009-SIMPLE-PAIRS-RELATIVE-VALUE-V0-RESULT.md`

## Safety

Existing data only. No network, keys, exchange endpoints, paper/live, runner,
service, coordinator, approval, KILL, configuration, model-ID, or RESET_TS change.
`promising_count=0`. Commit only allowed files.
