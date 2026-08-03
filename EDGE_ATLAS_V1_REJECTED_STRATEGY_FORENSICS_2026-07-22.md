# EDGE_ATLAS_v1 — forensic review of rejected strategies

Date: 2026-07-22  
Mode: read-only analysis  
Live impact: none  
Orders: 0  
Keys: not read  
Active live session: must not be touched  

## Objective

Look at old rejected / weak strategies from the opposite direction:

- not "remove losing trades after the fact";
- but "find causal, observable pockets where losers cluster";
- then decide whether any adaptive no-trade rule is worth a new paper-only child.

This is hypothesis generation only. Nothing here is a promotion, and nothing is live-ready.

## Data

Primary input:

- `logs/shadow_trades.jsonl`
- roughly 60k shadow rows
- old/rejected-like configs inspected:
  - `base:trend`
  - `base:scalping`
  - `base:pullback`
  - `base:vwap-reversion`
  - `base:momentum`
  - `base:rsi-reversal`
  - `fade:base:scalping`

US-hours definition used:

- 13:30-20:00 UTC

Metrics:

- average net percent per trade
- winrate
- day-clustered positive days
- symbol pockets
- US/off-hours split
- simple causal rolling guards

## Guardrail Against Overfit

Forbidden interpretation:

> These historical losers were bad, so remove them and call the strategy good.

Allowed interpretation:

> If a local pocket is already deteriorating using only past information, a future strategy may pause that pocket.

That means any new rule must be:

- causal;
- simple;
- preregistered;
- launched as a new model_id with a future RESET_TS;
- forward-tested;
- not used to rescue the old verdict.

## Main Result

Most old raw strategies are not worth rescuing. Simple adaptive filters reduce damage but do not create robust edge.

The only interesting salvage candidate is:

`FADE_SCALPING_ADAPTIVE_GUARD_v1`

Even that is thin and must be paper-only first.

## Raw Strategies: Mostly Not Salvageable

| Strategy | Base N | Base avg/trade | Base WR | Best simple guard read | Verdict |
|---|---:|---:|---:|---|
| `base:trend` | 6131 | -0.1157% | 30.0% | time-regime guard can show +0.0589%, but only 270 trades | suspicious, too narrow |
| `base:scalping` | 3482 | -0.1231% | 35.0% | guards remain negative | reject |
| `base:pullback` | 1471 | -0.1505% | 31.0% | guards remain negative / too few trades | reject |
| `base:vwap-reversion` | 3179 | -0.1727% | 31.1% | guards remain near negative | reject |
| `base:momentum` | 424 | -0.1834% | 16.7% | cooldown improves to -0.0289%, still bad | reject |
| `base:rsi-reversal` | 465 | -0.1402% | 34.0% | time-only pocket gives +0.205%, but only 35 trades | suspicious |

Interpretation:

The old raw families are not "one bad pocket away" from working. They are broadly weak. A rule that only leaves tiny pockets is not a strategy, it is likely selection bias.

## Bad Pockets Are Real

Worst repeated pockets include:

| Pocket | N | Avg/trade | WR |
|---|---:|---:|---:|
| `base:trend / ALLOUSDT` | 48 | -0.5550% | 20.8% |
| `base:trend / LITUSDT` | 50 | -0.5545% | 22.0% |
| `base:trend / AKEUSDT` | 40 | -0.5134% | 25.0% |
| `base:vwap-reversion / SOXLUSDT` | 84 | -0.3881% | 25.0% |
| `base:vwap-reversion / SKHYNIXUSDT` | 72 | -0.3743% | 22.2% |
| `base:pullback / NEARUSDT` | 48 | -0.2926% | 22.9% |

These are good kill-list inputs, but not enough by themselves to create a new edge. Excluding symbols simply because they lost is one of the cleanest forms of data mining unless there is a structural reason.

## Time Regime Splits

Some strategies clearly behave differently in US-hours vs off-hours:

| Strategy | US avg | Off avg | Read |
|---|---:|---:|---|
| `base:momentum` | -0.4472% | -0.0574% | US-hours especially bad |
| `base:rsi-reversal` | +0.0251% | -0.2354% | possible US-only pocket, but N small |
| `base:pullback` | -0.2868% | -0.0924% | both bad, US worse |
| `base:trend` | -0.1595% | -0.0975% | both bad |
| `base:vwap-reversion` | -0.1285% | -0.1889% | both bad |

This supports using time regime as a no-trade guard, but not as a magic rescue for raw strategies.

## The One Interesting Salvage: fade:scalping

Baseline:

| Config | N | Avg/trade | WR | Days | Positive days |
|---|---:|---:|---:|---:|---:|
| `fade:base:scalping` | 3173 | -0.0088% | 63.0% | 11 | 4 |

This is near-flat, not deeply bad. That makes it a more plausible candidate for a no-trade overlay.

### Adaptive Rule A: cooldown after 2 local losses

Rule:

> For each `symbol + time_regime`, if the last 2 closed trades were losers, pause that pocket until new history naturally clears the condition.

Backtest read:

| N taken | Skipped | Avg/trade | WR | Days | Positive days |
|---:|---:|---:|---:|---:|---:|
| 2551 | 622 | +0.0296% | 69.4% | 11 | 6 |

US/off-hours:

| Regime | N | Avg/trade | WR |
|---|---:|---:|---:|
| Off-hours | 1857 | +0.0400% | 71.0% |
| US-hours | 694 | +0.0017% | 65.1% |

Read:

This is plausible because it is causal and simple. It does not select by future PnL. It says: if a local pocket is currently failing, stop forcing it.

Weakness:

The edge is still thin. It could vanish under live spread/slippage.

### Adaptive Rule B: time-regime rolling last-50 positive

Rule:

> Trade only when the current time-regime bucket has positive rolling performance over its last 50 trades.

Backtest read:

| N taken | Skipped | Avg/trade | WR | Days | Positive days |
|---:|---:|---:|---:|---:|---:|
| 1640 | 1533 | +0.0424% | 72.1% | 10 | 7 |

US/off-hours:

| Regime | N | Avg/trade | WR |
|---|---:|---:|---:|
| Off-hours | 1225 | +0.0458% | 72.7% |
| US-hours | 415 | +0.0322% | 70.1% |

Read:

This is cleaner than symbol-by-symbol filtering because it is a regime-level guard, not a hand-picked symbol list.

Weakness:

Still thin; also shows bad days:

- 2026-07-19: -5.56 total
- 2026-07-18: -1.97 total
- 2026-07-21: only 3 trades, all noisy

### Adaptive Rule C: soft rolling pocket last-10

Rule:

> For each `symbol + time_regime`, after at least 10 observations, require last-10 avg > -0.03% and WR >= 45%.

Backtest read:

| N taken | Skipped | Avg/trade | WR | Days | Positive days |
|---:|---:|---:|---:|---:|---:|
| 2279 | 894 | +0.0142% | 67.1% | 11 | 5 |

Read:

Improves baseline, but weaker than A and B. More likely to overfit local noise.

## Proposed New Candidate

Candidate:

`FADE_SCALPING_ADAPTIVE_GUARD_v1`

Parent:

`fade:base:scalping`

Type:

paper-only child

Status:

`PAPER_READY_DRAFT`, not launched

Core rule:

Use a two-layer adaptive no-trade overlay:

1. Regime gate:
   - trade only when US/off-hours rolling last-50 bucket has positive net and WR >= 50%;
2. Local cooldown:
   - skip `symbol + regime` after 2 consecutive local losses.

No symbol kill-list in v1.

Why no symbol kill-list:

Removing individual losing symbols is too close to data mining unless the symbol has an external structural reason: bad depth, high spread, broken peg, token mapping issue, delisting risk, etc.

## Kill Test For This Candidate

The child must die if forward shows any of:

- net_taker <= 0 after sufficient N;
- day-clustered positive days < 50%;
- edge concentrated in one symbol only;
- live/slippage proxy > expected edge;
- WR improvement without net improvement;
- negative performance on 2 independent days after RESET_TS.

## Evidence Requirements

Because this child was born from analysis of rejected strategies, it needs a higher bar than a normal child:

- new model_id;
- future RESET_TS;
- at least 14 day-clustered days;
- N >= 300 preferred because scalping has thin edge;
- no promotion from paper only if live slippage remains unmeasured;
- no live until spread/slippage model is independent.

## Classification Of Findings

| Finding | Class | Reason |
|---|---|---|
| Raw trend rescue by narrow time-filter | SUSPICIOUS | leaves too few trades, likely pocket mining |
| Raw RSI US-only pocket | SUSPICIOUS | only 35 trades under best simple guard |
| Raw pullback/vwap/scalping/momentum | REJECT | still negative or too narrow |
| fade:scalping adaptive cooldown | STRUCTURAL_CANDIDATE | causal, simple, enough N, improves baseline |
| symbol kill-list | REJECT_FOR_NOW | too close to data mining without external reason |
| time-regime rolling guard | STRUCTURAL_CANDIDATE | regime-level, causal, not symbol cherry-pick |

## Recommended Next Step

Build package only, no launch:

1. `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_PREREG.md`
2. `reference/FADE_SCALPING_ADAPTIVE_GUARD_V1_BACKTEST_REVIEW.md`
3. candidate registry row as `needs_data` or `paper_ready_draft`
4. paper-factory evaluator only if approved

Do not launch live.

Do not use this to rescue existing FADE verdicts.

Do not call it profitable.

## Bottom Line

Yes, it is possible to formulate a "floating smart rule", but the honest version is not an AI oracle. It is an adaptive no-trade guard:

> trade only while the recent regime/pocket is still healthy; pause after local damage.

Only `fade:scalping` currently deserves a paper-only salvage child. The old raw strategies mostly remain rejected.
