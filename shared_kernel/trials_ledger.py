"""Shared kernel — the append-only trials ledger.

Multiplicity is a property of the search that produced a result, so the count of
searches has to be a fact on disk rather than a recollection. This ledger is that
fact.

**The search-space decision, settled 2026-08-07 and recorded here because after
the first deflated result it is no longer a neutral choice.**

Deflation counts trials in the *matching search space* by default. Botalin's
crypto trials never searched the BR calendar-spread space; deflating a MOEX
result by 1,066 unrelated attempts would be conservative in a way that is not
merely strict but wrong in kind, and an unfalsifiable gate teaches nothing. The
pooled count across spaces is always *reportable* and never *automatic*: a task
may declare a wider space explicitly and must then say why.

**Two record types.**

* `TRIAL_RECORD` — a result about a specific rule's performance was produced and
  could have changed a decision about that rule. Consumes multiplicity budget.
* `CONTOUR_RECORD` — a property of the venue or instrument was measured with no
  rule under test. TASK-MX-001 through -004 are all of this kind. Consumes none.

A contour measurement can still carry selection: Stage 0 measured four horizons
and named the survivors. Such a record takes `selection_among`, and any later
claim built on the selected variant must report it. Recording that honestly is
the difference between a contour record and a loophole.

Append-only. Records are never edited or deleted; a correction is a new record
that supersedes an old one by id.

Pure Python and stdlib only. Safety: writes exactly one file the caller names.
No network, credential or order path.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

__all__ = [
    "LedgerError",
    "TrialRecord",
    "TrialsLedger",
    "TRIAL_RECORD",
    "CONTOUR_RECORD",
    "RETROSPECTIVE_AGGREGATE",
]

TRIAL_RECORD = "TRIAL_RECORD"
CONTOUR_RECORD = "CONTOUR_RECORD"
RETROSPECTIVE_AGGREGATE = "RETROSPECTIVE_AGGREGATE"

_RECORD_TYPES = {TRIAL_RECORD, CONTOUR_RECORD, RETROSPECTIVE_AGGREGATE}

#: Types that consume multiplicity budget.
_COUNTS_TOWARD_MULTIPLICITY = {TRIAL_RECORD, RETROSPECTIVE_AGGREGATE}


class LedgerError(Exception):
    """A refusal by the ledger."""


@dataclass(frozen=True)
class TrialRecord:
    trial_id: str
    record_type: str
    search_space: str          # venue.instrument.mechanism.timeframe
    family: str
    task_id: str
    evidence_path: str
    params: Dict[str, Any] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    p_value: Optional[float] = None
    sharpe_per_period: Optional[float] = None
    n_obs: Optional[int] = None
    skew: Optional[float] = None
    kurtosis: Optional[float] = None
    selection_among: int = 1
    batch_size: int = 1        # >1 only for RETROSPECTIVE_AGGREGATE
    note: str = ""
    commit: str = ""

    def __post_init__(self) -> None:
        if self.record_type not in _RECORD_TYPES:
            raise LedgerError(f"UNKNOWN_RECORD_TYPE: {self.record_type!r}; known: {sorted(_RECORD_TYPES)}")
        for name in ("trial_id", "search_space", "family", "task_id", "evidence_path"):
            if not str(getattr(self, name)).strip():
                raise LedgerError(f"LEDGER_UNTRACEABLE: {name} is required")
        if self.p_value is not None and not (0.0 <= self.p_value <= 1.0):
            raise LedgerError(f"BAD_PVALUE: {self.p_value}")
        if self.selection_among < 1:
            raise LedgerError(f"BAD_SELECTION_AMONG: {self.selection_among}")
        if self.batch_size < 1:
            raise LedgerError(f"BAD_BATCH_SIZE: {self.batch_size}")
        if self.batch_size > 1 and self.record_type != RETROSPECTIVE_AGGREGATE:
            raise LedgerError(
                "BATCH_ONLY_FOR_RETROSPECTIVE: a batch of size >1 is how historical runs "
                "that were never recorded individually enter the ledger. A live trial is "
                "recorded one at a time or its count is a guess."
            )

    @property
    def multiplicity_weight(self) -> int:
        """How much budget this record consumes.

        A contour record consumes none — but if it selected among n variants, the
        selection is still real and is surfaced by `selection_among`, which
        callers must report even though it is not counted here.
        """
        if self.record_type not in _COUNTS_TOWARD_MULTIPLICITY:
            return 0
        return self.batch_size


class TrialsLedger:
    """Append-only JSONL ledger."""

    def __init__(self, path: Any):
        self.path = Path(path)

    # ---- writing ---------------------------------------------------------

    def append(self, record: TrialRecord) -> TrialRecord:
        if self.path.exists():
            existing = {r.trial_id for r in self.read()}
            if record.trial_id in existing:
                raise LedgerError(
                    f"DUPLICATE_TRIAL_ID: {record.trial_id}. The ledger is append-only; a "
                    "correction is a new record with a new id that supersedes the old one."
                )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(asdict(record), ensure_ascii=False, sort_keys=True) + "\n")
        return record

    # ---- reading ---------------------------------------------------------

    def read(self, search_space: Optional[str] = None) -> List[TrialRecord]:
        if not self.path.exists():
            return []
        out: List[TrialRecord] = []
        for line_no, line in enumerate(self.path.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                out.append(TrialRecord(**json.loads(line)))
            except (json.JSONDecodeError, TypeError, LedgerError) as exc:
                raise LedgerError(f"UNREADABLE_LEDGER_LINE {line_no}: {type(exc).__name__}: {exc}")
        if search_space is not None:
            out = [r for r in out if r.search_space == search_space]
        return out

    # ---- multiplicity ----------------------------------------------------

    def trial_count(self, search_space: Optional[str] = None) -> int:
        """Trials consuming budget. Pass a search_space; omitting it pools ALL
        spaces, which is reportable but never the automatic choice."""
        return sum(r.multiplicity_weight for r in self.read(search_space))

    def pvalue_family(self, search_space: str) -> List[TrialRecord]:
        """Records in one space carrying a p-value, for a family-wise correction."""
        return [r for r in self.read(search_space) if r.p_value is not None]

    def sharpe_variance(self, search_space: str) -> Optional[float]:
        """Variance of Sharpe across trials in one space — a DSR input.

        Returns None when fewer than two trials carry a Sharpe. Substituting zero
        would remove the deflation entirely and turn DSR into an ordinary Sharpe
        wearing a stricter name.
        """
        values = [
            r.sharpe_per_period
            for r in self.read(search_space)
            if r.record_type == TRIAL_RECORD and r.sharpe_per_period is not None
        ]
        if len(values) < 2:
            return None
        mean = sum(values) / len(values)
        return sum((v - mean) ** 2 for v in values) / (len(values) - 1)

    def summary(self) -> Dict[str, Dict[str, int]]:
        spaces: Dict[str, Dict[str, int]] = {}
        for r in self.read():
            s = spaces.setdefault(r.search_space, {"trials": 0, "contours": 0, "records": 0})
            s["records"] += 1
            if r.multiplicity_weight:
                s["trials"] += r.multiplicity_weight
            else:
                s["contours"] += 1
        return spaces
