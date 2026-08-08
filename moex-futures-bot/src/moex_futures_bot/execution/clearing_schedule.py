"""MOEX FORTS session and clearing schedule.

A pure function of the clock. No data dependency, no network, no broker.

The boundaries below are the venue's published schedule, not a preference. If
MOEX changes them, that is a schedule change and a **new dated constant**, not an
edit of the old one: a backtest run under the old schedule must stay
reproducible.

Source: MOEX derivatives market trading schedule, as in force 2026-08.
Recorded here because a bare time constant with no provenance is the same defect
the cost model exists to prevent.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from enum import Enum
from typing import Optional

__all__ = ["Session", "Decision", "GuardVerdict", "SCHEDULE_2026_08", "ClearingScheduleGuard"]


class Session(Enum):
    CLOSED = "CLOSED"
    MAIN = "MAIN_SESSION"
    CLEARING_DAY = "CLEARING_DAY"
    CLEARING_EVENING = "CLEARING_EVENING"
    EVENING = "EVENING_SESSION"


class Decision(Enum):
    ALLOW = "ALLOW"
    BLOCK = "BLOCK"


@dataclass(frozen=True)
class GuardVerdict:
    """A decision that always carries its reason.

    There is no bare boolean: a caller that is blocked must be able to say why,
    and a caller that is allowed must be able to show it asked.
    """

    decision: Decision
    reason: str
    session: Session
    cancel_resting_orders: bool = False

    @property
    def allowed(self) -> bool:
        return self.decision is Decision.ALLOW


@dataclass(frozen=True)
class Schedule:
    schedule_id: str
    effective_from: str
    main_open: time
    main_close: time
    clearing_day_start: time
    clearing_day_end: time
    clearing_evening_start: time
    clearing_evening_end: time
    evening_close: time
    #: Entries are blocked this many minutes before a clearing window opens.
    block_lead_minutes: int
    #: Resting limit orders are cancelled this many minutes before it opens.
    cancel_lead_minutes: int


SCHEDULE_2026_08 = Schedule(
    schedule_id="MOEX.FORTS.SCHEDULE.2026-08",
    effective_from="2026-08-01",
    main_open=time(10, 0),
    main_close=time(18, 50),
    clearing_day_start=time(14, 0),
    clearing_day_end=time(14, 5),
    clearing_evening_start=time(18, 50),
    clearing_evening_end=time(19, 5),
    evening_close=time(23, 50),
    block_lead_minutes=5,
    cancel_lead_minutes=2,
)


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


class ClearingScheduleGuard:
    """Blocks entries around clearing, and says why."""

    def __init__(self, schedule: Schedule = SCHEDULE_2026_08):
        self.schedule = schedule

    def session_at(self, t: time) -> Session:
        s = self.schedule
        m = _minutes(t)
        if _minutes(s.clearing_day_start) <= m < _minutes(s.clearing_day_end):
            return Session.CLEARING_DAY
        if _minutes(s.clearing_evening_start) <= m < _minutes(s.clearing_evening_end):
            return Session.CLEARING_EVENING
        if _minutes(s.main_open) <= m < _minutes(s.main_close):
            return Session.MAIN
        if _minutes(s.clearing_evening_end) <= m < _minutes(s.evening_close):
            return Session.EVENING
        return Session.CLOSED

    def _lead_window(self, t: time, lead: int) -> Optional[str]:
        """Which clearing this time is inside `lead` minutes of, if any."""
        s = self.schedule
        m = _minutes(t)
        for name, start in (
            ("day clearing", s.clearing_day_start),
            ("evening clearing", s.clearing_evening_start),
        ):
            if _minutes(start) - lead <= m < _minutes(start):
                return name
        return None

    def check_entry(self, t: time) -> GuardVerdict:
        """May a new position be opened at this time?"""
        session = self.session_at(t)
        if session is Session.CLEARING_DAY:
            return GuardVerdict(Decision.BLOCK, "inside the day clearing window", session, True)
        if session is Session.CLEARING_EVENING:
            return GuardVerdict(Decision.BLOCK, "inside the evening clearing window", session, True)
        if session is Session.CLOSED:
            return GuardVerdict(Decision.BLOCK, "market closed", session)

        pending = self._lead_window(t, self.schedule.block_lead_minutes)
        if pending:
            cancel = self._lead_window(t, self.schedule.cancel_lead_minutes) is not None
            return GuardVerdict(
                Decision.BLOCK,
                f"within {self.schedule.block_lead_minutes} minutes of the {pending}",
                session,
                cancel,
            )
        return GuardVerdict(Decision.ALLOW, f"{session.value} and clear of any clearing window", session)

    def should_cancel_resting(self, t: time) -> GuardVerdict:
        """Must resting limit orders be pulled at this time?"""
        session = self.session_at(t)
        if session in (Session.CLEARING_DAY, Session.CLEARING_EVENING):
            return GuardVerdict(Decision.BLOCK, f"inside {session.value}", session, True)
        pending = self._lead_window(t, self.schedule.cancel_lead_minutes)
        if pending:
            return GuardVerdict(
                Decision.BLOCK,
                f"within {self.schedule.cancel_lead_minutes} minutes of the {pending}",
                session,
                True,
            )
        return GuardVerdict(Decision.ALLOW, "no clearing imminent", session)
