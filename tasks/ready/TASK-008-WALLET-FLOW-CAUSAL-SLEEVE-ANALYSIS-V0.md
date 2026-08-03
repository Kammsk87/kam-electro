# TASK-008 - Wallet-Flow Causal Sleeve Analysis v0

## Goal

Determine, read-only, whether public Hyperliquid wallet-flow plus crowd data can support a distinct causal sleeve for the future multi-strategy router, or only a guard/intelligence feature. This is explicitly not copy trading.

## Lifecycle

`DATA_HEALTH -> DISCOVERY`. This task may nominate only `CANDIDATE_PASSPORT` work. It may not create a candidate, paper observer, `RESET_TS`, promotion, or live proposal.

## Preconditions

Read `CLAUDE.md`, `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, the project constitution if present on the server, the wallet-flow/AMEL join reports, and the relevant lessons. Relevant lessons include `LESSON-003`, `LESSON-008`, `LESSON-011`, `LESSON-016`, `LESSON-017`, and `LESSON-021`.

## Scope and safety

Work read-only against `/opt/botalin-edge`. Do not access keys, call execution endpoints, modify the watchlist, start/stop watcher processes, change any runner/config/coordinator/approval/KILL state, or write runtime data. Do not create a paper or live candidate.

## Required analysis

1. Locate primary wallet position/flow logs and the related aggregate crowd series. Verify timestamp semantics, source provenance, wallet coverage, sampling cadence, symbol normalization, and any data gaps.
2. Separate hypotheses that can be tested causally:
   - wallet lead/lag around independently detected events;
   - wallet-crowd divergence as a no-trade guard;
   - cross-wallet consensus with a pre-declared concentration limit;
   - delayed de-risking/position-reduction effects.
   Do not use an individual wallet's current position as a copy signal.
3. Evaluate immediate, delayed, and no-trade formulations over 1m, 5m, 15m, 1h, 4h, and 1d windows where coverage exists. Establish direction only from information known at the decision timestamp.
4. Build an explicit **economic follow-replay**. This is a research calculation, not automated copy trading: at the first public watcher observation of a qualifying change, consensus, divergence, or de-risking event, simulate a hypothetical entry only after fixed observation delays of 1m, 5m, and 15m. For each formulation report gross return, net return after pre-declared venue/size cost assumptions, median, mean, win rate, max adverse excursion, symbol/day concentration, and a buy-and-hold or matched-time baseline.
   - Test `FOLLOW_PUBLIC_CHANGE`, `FADE_PUBLIC_CHANGE`, `CONSENSUS_FOLLOW`, and `DE_RISK_FOLLOW` separately.
   - The simulated entry timestamp must never be the wallet's unobservable original fill; it must be the first timestamp the watcher could have exposed the information.
   - Missing public observation, symbol mapping, executable venue, or cost evidence must fail closed and be counted, not discarded.
   - Report economics at $7, $200, and $1k where execution evidence exists; otherwise label the tier `UNSUPPORTED`.
5. Compare every directional formulation against matched controls by symbol, time-of-day, market regime, and aggregate crowd state. Include random/matched-null testing where sample size permits.
6. Enforce cross-sectional robustness: remove each wallet in turn, remove best symbol/day, test both net-long and net-short conditions, and identify selection bias from the current watchlist.
7. Account for execution and universe limits: Hyperliquid observations versus any intended venue, available order-book evidence, delays, and a clear distinction between directional alpha and guard value.
8. Audit overlap with existing AMEL, NEWS, carry, FADE, HTF, and crowd families. A regime feature may be `GUARD_ONLY`; it is not a trade sleeve without independent directional evidence.
9. Return a strict per-hypothesis verdict: `CANDIDATE_PASSPORT_NOMINATION`, `GUARD_ONLY`, `NEEDS_MORE_LOGGING`, `DATA_BAD`, `DUPLICATE_OR_OVERLAP`, or `REJECT`.

## Deliverables

- `reference/WALLET_FLOW_CAUSAL_SLEEVE_ANALYSIS_2026-07-29.md`
- `data/wallet_flow_causal_sleeve_matrix_2026-07-29.csv`
- `tasks/results/TASK-008-WALLET-FLOW-CAUSAL-SLEEVE-ANALYSIS-V0-RESULT.md`

The report must name the exact next read-only task if evidence is sufficient; otherwise the smallest missing coverage/logging requirement. It must explicitly say that no wallet was endorsed, copied, or found profitable.

The CSV must include a separate economic scorecard for every `hypothesis × public_delay × horizon × capital_tier`, including unsupported/missing-data rows.

## Acceptance

- Read-only evidence only; no processes or runtime state changed.
- Event-time information is separated from outcomes.
- Directional results include the economic follow-replay, matched controls, concentration/removal tests, and execution caveats.
- No copy-trading conclusion.
- `promising_count` remains zero.
- Commit and push only the three allowlisted deliverables.
