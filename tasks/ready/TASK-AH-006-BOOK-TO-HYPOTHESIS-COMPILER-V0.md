# TASK-AH-006: Book-to-Hypothesis Compiler v0

## Purpose

Turn the operator-provided trading-book library into falsifiable research hypotheses.
This is a discovery task only. It must not estimate a trade win probability from prose,
enable a runner, or create a paper/live candidate.

## Lifecycle

Stage: `DISCOVERY`.

Next permitted transition: a hypothesis may move only to
`CANDIDATE_PASSPORT`, after a separate data-feasibility and overlap review.

## Preconditions

1. The operator provides a local source directory containing the books or extracted
   text, or explicitly points to its existing location.
2. The sources must be readable without credentials and may not contain exchange keys,
   account exports, or private personal data.
3. If the source directory is absent, write `SOURCE_LIBRARY_UNAVAILABLE` and stop.

## Allowed Files

- `scripts/analysis/book_to_hypothesis_compiler.mjs`
- `scripts/test_book_to_hypothesis_compiler.mjs`
- `reference/BOOK_TO_HYPOTHESIS_COMPILER_PROTOCOL_2026-07-30.md`
- `data/book_hypothesis_inventory_2026-07-30.json`
- `data/book_hypothesis_inventory_2026-07-30.csv`
- `tasks/results/TASK-AH-006-BOOK-TO-HYPOTHESIS-COMPILER-V0-RESULT.md`

## Non-Negotiable Rules

- Read-only access to supplied source documents.
- No market-data downloads, no exchange endpoints, no keys, no paper/live runners,
  no services/timers, and no coordinator/approval/KILL/config changes.
- Do not modify any existing trading or research runner.
- Do not claim a positive expectancy, win rate, alpha, or live readiness.
- Reference `docs/BOTALIN_MASTER_ORCHESTRATION_PLAN_2026-07-30.md`,
  `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, and relevant lessons before work.

## Required Output Per Hypothesis

Each extracted idea must become a structured record with:

- `hypothesis_id`, source title/location, and a short paraphrase;
- observable market condition and proposed market regime;
- instruments, timeframe, trigger, side, entry reference, invalidation, exit horizon;
- claimed causal mechanism, competing explanation, and expected failure mode;
- required data fields and whether Botalin already has them;
- overlap assessment against rejected/active families;
- `not_tested` evidence label and exact next permitted test.

The compiler must reject prose that cannot specify a falsifiable trigger and label it
`NON_FALSIFIABLE_BOOK_ADVICE` rather than inventing a rule.

## Selection

Produce no more than five independent hypotheses. Prefer mechanisms that are not
renamed FADE, HTF mean-reversion, failed-breakout, carry, direct wallet-follow, or
the rejected price-shock family. A book idea may be retained only as
`DISCOVERY_NOT_PROOF`.

## Verification

- `node --check` for the compiler and tests.
- Unit tests covering: valid extraction, missing required field, non-falsifiable prose,
  overlap quarantine, and absence of any trading/exchange endpoint.
- Static scan proves analysis code has no order, position, execution, or credential use.
- Results report names relevant lessons and states what the task cannot conclude.

## Acceptance

Commit only the allowed files. The result must state either:

- `SOURCE_LIBRARY_UNAVAILABLE`, or
- inventory count, rejected prose count, overlap count, and the at-most-five
  `DISCOVERY_NOT_PROOF` hypotheses with their next tests.
