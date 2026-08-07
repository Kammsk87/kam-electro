# TASK-SK-002 - Trials Ledger And p-Value Deflation v0

## Lifecycle

- Infrastructure. Enters and leaves no stage; creates no candidate.
- Blocks: any future `screening_pass` claim on either venue.
- Depends on: `shared_kernel/lifecycle.py` (TASK-SK-001).

## Objective

Make multiplicity a property of the system rather than of whoever remembers to
mention it. Today a MOEX autopilot run can declare 390 screening passes with no
correction of any kind, while Botalin carries 1,066 documented prior trials that
no MOEX result has ever been deflated against.

## What the retained artefacts can and cannot support

Established by inspection on 2026-08-07, before the design was fixed.

**Already available.** `data/reports/factory/*/results.jsonl` carries a per-idea
`sign_p` — a sign test over walk-forward fold excess. That is a genuine p-value
per hypothesis, so **Holm-Bonferroni and Benjamini-Hochberg can be applied to
past runs retroactively**, today, with no new data.

**Not available.** `backtest.py` computes `sharpe_daily_annualized` but the
**return series is discarded**; only aggregates reach `results.jsonl`. The
Deflated Sharpe Ratio needs the skewness and kurtosis of the return series and
the sample length T. Those cannot be reconstructed from a stored Sharpe.

Consequence, which must not be papered over: **DSR is not computable
retrospectively for any existing MOEX run.** It becomes computable only for runs
made after this task lands. Past runs enter the ledger as
`RETROSPECTIVE_AGGREGATE` — exactly the status of Botalin's 1,046 trials that
«exist only as aggregate batches». The programme will carry two eras of evidence
quality and should say so rather than pretend otherwise.

## The design decision this task must settle first

**Does a MOEX result deflate against Botalin's 1,066 crypto trials?**

Two defensible positions, and the task must pick one explicitly rather than
inherit a number because it is available:

- **Per-search-space (recommended).** Multiplicity corrects for the space that
  was searched to find *this* result. Botalin's crypto trials never searched the
  BR calendar spread space. Deflating a MOEX result by 1,066 unrelated trials is
  conservative in a way that is not merely strict but wrong in kind — it would
  make every MOEX result unfalsifiable regardless of its quality, and an
  unfalsifiable gate teaches nothing.
- **Per-researcher.** The same people and the same selection process generated
  both. Researcher degrees of freedom argue for one pooled count.

Recommended resolution: every trial record carries a `search_space` key
(venue + instrument + mechanism family + timeframe). Deflation counts trials in
the **matching space** by default. A task may declare a wider space explicitly,
and must then say why. The pooled count is always reportable, never automatic.

This must be written down before the first deflated result exists, because after
that the choice is no longer neutral.

## Required work

1. **`shared_kernel/trials_ledger.py`.** Append-only JSONL. One record per
   evaluation, carrying at minimum: `trial_id`, `search_space`, `candidate_id`,
   `family`, `params`, `timeframe`, `sample_start`, `sample_end`, `n_obs`,
   `metrics`, `p_value` where one exists, `record_type`, `evidence_path`,
   `task_id`, `commit`.

2. **`record_type` discipline.** Two kinds, with a rule sharp enough to apply
   without judgement:
   - `TRIAL_RECORD` — a result about a *specific rule's performance* was
     produced and could have changed a decision about that rule. Consumes
     multiplicity budget.
   - `CONTOUR_RECORD` — a property of the venue or instrument was measured with
     no rule under test. TASK-MX-001 through -003 are all of this kind. Consumes
     none.

   **Edge case that must be handled, not ignored:** a contour measurement over
   several variants from which one is then selected — Stage 0 measured four
   horizons and named the survivors — carries selection even though no rule was
   tested. Such a record takes `CONTOUR_RECORD` with an explicit
   `selection_among: n` field, and any later claim built on the selected variant
   reports that n.

3. **`shared_kernel/p_value_deflation.py`.**
   - `holm_bonferroni(pvalues)` and `benjamini_hochberg(pvalues, q)` — applicable
     to the existing `sign_p` values immediately.
   - `deflated_sharpe_ratio(sr, n_trials, var_sr_across_trials, skew, kurtosis, t_obs)`
     per Bailey & López de Prado, raising rather than defaulting when an input is
     missing.
   - The two are **not interchangeable and must not be mixed arbitrarily**: DSR
     corrects a single Sharpe selected as the best of N; Holm and BH correct a
     family of independent p-values. The autopilot's 390 passes are a selection
     problem, so DSR is primary and BH-FDR is the secondary view. The module must
     refuse to report a single "corrected p" that silently blends both.

4. **Retain what DSR needs, going forward.** Extend the backtest result to carry
   the return series' `n_obs`, `skew` and `kurtosis` — not the series itself, to
   keep artefacts small, but enough that DSR is computable. Without this, item 3
   is a module nobody can call.

5. **Backfill the ledger retrospectively** from existing factory and autopilot
   artefacts as `RETROSPECTIVE_AGGREGATE`, and reconcile the count against
   Botalin's trials ledger (`tasks/results/TASK-022-...-RESULT.md`). The count is
   known to be a floor in both programmes; the result must say so.

6. **Integrate with `run_idea_autopilot.py`.** No `screening_pass` may be
   declared without a ledger write and a corrected figure. This modifies a
   factory file, which the root safety rules restrict — it is allowlisted below
   for this task only.

## Pre-registered thresholds

Frozen before the first corrected number exists:

- A result whose **BH-FDR-adjusted p exceeds 0.10** is not a screening pass,
  whatever its headline metrics.
- A result whose **DSR is below 0.95** is not holdout-eligible.
- A run that cannot compute DSR because its inputs were not retained reports
  `DSR_UNAVAILABLE` and is not holdout-eligible either. Absence of the statistic
  is not a pass.

## Acceptance

- Both self-check suites still pass unchanged (lifecycle 21, cost model 33).
- New self-checks prove: append-only behaviour; `CONTOUR_RECORD` consumes no
  budget; `TRIAL_RECORD` does; `selection_among` is preserved; DSR raises on a
  missing input rather than defaulting; Holm and BH agree with worked examples;
  the module refuses to blend DSR and FDR into one number.
- The search-space decision is recorded in the result with its reasoning.
- The two eras of evidence quality are stated explicitly.
- `check_paper_gate.py` still returns `blocked`.

## What this task cannot do

- It cannot make past results trustworthy. Deflating a number computed under an
  unrecorded search is an estimate of how wrong it might be, not a repair.
- It cannot recover the true trial count. Both programmes' counts are floors
  known to be too low.
- It does not evaluate any strategy.

## Multiplicity

This task is itself a `CONTOUR_RECORD`: no signal tested, no parameter selected.

## Allowlisted deliverables

1. `shared_kernel/trials_ledger.py`
2. `shared_kernel/p_value_deflation.py`
3. `shared_kernel/test_trials_ledger.py`
4. `shared_kernel/test_p_value_deflation.py`
5. `moex-futures-bot/src/moex_futures_bot/backtest.py` — retain `n_obs`, `skew`,
   `kurtosis` only; no change to any return, cost or signal computation
6. `moex-futures-bot/tools/run_idea_autopilot.py` — ledger write and corrected
   figure before any `screening_pass`
7. `tasks/results/TASK-SK-002-TRIALS-LEDGER-AND-P-VALUE-DEFLATION-V0-RESULT.md`
