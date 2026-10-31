"""Response shapes for later backend work. No endpoints are served here.

Queue priority values match the names already written in SG-01.4. This module
does not assign them.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from contracts.errors import ContractError
from contracts.forecast import Forecast, ReasonCode
from contracts.ids import EncounterId, ObservationId
from contracts.observations import Observation
from contracts.policy import POLICY_VERSION
from contracts.tiers import Tier


class PriorityBand(str, Enum):
    """Allowed labels. ``contracts.triage`` assigns them and does not change tier rules."""

    IMMEDIATE = "Immediate"
    HIGH = "High"
    SCHEDULED = "Scheduled"
    ROUTINE = "Routine"
    INCOMPLETE = "Incomplete"


class QualityFlag(str, Enum):
    IMPUTED_OPTIONAL_INPUT = "imputed_optional_input"
    MISSING_REQUIRED_INPUT = "missing_required_input"
    INFERENCE_UNAVAILABLE = "inference_unavailable"
    CARRIED_FORWARD = "carried_forward"
    SIGMA_UNITS_UNCONFIRMED = "sigma_units_unconfirmed"
    # Emitted by ml/inference.predict_encounters(). The model does not impute.
    SIGMA_PLACEHOLDER = "sigma_placeholder"
    OPTIONAL_INPUT_MISSING = "optional_input_missing"
    SINGLE_EARLY_OBSERVATION = "single_early_observation"


class MetricState(str, Enum):
    REPORTED = "reported"
    NOT_EVALUATED = "not_evaluated"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class EncounterListItem:
    encounter_id: EncounterId
    observation_id: ObservationId
    current_rule_tier: Tier | None
    forecast: Forecast
    supplied_risk_log10_pc: float | None
    miss_distance_m: float | None
    time_to_tca_days: float
    priority: PriorityBand | None
    quality_flags: tuple[QualityFlag, ...]
    model_version: str | None
    policy_version: str = POLICY_VERSION


@dataclass(frozen=True)
class HistoryEntry:
    observation: Observation
    current_rule_tier: Tier | None
    forecast: Forecast | None


@dataclass(frozen=True)
class EncounterDetail:
    item: EncounterListItem
    history: tuple[HistoryEntry, ...]
    receipt: DecisionReceipt


@dataclass(frozen=True)
class RelativeTimeBin:
    """Hours are a display conversion of ``time_to_tca`` days. Both ends are inclusive."""

    start_hours_inclusive: float
    end_hours_inclusive: float
    encounter_ids: tuple[EncounterId, ...]
    view_label: str


@dataclass(frozen=True)
class RelativeTimeSummary:
    bins: tuple[RelativeTimeBin, ...]
    view_label: str
    policy_version: str = POLICY_VERSION


@dataclass(frozen=True)
class DecisionReceipt:
    encounter_id: EncounterId
    observation_id: ObservationId
    supplied_risk_log10_pc: float | None
    current_rule_tier: Tier | None
    forecast: Forecast
    miss_distance_m: float | None
    time_to_tca_days: float
    quality_flags: tuple[QualityFlag, ...]
    reason_codes: tuple[ReasonCode, ...]
    model_version: str | None
    policy_version: str = POLICY_VERSION
    units: str = (
        "miss distance and relative position in metres; relative speed in m/s; "
        "time_to_tca in days; hours are a display conversion; sigma units unconfirmed"
    )


@dataclass(frozen=True)
class EvaluationLabel:
    """Held-out training label. This object is not an inference payload."""

    encounter_id: EncounterId
    final_tier: Tier
    partition: str
    final_is_early: bool


@dataclass(frozen=True)
class MetricResult:
    name: str
    value: float | None
    state: MetricState
    reason: str


@dataclass(frozen=True)
class MetricsReport:
    cohort_label: str
    sample_count: int | None
    model_version: str | None
    policy_version: str
    metrics: tuple[MetricResult, ...]
    labels: tuple[EvaluationLabel, ...]


def history_in_update_order(entries: list[HistoryEntry]) -> tuple[HistoryEntry, ...]:
    """Farther from closest approach first. Ties use the smaller row index."""

    ordered = sorted(
        entries,
        key=lambda entry: (
            -entry.observation.time_to_tca_days,
            entry.observation.observation_id.row_index,
        ),
    )
    return tuple(ordered)


def test_final_tier_accuracy() -> MetricResult:
    """Test rows have current risk and no final outcomes. Do not invent a score."""

    return MetricResult(
        name="test_final_tier_accuracy",
        value=None,
        state=MetricState.UNAVAILABLE,
        reason="Test messages include current risk and have no final outcomes.",
    )


def reject_fabricated_test_accuracy(value: float) -> None:
    raise ContractError(
        f"test final-tier accuracy cannot be reported (got {value}); final outcomes are not in the test file"
    )


INFERENCE_FIELDS = frozenset(
    {
        "encounter_id",
        "observation_id",
        "supplied_risk_log10_pc",
        "current_rule_tier",
        "forecast_status",
        "forecast_final_tier",
        "p_critical",
        "predicted_final_log10_pc",
        "predicted_final_pc",
        "source_observation_id",
        "source_time_to_tca_days",
        "model_version",
        "policy_version",
        "quality_flags",
        "reason_codes",
    }
)


def assert_labels_absent_from_inference() -> None:
    leaked = {name for name in INFERENCE_FIELDS if name.startswith("final_")}
    if leaked:
        raise ContractError(f"inference fields include labels: {sorted(leaked)}")
