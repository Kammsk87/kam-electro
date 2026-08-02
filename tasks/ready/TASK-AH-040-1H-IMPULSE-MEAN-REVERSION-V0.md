# TASK-AH-040 - 1H Impulse Mean-Reversion v0

Offline fixed discovery only. Use committed AH-005A 109-symbol 1h OHLCV
archive; no network, parameter search, runtime/service/collector/config change,
live/paper, secrets, orders, accounts, or positions.

Frozen rule: impulse long setup is close at least 2.5 ATR14 below close five
bars earlier, volume >=2x prior-20 mean, RSI14 <25. Wait for the next completed
bar to close above the impulse midpoint, then enter next open. Mirror for
short: +2.5 ATR, 2x volume, RSI >75, confirmation close below midpoint. Stop
one ATR beyond impulse extreme; target is earlier of pre-impulse five-bar close
and 2R; timeout six bars; worst-case same-OHLC stop/target ordering; one active
trade per symbol. Exclude a prior multi-bar move >5 ATR and BTC same-direction
move >2 ATR. No event-label gate: labels are not causal/complete in AH-005A.

Use chronological 55/20/15/10, >=95% split coverage, 11/22 bps costs. Report
all split/OOS N, symbols, days, mean/median, WR, tails, DD, exits; 1,000 matched
time/symbol nulls; remove-best symbol/day; concentration; fixed neighbours
2.25/2.75 ATR impulse. Exact timestamp-overlap if ledgers exist, else
`OVERLAP_UNAVAILABLE` and no promotion. A passport draft additionally needs
positive holdout+forward net mean/median, null p<.05, nonnegative double-cost
median, robust removes/neighbours, 100 trades per OOS part, 5 symbols, 10 days
per part, 30 combined days, <=25% symbol PnL share. Otherwise non-promotion.

Only create/modify:
1. `scripts/analysis/ah040_1h_impulse_mean_reversion.mjs`
2. `scripts/test_ah040_1h_impulse_mean_reversion.mjs`
3. `reference/AH040_1H_IMPULSE_MEAN_REVERSION_PROTOCOL_2026-08-03.md`
4. `data/ah040_1h_impulse_mean_reversion_2026-08-03.{csv,json}`
5. `tasks/results/TASK-AH-040-1H-IMPULSE-MEAN-REVERSION-V0-RESULT.md`

Run syntax, deterministic tests, static scan, lessons checker, replay,
gitleaks, and diff check. Commit only allowlisted files. Push needs separate
explicit remote approval. Finish with verdict and exact artifact paths.
