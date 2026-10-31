"""Forecast status. This does not train or load a model."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from contracts.errors import ContractError
from contracts.ids import ObservationId
from contracts.policy import P_CRITICAL_DEFINITION
from contracts.tiers import Tier


class ForecastStatus(str, Enum):
    AVAILABLE = "available"
    UNABLE_TO_ASSESS = "unable_to_assess"
    UNAVAILABLE = "unavailable"
    CARRIED_FORWARD = "carried_forward"


class ReasonCode(str, Enum):
    NO_ELIGIBLE_OBSERVATION = "no_eligible_observation"
    UNSUPPORTED_TCA = "unsupported_tca"
    MODEL_UNAVAILABLE = "model_unavailable"
    FORECAST_CARRIED_FORWARD = "forecast_carried_forward"
    CURRENT_CRITICAL_TRIGGER = "current_critical_trigger"
    TEST_FINAL_OUTCOME_ABSENT = "test_final_outcome_absent"


@dataclass(frozen=True)
class Forecast:
    """One encounter-level forecast.

    ``p_critical`` and ``predicted_final_log10_pc`` are different fields.
    The current upgrade model leaves the Pc fields null.
    """

    status: ForecastStatus
    forecast_final_tier: Tier | None
    p_critical: float | None
    predicted_final_log10_pc: float | None
    predicted_final_pc: float | None
    source_observation_id: ObservationId | None
    source_time_to_tca_days: float | None
    model_version: str | None
    reason_codes: tuple[ReasonCode, ...]

    def __post_init__(self) -> None:
        _validate_forecast(self)


def _finite(value: float | None, name: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ContractError(f"{name} must be a finite number or null")


def _validate_forecast(forecast: Forecast) -> None:
    _finite(forecast.p_critical, "p_critical")
    _finite(forecast.predicted_final_log10_pc, "predicted_final_log10_pc")
    _finite(forecast.predicted_final_pc, "predicted_final_pc")
    if forecast.p_critical is not None and (
        forecast.predicted_final_log10_pc == forecast.p_critical
        or forecast.predicted_final_pc == forecast.p_critical
    ):
        raise ContractError("p_critical must not be copied into a collision-probability field")

    status = forecast.status
    tier = forecast.forecast_final_tier
    if status in (ForecastStatus.UNABLE_TO_ASSESS, ForecastStatus.UNAVAILABLE):
        if tier is not None or forecast.p_critical is not None:
            raise ContractError(f"{status.value} forecasts have a null tier and a null p_critical")
        if forecast.predicted_final_log10_pc is not None or forecast.predicted_final_pc is not None:
            raise ContractError(f"{status.value} forecasts do not invent a final collision probability")
        return

    if tier is None:
        raise ContractError(f"{status.value} requires a forecast final tier")
    if forecast.source_observation_id is None or forecast.source_time_to_tca_days is None:
        raise ContractError("a forecast must name the eligible source observation and its TCA")
    if forecast.source_time_to_tca_days < 2.0:
        raise ContractError("forecast source TCA must be at least 2 days")
    if status is ForecastStatus.CARRIED_FORWARD and ReasonCode.FORECAST_CARRIED_FORWARD not in forecast.reason_codes:
        raise ContractError("carried-forward forecasts must include the carried-forward reason code")


def available_forecast(
    *,
    tier: Tier,
    source_observation_id: ObservationId,
    source_time_to_tca_days: float,
    model_version: str,
    p_critical: float | None,
) -> Forecast:
    """Upgrade-model forecast. Predicted final Pc stays null."""

    return Forecast(
        status=ForecastStatus.AVAILABLE,
        forecast_final_tier=tier,
        p_critical=p_critical,
        predicted_final_log10_pc=None,
        predicted_final_pc=None,
        source_observation_id=source_observation_id,
        source_time_to_tca_days=source_time_to_tca_days,
        model_version=model_version,
        reason_codes=(),
    )


def unable_to_assess() -> Forecast:
    return Forecast(
        status=ForecastStatus.UNABLE_TO_ASSESS,
        forecast_final_tier=None,
        p_critical=None,
        predicted_final_log10_pc=None,
        predicted_final_pc=None,
        source_observation_id=None,
        source_time_to_tca_days=None,
        model_version=None,
        reason_codes=(ReasonCode.NO_ELIGIBLE_OBSERVATION,),
    )


def unavailable_forecast() -> Forecast:
    return Forecast(
        status=ForecastStatus.UNAVAILABLE,
        forecast_final_tier=None,
        p_critical=None,
        predicted_final_log10_pc=None,
        predicted_final_pc=None,
        source_observation_id=None,
        source_time_to_tca_days=None,
        model_version=None,
        reason_codes=(ReasonCode.MODEL_UNAVAILABLE,),
    )


def carry_forward(forecast: Forecast) -> Forecast:
    """Reuse an eligible forecast in a later view without running the model again."""

    if forecast.status not in (ForecastStatus.AVAILABLE, ForecastStatus.CARRIED_FORWARD):
        raise ContractError("only an existing eligible forecast can be carried forward")
    reasons = forecast.reason_codes
    if ReasonCode.FORECAST_CARRIED_FORWARD not in reasons:
        reasons = reasons + (ReasonCode.FORECAST_CARRIED_FORWARD,)
    return Forecast(
        status=ForecastStatus.CARRIED_FORWARD,
        forecast_final_tier=forecast.forecast_final_tier,
        p_critical=forecast.p_critical,
        predicted_final_log10_pc=forecast.predicted_final_log10_pc,
        predicted_final_pc=forecast.predicted_final_pc,
        source_observation_id=forecast.source_observation_id,
        source_time_to_tca_days=forecast.source_time_to_tca_days,
        model_version=forecast.model_version,
        reason_codes=reasons,
    )


def describe_p_critical() -> str:
    return P_CRITICAL_DEFINITION
