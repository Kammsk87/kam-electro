# TASK-007 - NEWS-LAB Causal Sleeve Analysis v0

## Goal

Determine, read-only, whether the existing Botalin NEWS runner can support a distinct causal sleeve for the future multi-strategy router. This is a falsification task: distinguish a tradeable event mechanism from an intelligence-only or no-trade guard.

## Lifecycle

`DATA_HEALTH -> DISCOVERY`. This task may nominate only `CANDIDATE_PASSPORT` work. It may not create a candidate, paper observer, `RESET_TS`, promotion, or live proposal.

## Preconditions

Read `CLAUDE.md`, `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, the project constitution if present on the server, and the relevant existing NEWS, AMEL, wallet-flow, and lessons documents. Relevant lessons include `LESSON-001`, `LESSON-003`, `LESSON-005`, `LESSON-016`, `LESSON-017`, and `LESSON-021`.

## Scope and safety

Work read-only against `/opt/botalin-edge`. Do not read secrets, start or stop a process, call exchange endpoints, change any runner/config/coordinator/approval/KILL state, or write runtime data. Do not create a paper or live candidate.

## Required analysis

1. Locate server-native NEWS event records and identify the authoritative timestamp. Treat `first_seen_at` as the event-time anchor whenever `published_at` is future-dated or otherwise unreliable.
2. Inspect existing NEWS/AMEL/wallet reports and specs only after locating raw sources. Reports are context, not source truth.
3. Produce a coverage and data-quality table: event count, category, symbol attribution, timestamps, duplicates, missingness, first-seen latency, and which event types have enough observations.
4. For each news category, state a concrete forced-payer thesis or reject it. Examples to examine include rule changes, leverage/risk-limit changes, delistings, maintenance, listings, and operational interruptions.
5. Test only causal event-time designs: immediate response, delayed response, and no-trade/guard response. Entry reference, side, exit, holding windows, benchmark, and kill condition must be frozen before outcomes are examined.
6. Use all available outcome windows from 1m through 1d. Compare every directional proposal with matched controls by symbol, time-of-day, and contemporaneous market regime where data permits.
7. Account for spread/depth/execution coverage, explicit proxy labels, and missing-data handling. Do not infer fillability from candle close alone.
8. Audit overlap with FADE, carry, AMEL event, HTF-volatility, wallet/crowd, and existing NEWS families. A renamed duplicate is not a new sleeve.
9. Return one strict verdict for each category: `CANDIDATE_PASSPORT_NOMINATION`, `GUARD_ONLY`, `NEEDS_MORE_LOGGING`, `DATA_BAD`, `DUPLICATE_OR_OVERLAP`, or `REJECT`.

## Deliverables

- `reference/NEWS_LAB_CAUSAL_SLEEVE_ANALYSIS_2026-07-29.md`
- `data/news_lab_causal_sleeve_matrix_2026-07-29.csv`
- `tasks/results/TASK-007-NEWS-LAB-CAUSAL-SLEEVE-ANALYSIS-V0-RESULT.md`

The report must name the exact next read-only task if a category is sufficiently supported; otherwise name the smallest missing logging or tagging change. It must state explicitly what it cannot conclude about profitability, paper readiness, or live readiness.

## Acceptance

- Read-only evidence only; no processes or runtime state changed.
- Source provenance and event-time semantics are explicit.
- No outcome field is used to decide entry.
- Every directional finding has matched controls, cost/execution caveats, and overlap review.
- `promising_count` remains zero.
- Commit and push only the three allowlisted deliverables.
