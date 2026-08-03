# Idea Autopilot Plan

## Purpose

The idea autopilot generates fixed strategy ideas from a constrained idea space, tests them through the same walk-forward/cost/roll checks, and routes each idea to the next safe status.

It is not a live trader.

## Entry Points

- Idea space: `configs/idea_space/brent_v1.json`
- Generator: `tools/generate_strategy_ideas.py`
- Autopilot runner: `tools/run_idea_autopilot.py`

Generate ideas only:

```bash
.venv/bin/python tools/generate_strategy_ideas.py --config configs/idea_space/brent_v1.json --output data/reports/ideas_brent_v1.jsonl
```

Smoke autopilot:

```bash
.venv/bin/python tools/run_idea_autopilot.py --config configs/idea_space/brent_v1.json --max-ideas 12 --limit-combos 4
```

Full autopilot:

```bash
.venv/bin/python tools/run_idea_autopilot.py --config configs/idea_space/brent_v1.json
```

## Routing

- `rejected`: archive the idea.
- `research_lead_short_only`: needs strict-window confirmation or rework.
- `research_lead`: run a focused pack.
- `holdout_eligible`: freeze candidate for manual holdout review.
- `paper_candidate`: reserved for a future manual promotion after holdout.
- `quarantined_after_holdout_fail`: same-family neighbor of a failed holdout; archive for the same holdout period.
- `manual_live_review_required`: reserved for a future manual promotion after paper evidence.

## Hard Safety

- Auto paper is disabled.
- Auto live is disabled.
- Real orders are disabled.
- Holdout is excluded from the autopilot until a candidate is frozen in writing.
- A spent holdout rejects the configured family neighborhood, not only one parameter point.
- Short-window-only leads need permutation/block-bootstrap calibration before focused-pack escalation.
