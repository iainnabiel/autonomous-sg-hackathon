"""Shared contracts for SG-01.2 and SG-01.3. This package has no server."""

from contracts.errors import ContractError
from contracts.features import assert_inference_columns
from contracts.fixtures import synthetic_examples
from contracts.forecast import (
    ForecastStatus,
    available_forecast,
    carry_forward,
    describe_p_critical,
    unable_to_assess,
    unavailable_forecast,
)
from contracts.ids import EncounterId, ObservationId
from contracts.observations import (
    is_early_eligible,
    refuse_unsupported_inference,
    select_early_observation,
    select_label_observation,
    select_upcoming_observation,
)
from contracts.policy import POLICY_VERSION, TRIAGE_POLICY_VERSION
from contracts.triage import assign_review, sort_upcoming
from contracts.schemas import INFERENCE_FIELDS, test_final_tier_accuracy
from contracts.tiers import Tier, current_rule_tier

__all__ = [
    "ContractError",
    "EncounterId",
    "ForecastStatus",
    "INFERENCE_FIELDS",
    "ObservationId",
    "POLICY_VERSION",
    "TRIAGE_POLICY_VERSION",
    "assign_review",
    "sort_upcoming",
    "Tier",
    "assert_inference_columns",
    "available_forecast",
    "carry_forward",
    "current_rule_tier",
    "describe_p_critical",
    "is_early_eligible",
    "refuse_unsupported_inference",
    "select_early_observation",
    "select_label_observation",
    "select_upcoming_observation",
    "synthetic_examples",
    "test_final_tier_accuracy",
    "unable_to_assess",
    "unavailable_forecast",
]
