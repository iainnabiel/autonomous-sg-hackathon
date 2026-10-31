"""Prototype review priority. This does not execute a manoeuvre.

The policy is a review-queue specification, not a certified operational
standard. It never overwrites the current rule tier or the forecast tier,
and it does not read ``p_critical`` or apply the model's upgrade threshold.
``forecast_final_tier`` is the model's output. Sigma values are not used.

``POLICY_VERSION`` stays the schema version from SG-01.2/SG-01.3.
``TRIAGE_POLICY_VERSION`` is only this queue policy.

The task plan's "within 24h" bands did not state the endpoint. The relative-time
window already includes its boundaries, so exactly 0 days and exactly 1 day
(24 hours) are inside the urgent bands.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from contracts.errors import ContractError
from contracts.forecast import Forecast, ForecastStatus
from contracts.ids import EncounterId, ObservationId
from contracts.policy import TRIAGE_POLICY_VERSION, UPCOMING_URGENCY_DAYS
from contracts.schemas import PriorityBand
from contracts.tiers import Tier

PROTOTYPE_NOTICE = (
    "Prototype review policy for ordering operator attention. "
    "It is not a certified operational standard and it is not an instruction to execute a manoeuvre."
)

_SEVERITY = {Tier.SAFE: 0, Tier.ELEVATED: 1, Tier.CRITICAL: 2}
_VALID_FORECAST = (ForecastStatus.AVAILABLE, ForecastStatus.CARRIED_FORWARD)


class PriorityReason(str, Enum):
    CURRENT_EVIDENCE = "current_evidence"
    FORECAST = "forecast"
    TIME_WITHIN_ONE_DAY = "time_within_one_day"
    CURRENT_NOT_DOWNGRADED = "current_not_downgraded"
    FORECAST_ESCALATION = "forecast_escalation"
    INCOMPLETE_REVIEW = "incomplete_review"
    FORECAST_NOT_TREATED_AS_SAFE = "forecast_not_treated_as_safe"
    CARRIED_FORWARD = "carried_forward"
    EXCLUDED_NEGATIVE_TCA = "excluded_negative_tca"


@dataclass(frozen=True)
class ReviewDecision:
    encounter_id: EncounterId
    current_rule_tier: Tier | None
    forecast_final_tier: Tier | None
    prioritisation_tier: Tier | None
    priority: PriorityBand | None
    in_upcoming_queue: bool
    reasons: tuple[PriorityReason, ...]
    current_time_to_tca_days: float
    source_observation_id: ObservationId | None
    source_time_to_tca_days: float | None
    forecast_status: ForecastStatus
    policy_version: str = TRIAGE_POLICY_VERSION
    prototype: bool = True


def _more_severe(current: Tier | None, forecast: Tier | None) -> Tier | None:
    present = [tier for tier in (current, forecast) if tier is not None]
    if not present:
        return None
    return max(present, key=lambda tier: _SEVERITY[tier])


def _reasons(
    *,
    current: Tier | None,
    forecast_tier: Tier | None,
    prioritisation: Tier | None,
    priority: PriorityBand | None,
    within_one_day: bool,
    forecast_status: ForecastStatus,
) -> list[PriorityReason]:
    reasons: list[PriorityReason] = []
    if forecast_status is ForecastStatus.CARRIED_FORWARD:
        reasons.append(PriorityReason.CARRIED_FORWARD)
    if forecast_status in (ForecastStatus.UNAVAILABLE, ForecastStatus.UNABLE_TO_ASSESS):
        reasons.append(PriorityReason.FORECAST_NOT_TREATED_AS_SAFE)
    if current is not None and forecast_tier is not None and _SEVERITY[current] > _SEVERITY[forecast_tier]:
        reasons.append(PriorityReason.CURRENT_NOT_DOWNGRADED)
    if (
        forecast_tier is not None
        and (current is None or _SEVERITY[forecast_tier] > _SEVERITY[current])
    ):
        reasons.append(PriorityReason.FORECAST)
        reasons.append(PriorityReason.FORECAST_ESCALATION)
    elif current is not None and current == prioritisation:
        reasons.append(PriorityReason.CURRENT_EVIDENCE)
    if within_one_day and priority in (PriorityBand.IMMEDIATE, PriorityBand.HIGH):
        reasons.append(PriorityReason.TIME_WITHIN_ONE_DAY)
    if priority is PriorityBand.INCOMPLETE:
        reasons.append(PriorityReason.INCOMPLETE_REVIEW)
    return reasons


def assign_review(
    *,
    encounter_id: EncounterId,
    current_rule_tier: Tier | None,
    current_time_to_tca_days: float,
    forecast: Forecast,
    source_encounter_id: EncounterId | None = None,
) -> ReviewDecision:
    """Assign a prototype queue band. Original tiers are only read."""

    if (
        isinstance(current_time_to_tca_days, bool)
        or not isinstance(current_time_to_tca_days, (int, float))
        or not math.isfinite(current_time_to_tca_days)
    ):
        raise ContractError("current TCA must be a finite number of days")
    if forecast.status is ForecastStatus.CARRIED_FORWARD:
        if source_encounter_id is None:
            raise ContractError("a carried-forward forecast must name the source encounter")
        if source_encounter_id != encounter_id:
            raise ContractError("carried-forward forecast source must belong to the same encounter")
        if forecast.source_observation_id is None or forecast.source_time_to_tca_days is None:
            raise ContractError("carried-forward forecast is missing its source observation")
    elif source_encounter_id is not None and source_encounter_id != encounter_id:
        raise ContractError("forecast source encounter does not match the encounter under review")

    forecast_tier = forecast.forecast_final_tier
    prioritisation = _more_severe(current_rule_tier, forecast_tier)
    base = dict(
        encounter_id=encounter_id,
        current_rule_tier=current_rule_tier,
        forecast_final_tier=forecast_tier,
        prioritisation_tier=prioritisation,
        current_time_to_tca_days=current_time_to_tca_days,
        source_observation_id=forecast.source_observation_id,
        source_time_to_tca_days=forecast.source_time_to_tca_days,
        forecast_status=forecast.status,
    )
    if current_time_to_tca_days < 0:
        return ReviewDecision(
            priority=None,
            in_upcoming_queue=False,
            reasons=(PriorityReason.EXCLUDED_NEGATIVE_TCA,),
            **base,
        )

    within_one_day = current_time_to_tca_days <= UPCOMING_URGENCY_DAYS
    forecast_valid = forecast.status in _VALID_FORECAST and forecast_tier is not None
    routine = (
        prioritisation is Tier.SAFE
        and current_rule_tier is Tier.SAFE
        and forecast_tier is Tier.SAFE
        and forecast_valid
    )
    if prioritisation is Tier.CRITICAL:
        priority = PriorityBand.IMMEDIATE if within_one_day else PriorityBand.HIGH
    elif prioritisation is Tier.ELEVATED:
        priority = PriorityBand.HIGH if within_one_day else PriorityBand.SCHEDULED
    elif routine:
        priority = PriorityBand.ROUTINE
    else:
        priority = PriorityBand.INCOMPLETE

    return ReviewDecision(
        priority=priority,
        in_upcoming_queue=True,
        reasons=tuple(
            _reasons(
                current=current_rule_tier,
                forecast_tier=forecast_tier,
                prioritisation=prioritisation,
                priority=priority,
                within_one_day=within_one_day,
                forecast_status=forecast.status,
            )
        ),
        **base,
    )


def sort_upcoming(decisions: list[ReviewDecision]) -> dict[PriorityBand, tuple[ReviewDecision, ...]]:
    """Upcoming bands only. Negative-TCA rows are omitted. Incomplete is its own band."""

    grouped: dict[PriorityBand, list[ReviewDecision]] = {band: [] for band in PriorityBand}
    for decision in decisions:
        if not decision.in_upcoming_queue or decision.priority is None:
            continue
        grouped[decision.priority].append(decision)
    for members in grouped.values():
        members.sort(
            key=lambda decision: (
                decision.current_time_to_tca_days,
                decision.encounter_id.source,
                decision.encounter_id.event_id,
            )
        )
    routine_ids = {decision.encounter_id for decision in grouped[PriorityBand.ROUTINE]}
    incomplete_ids = {decision.encounter_id for decision in grouped[PriorityBand.INCOMPLETE]}
    if routine_ids & incomplete_ids:
        raise ContractError("an incomplete review was placed in Routine")
    return {band: tuple(members) for band, members in grouped.items()}
