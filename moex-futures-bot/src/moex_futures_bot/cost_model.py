"""The single source of truth for the MOEX FORTS round-trip cost floor.

Why this module exists
----------------------
`configs/idea_space/brent_v1.json` sweeps `cost_bps: [0, 10, 25, 50]` and calls 25
"robust". None of those four values is derived from anything, and
`backtest.py` defaults `exchange_fee_rub` and `broker_fee_rub` to zero underneath
them. Botalin already paid for this exact mistake on the crypto side: a bare `11`
bps constant was hardcoded in six engines, was wrong by roughly 5 bps, and 37
hypotheses were judged against it before anyone re-derived it.

The rule this module enforces is that **a floor may not be a bare number**. Every
value it returns carries the schedule entry it came from and the measurement
behind that entry, and `require_floor` raises rather than returning a default
when the schedule, the date, or the execution basis is missing.

What is different from the crypto cost model
--------------------------------------------
FORTS charges a flat rouble fee per contract per side, not a percentage of
notional. Basis points are therefore *derived*, not primitive: the same contract
costs a different number of bps at a different price. `require_floor` returns
roubles; it returns bps only if the caller supplies the reference price that
makes bps meaningful.

Scope of honesty
----------------
This schedule has no broker commission, no measured spread and no measured
slippage, because no MOEX order has ever been placed by this project and
`data/market/finam/orderbook/` is empty. Everything this module returns is a
LOWER BOUND on the true cost. `CostFloor.is_lower_bound` says so, and
`execution_basis="MEASURED"` raises instead of substituting a proxy.

Safety: no network, process, service, credential, exchange, account or order
path. Reads one explicitly supplied JSON file. Deterministic.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

__all__ = [
    "CostModelError",
    "ExecutionBasisUnavailable",
    "CostFloor",
    "DEFAULT_SCHEDULE_PATH",
    "load_schedule",
    "entry_as_of",
    "require_floor",
    "contract_notional_rub",
]

_REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_SCHEDULE_PATH = _REPO_ROOT / "configs" / "costs" / "moex_forts_fee_schedule_2026-08-06.json"

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CostModelError(Exception):
    """Any refusal by the cost model. Never caught internally to return a default."""


class ExecutionBasisUnavailable(CostModelError):
    """The requested execution basis has no measurement behind it on this venue."""


@dataclass(frozen=True)
class CostFloor:
    """A cost floor that cannot be quoted without its derivation.

    There is deliberately no way to obtain the number alone: a caller that wants
    67 roubles must carry the reason it is 67.
    """

    roundtrip_rub: float
    legs: int
    scalper: bool
    stress: bool
    execution_basis: str
    instrument: str
    as_of: str

    fee_component_rub: float
    execution_component_rub: float
    broker_component_rub: float
    fee_basis: str
    fee_source: str
    execution_note: str
    broker_basis: str
    exit_route: str

    minstep: float
    rub_per_price_point: float
    initial_margin_rub: Optional[float]
    margin_blocked_rub: Optional[float]
    margining_rule_used: Optional[str]
    margining_rule_basis: Optional[str]
    margining_rule_in_force: Optional[str]

    schedule_id: str
    schedule_version: str
    entry_tier: str
    entry_effective_from: str

    is_lower_bound: bool
    lower_bound_reasons: List[str] = field(default_factory=list)
    undetermined: List[str] = field(default_factory=list)

    reference_price: Optional[float] = None
    contract_notional_rub: Optional[float] = None
    roundtrip_bps: Optional[float] = None

    def bps_at(self, price: float) -> float:
        """Basis points of one leg's notional at `price`.

        Separate from `roundtrip_bps` so that a caller who did not declare a
        reference price up front has to declare one here, explicitly.
        """
        if not isinstance(price, (int, float)) or price <= 0:
            raise CostModelError(f"COST_MODEL_BAD_PRICE: {price!r}")
        return self.roundtrip_rub / contract_notional_rub(price, self.rub_per_price_point) * 10_000.0

    def citation(self) -> str:
        """One-line provenance, so the floor is never quoted bare in a report."""
        bps = f" = {self.roundtrip_bps:.2f} bps at {self.reference_price}" if self.roundtrip_bps is not None else ""
        bound = " LOWER BOUND" if self.is_lower_bound else ""
        marg = ""
        if self.margin_blocked_rub is not None and self.legs == 2:
            marg = (
                f", margin blocked {self.margin_blocked_rub:,.0f} RUB under {self.margining_rule_used}"
                f" [{self.margining_rule_basis}; rule in force {self.margining_rule_in_force}]"
            )
        return (
            f"{self.roundtrip_rub:.2f} RUB per contract round trip ({self.legs}-leg, "
            f"{'scalper' if self.scalper else 'non-scalper'}, {self.exit_route}"
            f"{', double-cost stress' if self.stress else ''}, execution basis {self.execution_basis})"
            f"{bps}{bound} = {self.fee_component_rub:.2f} exchange fee [{self.fee_basis}] + "
            f"{self.broker_component_rub:.2f} broker [{self.broker_basis}] + "
            f"{self.execution_component_rub:.2f} execution [{self.execution_note}]{marg}, "
            f"schedule {self.schedule_id} v{self.schedule_version} entry {self.entry_tier} "
            f"effective {self.entry_effective_from}, source {self.fee_source}"
        )


def contract_notional_rub(price: float, rub_per_price_point: float) -> float:
    """Rouble notional of one contract: price * (stepprice / minstep)."""
    return price * rub_per_price_point


def load_schedule(path: Any = DEFAULT_SCHEDULE_PATH) -> Dict[str, Any]:
    """Load the schedule, or raise. There is no built-in fallback schedule."""
    p = Path(path).resolve()
    if not p.exists():
        raise CostModelError(f"FEE_SCHEDULE_MISSING: {p}")
    schedule = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(schedule.get("entries"), list) or not schedule["entries"]:
        raise CostModelError("FEE_SCHEDULE_EMPTY")
    if not schedule.get("execution_bases"):
        raise CostModelError("FEE_SCHEDULE_NO_EXECUTION_BASES")
    return schedule


def entry_as_of(schedule: Dict[str, Any], instrument: str, as_of: str) -> Dict[str, Any]:
    """The entry in force for `instrument` on `as_of`.

    `as_of` is required. Defaulting it to today would make every call depend on
    when the code ran, and this module is used to judge historical measurements.
    Entries are appended and never rewritten, so a result computed under an older
    schedule stays reproducible by asking for its own date.
    """
    if not isinstance(as_of, str) or not _DATE_RE.match(as_of):
        raise CostModelError(
            "COST_MODEL_ASOF_REQUIRED: pass an explicit YYYY-MM-DD; "
            "defaulting to now would make the floor depend on when the code ran"
        )
    candidates = [
        e
        for e in schedule["entries"]
        if e.get("instrument") == instrument
        and e.get("effective_from", "9999-12-31") <= as_of
        and (e.get("effective_to") in (None, "") or e["effective_to"] >= as_of)
    ]
    if not candidates:
        known = sorted({e.get("instrument") for e in schedule["entries"]})
        raise CostModelError(f"NO_FEE_SCHEDULE_ENTRY_FOR {instrument} AT {as_of}; known instruments: {known}")
    candidates.sort(key=lambda e: e["effective_from"], reverse=True)
    return candidates[0]


def require_floor(
    *,
    as_of: str,
    instrument: str,
    execution_basis: str,
    legs: int = 1,
    scalper: bool = False,
    stress: bool = False,
    exit_route: str = "TRADE_OUT",
    reference_price: Optional[float] = None,
    schedule_path: Any = DEFAULT_SCHEDULE_PATH,
) -> CostFloor:
    """The round-trip cost floor, with its provenance attached.

    All arguments are keyword-only and the three that decide the answer —
    `as_of`, `instrument`, `execution_basis` — have no defaults. A caller must
    state which venue date, which contract and which execution assumption it is
    claiming, because those are exactly the three things that get silently
    assumed when a cost is a constant.

    `legs` is 1 for a single-instrument round trip and 2 for anything that must
    trade a hedge, such as a calendar spread.

    `scalper` selects the FORTS intraday `scalperfee`. It defaults to False.
    Claiming it requires proving every round trip closes within the session; a
    strategy that sometimes holds overnight pays the full `buysellfee`.
    """
    if legs not in (1, 2):
        raise CostModelError(f"COST_MODEL_BAD_LEGS: {legs!r} (expected 1 or 2)")
    if not isinstance(execution_basis, str) or not execution_basis:
        raise CostModelError(
            "COST_MODEL_EXECUTION_BASIS_REQUIRED: name the execution assumption "
            "(NONE, TICK_FLOOR, TICK_FLOOR_STRESS, MEASURED)"
        )

    schedule = load_schedule(schedule_path)
    entry = entry_as_of(schedule, instrument, as_of)

    bases = schedule["execution_bases"]
    if execution_basis not in bases:
        raise CostModelError(f"COST_MODEL_UNKNOWN_EXECUTION_BASIS: {execution_basis}; known: {sorted(bases)}")
    basis = bases[execution_basis]
    if basis.get("available") is False:
        raise ExecutionBasisUnavailable(
            f"EXECUTION_BASIS_UNAVAILABLE: {execution_basis} on {schedule.get('venue')} - {basis.get('note')}"
        )

    routes = schedule.get("exit_routes")
    if routes is not None and exit_route not in routes:
        raise CostModelError(f"COST_MODEL_UNKNOWN_EXIT_ROUTE: {exit_route}; known: {sorted(routes)}")

    m = entry["measurement"]
    fee_per_side = m["conservative_scalperfee_rub"] if scalper else m["conservative_buysellfee_rub"]
    if exit_route == "EXPIRY_SETTLE":
        exercise = m.get("conservative_exercisefee_rub")
        if exercise is None:
            raise CostModelError(
                "COST_MODEL_NO_EXERCISE_FEE: this schedule entry carries no exercisefee, "
                "so the EXPIRY_SETTLE route cannot be priced"
            )
        # entry trades every leg; exit trades every leg but the near one, which settles
        fee_rub = legs * float(fee_per_side) + (legs - 1) * float(fee_per_side) + float(exercise)
    else:
        fee_rub = legs * 2.0 * float(fee_per_side)

    broker = entry.get("broker") or {}
    broker_per_side = broker.get("fee_rub_per_contract_per_side")
    # Charged on every leg and side regardless of route: whether the broker waives
    # its fee on a leg that settles at expiry is recorded as unknown, so it is paid.
    broker_rub = legs * 2.0 * float(broker_per_side) if broker_per_side is not None else 0.0
    broker_basis = broker.get("basis", "ABSENT")

    minstep = float(m["minstep"])
    rub_per_point = float(m["rub_per_price_point"])
    ticks_per_leg = float(basis.get("roundtrip_ticks_per_leg", 0))
    execution_rub = legs * ticks_per_leg * minstep * rub_per_point

    total_rub = fee_rub + execution_rub + broker_rub
    if stress:
        total_rub *= float(schedule.get("stress_multiplier", 2.0))

    lower_bound_reasons = [
        "no measured bid-ask spread on this venue; data/market/finam/orderbook/ is empty",
        "no measured slippage; no MOEX order has ever been placed by this project",
    ]
    if broker_per_side is None:
        lower_bound_reasons.insert(0, "no broker commission in this schedule; the exchange leg only")
    elif broker_basis != "PUBLISHED_BROKER_TARIFF":
        lower_bound_reasons.append(
            f"broker component carries basis {broker_basis}, not a filed tariff document"
        )
    if execution_basis == "NONE":
        lower_bound_reasons.insert(0, "execution basis NONE: fees only, not a tradeable-realistic floor")
    if scalper:
        lower_bound_reasons.append("scalper rate claimed; every round trip must be proven to close intraday")
    if exit_route == "EXPIRY_SETTLE":
        lower_bound_reasons.append(
            "EXPIRY_SETTLE claimed: the near leg fixes at the final settlement price, the position "
            "surrenders its choice of exit timing, and an outright far leg remains; none of that is priced here"
        )

    margins = m.get("initialmargin_rub_per_contract") or {}
    margin = max(margins.values()) if margins else None

    # Calendar-spread margining. The rule is published; which rule is applied for a
    # computation is recorded with its own basis so a bound is never mistaken for a value.
    marg = schedule.get("margining") or {}
    rule_used = marg.get("computation_rule_used")
    rule_basis = marg.get("computation_rule_basis")
    rule_in_force = marg.get("rule_in_force_for_front_second")
    margin_blocked: Optional[float] = None
    if legs == 2 and margins:
        values = sorted(margins.values(), reverse=True)
        if rule_used == "POLUNETTO":
            margin_blocked = values[0]
        elif rule_used == "SUM" or rule_used is None:
            margin_blocked = sum(values[:2]) if len(values) >= 2 else values[0] * 2
        elif rule_used == "NETTO":
            raise CostModelError(
                "COST_MODEL_NETTO_PARAMETER_MISSING: the NETTO rule blocks the interest-rate risk, "
                "whose numeric value was never obtained. Use POLUNETTO as a declared bound instead of "
                "inventing a discount."
            )
        else:
            raise CostModelError(f"COST_MODEL_UNKNOWN_MARGINING_RULE: {rule_used}")
        if rule_used != rule_in_force and rule_in_force is not None:
            lower_bound_reasons.append(
                f"margin computed under {rule_used} while {rule_in_force} is the rule in force; "
                f"basis {rule_basis} - this overstates the funding cost"
            )
    elif legs == 1 and margins:
        margin_blocked = values_single = max(margins.values())

    notional = None
    bps = None
    if reference_price is not None:
        if not isinstance(reference_price, (int, float)) or reference_price <= 0:
            raise CostModelError(f"COST_MODEL_BAD_PRICE: {reference_price!r}")
        notional = contract_notional_rub(float(reference_price), rub_per_point)
        bps = total_rub / notional * 10_000.0

    return CostFloor(
        roundtrip_rub=total_rub,
        legs=legs,
        scalper=scalper,
        stress=stress,
        execution_basis=execution_basis,
        instrument=instrument,
        as_of=as_of,
        fee_component_rub=fee_rub * (float(schedule.get("stress_multiplier", 2.0)) if stress else 1.0),
        execution_component_rub=execution_rub * (float(schedule.get("stress_multiplier", 2.0)) if stress else 1.0),
        broker_component_rub=broker_rub * (float(schedule.get("stress_multiplier", 2.0)) if stress else 1.0),
        fee_basis=entry["basis"],
        fee_source=entry["source"],
        execution_note=basis.get("note", ""),
        broker_basis=broker_basis,
        exit_route=exit_route,
        minstep=minstep,
        rub_per_price_point=rub_per_point,
        initial_margin_rub=margin,
        margin_blocked_rub=margin_blocked,
        margining_rule_used=rule_used,
        margining_rule_basis=rule_basis,
        margining_rule_in_force=rule_in_force,
        schedule_id=schedule["schedule_id"],
        schedule_version=schedule["schema_version"],
        entry_tier=entry["tier"],
        entry_effective_from=entry["effective_from"],
        is_lower_bound=True,
        lower_bound_reasons=lower_bound_reasons,
        undetermined=list(schedule.get("undetermined", [])),
        reference_price=float(reference_price) if reference_price is not None else None,
        contract_notional_rub=notional,
        roundtrip_bps=bps,
    )
