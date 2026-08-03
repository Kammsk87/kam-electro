# TASK-006: Multi-Strategy Router Architecture v0

## Role

Act as the Multi-Strategy Router Architect for Botalin. Work read-only. This is a design task only.

## Scope And Hard Boundaries

- Do not change server state, repository code, configs, coordinator, approvals, KILL state, runners, live or paper systems.
- Do not read or print execution keys.
- Do not start, stop, or restart any process, timer, service, live run, or paper run.
- Do not claim profitability, live readiness, or that a sleeve should trade now.
- Do not create a paper candidate, model ID, or RESET_TS.
- `promising_count` remains zero.

## Known State

- No directed sleeve is live-ready or proven profitable.
- Guards are risk suppression, not alpha.
- Carry, NEWS, AMEL, and wallet flow are evidence lanes, not deployable directional strategies.
- FADE tokenized trend is bad even at ideal fill. Do not revive it through a child variant.
- HTF MA-distance mean reversion failed OOS robustness.
- HTF 4h volatility compression to expansion is waiting for more event-time execution evidence.
- Micro-live can prove mechanics but cannot prove edge.
- Future paper/live work requires separate preregistration and explicit operator GO.

## Objective

Design the pre-registered router architecture that will be implemented only after the canonical causal event dataset exists. It must select among independently validated sleeves or choose `NO_TRADE` across `1m`, `5m`, `15m`, `1h`, `4h`, and `1d`, without learning selection weights from the same evaluation sample.

## Required Output

Write a compact router contract with these sections.

### 1. Causal Market State At Decision Time

Specify a schema of features that are observable at time `t`, including:

- time/session;
- asset and liquidity bucket;
- direction and cross-asset context;
- volatility and market structure across all six timeframes;
- executable liquidity, spread, depth, and data-health;
- funding/OI state where available;
- NEWS and wallet-flow state as intelligence features only.

For every feature, state availability latency, source of truth, and a no-lookahead rule.

### 2. Sleeve Archetypes Worth Searching

Propose only three to five independent archetypes. For each provide:

- payer/mechanism hypothesis;
- allowed regimes and forbidden regimes;
- intended timeframe and holding horizon;
- minimum required data;
- entry/exit research shape, not tuned numeric parameters;
- kill condition;
- overlap/factor risk with other sleeves.

At least one archetype must explicitly be `NO_TRADE`/guard architecture rather than directional alpha.

### 3. Sleeve Admission And No-Trade Rules

Define independent sleeve gates: ideal-fill, executable replay, OOS, matched null, concentration, parameter-neighborhood, and family-overlap checks. Define hard data/execution `NO_TRADE` conditions.

### 4. Nested Walk-Forward And Multiplicity Control

Specify train/validation/holdout/forward chronology, frozen decision points, and the family-wise controls for many sleeves, regimes, timeframes, and variants. The router must not choose the historical winner after looking at outcome data.

### 5. Conflicts, Factors, And Allocation

Define factor labels, correlation/exposure caps, conflict resolution when sleeves disagree, and the rule that allocation begins only after each sleeve independently survives its own gates. Explicitly forbid in-sample performance weighting and dynamic capital scaling from unproven sleeves.

### 6. Claude Code Router Lab Contract

Specify exact required tables/files/fields the later implementation must emit, including at least:

- `decision_time`, data cutoffs and provenance;
- complete regime vector;
- eligible sleeves and rejected sleeves with reason;
- selected action / `NO_TRADE`;
- counterfactual sleeves that were not selected;
- execution assumptions and realized/outcome fields;
- per-sleeve and portfolio OOS statistics;
- multiplicity and concentration diagnostics;
- factor exposures and conflicts;
- machine-readable final verdicts.

### 7. Cannot Conclude

State the limits of the current evidence and what cannot be inferred until the causal dataset, execution replay, and independent forward periods exist.

## Acceptance

- The output is a design/report only.
- It is explicit about evidence hierarchy and no-lookahead.
- It gives a deterministic `NO_TRADE` default.
- It contains no profitability or deployment claim.
- It preserves the distinction among alpha, guard, evidence lane, and execution proof.
- Include `Relevant lessons: LESSON-001, LESSON-003, LESSON-007, LESSON-008, LESSON-021`.
- End with `No new lesson.`
