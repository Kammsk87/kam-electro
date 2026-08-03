#!/usr/bin/env python3
"""Generate fixed strategy ideas from an idea-space config."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", help="Optional JSONL output path.")
    parser.add_argument("--family", action="append", help="Only generate this family. Can be repeated.")
    parser.add_argument("--max-ideas", type=int, default=0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config_path = _resolve(args.config)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    ideas = generate_ideas(config, families=args.family, max_ideas=args.max_ideas)
    if args.output:
        out_path = _resolve(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as handle:
            for idea in ideas:
                handle.write(json.dumps(idea, ensure_ascii=False, sort_keys=True) + "\n")
    print(json.dumps({"ideas": len(ideas), "output": args.output or ""}, ensure_ascii=False, indent=2))
    return 0


def generate_ideas(config: dict[str, Any], families: list[str] | None = None, max_ideas: int = 0) -> list[dict[str, Any]]:
    selected_families = families or list(config["families"].keys())
    ideas: list[dict[str, Any]] = []
    for family in selected_families:
        grid = config["families"][family]
        keys = list(grid.keys())
        for values in itertools.product(*(grid[key] for key in keys)):
            params = dict(zip(keys, values))
            if not _passes_constraints(family, params, config.get("constraints", {})):
                continue
            idea_id = _idea_id(family, params)
            ideas.append(
                {
                    "id": idea_id,
                    "family": family,
                    "params": params,
                    "status": "idea",
                    "route": "research_test_factory",
                }
            )
            if max_ideas and len(ideas) >= max_ideas:
                return ideas
    return ideas


def _passes_constraints(family: str, params: dict[str, Any], constraints: dict[str, list[str]]) -> bool:
    for constraint in constraints.get(family, []):
        if constraint == "fast < slow" and not (float(params["fast"]) < float(params["slow"])):
            return False
    return True


def _idea_id(family: str, params: dict[str, Any]) -> str:
    normalized = json.dumps(params, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha1(f"{family}:{normalized}".encode("utf-8")).hexdigest()[:10]
    return f"{family}_{digest}"


def _resolve(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


if __name__ == "__main__":
    raise SystemExit(main())
