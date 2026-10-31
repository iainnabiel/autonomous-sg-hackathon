"""JSON views in the dashboard's provisional shape (``frontend/src/api/types.ts``).

The domain objects are the shared contracts. This module only renders them for
the current dashboard: tiers and bands are lower-cased, days become hours for
display, and codes are existing enum values (``contracts`` ReasonCode,
QualityFlag and PriorityReason; SG-02.2 RiskRule; ``ml.inference`` quality
flags). When the dashboard moves to the contract shape (SG-07.4), only this
module changes.

``risk_tier`` is the prioritisation tier: the more severe of the current rule
tier and the forecast tier (SG-01.4). ``upgraded`` is the model's own upgrade
of the persistence tier to Critical.
"""

from __future__ import annotations

import math

from backend.assessment import Assessment
from backend.message_validation import IssueKind, MessageCheck
from contracts.forecast import ForecastStatus
from contracts.policy import EARLY_CUTOFF_DAYS, tca_hours
from contracts.schemas import QualityFlag

REVIEW_NOT_IMPLEMENTED = {
    "status": "unreviewed",
    "observation_id": None,
    "needs_renewal": False,
    "renewal_reason": None,
    "storage": "review status is SG-02.8 (Next); not implemented in this backend yet",
}


def lower(value) -> str | None:
    return None if value is None else value.value.lower()


def number(value) -> float | None:
    if value is None:
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def hours(check: MessageCheck | None) -> float | None:
    if check is None or check.time_to_tca_days is None:
        return None
    return tca_hours(check.time_to_tca_days)


def model_status(assessment: Assessment) -> str:
    status = assessment.forecast.status
    if status in (ForecastStatus.AVAILABLE, ForecastStatus.CARRIED_FORWARD):
        return "scored"
    return status.value  # "unable_to_assess" or "unavailable"


def message_flags(check: MessageCheck) -> list[str]:
    flags = []
    if any(i.kind is IssueKind.PLACEHOLDER for i in check.issues):
        flags.append("sigma_placeholder")
    if any(i.field in ("F10", "AP") and i.kind is IssueKind.MISSING for i in check.issues):
        flags.append("space_weather_missing")
    if check.missing_fields or check.invalid_fields:
        required = {"risk", "miss_distance", "time_to_tca", "event_id"}
        if required & (set(check.missing_fields) | set(check.invalid_fields)):
            flags.append(QualityFlag.MISSING_REQUIRED_INPUT.value)
    return flags


def quality_flags(assessment: Assessment) -> list[str]:
    flags = message_flags(assessment.assessed_message) if assessment.assessed_message else []
    status = assessment.forecast.status
    if status is ForecastStatus.UNAVAILABLE:
        flags.append(QualityFlag.INFERENCE_UNAVAILABLE.value)
    if status is ForecastStatus.CARRIED_FORWARD:
        flags.append(QualityFlag.CARRIED_FORWARD.value)
    for flag in assessment.forecast_result.model_quality_flags:
        if flag not in flags:
            flags.append(flag)
    return flags


def reason_codes(assessment: Assessment) -> list[str]:
    codes = []
    if assessment.classification is not None:
        codes += [rule.value for rule in assessment.classification.triggered_rules]
    codes += [code.value for code in assessment.forecast.reason_codes]
    if assessment.decision is not None:
        codes += [reason.value for reason in assessment.decision.reasons]
    return list(dict.fromkeys(codes))


def queue_item(assessment: Assessment) -> dict:
    message = assessment.assessed_message
    decision = assessment.decision
    forecast = assessment.forecast
    complete = assessment.classification is not None and assessment.classification.is_complete
    return {
        "encounter_id": str(assessment.encounter_id),
        "observation_id": message.observation_key if message else None,
        "priority": lower(decision.priority) if decision else None,
        "status": "assessed" if complete else "incomplete",
        "model_status": model_status(assessment),
        "risk_tier": lower(decision.prioritisation_tier) if decision else None,
        "rule_tier": lower(assessment.current_rule_tier),
        "forecast_tier": lower(forecast.forecast_final_tier),
        "upgraded": assessment.forecast_result.upgraded,
        "p_critical": forecast.p_critical,
        "log10_pc": number(message.values.get("risk")) if message else None,
        "miss_distance_m": number(message.values.get("miss_distance")) if message else None,
        "tca_hours": hours(message),
        "quality_flags": quality_flags(assessment),
        "reason_codes": reason_codes(assessment),
        "object_type": message.values.get("c_object_type") if message else None,
        "in_upcoming_queue": assessment.in_queue,
        "review": dict(REVIEW_NOT_IMPLEMENTED),
    }


def history(assessment: Assessment) -> list[dict]:
    from backend.tiers import rule_tier

    rows = []
    for index, check in enumerate(assessment.history, start=1):
        tier, _ = rule_tier(check.values.get("risk"), check.values.get("miss_distance"))
        rows.append(
            {
                "observation_id": check.observation_key,
                "update_index": index,
                "tca_hours": hours(check),
                "log10_pc": number(check.values.get("risk")),
                "miss_distance_m": number(check.values.get("miss_distance")),
                "relative_speed_m_s": number(check.values.get("relative_speed")),
                "rule_tier": lower(tier),
                "model_input": bool(check.meets_inference_cutoff),
                "quality_flags": message_flags(check),
            }
        )
    return rows


def geometry(check: MessageCheck | None) -> dict:
    values = check.values if check else {}
    issues = check.issues if check else ()
    return {
        "r_m": number(values.get("relative_position_r")),
        "t_m": number(values.get("relative_position_t")),
        "n_m": number(values.get("relative_position_n")),
        "relative_speed_m_s": number(values.get("relative_speed")),
        "c_sigma_r_m": number(values.get("c_sigma_r")),
        "t_sigma_r_m": number(values.get("t_sigma_r")),
        "sigma_placeholder": any(i.kind is IssueKind.PLACEHOLDER for i in issues),
    }


MODEL_INPUT_CUTOFF_HOURS = tca_hours(EARLY_CUTOFF_DAYS)
