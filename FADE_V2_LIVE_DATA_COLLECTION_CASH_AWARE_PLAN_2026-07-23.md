# FADE v2 live data collection — cash-aware plan

Date: 2026-07-23

Status: PLAN ONLY. No live launch is approved by this document.

Model: `FADE_TOKENIZED_TREND_US_HOURS_v2`

Goal: earn if the live edge exists, but buy the truth cheaply if it does not.

## 1. Current read

FADE execution is now mature enough to test signal survival:

- market entry works;
- private WS fill detection works;
- directional adverse slippage cap works;
- R:R floor works;
- coordinator lease and terminal flat checks work;
- post-series independent flat verification has been required and used.

Alpha is not confirmed:

- v1+v2 live LONG sample is only 3 observations;
- aggregate outcome is 1 target / 2 stops;
- net PnL is small and not decision-grade;
- v2 produced 2 clean fills and both stopped;
- signal diagnosis says the strategy is likely low-WR / fat-tail, and a simple HTF downtrend veto is not justified.

Conclusion: any next FADE live work is data collection under live-money execution, not deployment of a proven strategy.

## 2. Non-negotiable constraints

- Fresh explicit operator GO is required before any live action.
- No approval files are created in advance.
- No coordinator enablement without separate GO.
- No KILL changes except for a real emergency.
- No cap changes during a batch.
- No automatic second batch.
- No strategy promotion from small N.
- Account must be independently verified FLAT before and after the run.
- Runner must be bounded and stop on terminal conditions.
- Telegram notifications must be enabled for launch, stop, and report.

## 3. Clean fill definition

A fill counts toward the 20-fill target only if all are true:

- entry was market or marketable and confirmed by private WS;
- economic side matches the signal after side/geometry remap;
- no execution anomaly occurred;
- adverse slippage versus marketable reference is `<= 18 bps`;
- remaining R:R at entry is `>= 1.0`;
- exit was a strategy exit, not emergency handling;
- terminal flat is true;
- independent post-trade flat verification is true.

Any fill that fails these conditions is reported separately as an execution/anomaly observation, not alpha evidence.

## 4. Batch target

Target: 20 clean fills.

Checkpoints:

- after 5 clean fills;
- after 10 clean fills;
- after 15 clean fills;
- final review after 20 clean fills.

Stop early if any kill condition triggers.

The checkpoint is a report and decision point, not permission to auto-scale or auto-rerun.

## 5. Cash-aware risk design

The live balance is a reality sensor, not a sizing base.

Position sizing must satisfy both:

- a target/runner outcome can still make visible money if the edge is real;
- a normal loss streak for a low-WR strategy remains an acceptable information cost.

Use fixed micro-risk per fill for this batch. Do not martingale, ladder, double after losses, or expand size after wins.

Recommended batch design:

- same symbol universe and US-hours window as v2 unless a new prereg says otherwise;
- same directional adverse slippage cap: `18 bps`;
- same R:R floor: `>= 1.0`;
- same signal freshness max age: `30 min`;
- same max loss logic as v2 until explicitly changed in a new version;
- max clean fills: `20`;
- checkpoint cadence: `5`;
- hard stop on `2` consecutive filled losses may be too strict for fat-tail data collection and should be replaced only if preregistered before launch.

Open decision before launch:

- choose whether the batch tests fat-tail honestly with a wider loss-count allowance, or repeats v2's strict two-loss stop as an execution-safety micro-test.

Default if not explicitly decided: keep v2 strict stop. This buys less signal truth but preserves the most conservative capital behavior.

## 6. Kill conditions

Stop the batch immediately if any occurs:

- account cannot be confirmed FLAT before launch;
- another live runner is active;
- coordinator state is not the expected state;
- approval is missing, stale, duplicated, or ambiguous;
- private WS execution feed is unavailable;
- terminal flat check fails;
- independent flat verification fails;
- adverse slippage exceeds `18 bps`;
- R:R at entry is below `1.0`;
- signal age exceeds `30 min`;
- symbol filter, qty step, price tick, or min-notional check fails;
- position side/geometry cannot be resolved;
- unexpected open position remains after exit attempt;
- Telegram notification path is unavailable;
- operator manually stops the batch.

## 7. Pre-launch checklist

Run only after the operator gives a fresh explicit GO for this exact batch.

Required checks:

- clean git tree or only intended staged files;
- committed plan/prereg in repo;
- current branch and HEAD recorded;
- account FLAT confirmed independently;
- no live FADE runner process;
- coordinator `enabled:false` before launch unless operator separately enables it;
- no stale lease/halt/approval state;
- `LIVE_COORDINATOR_GO=OPERATOR_APPROVED` set only for the approved launch path;
- Telegram enabled;
- API secrets not printed;
- US-hours window currently valid if required by plan;
- runner command recorded before execution.

## 8. Report format

Each checkpoint and final report must include:

- run_id;
- branch and HEAD;
- exact config/caps;
- start/end timestamps;
- clean fill count;
- anomaly fill count;
- skipped signal count and reasons;
- per-trade side, symbol, entry, stop, target, R:R, signal age, slippage, exit reason, PnL;
- fees and estimated slippage;
- terminal flat result;
- independent flat verification result;
- paper/live comparison for matching signals where possible;
- decision: continue, pause, retire, or redesign.

## 9. Decision rules after 20 clean fills

Do not call the strategy production-ready after 20 fills.

Possible outcomes:

- Positive and paper/live transfer is coherent: write a review and ask for a fresh GO for one more same-size batch.
- Mixed or path-dependent: pause live, analyze distribution, slippage, skipped signals, and paper/live divergence.
- Negative with clean execution: pause FADE live and mark alpha unresolved/weak, not an execution problem.
- Many no-fill/no-signal observations: diagnose frequency and entry mechanics, not edge.
- Any safety anomaly: pause and write a postmortem before any new run.

No outcome grants automatic scaling.

## 10. Explicit non-goals

- Do not build FADE v3 trend gate from the current evidence.
- Do not launch Failed Breakout paper from current evidence.
- Do not promote any paper candidate while `promising_count=0`.
- Do not create more FADE child models just to rescue the parent.
- Do not use this document as live approval.

## 11. Operator GO wording

Acceptable launch instruction should name the exact batch and boundary, for example:

`GO: launch FADE_TOKENIZED_TREND_US_HOURS_v2 live data-collection batch for up to 20 clean fills under the 2026-07-23 cash-aware plan, micro-size only, no auto-rerun, report at every 5 clean fills.`

Anything less specific should be treated as discussion, not live permission.
