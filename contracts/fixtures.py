"""Synthetic development fixtures. These rows are not dataset encounters."""

from __future__ import annotations

from dataclasses import dataclass

from contracts.forecast import (
    Forecast,
    ReasonCode,
    available_forecast,
    carry_forward,
    unable_to_assess,
    unavailable_forecast,
)
from contracts.ids import EncounterId, ObservationId
from contracts.observations import Observation
from contracts.policy import POLICY_VERSION
from contracts.schemas import (
    DecisionReceipt,
    EncounterListItem,
    QualityFlag,
    test_final_tier_accuracy,
)
from contracts.tiers import Tier, current_rule_tier

SYNTHETIC_MODEL_VERSION = "synthetic-fixture-0"
FIXTURE_LABEL = "synthetic development fixtures"


@dataclass(frozen=True)
class SyntheticExample:
    name: str
    synthetic: bool
    label: str
    item: EncounterListItem
    receipt: DecisionReceipt


def _item(
    *,
    name_event: int,
    row_index: int,
    time_to_tca_days: float,
    risk: float | None,
    miss_m: float | None,
    forecast: Forecast,
    flags: tuple[QualityFlag, ...] = (),
) -> tuple[EncounterListItem, DecisionReceipt]:
    encounter = EncounterId("fixture", name_event)
    observation = ObservationId("fixture", row_index)
    current = current_rule_tier(risk, miss_m)
    reasons = forecast.reason_codes
    if current is Tier.CRITICAL and forecast.forecast_final_tier is None:
        if ReasonCode.CURRENT_CRITICAL_TRIGGER not in reasons:
            reasons = reasons + (ReasonCode.CURRENT_CRITICAL_TRIGGER,)
            forecast = Forecast(
                status=forecast.status,
                forecast_final_tier=forecast.forecast_final_tier,
                p_critical=forecast.p_critical,
                predicted_final_log10_pc=forecast.predicted_final_log10_pc,
                predicted_final_pc=forecast.predicted_final_pc,
                source_observation_id=forecast.source_observation_id,
                source_time_to_tca_days=forecast.source_time_to_tca_days,
                model_version=forecast.model_version,
                reason_codes=reasons,
            )
    item = EncounterListItem(
        encounter_id=encounter,
        observation_id=observation,
        current_rule_tier=current,
        forecast=forecast,
        supplied_risk_log10_pc=risk,
        miss_distance_m=miss_m,
        time_to_tca_days=time_to_tca_days,
        priority=None,
        quality_flags=flags,
        model_version=forecast.model_version,
        policy_version=POLICY_VERSION,
    )
    receipt = DecisionReceipt(
        encounter_id=encounter,
        observation_id=observation,
        supplied_risk_log10_pc=risk,
        current_rule_tier=current,
        forecast=forecast,
        miss_distance_m=miss_m,
        time_to_tca_days=time_to_tca_days,
        quality_flags=flags,
        reason_codes=reasons,
        model_version=forecast.model_version,
    )
    return item, receipt


def synthetic_examples() -> tuple[SyntheticExample, ...]:
    """Successful, unable-to-assess, unavailable, and carried-forward forecasts."""

    success_forecast = available_forecast(
        tier=Tier.CRITICAL,
        source_observation_id=ObservationId("fixture", 10),
        source_time_to_tca_days=2.5,
        model_version=SYNTHETIC_MODEL_VERSION,
        p_critical=0.62,
    )
    success_item, success_receipt = _item(
        name_event=1,
        row_index=10,
        time_to_tca_days=2.5,
        risk=-3.4,
        miss_m=1800.0,
        forecast=success_forecast,
    )

    no_early = unable_to_assess()
    incomplete_item, incomplete_receipt = _item(
        name_event=2,
        row_index=20,
        time_to_tca_days=0.4,
        risk=None,
        miss_m=640.0,
        forecast=no_early,
        flags=(QualityFlag.MISSING_REQUIRED_INPUT,),
    )

    failed = unavailable_forecast()
    unavailable_item, unavailable_receipt = _item(
        name_event=3,
        row_index=30,
        time_to_tca_days=3.0,
        risk=-5.2,
        miss_m=3200.0,
        forecast=failed,
        flags=(QualityFlag.INFERENCE_UNAVAILABLE,),
    )

    carried = carry_forward(
        available_forecast(
            tier=Tier.ELEVATED,
            source_observation_id=ObservationId("fixture", 40),
            source_time_to_tca_days=2.0,
            model_version=SYNTHETIC_MODEL_VERSION,
            p_critical=0.31,
        )
    )
    carried_item, carried_receipt = _item(
        name_event=4,
        row_index=41,
        time_to_tca_days=0.8,
        risk=-5.5,
        miss_m=4200.0,
        forecast=carried,
        flags=(QualityFlag.CARRIED_FORWARD,),
    )

    examples = (
        ("successful", success_item, success_receipt),
        ("unable_to_assess", incomplete_item, incomplete_receipt),
        ("unavailable", unavailable_item, unavailable_receipt),
        ("carried_forward", carried_item, carried_receipt),
    )
    return tuple(
        SyntheticExample(name=name, synthetic=True, label=FIXTURE_LABEL, item=item, receipt=receipt)
        for name, item, receipt in examples
    )


def synthetic_observation() -> Observation:
    return Observation(
        observation_id=ObservationId("fixture", 10),
        encounter_id=EncounterId("fixture", 1),
        time_to_tca_days=2.5,
        risk_log10_pc=-3.4,
        miss_distance_m=1800.0,
    )


# Imported so fixture callers can show the test metric beside the examples.
SYNTHETIC_TEST_METRIC = test_final_tier_accuracy()
