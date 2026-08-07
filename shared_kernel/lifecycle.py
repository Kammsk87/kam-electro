"""Shared kernel — the candidate lifecycle state machine.

This is a faithful port of `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, which is
the authoritative definition for both Botalin and the MOEX futures bot. It is
venue-agnostic on purpose: nothing here knows about an exchange, an instrument,
a fee or a signal.

Four properties this module exists to enforce, each of which a plain enum plus a
`current_stage` attribute would not give you:

1. **Transitions are adjacent.** A candidate cannot skip from feasibility to a
   live allocation because someone passed the wrong enum member. The whole point
   of a ladder is that its rungs are in order.

2. **Failure routes are mostly NOT terminal.** `STRUCTURAL_VARIANT`,
   `DATA_REQUEST` and `GUARD_ONLY` are how work continues after a negative
   result — TASK-MX-001 was routed to `DATA_REQUEST` and that is precisely how
   TASK-MX-002 came to exist. Making every route terminal would have made the
   project's own history illegal.

3. **Identity is part of the state.** Per the lifecycle document: «Every
   transition is one-way for a specific `model_id` and `RESET_TS`. A changed rule
   is a new candidate, not a repair of history.» Without identity, a tweaked rule
   silently inherits the evidence of the rule it replaced.

4. **Paper and live are never reachable from code.** `MICRO_LIVE_MECHANICS`
   requires «a fresh explicit operator GO for this specific run. Not a standing
   authorization, not implied by any earlier stage.» This module cannot mint one
   and offers no method that does.

Safety: pure state machine. No network, no filesystem writes except an explicit
`save()` the caller asks for, no credential, no order path.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

__all__ = [
    "Stage",
    "Route",
    "LifecycleError",
    "IllegalTransition",
    "OperatorGoRequired",
    "TransitionRecord",
    "CandidateLifecycle",
    "LADDER_TO_STAGE",
]


class Stage(Enum):
    """The ten states of the lifecycle, in order."""

    DATA_HEALTH = "DATA_HEALTH"
    DISCOVERY = "DISCOVERY"
    CANDIDATE_PASSPORT = "CANDIDATE_PASSPORT"
    IDEAL_FILL_AND_OOS = "IDEAL_FILL_AND_OOS"
    EXECUTION_REPLAY = "EXECUTION_REPLAY"
    QUARANTINED_PAPER_OBSERVER = "QUARANTINED_PAPER_OBSERVER"
    MICRO_LIVE_MECHANICS = "MICRO_LIVE_MECHANICS"
    FORWARD_RETENTION = "FORWARD_RETENTION"
    ROUTER_ADMISSION = "ROUTER_ADMISSION"
    PORTFOLIO_FORWARD = "PORTFOLIO_FORWARD"


class Route(Enum):
    """The five failure routes. A negative result takes exactly one of them.

    Three are not terminal: they are how the programme continues.
    """

    STRUCTURAL_VARIANT = "STRUCTURAL_VARIANT"
    DATA_REQUEST = "DATA_REQUEST"
    GUARD_ONLY = "GUARD_ONLY"
    QUARANTINE = "QUARANTINE"
    REJECTED_FAMILY = "REJECTED_FAMILY"


#: Routes from which work can resume, and under what condition.
NON_TERMINAL_ROUTES: Set[Route] = {
    Route.STRUCTURAL_VARIANT,
    Route.DATA_REQUEST,
    Route.GUARD_ONLY,
}

#: Routes that end this model identity. A family returns only as a new identity
#: with a recorded structural difference and a new task ID.
TERMINAL_ROUTES: Set[Route] = {Route.QUARANTINE, Route.REJECTED_FAMILY}

_ORDER: List[Stage] = list(Stage)

#: Legal forward transitions. Strictly one rung at a time, one way.
ALLOWED: Dict[Stage, Set[Stage]] = {
    a: {b} for a, b in zip(_ORDER, _ORDER[1:])
}
ALLOWED[Stage.PORTFOLIO_FORWARD] = set()

#: Stages whose entry requires a fresh operator GO that this module cannot mint.
REQUIRES_OPERATOR_GO: Set[Stage] = {
    Stage.QUARANTINED_PAPER_OBSERVER,
    Stage.MICRO_LIVE_MECHANICS,
    Stage.PORTFOLIO_FORWARD,
}

#: The Stage 0-4 ladder in BOTALIN_RESEARCH_PIPELINE_PROTOCOL is a different
#: framing of the same machine, not a different machine. This is the mapping.
LADDER_TO_STAGE: Dict[str, Stage] = {
    "STAGE_0_FEASIBILITY": Stage.DATA_HEALTH,
    "STAGE_1_IDEAL_FILL_AND_OOS": Stage.IDEAL_FILL_AND_OOS,
    "STAGE_2_EXECUTION_REPLAY": Stage.EXECUTION_REPLAY,
    "STAGE_3_PAPER_OBSERVER": Stage.QUARANTINED_PAPER_OBSERVER,
    "STAGE_4_MICRO_LIVE_MECHANICS": Stage.MICRO_LIVE_MECHANICS,
}


class LifecycleError(Exception):
    """Any refusal by the state machine."""


class IllegalTransition(LifecycleError):
    """A transition that is not adjacent, not forward, or out of a closed state."""


class OperatorGoRequired(LifecycleError):
    """A stage that only a human can authorise was requested without one."""


@dataclass(frozen=True)
class TransitionRecord:
    from_state: str
    to_state: str
    kind: str  # "STAGE" or "ROUTE"
    at: str
    reason: str
    evidence: str
    task_id: str
    operator_go_ref: Optional[str] = None


@dataclass
class CandidateLifecycle:
    """One model identity moving through the ladder.

    `model_id` and `reset_ts` together are the identity. A changed rule gets a
    new instance via `structural_variant()`; it never rewrites this one.
    """

    candidate_id: str
    family: str
    model_id: str
    reset_ts: str
    stage: Stage = Stage.DATA_HEALTH
    route: Optional[Route] = None
    history: List[TransitionRecord] = field(default_factory=list)
    parent_model_id: Optional[str] = None
    structural_difference: Optional[str] = None

    # ---- queries ---------------------------------------------------------

    @property
    def is_closed(self) -> bool:
        """True when this identity can no longer advance."""
        return self.route is not None

    @property
    def can_resume(self) -> bool:
        return self.route in NON_TERMINAL_ROUTES if self.route else False

    def can_enter_paper(self) -> bool:
        """Deliberately always False.

        Reachability of paper is not a property of the state machine. Paper start
        requires a fresh explicit operator GO, and a module that could answer
        True would be the thing that eventually answers True by accident. Ask
        `stage_is(Stage.EXECUTION_REPLAY)` and require the GO separately.
        """
        return False

    def stage_is(self, stage: Stage) -> bool:
        return (not self.is_closed) and self.stage is stage

    # ---- transitions -----------------------------------------------------

    def advance(
        self,
        to: Stage,
        *,
        reason: str,
        evidence: str,
        task_id: str,
        operator_go_ref: Optional[str] = None,
        now: Optional[str] = None,
    ) -> "CandidateLifecycle":
        """Move one rung up the ladder.

        `evidence` and `task_id` are mandatory: a transition nobody can trace to
        a report is a transition that did not happen.
        """
        if self.is_closed:
            raise IllegalTransition(
                f"{self.candidate_id} is closed on route {self.route.value}; "
                f"{'use structural_variant() to open a NEW identity' if self.can_resume else 'this identity is terminal'}"
            )
        if not isinstance(to, Stage):
            raise IllegalTransition(f"not a Stage: {to!r}")
        if to not in ALLOWED[self.stage]:
            legal = sorted(s.value for s in ALLOWED[self.stage]) or ["<none: end of ladder>"]
            raise IllegalTransition(
                f"{self.stage.value} -> {to.value} is not adjacent; legal next: {legal}"
            )
        if not reason.strip() or not evidence.strip() or not task_id.strip():
            raise LifecycleError("TRANSITION_UNTRACEABLE: reason, evidence and task_id are all required")
        if to in REQUIRES_OPERATOR_GO and not (operator_go_ref or "").strip():
            raise OperatorGoRequired(
                f"{to.value} requires a fresh explicit operator GO for this specific run. "
                "It is not a standing authorization and is not implied by any earlier stage."
            )

        self.history.append(
            TransitionRecord(
                from_state=self.stage.value,
                to_state=to.value,
                kind="STAGE",
                at=now or _utc_now(),
                reason=reason,
                evidence=evidence,
                task_id=task_id,
                operator_go_ref=operator_go_ref,
            )
        )
        self.stage = to
        return self

    def route_to(
        self,
        route: Route,
        *,
        reason: str,
        evidence: str,
        task_id: str,
        now: Optional[str] = None,
    ) -> "CandidateLifecycle":
        """Close this identity on exactly one named failure route."""
        if self.is_closed:
            raise IllegalTransition(f"{self.candidate_id} is already closed on {self.route.value}")
        if not isinstance(route, Route):
            raise IllegalTransition(f"not a Route: {route!r}")
        if not reason.strip() or not evidence.strip() or not task_id.strip():
            raise LifecycleError("ROUTE_UNTRACEABLE: reason, evidence and task_id are all required")

        self.history.append(
            TransitionRecord(
                from_state=self.stage.value,
                to_state=route.value,
                kind="ROUTE",
                at=now or _utc_now(),
                reason=reason,
                evidence=evidence,
                task_id=task_id,
            )
        )
        self.route = route
        return self

    def structural_variant(
        self,
        *,
        new_model_id: str,
        structural_difference: str,
        task_id: str,
        reset_ts: Optional[str] = None,
        resume_at: Stage = Stage.DATA_HEALTH,
    ) -> "CandidateLifecycle":
        """Open a NEW identity after a non-terminal route.

        This is the only way a closed candidate's line of work continues, and it
        deliberately produces a different object. The lifecycle document is
        explicit: a changed rule is a new candidate, not a repair of history.
        """
        if not self.is_closed:
            raise LifecycleError("STILL_OPEN: a structural variant is opened from a closed identity")
        if self.route in TERMINAL_ROUTES:
            raise IllegalTransition(
                f"{self.route.value} is terminal for this family neighbourhood. A return requires a new "
                "task ID, a recorded structural difference AND confirmation on data generated after the "
                "failure was recorded; it is not a variant of this identity."
            )
        if not structural_difference.strip():
            raise LifecycleError(
                "STRUCTURAL_DIFFERENCE_REQUIRED: a variant without a recorded difference is a retry"
            )
        if new_model_id == self.model_id:
            raise LifecycleError("MODEL_ID_UNCHANGED: a new identity needs a new model_id")

        child = CandidateLifecycle(
            candidate_id=f"{self.candidate_id}+{new_model_id}",
            family=self.family,
            model_id=new_model_id,
            reset_ts=reset_ts or _utc_now(),
            stage=resume_at,
            parent_model_id=self.model_id,
            structural_difference=structural_difference,
        )
        child.history.append(
            TransitionRecord(
                from_state=f"{self.model_id}@{self.route.value}",
                to_state=resume_at.value,
                kind="ROUTE",
                at=child.reset_ts,
                reason=f"structural variant of {self.model_id}: {structural_difference}",
                evidence=f"parent history: {len(self.history)} transitions",
                task_id=task_id,
            )
        )
        return child

    # ---- persistence -----------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["stage"] = self.stage.value
        d["route"] = self.route.value if self.route else None
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CandidateLifecycle":
        obj = cls(
            candidate_id=d["candidate_id"],
            family=d["family"],
            model_id=d["model_id"],
            reset_ts=d["reset_ts"],
            stage=Stage(d["stage"]),
            route=Route(d["route"]) if d.get("route") else None,
            parent_model_id=d.get("parent_model_id"),
            structural_difference=d.get("structural_difference"),
        )
        obj.history = [TransitionRecord(**r) for r in d.get("history", [])]
        return obj

    def save(self, path: Any) -> None:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def load(cls, path: Any) -> "CandidateLifecycle":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
