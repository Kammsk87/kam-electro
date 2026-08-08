# TASK-SK-002 Result — Trials Ledger And p-Value Deflation

Date: 2026-08-08
Deliverables: `shared_kernel/trials_ledger.py`, `shared_kernel/p_value_deflation.py`,
their self-checks, `backtest.py` moment retention, `data/trials_ledger.jsonl`

## Lifecycle footer

- Infrastructure. Enters and leaves no stage; creates no candidate.
- Self-checks: p-value deflation **28/28**, trials ledger **17/17**. Lifecycle
  21/21, cost model 33/33, term structure 21/21 still pass.
- `check_paper_gate.py` returns `blocked`.
- This task is itself a `CONTOUR_RECORD`.

## The headline: no MOEX result has ever survived multiplicity correction

Applied to every historical run carrying a p-value — 438 rows out of 3,762 across
the factory and idea-autopilot artefacts:

| | |
|---|---:|
| rows with a p-value | 438 |
| raw p < 0.05 | **51** (11.6%) |
| expected under pure noise | 21.9 |
| **BH-FDR q < 0.10** | **0** |
| **Holm p < 0.05** | **0** |
| best raw p | 0.0030 |
| that same result, BH-adjusted | 0.2737 |
| that same result, Holm-adjusted | 1.0000 |

51 passes against 22 expected is roughly 2.3× noise, which looks encouraging
until it is corrected. It is not enough for even the most permissive of the two
corrections to flag a single result. The best p-value in the entire history of
the MOEX search becomes 0.27 once the search that produced it is counted.

This is the number the project has been operating without.

## The search-space decision, recorded before the first deflated result

Deflation counts trials in the **matching search space** by default.

Botalin's 1,066 crypto trials never searched the BR calendar-spread space.
Deflating a MOEX result by them would be conservative in a way that is not merely
strict but wrong in kind: it would make every MOEX result unfalsifiable
regardless of quality, and an unfalsifiable gate teaches nothing. The counter
argument — same researchers, same selection process, so pool them — is real, and
so the pooled count is always *reportable* and never *automatic*. A task may
declare a wider space and must then say why.

Ledger state after backfill:

| search space | trials | contours |
|---|---:|---:|
| `moex.br.calendar_spread.1h` | **0** | 4 |
| `moex.br.directional_daily` | 3,762 | 0 |
| `botalin.crypto.pooled` | 1,066 | 0 |
| pooled, reportable only | 4,828 | — |

The calendar-spread space has consumed **zero** budget. TASK-MX-001 through -004
measured venue properties with no rule under test; MX-001 carries
`selection_among: 4` because Stage 0 measured four horizons and named the
survivors, and any later claim on a selected horizon must report that.

## Two eras of evidence quality, stated rather than blurred

DSR needs the skewness, kurtosis and length of the return series. `backtest.py`
discarded the series and kept only aggregates, so **DSR is not computable for any
run this project made before today**. Those runs enter as
`RETROSPECTIVE_AGGREGATE`, exactly as Botalin's 1,046 aggregate-only trials do.

From today `backtest.py` retains `return_n_obs`, `return_skew`,
`return_kurtosis` and a non-annualised `sharpe_per_period`. Runs after this point
are DSR-computable; runs before it report `DSR_UNAVAILABLE`, which under the
frozen thresholds is not holdout-eligible.

## A bug caught twice, by the same mechanism

`sharpe_moments` guarded degenerate input with `variance <= 0`. A constant series
like `[0.1] * 10` leaves a residual variance around 1e-34 from floating-point
representation, which sails past that check and yields a Sharpe of **7.2 × 10¹⁵**.

The guard was fixed in the kernel to be relative to the scale of the data — and
then the identical bug appeared a second time in `backtest.py`, because the
moment arithmetic had been written there separately. That is the argument for a
shared kernel made concrete: `backtest.py` now delegates to
`shared_kernel.p_value_deflation.sharpe_moments`, and there is one implementation
to be wrong in.

## Three refusals the modules make, and why each default would flatter

- **`deflated_sharpe_ratio` raises on any missing input.** Zero variance across
  trials removes the deflation entirely; zero skew and kurtosis 3 assume a
  normality returns do not have; a guessed T scales the whole statistic.
- **`sharpe_variance` returns None below two trials** rather than zero. Zero
  would turn DSR into an ordinary Sharpe wearing a stricter name.
- **Excess kurtosis is rejected outright.** The formula takes raw kurtosis where
  a normal distribution reads 3.0; passing the excess form silently inflates the
  result, and 0.0 is exactly what an excess-kurtosis caller would pass.

The modules also refuse to blend DSR and FDR into one "corrected p". They answer
different questions: DSR corrects a single Sharpe selected as the best of N; Holm
and BH correct a family of p-values.

## Something learned about DSR that the tests now pin

Negative skew and fat tails **do not always lower** the DSR. The moments enter
through the denominator, so they shrink whatever the numerator is. When the
Sharpe sits below the expected maximum the numerator is negative and fat tails
push the DSR *up*. Two tests assert both regimes, so that nobody later "fixes"
the behaviour into a blanket rule and breaks the mathematics.

## What this task does not do

- It does not make past results trustworthy. Deflating a number computed under an
  unrecorded search estimates how wrong it might be; it does not repair it.
- It does not recover the true trial count. Both programmes' counts are floors
  known to be too low — 3,762 MOEX rows include only those that were written to
  an artefact at all.
- `run_idea_autopilot.py` is **not yet wired** to the ledger. That was item 6 of
  the task and is deferred: the autopilot is a factory file, the wiring changes
  what it may declare a screening pass, and doing it in the same commit as the
  statistics would mix infrastructure with a behavioural change to a gate. It is
  the first item of the follow-up.

## Next

`TASK-MX-006` is now unblocked on its dependency. Before it runs, the autopilot
wiring should land, so that the first frozen MOEX rule is recorded as a
`TRIAL_RECORD` at the moment it is tested rather than reconstructed afterwards.
