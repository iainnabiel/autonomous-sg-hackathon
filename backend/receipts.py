"""SG-02.6: decision receipt for one encounter, in the dashboard's Receipt shape.

The receipt records what was assessed and why the encounter sits in its band:

- the assessed message and its supplied inputs, units and quality handling;
- which probability and distance thresholds fired (SG-02.2 rules);
- the model's contribution: persistence tier from the latest early message,
  whether the model upgraded it, the score and threshold, and the source
  observation when the forecast is carried forward;
- urgency and every SG-01.4 policy reason, with model and policy versions;
- for unable-to-assess, unavailable or incomplete outcomes, the reason.

Supplied miss distance and log10 Pc are message data, not model predictions.
``p_critical`` is the model's uncalibrated score for a Critical final tier.
"""

from __future__ import annotations

from backend.assessment import Assessment
from backend.forecasts import ModelInfo
from backend.message_validation import FIELD_UNITS, IssueKind, MessageCheck
from backend.risk_classification import RiskRule
from backend.views import MODEL_INPUT_CUTOFF_HOURS, hours, lower, model_status, number, quality_flags
from contracts.forecast import ForecastStatus
from contracts.policy import (
    CRITICAL_LOG10_PC,
    CRITICAL_MISS_DISTANCE_M,
    ELEVATED_LOG10_PC,
    ELEVATED_MISS_DISTANCE_M,
    P_CRITICAL_DEFINITION,
    POLICY_VERSION,
    TRIAGE_POLICY_VERSION,
    UPCOMING_URGENCY_DAYS,
    tca_hours,
)
from contracts.tiers import Tier
from contracts.triage import PROTOTYPE_NOTICE, PriorityReason

URGENT_HOURS = tca_hours(UPCOMING_URGENCY_DAYS)

HANDLING = {
    "sigma_placeholder": "A radial sigma held the 6.378136e7 placeholder and was treated as missing. "
    "Sigma is supplied position uncertainty, not model confidence.",
    "optional_input_missing": "An optional input (for example F10, AP or a sigma) was not supplied. "
    "The model handles missing values natively; nothing was imputed.",
    "single_early_observation": "Only one message at least 2 days out, so trend features are undefined.",
    "missing_required_input": "A required input (log10 Pc, miss distance, TCA or event id) is missing or invalid. "
    "No tier is given unless the other input alone is Critical; never treated as Safe.",
    "inference_unavailable": "The model forecast is unavailable, so the band uses the current rule tier only "
    "and the encounter cannot be Routine.",
    "carried_forward": "The current message is inside 2 days, so the model forecast from the latest early message "
    "is shown unchanged; it was not re-run.",
}

_RULES = (
    (RiskRule.PROBABILITY_CRITICAL, "probability", f"Supplied log10 Pc >= {CRITICAL_LOG10_PC:g} -> Critical"),
    (RiskRule.DISTANCE_CRITICAL, "distance", f"Supplied miss distance < {CRITICAL_MISS_DISTANCE_M:g} m -> Critical"),
    (RiskRule.PROBABILITY_ELEVATED, "probability", f"Supplied log10 Pc >= {ELEVATED_LOG10_PC:g} -> at least Elevated"),
    (RiskRule.DISTANCE_ELEVATED, "distance", f"Supplied miss distance <= {ELEVATED_MISS_DISTANCE_M:g} m -> at least Elevated"),
)


def _fmt(value, digits: int = 0) -> str:
    value = number(value)
    return "not supplied" if value is None else f"{value:.{digits}f}"


def _pc_text(value) -> str:
    value = number(value)
    if value is None:
        return "log10 Pc missing or invalid"
    floor = " (placeholder for Pc too small to compute; treated as Pc ~ 0)" if value <= -30 else ""
    return f"log10 Pc = {value:.2f}{floor}"


def _miss_text(value) -> str:
    value = number(value)
    return "miss distance missing or invalid" if value is None else f"miss distance = {value:.0f} m"


def _note(check: MessageCheck, field: str) -> str | None:
    kinds = {issue.kind for issue in check.issues if issue.field == field}
    if IssueKind.PLACEHOLDER in kinds:
        return "placeholder 6.378136e7 treated as missing"
    if IssueKind.MISSING in kinds:
        return "not supplied"
    if kinds:
        return "invalid: " + ", ".join(sorted(kind.value for kind in kinds))
    if field == "risk":
        return "supplied with the message, not a model output"
    if field == "miss_distance":
        return "supplied with the message, not a model prediction"
    return None


def _inputs(check: MessageCheck, is_model_source: bool) -> list[dict]:
    def used(rule: bool) -> list[str]:
        return (["rule"] if rule else []) + (["model"] if is_model_source else [])

    rows = [
        {"field": "time_to_tca", "value": _fmt(hours(check), 1), "unit": "h", "used_by": used(True),
         "imputed": False, "note": "supplied in days; hours are a display conversion"},
    ]
    for field, digits, rule in (
        ("risk", 2, True),
        ("miss_distance", 0, True),
        ("relative_speed", 0, False),
        ("relative_position_r", 1, False),
        ("relative_position_t", 1, False),
        ("relative_position_n", 1, False),
        ("c_sigma_r", 1, False),
        ("t_sigma_r", 1, False),
        ("F10", 0, False),
        ("AP", 0, False),
    ):
        rows.append({"field": field, "value": _fmt(check.values.get(field), digits), "unit": FIELD_UNITS[field],
                     "used_by": used(rule), "imputed": False, "note": _note(check, field)})
    rows.append({"field": "c_object_type", "value": check.values.get("c_object_type") or "not supplied", "unit": None,
                 "used_by": used(False), "imputed": False, "note": _note(check, "c_object_type")})
    return rows


def _causes(assessment: Assessment) -> list[str]:
    decision = assessment.decision
    if decision is None or decision.prioritisation_tier is None or decision.prioritisation_tier is Tier.SAFE:
        return []
    target = decision.prioritisation_tier
    causes: list[str] = []
    fired = set(assessment.classification.triggered_rules) if assessment.classification else set()
    if assessment.current_rule_tier is target:
        wanted = (RiskRule.PROBABILITY_CRITICAL, RiskRule.DISTANCE_CRITICAL) if target is Tier.CRITICAL else (
            RiskRule.PROBABILITY_ELEVATED, RiskRule.DISTANCE_ELEVATED)
        causes += [kind for rule, kind, _ in _RULES if rule in wanted and rule in fired]
    if assessment.forecast.forecast_final_tier is target and assessment.forecast_result.upgraded:
        causes.append("model")
    return list(dict.fromkeys(causes))


def _model_text(assessment: Assessment, model: ModelInfo | None) -> str:
    forecast, result = assessment.forecast, assessment.forecast_result
    if forecast.status is ForecastStatus.UNABLE_TO_ASSESS:
        return "No forecast: there is no message at least 2 days before closest approach."
    if forecast.status is ForecastStatus.UNAVAILABLE:
        return f"No forecast: {result.problem or 'inference unavailable'}."
    base = f"Persistence tier {result.persistence_tier.value} from the latest early message"
    if result.upgraded:
        text = f"{base}; the model score {forecast.p_critical:.2f} >= {model.threshold} raised it to Critical."
    else:
        text = f"{base}; model score {forecast.p_critical:.2f}"
        text += "." if result.persistence_tier is Tier.CRITICAL else f" < {model.threshold}, so no upgrade."
    if forecast.status is ForecastStatus.CARRIED_FORWARD:
        text += f" Carried forward from {forecast.source_observation_id} ({tca_hours(forecast.source_time_to_tca_days):.1f} h)."
    return text


def _summary(assessment: Assessment, model: ModelInfo | None, causes: list[str]) -> str:
    decision = assessment.decision
    model_text = _model_text(assessment, model)
    if decision is None:
        return "No message has a usable time to closest approach, so the encounter cannot be placed."
    reasons = set(decision.reasons)
    if PriorityReason.EXCLUDED_NEGATIVE_TCA in reasons:
        return "Closest approach has passed for every message, so the encounter is not in the upcoming queue. " + model_text
    if decision.priority is not None and decision.priority.value == "Incomplete":
        return ("Assessment incomplete: required evidence is missing, invalid or unavailable, so it is routed for "
                "review rather than treated as Safe. " + model_text)
    if decision.prioritisation_tier is Tier.SAFE:
        return "No probability or distance threshold fired on the current message. " + model_text
    names = {"probability": "the supplied probability", "distance": "the supplied miss distance", "model": "the model forecast"}
    why = " and ".join(names[c] for c in causes) or "the forecast's persistence tier from the latest early message"
    band = (f"Closest approach within {URGENT_HOURS:g} h raised the band." if PriorityReason.TIME_WITHIN_ONE_DAY in reasons
            else f"Not within {URGENT_HOURS:g} h, so urgency did not raise the band.")
    return f"{decision.prioritisation_tier.value} because of {why}. {model_text} {band}"


def build_receipt(assessment: Assessment, model: ModelInfo | None) -> dict:
    message = assessment.assessed_message
    decision = assessment.decision
    forecast = assessment.forecast
    reasons = set(decision.reasons) if decision else set()
    fired = set(assessment.classification.triggered_rules) if assessment.classification else set()
    early = assessment.latest_early
    is_model_source = early is not None and message is not None and early.observation_key == message.observation_key

    rules = [
        {"code": rule.value, "kind": kind, "description": description, "triggered": rule in fired,
         "evidence": _pc_text(message.values.get("risk")) if kind == "probability" else _miss_text(message.values.get("miss_distance"))}
        for rule, kind, description in _RULES
    ] if message else []
    rules += [
        {"code": PriorityReason.FORECAST_ESCALATION.value, "kind": "model",
         "description": "The forecast tier is more severe than the current rule tier and sets the band. "
                        "The model can raise persistence to Critical, never lower a tier.",
         "triggered": PriorityReason.FORECAST_ESCALATION in reasons, "evidence": _model_text(assessment, model)},
        {"code": PriorityReason.TIME_WITHIN_ONE_DAY.value, "kind": "urgency",
         "description": f"Closest approach within {URGENT_HOURS:g} h (inclusive) raises the band, not the tier",
         "triggered": PriorityReason.TIME_WITHIN_ONE_DAY in reasons,
         "evidence": "time not usable" if hours(message) is None else f"{hours(message):.1f} h to closest approach"},
        {"code": PriorityReason.INCOMPLETE_REVIEW.value, "kind": "quality",
         "description": "Missing evidence routes the encounter to Incomplete review; it is never filed as Routine",
         "triggered": PriorityReason.INCOMPLETE_REVIEW in reasons,
         "evidence": "complete" if PriorityReason.INCOMPLETE_REVIEW not in reasons else "evidence incomplete"},
    ]
    causes = _causes(assessment)
    flags = quality_flags(assessment)
    handling = [{"flag": flag, "handling": HANDLING.get(flag, "Recorded by the model package; no further handling.")} for flag in flags]
    if forecast.status is ForecastStatus.UNABLE_TO_ASSESS:
        handling.append({"flag": "no_eligible_observation", "handling": "No message at least 2 days out, so the model was not run. "
                         "The band uses the current rule tier and cannot be Routine."})
    return {
        "observation_id": message.observation_key if message else None,
        "model_input_observation_id": early.observation_key if early else None,
        "model_input_count": sum(1 for c in assessment.history if c.meets_inference_cutoff),
        "inputs": _inputs(message, is_model_source) if message else [],
        "thresholds": {
            "critical_log10_pc": CRITICAL_LOG10_PC,
            "elevated_log10_pc": ELEVATED_LOG10_PC,
            "critical_distance_m": CRITICAL_MISS_DISTANCE_M,
            "elevated_distance_m": ELEVATED_MISS_DISTANCE_M,
            "urgent_tca_hours": URGENT_HOURS,
            "upgrade_p_critical": model.threshold if model else None,
            "model_input_cutoff_hours": MODEL_INPUT_CUTOFF_HOURS,
        },
        "rules": rules,
        "rule_tier": lower(assessment.current_rule_tier),
        "risk_tier": lower(decision.prioritisation_tier) if decision else None,
        "forecast_tier": lower(forecast.forecast_final_tier),
        "persistence_tier": lower(assessment.forecast_result.persistence_tier),
        "upgraded": assessment.forecast_result.upgraded,
        "p_critical": forecast.p_critical,
        "p_critical_definition": P_CRITICAL_DEFINITION,
        "model_status": model_status(assessment),
        "forecast_status": forecast.status.value,
        "forecast_source_observation_id": None if forecast.source_observation_id is None else str(forecast.source_observation_id),
        "forecast_problem": assessment.forecast_result.problem,
        "upgrade_reasons": list(assessment.forecast_result.upgrade_reasons),
        "escalation_causes": causes,
        "urgency_raised_band": PriorityReason.TIME_WITHIN_ONE_DAY in reasons,
        "escalation_summary": _summary(assessment, model, causes),
        "triage_reasons": [reason.value for reason in decision.reasons] if decision else [],
        "quality_handling": handling,
        "invalid_inputs": list(assessment.classification.invalid_inputs) if assessment.classification else [],
        "model_version": model.model_version if model else None,
        "model_sha256": model.model_sha256 if model else None,
        "policy_version": TRIAGE_POLICY_VERSION,
        "schema_version": POLICY_VERSION,
        "prototype_notice": PROTOTYPE_NOTICE,
    }
