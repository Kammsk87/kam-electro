# TASK-AH-041 — Triad Structural Strategies v0 (Result)

**Task ID:** TASK-AH-041-TRIAD-STRUCTURAL-STRATEGIES-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only. No candidate created, no promotion, no paper/live.

## 0. Three independent verdicts

| Member | Verdict | Why |
|---|---|---|
| `CS_RELATIVE_STRENGTH_24H` | **DATA_INADEQUATE** | The frozen AH-005A universe manifest and its daily bars are not present in this repository |
| `FUNDING_PERSISTENCE_CARRY` | **DATA_INADEQUATE** | No causal spot/perp/funding-publication/borrow/basis/two-leg-execution dataset exists locally |
| `NEWS_FORCED_FLOW_REACTION` | **DATA_INADEQUATE** | No causal `first_seen` news stream, event labels, or aligned execution prices exist locally |

PnL was **not pooled**. Nothing was computed that spans two members, and the report contains no
combined equity, no blended verdict, and no top-level `verdict` field. `promising_count` remains `0`.

## 1. Data availability, established before any evaluation

The AH-005A archive that AH-037…AH-040 ran against lives at `/opt/botalin-edge/data/bars_xs/bars.json`
on the research server. This machine is the local control repo. I verified:

| Path | Status |
|---|---|
| `/opt/botalin-edge/` | absent |
| `/opt/botalin-edge/data/` | absent |
| `/mnt/data-vol/botalin-research/ah005/` | absent |
| `bars*.json` / `*universe*.json` anywhere in the repo | none |
| Any funding, borrow, basis, or news dataset in the repo | none |

`data/` holds only prior AH **result** artifacts (`ah037…ah040_*.json`) and the warehouse fixtures.
A result report is not a source dataset; the 1h/daily OHLC series cannot be reconstructed from it.
No AH-005A result or universe manifest is committed either.

Network access is prohibited by the task and was not attempted. Server access is unavailable and was
not attempted.

**Every one of the three verdicts is therefore a genuine data verdict, not a modelling outcome.**

### Exact missing-field manifest

The run names every missing field rather than reporting a bare failure:

```
CS_RELATIVE_STRENGTH_24H
  universe     DATASET_NOT_SUPPLIED   universe_id, frozen_at, symbols
  daily_bars   DATASET_NOT_SUPPLIED   ts, o, c

FUNDING_PERSISTENCE_CARRY
  carry        DATASET_NOT_SUPPLIED   ts, spot_price, perp_price, funding_rate,
                                      funding_publish_ts, borrow_rate, basis,
                                      spot_bid, spot_ask, perp_bid, perp_ask

NEWS_FORCED_FLOW_REACTION
  news         DATASET_NOT_SUPPLIED   first_seen_ts, event_label, symbol
  news_prices  DATASET_NOT_SUPPLIED   ts, symbol, price, bid, ask
```

## 2. No substitution

Candles were not substituted for anything. Funding, borrow, basis, execution quotes and news labels
are not derivable from an OHLC series, and a price move is not a news event. Each member records
`substitution_refused: true`.

This is enforced, not merely stated: a shipped test supplies **only** daily bars and asserts that
neither `FUNDING_PERSISTENCE_CARRY` nor `NEWS_FORCED_FLOW_REACTION` becomes executable. Null,
`undefined` and empty-string values are also treated as missing rather than as data.

## 3. What was built, and what it does when data arrives

Member 1 is fully implemented and tested against synthetic panels, so it runs correctly the moment
the frozen universe and daily bars are supplied:

- score = 7-day return minus the universe median; long top quintile, short bottom quintile;
- equal notional, gross 1.0, net 0 by construction (verified: a uniformly rising market yields a
  neutral book, not a profit);
- entry at the open **after** the decision date, exit one open later (24h hold);
- eligibility excludes under-30-day history and any single-day move above 25% inside the lookback;
- both-leg costs at the frozen 11 bps gross roundtrip, with a 22 bps double-cost stress;
- shuffled-rank matched null, 1,000 seeded samples, preserving dates, eligible set and both leg sizes.

Members 2 and 3 are implemented as gates. Member 3's mechanical direction, entry and exit are
pre-declared in code (`FADE_THE_IMPULSE`, entry at the first quote after `first_seen_ts + 60s`, fixed
4h exit) so they cannot be chosen after inspecting data.

### Two deliberate strengthenings over the AH-037…AH-040 pattern

**Neighbours are measured on validation, not holdout.** The task requires two fixed neighbours but
names no segment. Running a three-point parameter surface on the sealed holdout converts one
pre-registered look into three, which the project chronology rules prohibit. The two fixed
neighbours (6d and 8d) are therefore evaluated on validation. Stated here because it is a choice.

**Purge and embargo are applied and counted.** A decision whose outcome window crosses a split
boundary is purged (2 days), and the feature warm-up head of each evaluated split is embargoed
(7 days, the lookback length). Without these, train outcomes overlap validation feature windows.

## 4. The overlap gate blocks promotion regardless of statistics

`CS_RELATIVE_STRENGTH_24H` declares a priori that it is adjacent to two blocked families:
`RAW_MOMENTUM` and `PAIRS_RELATIVE_VALUE`. Cross-sectional relative strength is momentum-adjacent by
construction; it differs from the rejected raw-momentum family in being market-neutral and
cross-sectional rather than directional and time-series — but **that is a claim, not a measurement**.

Exact trade-timestamp ledgers for the blocked families were not retained alongside the AH-005A
archive, so the overlap gate reports `UNAVAILABLE` with `blocking: true`.

The verdict ladder is ordered so a passport draft is unreachable while overlap is unmeasured:

```
DATA_INADEQUATE → OOS_FAIL_REJECT_FAMILY → ROBUSTNESS_FAIL_DEPRIORITIZE
                → DUPLICATE_OR_OVERLAP_BLOCKED → CANDIDATE_PASSPORT_DRAFT
```

A shipped test builds a result that passes every statistical gate and asserts the verdict is still
`DUPLICATE_OR_OVERLAP_BLOCKED`. Even with perfect data, this member could not have promoted today.

## 5. Checks run

| Check | Result |
|---|---|
| `node --check` on both scripts | pass |
| Deterministic test suite | **58 / 58 pass** |
| Static scan (11 assertions) | pass |
| Full replay (`--out` to the allowlisted data base) | pass, exit 0, three DATA_INADEQUATE verdicts |
| `git diff --check` | clean |
| Secret scan over the five deliverables | **0 hits** |
| `gitleaks` | **NOT RUN — binary not installed** (see below) |

Suite breakdown: data gates 10/10 · member independence 4/4 · cross-sectional mechanics 8/8 ·
chronology 4/4 · statistics 4/4 · shuffled-rank null 4/4 · overlap and verdicts 8/8 ·
determinism 5/5 · static scan 11/11.

Notable assertions: no look-ahead (mutating every bar after the exit date leaves observations
byte-identical); drawdown computed in date order rather than input order; an information-free signal
cannot clear alpha against its own shuffled-rank null; the report contains no pooled-PnL key; two
runs are byte-identical and embed no timestamp.

### gitleaks gap

`gitleaks` is not installed on this machine and installing it needs network access, which the task
forbids. I ran an equivalent manual scan instead — GitHub/AWS/Slack/OpenAI token patterns, PEM private
key headers, JWT prefixes, `password`/`secret`/`token` assignments, and any 32+ character
alphanumeric run — across all five deliverables. **Zero hits.** The deliverables are code, a protocol
document, and a data-gate report containing no credentials.

This is a substitute, not the required tool. If gitleaks output is needed for acceptance, it must be
run separately once the binary is available.

**Separately, and unrelated to this task:** the repository's `origin` remote URL still embeds a live
`ghp_…` GitHub token in `.git/config`. gitleaks would very likely flag it. I did not touch it. It
should be revoked and the remote switched to SSH or a credential helper.

## 6. Artifact paths

| Deliverable | Path |
|---|---|
| Engine | `scripts/analysis/ah041_triad_structural_strategies.mjs` |
| Tests | `scripts/test_ah041_triad_structural_strategies.mjs` |
| Protocol | `reference/AH041_TRIAD_STRUCTURAL_STRATEGIES_PROTOCOL_2026-08-03.md` |
| Run report (JSON) | `data/ah041_triad_structural_strategies_2026-08-03.json` |
| Run report (CSV) | `data/ah041_triad_structural_strategies_2026-08-03.csv` |
| This result | `tasks/results/TASK-AH-041-TRIAD-STRUCTURAL-STRATEGIES-V0-RESULT.md` |

## 7. What this task cannot conclude

1. Nothing about any of the three mechanisms. No return was computed for any member. `DATA_INADEQUATE`
   is a statement about our data, not about the market.
2. That the cross-sectional member is distinct from raw momentum or pairs relative value. That needs
   retained per-trade ledgers which do not exist.
3. That the missing datasets are obtainable. Funding publication timestamps, borrow rates and a
   causal `first_seen` news lane are open data-collection requests, each needing its own operator GO.
4. That any future positive result would promote. A passing member reaches at most
   `CANDIDATE_PASSPORT_DRAFT`, which is a research state, and any p-value it reports is uncorrected
   for the programme's documented prior-trial count.

## 8. Lifecycle footer

| Field | Value |
|---|---|
| Lifecycle state entered | none — all three members gated at `DATA_HEALTH` |
| Lifecycle state left | none |
| Position in the state machine | Blocked at `DATA_HEALTH` for all three members |
| Next permitted transition | none performed. Member 1 needs the frozen AH-005A universe plus daily bars; members 2 and 3 need their causal datasets collected first |
| Evidence gate passed / failed | none evaluated — no data was analysed |
| Failure route | `DATA_REQUEST` for all three members |
| Next queued task and owner | Data collection for the three missing datasets, owner Codex to prioritise. Task selection remains Codex's decision |
| What this task cannot conclude | §7 |
| Files changed | The 6 allowlisted deliverables only |
| Prohibitions respected | No network. No server access attempted. No parameter search. No live/paper, service, collector, config, coordinator, approval, KILL, `model_id`, or `RESET_TS` touched. No secret read. No exchange, account, order, execution or position endpoint. PnL never pooled across members. No missing data substituted with candles. `promising_count` remains `0` |

**Relevant lessons** (source `/opt/botalin-edge/reference/BOTALIN_LESSONS_LEDGER.md`, not readable
from this machine; titles remain unverified):

- **LESSON-003** — the overlap gate blocks a passport draft for a momentum-adjacent member rather
  than letting a renamed mechanism through on statistics alone.
- **LESSON-016** — member 3 treats `first_seen_ts` as the causal timestamp and refuses a publisher
  timestamp; the gate is not cleared merely because the field is populated.
- **LESSON-019** — §7 item 4 records that any p-value here would be uncorrected for the programme's
  prior-trial count.
- **LESSON-021** — the ladder puts the out-of-sample signal gate ahead of any execution consideration.

No new lesson.

## 9. Commit

Committed on branch `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0`. Only the six allowlisted files
were staged. **Push was not performed — it requires separate explicit approval.**
