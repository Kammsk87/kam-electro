# TASK-AH-015 - NEWS Tagger Risk-Limit v0: Build, Test, Do Not Activate

## Objective

Prepare a versioned forward-only NEWS tagger rule for the currently missed
forced-deleveraging events: risk-limit/leverage adjustments and maintenance.
The task builds and tests the classifier only. It must not install, activate,
reload, restart, or otherwise alter the active NEWS recorder.

## Evidence and safety boundary

Read source-native NEWS events and tagger code. Do not start/stop/reload any
process, timer, or service; do not modify active configuration, runtime logs,
coordinator, approval, KILL, model_id, RESET_TS, or promising_count. Do not
call exchange endpoints or read secrets. No backfill, rewrite, or relabel of
existing append-only records.

Relevant lessons: LESSON-003, LESSON-005, LESSON-013, LESSON-015,
LESSON-016, LESSON-017, LESSON-019, LESSON-021.

## Required work

1. Locate the active NEWS tagger source and identify its current categories,
   version identifier, and exact service-owned file path without changing it.
2. Build a pure, versioned candidate classifier module outside the active
   runtime path. Its output categories are:
   - `RISK_LIMIT_DELEVERAGE` for confirmed risk-limit or leverage-limit
     reductions/adjustments that name affected perpetual contracts;
   - `MAINTENANCE_INTERRUPT` for maintenance or operational interruption that
     names affected contracts;
   - `UNKNOWN_OR_AMBIGUOUS` when side, contract, or enforcement cannot be
     established.
3. Use a fixed labelled fixture set drawn from existing `other` headlines plus
   adversarial false positives. Explicitly reject generic AI, marketing,
   listing, funding, and harmless policy text.
4. Preserve the authoritative `first_seen_at` semantics. The pure module must
   not derive trade direction or outcomes and must not inspect price data.
5. Produce a migration/activation plan with an explicit forward-only boundary,
   versioned record schema, rollback procedure, and post-activation data-quality
   checks. The plan must state that activation is a separate operator-GO because
   the active recorder is an immutable running experiment.

## Deliverables

1. `scripts/analysis/news_tagger_risk_limit_v0.mjs` (pure candidate module)
2. `scripts/test_news_tagger_risk_limit_v0.mjs`
3. `reference/NEWS_TAGGER_RISK_LIMIT_V0_ACTIVATION_PLAN_2026-07-30.md`
4. `tasks/results/TASK-AH-015-NEWS-TAGGER-RISK-LIMIT-V0-BUILD-NOT-ACTIVATE-RESULT.md`

Run syntax, deterministic unit tests, smoke, static scan for network,
secrets/process/service mutation, lessons checker, then commit/push only these
four deliverables. The final verdict must be `BUILD_READY_AWAIT_OPERATOR_GO` or
`DATA_BAD`; it cannot claim a strategy, candidate, paper readiness, or live
readiness.
