# TASK-AH-041 - Triad Structural Strategies v0

Research only. No network, parameter search, live/paper, services, collectors,
configs, coordinator, approval, KILL, secrets, orders, accounts, or positions.
Use only committed local/canonical project datasets. Do not substitute missing
data with candles. Emit three independent verdicts; never pool PnL.

## Fixed Members

1. `CS_RELATIVE_STRENGTH_24H`: on the frozen AH-005A liquid universe, daily
7-day return minus universe median; long top quintile/short bottom quintile,
equal notional and market-neutral gross; hold 24h; exclude <30d history or
single-day move >25%. Include both-leg costs and shuffled-rank null.
2. `FUNDING_PERSISTENCE_CARRY`: only with causal synchronized spot, perpetual,
funding publication time, borrow, basis and two-leg execution data. Fixed
threshold must cover all costs. Missing any field is `DATA_INADEQUATE`.
3. `NEWS_FORCED_FLOW_REACTION`: only with causal `first_seen` news time, event
label, aligned price and execution data. Predeclare one mechanical direction,
entry/exit before inspection; missing causal labels/execution data is
`DATA_INADEQUATE`.

For every executable member use chronological 55/20/15/10, frozen costs,
holdout+forward metrics, 1,000 matched nulls, remove-best symbol/day/event,
concentration, two fixed neighbours, and exact ledger overlap. Positive pockets
do not promote: require separate robust OOS and all data gates. Existing
rejected breakout, raw momentum, wallet-follow, pairs and HMM families are
blocked as duplicates.

Only modify:
1. `scripts/analysis/ah041_triad_structural_strategies.mjs`
2. `scripts/test_ah041_triad_structural_strategies.mjs`
3. `reference/AH041_TRIAD_STRUCTURAL_STRATEGIES_PROTOCOL_2026-08-03.md`
4. `data/ah041_triad_structural_strategies_2026-08-03.{csv,json}`
5. `tasks/results/TASK-AH-041-TRIAD-STRUCTURAL-STRATEGIES-V0-RESULT.md`

Run syntax, deterministic tests, static scan, full replay, gitleaks and diff
check. Commit only allowlisted files. Push needs separate explicit approval.
