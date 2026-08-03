# Test Factory Plan

## Purpose

The factory makes strategy research reproducible. A strategy idea must pass the same data, cost, roll, window, and gate checks before it can become a paper candidate.

The factory is research-only. It does not submit orders and does not open paper mode.

## Current Entry Points

- Config: `configs/experiments/brent_research_v1.json`
- Runner: `tools/run_experiment_factory.py`
- Summary: `tools/summarize_experiment_results.py`
- Gate: `tools/check_paper_gate.py`

Example:

```bash
.venv/bin/python tools/run_experiment_factory.py --config configs/experiments/brent_research_v1.json
```

Smoke example:

```bash
.venv/bin/python tools/run_experiment_factory.py --config configs/experiments/brent_research_v1.json --limit-combos 1
```

## Output

Each run creates:

- `data/reports/factory/<run_id>/config.json`
- `data/reports/factory/<run_id>/results.jsonl`
- `data/reports/factory/<run_id>/failures.jsonl`
- `data/reports/factory/<run_id>/summary.json`
- `data/reports/factory/<run_id>/report.md`

## Status Model

- `rejected`: no useful screening evidence.
- `research_lead_short_only`: short-window evidence only.
- `research_lead`: some strict or robust evidence, but not enough for holdout.
- `holdout_eligible`: robust strict-window pass plus short-window support.
- `paper_candidate`: reserved for future use after a successful preregistered holdout and explicit user approval.
- `quarantined_after_holdout_fail`: same-family neighbor of a failed holdout on the same spent period.

## Current Safety Rule

Holdout remains excluded from the factory. It is used only once a candidate is frozen in writing.
After a holdout fail, neighboring ideas from the same configured family cannot be routed back to focused-pack or holdout on that same period. Short-window leads also require a block-shuffled null check, so pass counts are evaluated against the factory's own false-positive baseline rather than as absolute totals.
