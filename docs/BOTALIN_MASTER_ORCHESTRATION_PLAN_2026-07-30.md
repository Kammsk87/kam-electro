# Botalin Master Orchestration Plan

**Effective from:** 2026-07-30  
**Owner:** Codex Orchestrator  
**Objective:** continuously discover, falsify, and mature independent strategy sleeves until at least two sleeves earn evidence-based admission to a research multi-strategy router. The target is not a forced profitable backtest; it is a repeatable process that can eventually justify controlled paper and, only by explicit operator GO, bounded micro-live mechanics checks.

This is the operating source of truth for work allocation, checkpoints, and context recovery. Every new Botalin task must be checked against this plan, the candidate lifecycle, and the lessons ledger before dispatch.

## 1. Non-Negotiable Operating Rules

1. `NO_TRADE` and `promising_count=0` are the default state.
2. No paper or live start, coordinator/approval/KILL change, key/environment read, service/timer change, model ID, or `RESET_TS` change without a fresh explicit operator GO.
3. A backtest, paper result, or 1-3 micro-live fills cannot by itself establish an edge.
4. A signal must be evaluated at ideal fill before execution is blamed. A positive ideal-fill result must then survive holdout, null, concentration, parameter-neighbourhood, cost, and execution checks.
5. A negative result retires only its exact rule set. The next task must either test a materially different structural variant, identify a data gap, derive a guard, or close the family honestly.
6. Pattern-first discovery is allowed: start from repeated normalized moves and formulate the mechanism afterwards. Do not require a payer story before measuring recurrence.
7. Raw server data and provenance beat dashboards, Telegram summaries, fixtures, and stale local copies.

## 2. Evidence Path And Final Goal

```text
Reliable data
  -> Pattern / mechanism discovery
  -> Candidate passport
  -> Ideal-fill + walk-forward OOS
  -> At-event execution replay
  -> Quarantined paper observer
  -> Micro-live mechanics (operator GO)
  -> Forward retention
  -> Router admission
  -> Portfolio forward observation
```

**Portfolio gate:** no allocation or automatic sleeve switching until at least two independently surviving sleeves have overlapping OOS/forward evidence, known correlation, explicit conflict rules, and a common risk budget. Until then, the router may only output `NO_TRADE` or research diagnostics.

## 3. Roles And Accountability

| Role | Owner | Permanent responsibility | Cannot do |
|---|---|---|---|
| Orchestrator | Codex | Maintains this plan, assigns bounded work, verifies current state, reviews acceptance, keeps all queues non-idle, chooses next task after each result | Claim a strategy works without its evidence gate; start paper/live without GO |
| Alpha Hunter | Lovelace + Claude research worker | Mines recurring normalized price patterns across timeframes; proposes structural variants when a rule fails | Promote a candidate or hide failures through parameter fitting |
| Data Truth Auditor | Huygens | Checks timestamp overlap, source provenance, causal availability, missing fields, fixture contamination, and execution-data coverage | Allow a research result built on incompatible periods |
| Research Skeptic | Arendt | Attacks candidates with holdout, matched null, concentration, cost stress, exit variants, and overlap checks | Re-label an in-sample pocket as evidence |
| Router Architect | Turing + Claude Task-009/010 line | Builds a pure, fail-closed research router and causal replay adapter; records why rows are ineligible | Manufacture alpha or turn missing data into an ALLOW decision |
| Evidence Auditor | Cicero | Independently reviews task claims, source-to-result traceability, tests, forbidden paths, and lessons | Accept a task merely because tests passed |
| Task Designer | Volta | Produces narrow contracts with allowed files, gates, outputs, and safe acceptance criteria | Expand scope into runtime or trading infrastructure |
| Claude Code lead | Claude Code plus its subagents | Performs bounded implementation/replay tasks assigned by Codex; may parallelize reading, tests, and research within the task contract | Choose deployment, mutate runtime, or self-promote work |
| Operator | Aleksandr | Gives explicit GO for paper/live and decides on capital/risk changes | Be bypassed by automation |

## 4. The Four Always-Active Queues

| Queue | Current owner | Active item | Next checkpoint | Done means |
|---|---|---|---|---|
| Data health | Huygens | Verify all candidate datasets have timestamp overlap, decision-time provenance, and execution coverage | Before any candidate passport is accepted | A source map says exactly what can and cannot be concluded |
| Discovery | Lovelace + Claude | `AH-004 Price Shock Pattern Factory`: recurring normalized impulse, reversal, escape, failed continuation, compression, and session patterns | First atlas from the authorized market-only dataset | Ranked patterns with exact event/entry/exit and no outcome leakage |
| Validation | Arendt + Cicero | Attack existing and newly found patterns with ideal-fill, OOS, null, concentration, cost, and execution realism | Immediately after any passport draft | Pass, precise failure route, or required data request |
| Integration | Turing + Claude | Router Lab core (complete) followed by Task-010 causal replay adapter | After Task-009 branch acceptance; Task-010 remains read-only | Router explains `NO_TRADE` / ineligibility without using future outcomes |

No queue may be idle because another recorder is running. If a task is blocked, Codex assigns a non-overlapping task from another queue.

## 5. Current Workboard (30 July 2026)

| ID | Work | Owner | State | Target date / trigger | Required result |
|---|---|---|---|---|---|
| W-01 | Price-shock pattern factory (`AH-004`) | Claude Code research worker, monitored by Codex | Initial scan complete; one narrow data-request route found | Initial report received 2026-07-30 | No passport admitted; all but one narrow ideal-fill pattern failed, and its execution/funding evidence is missing |
| W-02 | Data chronology audit for W-01 | Huygens | Finding confirmed | Completed 2026-07-30 | 1h bar history and July AMEL events have zero temporal overlap and must not be merged into one test |
| W-03 | Independent W-01 attack (`AH-004A`) | Claude Code, adversarial role; Codex reviews | Complete: `ROBUSTNESS_FAIL` | Completed 2026-07-30 | The initial route fails holdout significance and multi-symbol concentration; z>=3.0 passport withdrawn |
| W-04 | Causal router replay adapter (`TASK-010`) | Claude Code | Queued | After W-01 has a reviewed output or when an integration slot is free | Read-only adapter; expected result may be entirely `NO_TRADE` |
| W-05 | Forced-flow absorption reversal | Lovelace | Hypothesis queue | After data-truth confirmation of liquidation/OI fields | Exact event definition then ideal-fill/OOS; no paper |
| W-06 | Wick-reclaim sweep exit redesign | Lovelace | Waiting for sufficient data | After the completed 7-day AMEL dataset and at least 100 usable events | Test only the distinct exit variant; otherwise close/defer |
| W-07 | HTF alt volatility expansion | Lovelace | Waiting for order-book coverage | When at least 30 matched events across 8 symbols exist | Re-run execution gate; no relaxed thresholds |
| W-08 | NEWS delayed-reaction sleeve | Volta + Arendt | Waiting for the NEWS/AMEL study checkpoint | 2026-08-06 | Event study with `first_seen_at`, execution, OOS, and overlap checks |
| W-09 | AMEL seven-day second-order replay | Codex dispatches, Huygens audits | Waiting for recorder completion | Approximately 2026-08-04 | Larger-N pattern and liquidity replay; no auto-promotion |
| W-10 | Wallet flow | Closed as direct entry | Cicero | Rejected for follow/fade entry | Reopen only as a new guard hypothesis with a separate matched-control proof | No copy-trading or reverse-copy candidate |
| W-11 | Pre-registered 1h unseen-window recheck | Claude Code + Huygens audit | Queued | Next visible Claude task | Freeze z>=4.0, 12h/24h holds, train-only liquidity tier, two cost levels; test 2026-03-20 onward once without re-parameterizing |

Dates are checkpoints, not permission for automatic paper or live action.

## 6. Candidate Formation Standard

A discovery finding becomes a **candidate passport draft** only if it states all of the following before any forward observer is proposed:

1. Market pocket: universe, liquidity tier, session, regime, and timeframe.
2. Exact decision-time trigger; no future outcome or execution field in the detector.
3. Entry reference, direction, stop, target/timeout, size tier, and cost model.
4. At least 100 events, 5 symbols, and 5 independent day clusters, unless a written structural exception is reviewed.
5. Positive holdout mean and median at ideal fill; matched-null advantage; remove-best-symbol/day survival; parameter-neighbourhood stability.
6. A family/overlap check against FADE, HTF mean reversion, carry, failed breakout, AMEL event rules, and wallet follow/fade.
7. A route: execution replay, structural variant, data request, guard-only, quarantine, or reject.

Only a passport passing all seven goes to execution replay. Only an execution-surviving passport can be nominated for a quarantined paper observer. Paper and micro-live remain separate operator-GO decisions.

## 7. Review And Escalation Rhythm

### Execution visibility

- A Claude Code task that is reported as **running** must be visible in the operator's chosen Claude Code / VS Code session, with its task name and latest activity.
- A detached CLI scratch session may be used only for short, read-only assistance. It is labelled **auxiliary**, never the sole active owner of a workboard item.
- If the visible session is unavailable, Codex reports the task as **blocked by execution channel** rather than implying that background activity is a monitored delivery.
- Each status update names the visible task, owner, current stage, and the next concrete output. Completion is verified from files/tests or a reviewed report, not from an animated UI indicator.

### At every task start

- Read this plan, `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, and the relevant lessons.
- Verify the server/current data truth if a task touches remote state.
- State the lifecycle stage, permitted files/data, and what the task cannot conclude.

### At every task completion

- Codex checks the actual changed files, test outputs, source provenance, and acceptance gates.
- Evidence Auditor performs an adversarial check for leakage, temporal mismatch, concentration, and unapproved runtime effects.
- Codex assigns the next bounded item from the workboard; a result never leaves an ownerless gap.

### Cadence

- Every two hours while research is active: inspect W-01 through W-10, collectors, blockers, and queue coverage.
- On 2026-08-04: AMEL completion review and second-order replay dispatch.
- On 2026-08-06: NEWS event-study decision.
- On 2026-08-21: HTF volatility order-book coverage recheck.

## 8. Claude Code Subagent Pattern

For a task large enough to benefit from parallel work, Claude Code must create only task-scoped roles:

1. **Data reader:** inspect schemas, time ranges, and causal availability.
2. **Pattern miner:** build the specified event/entry/exit atlas.
3. **Skeptic:** run holdout, null, concentration, cost, and mutation checks independently.
4. **Reporter/tester:** verify outputs against the allowlist and task acceptance commands.

Their outputs are evidence for the Claude lead, not independently accepted work. Codex remains the acceptance authority. A subagent may never access secrets, live paths, or modify trading infrastructure.

## 9. Explicitly Closed Or Restricted Paths

- FADE tokenized: do not invest in speed/depth fixes; it fails at ideal fill. A genuinely new trigger can be considered only as a new family.
- HTF MA-distance reversion on majors: deprioritized after OOS/robustness failure.
- Wallet follow/fade: rejected as directional entry; no copy/reverse-copy revival.
- Historical Bybit self-trading: not a source of reusable alpha; it is risk-of-ruin forensic evidence.
- Guards (liquidity, spread, crowd/wallet) can suppress a trade but cannot be called a standalone directional sleeve.

## 10. Definition Of Progress

Progress is not a positive in-sample chart. It is one of:

- a trustworthy new dataset or corrected data defect;
- a new non-overlapping pattern with a precise decision-time definition;
- a candidate that survives one more independent gate;
- a failed rule closed precisely enough to prevent retesting it unchanged;
- a router component that fails closed and preserves evidence boundaries.

The first genuine multi-strategy milestone is **two independent sleeves that survive execution replay and enter separate quarantined paper observers**. Until that milestone, the programme remains an evidence-building system, not a trading system.
