# TASK-AH-020 - HMM Regime Transition Directional 1h v0

## Objective

Test whether a causal hidden-Markov regime model produces a robust directional
probability shift on liquid crypto perpetuals. This is a fixed statistical
forecast test, not a promise that HMM can predict price or a paper/live task.
It is distinct from prior trend, mean-reversion, breakout, and cross-sectional
rules because it acts only on the inferred transition probability of a latent
market state.

## Safety and data boundary

Use only the committed AH-005A 109-symbol 1h archive and its manifest. No
network, downloads, secrets, exchange/order/account/position endpoints, or
runtime reads. Do not start/stop/change live or paper processes, collectors,
services, timers, coordinator, approval, KILL, config, model_id, RESET_TS, or
promising_count.

Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
LESSON-017, LESSON-019, LESSON-021.

## Data and splits

- Eligible universe: non-tokenized, non-commodity crypto perps with at least
  95% continuous hourly bars in every chronological split. Record exclusions.
- Split every symbol chronologically: train 55%, validation 20%, holdout 15%,
  forward 10%. The model is fit on train only; validation is a fixed diagnostic,
  never a parameter-selection surface. Holdout and forward are examined once.
- Decision-time features are exactly: one-hour log return, rolling six-hour
  realized volatility, 24-hour return, and 24-hour volume z-score. Each is
  normalized using train-only location/scale, with causal rolling values only.
  Missing feature rows fail closed.

## Frozen model and forecast

1. Fit a four-state diagonal-Gaussian HMM per eligible symbol on train-only
   features using a recorded deterministic seed and an explicit convergence
   limit. State labels are ordered only for reporting; no future outcome may
   relabel a state.
2. At each completed hour `t`, use the filtered posterior through `t` and the
   train-fit transition matrix to calculate `P(next state | observations <= t)`.
3. Define state directional score from the train-only mean next-hour return for
   each state, estimated using only transitions fully contained in train.
4. Long when probability-weighted score is at least `+0.15` train-standard-
   deviations and short when at most `-0.15`; otherwise no trade. Entry is the
   next independent hourly open and exit exactly four completed hours later.
5. Do not add stop, target, regime filter, news, wallet, funding, volume
   condition, cross-sectional ranking, or post-hoc state interpretation.

## Robustness neighbours

Do not optimize. Report only the frozen neighbours: three-state and five-state
HMMs, retaining every other feature, threshold, entry, and exit rule.

## Economics and validation

- Report ideal-fill first, then apply the repository conservative one-leg
  round-trip cost and a double-cost tier; record the exact constant/provenance.
- Generate at least 1,000 matched-null samples with identical symbols,
  timestamps, directions, holding profile, and fixed seed.
- Report validation, holdout, forward, and combined OOS: N, days, symbols,
  mean, median, win rate, p5/p95, MFE/MAE, drawdown, cost tiers, null p-value,
  transition/confidence distribution, remove-best-symbol/three-symbols/day,
  and PnL concentration.
- Explicitly audit event overlap with HTF trend continuation, HTF
  mean-reversion, AH-007 price-action families, AH-011 cross-sectional ranking,
  and session handoff. Stop as `DUPLICATE_OR_OVERLAP` if the HMM events are
  merely a renamed existing directional trigger.

Only return `CANDIDATE_PASSPORT_DRAFT` when both holdout and forward each have
at least 100 trades across five symbols and ten calendar days, combined OOS
spans at least 30 days, net mean and median are positive after cost, median is
non-negative after double cost, null p < 0.05, results remain positive after
remove-best-symbol and remove-best-day, no symbol exceeds 25% of PnL, and both
state-count neighbours have non-negative net median. Otherwise use
`OOS_FAIL_REJECT_FAMILY`, `ROBUSTNESS_FAIL_DEPRIORITIZE`,
`DUPLICATE_OR_OVERLAP`, or `DATA_INADEQUATE`.

## Deliverables

1. `scripts/analysis/ah020_hmm_regime_transition_directional_1h.mjs`
2. `scripts/test_ah020_hmm_regime_transition_directional_1h.mjs`
3. `reference/AH020_HMM_REGIME_TRANSITION_DIRECTIONAL_1H_PROTOCOL_2026-08-02.md`
4. `data/ah020_hmm_regime_transition_directional_1h_2026-08-02.{csv,json}`
5. `tasks/results/TASK-AH-020-HMM-REGIME-TRANSITION-DIRECTIONAL-1H-V0-RESULT.md`

Run syntax, deterministic unit tests, smoke, static no-trading scan, lessons
checker, and full replay; then commit/push only the allowlisted deliverables.
State clearly that this cannot conclude paper or live readiness.
