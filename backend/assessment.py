"""SG-02.4: one assessment per encounter and the review queue.

Per encounter, using raw ``time_to_tca`` and the shared selection rules
(``contracts.observations``; ties by smaller row index, then source):

- **Current** observation: smallest non-negative TCA (upcoming view). Its rule
  tier (SG-02.2) and TCA drive urgency and the queue.
- **Latest early** observation: smallest TCA >= 2 days. The model's source.
- **Label** observation (smallest TCA, negatives included) is never used here.

The forecast is used as is when the current observation is the model's
source, and carried forward (``contracts.forecast.carry_forward``) when the
current observation is inside 2 days. Priority comes only from the SG-01.4
prototype policy (``contracts.triage.assign_review``), and bands are ordered
with ``sort_upcoming``.

An encounter whose messages are all negative has no current observation. It
is assessed on its latest message, which the policy excludes from the upcoming
queue with reason ``excluded_negative_tca``; it stays reachable by id.
Messages without a usable ``event_id`` or ``time_to_tca`` cannot be placed and
are counted, not dropped silently.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from backend.forecasts import ForecastResult
from backend.message_validation import MessageCheck
from backend.risk_classification import RiskClassification
from backend.tiers import rule_tier
from contracts.forecast import Forecast, ForecastStatus, carry_forward
from contracts.ids import EncounterId, ObservationId
from contracts.observations import (
    Observation,
    select_early_observation,
    select_label_observation,
    select_upcoming_observation,
)
from contracts.schemas import PriorityBand
from contracts.tiers import Tier
from contracts.triage import ReviewDecision, assign_review, sort_upcoming

BAND_ORDER = tuple(PriorityBand)  # contract enum order: Immediate, High, Scheduled, Routine, Incomplete


def _observation(check: MessageCheck, encounter_id: EncounterId) -> Observation:
    values = check.values
    return Observation(
        observation_id=ObservationId(check.source, check.row_index),
        encounter_id=encounter_id,
        time_to_tca_days=check.time_to_tca_days,
        risk_log10_pc=values.get("risk"),
        miss_distance_m=values.get("miss_distance"),
        relative_speed_m_s=values.get("relative_speed"),
        relative_position_r_m=values.get("relative_position_r"),
        relative_position_t_m=values.get("relative_position_t"),
        relative_position_n_m=values.get("relative_position_n"),
    )


@dataclass(frozen=True)
class EncounterMessages:
    encounter_id: EncounterId
    checks: tuple[MessageCheck, ...]
    observations: tuple[Observation, ...]
    unplaced: int

    @property
    def by_key(self) -> dict[str, MessageCheck]:
        return {check.observation_key: check for check in self.checks}

    def _check(self, observation: Observation | None) -> MessageCheck | None:
        return None if observation is None else self.by_key[str(observation.observation_id)]

    @property
    def latest_early(self) -> MessageCheck | None:
        return self._check(select_early_observation(list(self.observations)))

    @property
    def upcoming(self) -> MessageCheck | None:
        return self._check(select_upcoming_observation(list(self.observations)))

    @property
    def latest(self) -> MessageCheck | None:
        return self._check(select_label_observation(list(self.observations)))


@dataclass
class GroupedMessages:
    encounters: dict[EncounterId, EncounterMessages]
    without_encounter: int  # messages whose event_id was missing or invalid

    def early_sources(self) -> dict[EncounterId, ObservationId | None]:
        out = {}
        for encounter_id, group in self.encounters.items():
            early = group.latest_early
            out[encounter_id] = None if early is None else ObservationId(early.source, early.row_index)
        return out

    def checks_by_key(self) -> dict[str, MessageCheck]:
        return {key: check for group in self.encounters.values() for key, check in group.by_key.items()}


def group_messages(checks: Iterable[MessageCheck]) -> GroupedMessages:
    grouped: dict[EncounterId, list[MessageCheck]] = defaultdict(list)
    keys: set[str] = set()
    without_encounter = 0
    for check in checks:
        if check.observation_key in keys:
            raise ValueError(f"duplicate observation {check.observation_key}")
        keys.add(check.observation_key)
        if check.event_id is None:
            without_encounter += 1
            continue
        grouped[EncounterId(check.source, check.event_id)].append(check)

    encounters = {}
    for encounter_id, members in grouped.items():
        members.sort(key=lambda c: (-(c.time_to_tca_days if c.time_to_tca_days is not None else float("-inf")), c.row_index))
        placed = [c for c in members if c.time_to_tca_days is not None]
        encounters[encounter_id] = EncounterMessages(
            encounter_id=encounter_id,
            checks=tuple(members),
            observations=tuple(_observation(c, encounter_id) for c in placed),
            unplaced=len(members) - len(placed),
        )
    return GroupedMessages(encounters, without_encounter)


@dataclass(frozen=True)
class Assessment:
    encounter_id: EncounterId
    history: tuple[MessageCheck, ...]
    current: MessageCheck | None  # upcoming observation; None if every placed message is negative
    assessed_message: MessageCheck | None  # current, or the latest message when all are negative
    latest_early: MessageCheck | None
    current_rule_tier: Tier | None
    classification: RiskClassification | None
    forecast_result: ForecastResult
    forecast: Forecast  # as used for triage: direct, or carried forward to the current observation
    decision: ReviewDecision | None  # None only when no message has a usable time
    unplaced_messages: int

    @property
    def in_queue(self) -> bool:
        return self.decision is not None and self.decision.in_upcoming_queue


def assess(group: EncounterMessages, forecast_result: ForecastResult) -> Assessment:
    current = group.upcoming
    assessed_message = current or group.latest
    classification = None
    tier = None
    decision = None
    forecast = forecast_result.forecast
    if assessed_message is not None:
        tier, classification = rule_tier(
            assessed_message.values.get("risk"), assessed_message.values.get("miss_distance")
        )
        carried = False
        if (
            forecast.status is ForecastStatus.AVAILABLE
            and str(forecast.source_observation_id) != assessed_message.observation_key
        ):
            forecast = carry_forward(forecast)
            carried = True
        decision = assign_review(
            encounter_id=group.encounter_id,
            current_rule_tier=tier,
            current_time_to_tca_days=assessed_message.time_to_tca_days,
            forecast=forecast,
            source_encounter_id=group.encounter_id if carried else None,
        )
    return Assessment(
        encounter_id=group.encounter_id,
        history=group.checks,
        current=current,
        assessed_message=assessed_message,
        latest_early=group.latest_early,
        current_rule_tier=tier,
        classification=classification,
        forecast_result=forecast_result,
        forecast=forecast,
        decision=decision,
        unplaced_messages=group.unplaced,
    )


def assess_all(
    grouped: GroupedMessages, forecasts: Mapping[EncounterId, ForecastResult]
) -> dict[EncounterId, Assessment]:
    missing = set(grouped.encounters) - set(forecasts)
    if missing:
        raise ValueError(f"no forecast result for {len(missing)} encounters, e.g. {sorted(map(str, missing))[:3]}")
    return {encounter_id: assess(group, forecasts[encounter_id]) for encounter_id, group in grouped.encounters.items()}


def queue_order(assessments: Mapping[EncounterId, Assessment]) -> tuple[list[Assessment], list[Assessment]]:
    """Queue in band order, then the policy's within-band order; and the excluded encounters."""

    decisions = [a.decision for a in assessments.values() if a.decision is not None]
    bands = sort_upcoming(decisions)
    ordered = [assessments[d.encounter_id] for band in BAND_ORDER for d in bands[band]]
    excluded = sorted(
        (a for a in assessments.values() if not a.in_queue),
        key=lambda a: (a.encounter_id.source, a.encounter_id.event_id),
    )
    return ordered, excluded
