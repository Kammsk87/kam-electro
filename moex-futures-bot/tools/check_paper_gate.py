#!/usr/bin/env python3
"""Check whether the paper/execution research gate is open.

Two independent checks, composed so that **either one can block and neither can
open**:

1. the original candidate-review check, unchanged in behaviour;
2. the shared-kernel lifecycle: no candidate identity may sit past
   `EXECUTION_REPLAY` without a recorded operator GO.

There is deliberately no code path that prints `open` on the strength of state
alone. `CandidateLifecycle.can_enter_paper()` returns False unconditionally, by
design: paper start requires a fresh explicit operator GO, which is a human act
and is not derivable from a state machine. A gate that could compute its own
authorisation is the gate that eventually grants it by accident.

Exit code 0 means open, 1 means blocked, as before.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))
sys.path.insert(0, str(REPO_ROOT))

from moex_futures_bot.storage import default_storage_paths  # noqa: E402

try:
    from shared_kernel.lifecycle import CandidateLifecycle, Stage  # noqa: E402

    LIFECYCLE_AVAILABLE = True
except ImportError:  # the kernel is optional for this check, never a bypass
    LIFECYCLE_AVAILABLE = False


LIFECYCLE_DIR = PROJECT_ROOT / "data" / "lifecycle"

#: Stages at or beyond which a candidate would be doing something that needs a GO.
GATED_STAGES = {
    Stage.QUARANTINED_PAPER_OBSERVER,
    Stage.MICRO_LIVE_MECHANICS,
    Stage.FORWARD_RETENTION,
    Stage.ROUTER_ADMISSION,
    Stage.PORTFOLIO_FORWARD,
} if LIFECYCLE_AVAILABLE else set()


def check_candidate_review() -> Tuple[bool, str]:
    paths = default_storage_paths(PROJECT_ROOT)
    reports = sorted(
        paths.reports_root.glob("candidate_review_*.md"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    if not reports:
        return False, "no candidate_review report found"
    latest = reports[0]
    text = latest.read_text(encoding="utf-8")
    if "Current gate verdict: `paper_candidate`" in text:
        return True, f"candidate_review declares paper_candidate: {latest}"
    return False, f"candidate_review does not declare paper_candidate: {latest}"


def check_lifecycle() -> Tuple[bool, str]:
    if not LIFECYCLE_AVAILABLE:
        return False, "shared_kernel.lifecycle not importable; absence of the machine is not permission"
    if not LIFECYCLE_DIR.exists():
        return False, "no lifecycle records: no candidate identity exists"

    records: List[CandidateLifecycle] = []
    for p in sorted(LIFECYCLE_DIR.glob("*.json")):
        try:
            records.append(CandidateLifecycle.load(p))
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            return False, f"unreadable lifecycle record {p.name}: {type(exc).__name__}"

    if not records:
        return False, "no candidate identity exists"

    open_ones = [r for r in records if not r.is_closed]
    if not open_ones:
        return False, f"all {len(records)} candidate identities are closed on a failure route"

    gated = [r for r in open_ones if r.stage in GATED_STAGES]
    for r in gated:
        last = r.history[-1] if r.history else None
        if not (last and last.operator_go_ref):
            return False, f"{r.candidate_id} sits at {r.stage.value} with no recorded operator GO"

    # Even a candidate that satisfies everything above does not open this gate.
    return False, (
        f"{len(open_ones)} open identity/identities, furthest at "
        f"{max(open_ones, key=lambda r: list(Stage).index(r.stage)).stage.value}; "
        "paper start still requires a fresh explicit operator GO, which no code path can supply"
    )


def main() -> int:
    review_open, review_why = check_candidate_review()
    lifecycle_open, lifecycle_why = check_lifecycle()

    if review_open and lifecycle_open:
        print("open")
        return 0

    print("blocked")
    print(f"  candidate_review: {'open' if review_open else 'blocked'} - {review_why}")
    print(f"  lifecycle:        {'open' if lifecycle_open else 'blocked'} - {lifecycle_why}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
