# Botalin AI Handoff — 2026-07-22

Audience: another AI/agent taking over analysis of the Botalin trading research stack.

Repository: /opt/botalin-edge
Current HEAD at handoff: 8c1deda
Server: 167.233.205.87, Ubuntu, UTC clock
Hard rule: do not print secrets. Existing process listings may contain env secrets; redact them in any report.

## Executive Summary

Over the last working block, the system moved from single-strategy live debugging into a broader paper-factory pipeline:

1. Live execution plumbing for tokenized-stock FADE was validated through tiny real orders.
2. REST fill detection was proven unreliable on this account due to readback lag (observed ~9s to ~63s). Private WebSocket fill feed became mandatory.
3. WS-driven hold-to-exit path was built and validated end-to-end on small real positions.
4. A true-alpha FADE trend live series found that off-hours tokenized SOXL behavior confounded the result; fade-short in off-hours lost, raw-long won, so regime gating became required.
5. A paper factory conveyor was built and launched hourly, paper-only, with strict no-orders/no-keys/promising=0 invariants.
6. Candidate Miner was added so the factory now emits child-model drafts, not only evaluates a fixed list.
7. Paper child models were added for US-hours pullback and slippage-cap variants.
8. Shadow slippage instrumentation was added so future shadow rows can support slippage-cap paper children.

Do not claim any strategy is profitable. The only true statement is: execution plumbing is much stronger now; several paper hypotheses are collecting forward evidence; live FADE trend still needs more/cleaner evidence.

## Current Live Status

As of this handoff:

- One live edge-series runner process is present (2 process lines: wrapper + node).
- It is configured for FADE_TOKENIZED_TREND_US_HOURS_v1, market entry, US-hours only, coordinator required.
- Coordinator status with LIVE_COORDINATOR_GO=OPERATOR_APPROVED:
  - enabled=true
  - halt=false
  - active_profile=current_small_balance
  - caps: max_positions=1, max_notional=7, max_loss=8
  - active_leases=[]
- Coordinator status without GO shows enabled=false, which is expected; the runner itself has the GO env.
- Never paste the full process command because it includes API/TG secrets.

Live runner intended config, redacted:

- EDGE_CONFIG_SCOPE=fade-trend
- EDGE_TIME_WINDOW=us-hours
- SMOKE_ENTRY_MODE=market
- SMOKE_MAX_SPREAD_BPS=8
- EDGE_TARGET_FILLED=5
- EDGE_MAX_FILLED_LOSSES=2
- EDGE_HOLD_CAP_MS=5400000 (90m)
- EDGE_SERIES_LOSS_CAP=8
- EDGE_SLIPPAGE_THR_BPS=8
- COORDINATOR_REQUIRED=1
- LIVE_COORDINATOR_GO=OPERATOR_APPROVED
- FADE_TINY_SMOKE_GO=OPERATOR_APPROVED
- BYBIT_WS_DRYRUN_GO=OPERATOR_APPROVED

Hard live boundaries:

- No averaging/scaling.
- Max concurrent = 1 via coordinator profile.
- Lease required before any order.
- Release lease only after flat.
- Anomaly -> coordinator HALT + TG urgent.
- No off-hours entry.
- Do not start a second batch automatically.

## Key Live Execution Lessons

### REST fill detection retired

Multiple tiny-smoke attempts showed that REST order/position/execution readback can lag enough to miss real fills:

- Earlier lags: ~9s to ~28s.
- Pilot lag: ~63s.
- Consequence: REST-only executor falsely declared NO_FILL/FLAT while a real position existed.
- External delayed dual flat-verify caught every orphan, but safety net is not strategy logic.

Conclusion: REST is fallback/reconciliation only. Private WS execution feed is required for live strategy trades.

### WS path validated

A private Bybit WS fill-feed was built and tested:

- Auth/sub PASS with sub-second ack (~900ms in test).
- WS execution/order/position topics normalized.
- FillTracker handles partials, duplicates, out-of-order events.
- WS-driven executor starts hold immediately on fill.
- Disconnect while in position -> STOPPED_ANOMALY / fallback close.

### Side semantics fixed

FADE signals can carry raw side labels that are misleading for economic direction. The executor now resolves economic side from level geometry:

- LONG geometry: stop < entry < t1 <= t2
- SHORT geometry: stop > entry > t1 >= t2
- raw Buy + short geometry gets remapped to economic SHORT / Sell.
- Bad geometry is blocked, not guessed.

## Live Result Summary

Do not compress this into a profitability claim.

Completed real-money observations before the current runner:

- v2 retry batch on weaker/raw-long config: 3 filled, net about +0.191, exits target/target/breakeven. This was not the true fade-short config and should not validate FADE alpha.
- true-alpha fade-short prior batch: 4 filled shorts, all negative or near-zero, net about -0.1398, stopped by slippage safety. This was correct economic side, but mostly off-hours confounded by SOXL perp upward drift.
- true-alpha one-short milestone: 1 economic SHORT, max_hold timeout, net about +0.026, mechanics proven but edge not measured.

Interpretation:

- Execution mechanics: broadly proven with WS + terminal flat.
- Edge: not proven.
- Off-hours is a major confound for tokenized stock perps.
- US-hours-only retest is the clean next live test.

## Paper Factory Current Status

Timer:

- botalin-auto-paper-factory.timer active.
- Last scan around 2026-07-22T11:17-11:34 UTC during this work block.
- Hourly cadence.

Factory invariants:

- orders=NONE
- execution_keys=NOT_READ
- promising_count=0
- reset_ts_immutable=true
- sandbox=auto:paper:

Current tally after latest scan:

- generated=12
- paper_active=7
- guard=2
- needs_data=2
- rejected=1
- killed=0
- promising_count=0

## Paper Active Candidates

### FADE_TOKENIZED_PULLBACK

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-20T20:11:39.344Z
- Forward: N=22, days=3, net_taker=+0.1381, wr=54.5
- Flags: ONE_SYMBOL_POCKET, SIDE_INCONSISTENT, SLIPPAGE_RISK, LOW_N
- Interpretation: weak/fragile parent; source of child ideas, not a promotion candidate.

### FADE_TOKENIZED_PULLBACK_US_HOURS_v1

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-22T09:46:32.545Z
- Filter: pullback, fade, SOXL/LAB, US-hours only, exact_reset, dedup_setup
- Forward: N=0 at launch snapshot
- In-sample/kill context: US-hours all-history looked positive but thin (N=14), so launched as paper_observe_low_n=true
- Interpretation: clean child to test whether US-hours removes off-hours noise.

### FADE_TOKENIZED_VWAP

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-20T20:11:39.344Z
- Forward: N=210, days=3, net_taker=+0.3465, wr=83.8
- Flags: SIDE_INCONSISTENT, OFFHOURS_ONLY, SLIPPAGE_RISK
- Interpretation: headline looks good, but off-hours/slippage confounds are serious.

### FADE_TOKENIZED_VWAP_SLIPCAP_v1

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-22T11:17:19.049Z
- Filter: vwap-reversion, fade, SOXL/SNDK/MU/LAB, exact_reset, dedup_setup, max_slippage_vs_signal_bps=35
- At launch it was SLIPPAGE_GATE_PENDING_INSTRUMENTATION because old shadow rows lacked slippage fields.
- After shadow instrumentation restart, future rows should include slippage fields.
- Interpretation: this is a paper observer for whether a 35bps slippage cap preserves VWAP edge.

### FADE_TOKENIZED_TREND_SLIPCAP_v1

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-22T11:34:04.153Z
- Filter: trend, fade, SOXL/SNDK/MU/LAB, exact_reset, dedup_setup, max_slippage_vs_signal_bps=35
- At launch: pending instrumentation until new rows after shadow restart.
- Interpretation: tests whether trend fade edge survives if late/chasing entries are filtered.

### SOXL_OFFHOURS_DRIFT_LONG_v1

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-21T10:45:40.204Z
- Forward at snapshot: N=30, days=2, net about +0.0742
- Separate strategy, not FADE.
- Thesis: off-hours SOXL perp follows crypto risk-on while US stock is closed.
- Needs 14 days / sufficient N; do not infer from early positive rows.

### BYBIT_CARRY_SNX_GRT_WATCH

- Status: PAPER_ACTIVE / NEEDS_DATA
- RESET_TS: 2026-07-20T20:11:39.344Z
- Funding days around 11/14 at handoff.
- Earlier finding: SNX near-miss, GRT weak/weaken.
- No live carry action.

## Guards / Waiting / Rejected

- ORACLE_VOL_GUARD: GUARD_CANDIDATE
- OI_PRICE_DIVERGENCE_VOL_GUARD: GUARD_CANDIDATE
- AMBUSH_B_OB_GATED: NEEDS_DATA, blocker is OB coverage.
- HURST_GATED_FADE_TREND_v1: WAIT, precondition FADE trend survival around 2026-07-25.
- FUND_EXTREME_FADE: DEDUP_REJECT due protected cohort/payer_family.

## Candidate Miner

Implemented in:

- lib/candidate_miner.mjs
- scripts/test_candidate_miner.mjs

Integrated into:

- scripts/autonomous_paper_factory_conveyor.mjs
- data/auto_paper_factory_status.json under candidate_miner
- logs/paper_factory/candidate_miner/drafts.json
- logs/paper_factory/candidate_miner/scans.jsonl

Behavior:

- Draft-only.
- Does not mutate config.
- Does not launch paper.
- Does not place orders.
- promising=false.

Draft rules:

- US_HOURS_STRONGER
- ONE_SYMBOL_POCKET
- NEGATIVE_SYMBOL_FILTER
- SLIPPAGE_RISK

Current queue after converting both slipcap drafts:

- draft_count=0
- drafts=[]

Important: Candidate Miner is a source of operator-review ideas, not an auto-launcher.

## Slippage Instrumentation

Implemented in:

- scripts/shadow_runner.mjs
- scripts/test_shadow_slippage_instrumentation.mjs
- reference/FADE_TOKENIZED_SLIPPAGE_INSTRUMENTATION_REVIEW_2026-07-22.md

New additive fields in future shadow_trades rows:

- signal_price
- entry_fill_price
- slippage_vs_signal_bps
- slippage_model

For shadow fills:

- slippage_vs_signal_bps=0
- slippage_model=shadow_entry_touch

Important limitations:

- Historical rows were not backfilled.
- Only rows emitted after the 2026-07-22 shadow restart will contain these fields.
- This does not represent live slippage; live slippage is from executor logs.
- It simply allows paper slippage-cap children to know whether new shadow rows pass the frozen cap.

Shadow service:

- botalin-shadow.service was restarted cleanly after instrumentation.
- Active/running, NRestarts=0 after restart.
- The restart is observability-only; FADE-8 logic/thresholds were not intentionally changed.

## Key Reports / Commits

Recent important commits:

- f8c58ae: backtest report for PULLBACK/DRIFT child ideas.
- a3eed1a: launch PULLBACK_US_HOURS child observer.
- f155923: add Candidate Miner drafts.
- 17101fd: launch VWAP_SLIPCAP child observer.
- 8c1deda: enable slippage-cap instrumentation and TREND_SLIPCAP child.

Important references:

- reference/PAPER_CHILD_BACKTEST_PULLBACK_DRIFT_2026-07-22.md
- reference/FADE_TOKENIZED_PULLBACK_US_HOURS_CHILD_REVIEW_2026-07-22.md
- reference/AUTO_PAPER_FACTORY_CANDIDATE_MINER_REVIEW_2026-07-22.md
- reference/FADE_TOKENIZED_VWAP_SLIPCAP_CHILD_REVIEW_2026-07-22.md
- reference/FADE_TOKENIZED_SLIPPAGE_INSTRUMENTATION_REVIEW_2026-07-22.md
- reference/FADE_TOKENIZED_SIDE_THESIS_RECONCILIATION_2026-07-21.md
- reference/FADE_TOKENIZED_TREND_TRUE_ALPHA_SERIES_RESULT_2026-07-20.md
- reference/FADE_TOKENIZED_TREND_EDGE_SERIES_V2_RETRY_RESULT_2026-07-20.md
- reference/ACTIVE_CASH_SCOREBOARD_2026-07-21.md
- reference/HL_CARRY_2026-07-30_DECISION_PACK.md

## Safety Invariants for Next Agent

Do not violate these:

1. Do not print API keys, Telegram token, or full process env.
2. Do not start live orders without explicit fresh operator go.
3. Do not call any strategy profitable from current evidence.
4. Do not mutate parent models in-place; new logic must be child model with new RESET_TS.
5. Do not backfill old shadow rows with new slippage fields unless explicitly requested and documented; it would contaminate forward windows.
6. Keep promising_count=0 unless a human explicitly changes classification after proper gates.
7. FADE-8 verdict/cohort remains untouched unless explicitly requested.
8. Paper factory writes only sandbox/status/log artifacts; no execution keys.
9. Live runner uses coordinator leases; do not run parallel live processes outside coordinator.
10. If touching shadow_runner, verify service health and note that this is keyless/signals-only.

## Suggested Next Work

### Near-term

1. Check whether post-restart shadow rows now contain slippage_vs_signal_bps.
2. Run paper factory scan after such rows exist and confirm VWAP_SLIPCAP/TREND_SLIPCAP forward.n begins increasing.
3. Watch current live US-hours runner. If it finishes, collect report, flat verify, coordinator state, and TG outcome.
4. If no live fills, diagnose signal freshness / time-window / coordinator lease logs without changing caps.

### Paper-factory next

1. Let PULLBACK_US_HOURS, VWAP_SLIPCAP, TREND_SLIPCAP accumulate forward evidence.
2. Do not create more children until current ones show either data accumulation or obvious blockers.
3. If Candidate Miner emits new drafts, treat them as review queue only.
4. Consider adding an explicit shadow slippage-field health check to paper factory status.

### Live strategy next

1. Current clean live test is FADE_TOKENIZED_TREND_US_HOURS_v1 only.
2. Do not restart or duplicate the runner unless it has ended and operator gives fresh go.
3. If result is negative, separate execution failure from regime failure.
4. If result is positive, still do not call profitable; N will be too small.

### Cash path next

1. HL_CARRY remains the more mature cash candidate, decision pack date around 2026-07-30.
2. BYBIT_CARRY SNX/GRT watch is not ready; SNX near-miss, GRT weak.

## Quick Commands for Read-only Follow-up

All examples must be run on /opt/botalin-edge and secrets must be redacted in any copied output.

Paper factory status:

```bash
sudo -u botalin node -e 'const fs=require("fs"); const st=JSON.parse(fs.readFileSync("data/auto_paper_factory_status.json","utf8")); console.log(JSON.stringify({ts:st.ts,tally:st.tally,promising_count:st.promising_count,candidate_miner:st.candidate_miner},null,2));'
```

Coordinator status as runner sees it:

```bash
sudo -u botalin env LIVE_COORDINATOR_GO=OPERATOR_APPROVED node scripts/live_runner_coordinator.mjs --status
```

Check live runner presence without printing env:

```bash
pgrep -f "fade_tokenized_trend_edge_series_runner\.mjs" | wc -l
```

Check shadow service:

```bash
systemctl show botalin-shadow.service -p ActiveState -p SubState -p NRestarts --no-pager
```

Check latest shadow slippage fields:

```bash
sudo -u botalin node -e 'const fs=require("fs"); const rows=fs.readFileSync("logs/shadow_trades.jsonl","utf8").trim().split(/\n/).slice(-20).map(JSON.parse); console.log(rows.slice(-5).map(r=>({ts_close:r.ts_close,config_id:r.config_id,kind:r.kind,symbol:r.symbol,slip:r.slippage_vs_signal_bps,model:r.slippage_model})));'
```

## Final Handoff Position

The system is now split correctly:

- Live lane: one small, coordinated, US-hours FADE trend test can run if signals arrive.
- Paper lane: 7 paper-active observers, all NEEDS_DATA, all promising=false.
- Factory lane: Candidate Miner emits drafts but does not auto-launch.
- Instrumentation lane: future shadow rows can support slippage-cap children.

The next AI should be conservative. The goal is not to declare victory; it is to let the factory generate and falsify candidates while live tests remain tiny, coordinated, and explicitly gated.
