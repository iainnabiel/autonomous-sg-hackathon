"""Observations, eligibility, and deterministic selection.

Labels use the smallest ``time_to_tca``, including negative values.
Upcoming views use the smallest nonnegative ``time_to_tca``.
Early inference uses only rows at or above 2 days, and among those the
smallest ``time_to_tca`` (the latest early message).

Ties break by smaller observation row index, then by source name.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from contracts.errors import ContractError
from contracts.ids import EncounterId, ObservationId
from contracts.policy import EARLY_CUTOFF_DAYS


@dataclass(frozen=True)
class Observation:
    observation_id: ObservationId
    encounter_id: EncounterId
    time_to_tca_days: float
    risk_log10_pc: float | None = None
    miss_distance_m: float | None = None
    relative_speed_m_s: float | None = None
    relative_position_r_m: float | None = None
    relative_position_t_m: float | None = None
    relative_position_n_m: float | None = None

    def __post_init__(self) -> None:
        if self.observation_id.source != self.encounter_id.source:
            raise ContractError("observation and encounter must come from the same source file")
        if (
            isinstance(self.time_to_tca_days, bool)
            or not isinstance(self.time_to_tca_days, (int, float))
            or not math.isfinite(self.time_to_tca_days)
        ):
            raise ContractError("time_to_tca_days must be a finite number of days")


def is_early_eligible(time_to_tca_days: float) -> bool:
    """True at exactly 2 days. Values below 2 days are not inference inputs."""

    return time_to_tca_days >= EARLY_CUTOFF_DAYS


def _same_encounter(observations: list[Observation]) -> None:
    if not observations:
        return
    encounter = observations[0].encounter_id
    if any(item.encounter_id != encounter for item in observations):
        raise ContractError("selection expects observations from one encounter")


def _first(observations: list[Observation]) -> Observation:
    return min(
        observations,
        key=lambda item: (item.time_to_tca_days, item.observation_id.row_index, item.observation_id.source),
    )


def select_label_observation(observations: list[Observation]) -> Observation | None:
    """Smallest TCA, including negative values."""

    _same_encounter(observations)
    if not observations:
        return None
    return _first(observations)


def select_upcoming_observation(observations: list[Observation]) -> Observation | None:
    """Smallest nonnegative TCA. Negative rows are excluded from upcoming views."""

    _same_encounter(observations)
    pool = [item for item in observations if item.time_to_tca_days >= 0]
    if not pool:
        return None
    return _first(pool)


def select_early_observation(observations: list[Observation]) -> Observation | None:
    """Latest early message: smallest TCA that is still at least 2 days."""

    _same_encounter(observations)
    pool = [item for item in observations if is_early_eligible(item.time_to_tca_days)]
    if not pool:
        return None
    return _first(pool)


def refuse_unsupported_inference(time_to_tca_days: float) -> None:
    """Do not run the model on a message inside the 2-day cutoff."""

    if not is_early_eligible(time_to_tca_days):
        raise ContractError(
            "time_to_tca is below 2 days; inference is unsupported and must not be run on this input"
        )
