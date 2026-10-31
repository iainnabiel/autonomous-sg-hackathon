"""SG-03.1 evaluation labels: organiser outcomes, cross-checked against raw messages.

The organisers' ``final_tier`` and ``usable_for_training`` are the labels of
record. They are never replaced. Raw ``train_data`` messages are reclassified
only to check them, and any disagreement fails with the affected encounter IDs.

Eligibility, the final message, the latest eligible message and
``final_is_early`` come from raw ``time_to_tca`` through the shared contract
functions. The workbook's rounded final time is compared, never used to select.

Inputs are in-memory records. Reading CSV or workbook files is a later step.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass

from contracts.errors import ContractError
from contracts.ids import EncounterId, ObservationId
from contracts.observations import (
    Observation,
    is_early_eligible,
    select_early_observation,
    select_label_observation,
)
from contracts.tiers import Tier, current_rule_tier
from evaluation.errors import ProblemCollector

LABELLED_SOURCE = "train"  # only train_data.csv has organiser outcomes
PARTITIONS = ("train", "validation")  # ml/splits/train_validation.csv
USABLE_VALUES = {"yes": True, "no": False}  # organiser usable_for_training
WORKBOOK_TCA_DECIMALS = 4  # final_time_to_tca_days is rounded to 4 dp in the workbook
WORKBOOK_TCA_TOLERANCE_DAYS = 0.5 * 10.0**-WORKBOOK_TCA_DECIMALS + 1e-12
MAX_LOG10_PC = 0.0  # Pc cannot exceed 1
MIN_MISS_DISTANCE_M = 0.0  # a distance cannot be negative


@dataclass(frozen=True)
class RawMessage:
    """One ``train_data`` row. ``row_index`` is the 0-based CSV data row."""

    source: str
    row_index: int
    event_id: int
    time_to_tca_days: float
    risk_log10_pc: float | None
    miss_distance_m: float | None


@dataclass(frozen=True)
class OrganiserLabel:
    """One row of the organisers' ``train_event_labels`` sheet."""

    event_id: int
    final_tier: str
    usable_for_training: str
    final_time_to_tca_days: float  # rounded in the workbook; checked, not used


@dataclass(frozen=True)
class SplitRow:
    """One row of the saved encounter-grouped split."""

    encounter_id: str
    partition: str
    final_tier: str
    final_is_early: bool


@dataclass(frozen=True)
class LabelRecord:
    """Organiser label plus raw-message provenance for one train encounter."""

    encounter_id: EncounterId
    final_tier: Tier  # organiser value of record
    usable: bool  # organiser value, cross-checked against raw eligibility
    final_observation_id: ObservationId
    final_time_to_tca_days: float  # raw
    final_is_early: bool  # raw
    latest_eligible_observation_id: ObservationId | None
    latest_eligible_time_to_tca_days: float | None
    latest_eligible_rule_tier: Tier | None
    partition: str | None  # None when the encounter is not usable


def encounter_order(encounter_id: EncounterId) -> tuple[str, int]:
    return (encounter_id.source, encounter_id.event_id)


def _real(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _optional_real(value: object) -> bool:
    return value is None or _real(value)


def _rule_tier(observation: Observation, problems: ProblemCollector) -> Tier | None:
    """Organiser rule tier for a message whose inputs are complete and in range.

    ``current_rule_tier`` tolerates a missing input (one Critical input is enough
    for Critical). A cross-check must not, so both inputs are required here:
    log10(Pc) at most ``MAX_LOG10_PC`` and miss distance at least ``MIN_MISS_DISTANCE_M``.
    """

    risk, miss = observation.risk_log10_pc, observation.miss_distance_m
    if not (_real(risk) and _real(miss) and risk <= MAX_LOG10_PC and miss >= MIN_MISS_DISTANCE_M):
        problems.add("invalid_classification_input", observation.observation_id)
        return None
    tier = current_rule_tier(risk, miss)
    if tier is None:
        problems.add("label_unverifiable", observation.observation_id)
    return tier


def _group_messages(
    messages: Iterable[RawMessage], problems: ProblemCollector
) -> dict[EncounterId, list[Observation]]:
    grouped: dict[EncounterId, list[Observation]] = {}
    seen: set[ObservationId] = set()
    for message in messages:
        label = f"{message.source}:{message.row_index}"
        if message.source != LABELLED_SOURCE:
            problems.add("wrong_source", label)
            continue
        try:
            observation_id = ObservationId(message.source, message.row_index)
            encounter_id = EncounterId(message.source, message.event_id)
        except ContractError:
            problems.add("malformed_id", label)
            continue
        if observation_id in seen:
            problems.add("duplicate_observation", observation_id)
            continue
        seen.add(observation_id)
        if not (
            _real(message.time_to_tca_days)
            and _optional_real(message.risk_log10_pc)
            and _optional_real(message.miss_distance_m)
        ):
            problems.add("invalid_message", observation_id)
            continue
        grouped.setdefault(encounter_id, []).append(
            Observation(
                observation_id=observation_id,
                encounter_id=encounter_id,
                time_to_tca_days=float(message.time_to_tca_days),
                risk_log10_pc=message.risk_log10_pc,
                miss_distance_m=message.miss_distance_m,
            )
        )
    return grouped


def _index_organiser(
    labels: Iterable[OrganiserLabel], problems: ProblemCollector
) -> dict[EncounterId, tuple[Tier, bool, float]]:
    indexed: dict[EncounterId, tuple[Tier, bool, float]] = {}
    for label in labels:
        try:
            encounter_id = EncounterId(LABELLED_SOURCE, label.event_id)
        except ContractError:
            problems.add("malformed_id", f"{LABELLED_SOURCE}:{label.event_id}")
            continue
        if encounter_id in indexed:
            problems.add("duplicate_label", encounter_id)
            continue
        try:
            tier = Tier.parse(label.final_tier)
        except ValueError:
            problems.add("invalid_label", encounter_id)
            continue
        if label.usable_for_training not in USABLE_VALUES or not _real(label.final_time_to_tca_days):
            problems.add("invalid_label", encounter_id)
            continue
        indexed[encounter_id] = (tier, USABLE_VALUES[label.usable_for_training], label.final_time_to_tca_days)
    return indexed


def _index_split(split: Iterable[SplitRow], problems: ProblemCollector) -> dict[EncounterId, SplitRow]:
    indexed: dict[EncounterId, SplitRow] = {}
    for row in split:
        try:
            encounter_id = EncounterId.parse(row.encounter_id)
        except ContractError:
            problems.add("malformed_id", row.encounter_id)
            continue
        if encounter_id.source != LABELLED_SOURCE:
            problems.add("wrong_source", encounter_id)
            continue
        if encounter_id in indexed:
            problems.add("duplicate_split", encounter_id)
            continue
        valid_tier = row.final_tier in {tier.value for tier in Tier}
        if row.partition not in PARTITIONS or not valid_tier or not isinstance(row.final_is_early, bool):
            problems.add("invalid_split", encounter_id)
            continue
        indexed[encounter_id] = row
    return indexed


def derive_labels(
    messages: Iterable[RawMessage],
    organiser_labels: Iterable[OrganiserLabel],
    split: Iterable[SplitRow],
) -> dict[EncounterId, LabelRecord]:
    """Labels for every train encounter, keyed and ordered by source-qualified ID.

    Raises ``EvaluationInputError`` listing every affected ID when any input is
    malformed or any cross-check disagrees. No label is dropped or replaced.
    """

    problems = ProblemCollector()
    grouped = _group_messages(messages, problems)
    organiser = _index_organiser(organiser_labels, problems)
    split_rows = _index_split(split, problems)
    problems.raise_if_any()

    for encounter_id in grouped.keys() - organiser.keys():
        problems.add("label_missing", encounter_id)
    for encounter_id in organiser.keys() - grouped.keys():
        problems.add("messages_missing", encounter_id)

    records: dict[EncounterId, LabelRecord] = {}
    for encounter_id in sorted(grouped.keys() & organiser.keys(), key=encounter_order):
        observations = grouped[encounter_id]
        organiser_tier, organiser_usable, rounded_final_time = organiser[encounter_id]
        final = select_label_observation(observations)
        early = select_early_observation(observations)

        final_rule_tier = _rule_tier(final, problems)
        if final_rule_tier is not None and final_rule_tier is not organiser_tier:
            problems.add("label_mismatch", encounter_id)
        if (early is not None) != organiser_usable:
            problems.add("usable_mismatch", encounter_id)
        if abs(final.time_to_tca_days - rounded_final_time) > WORKBOOK_TCA_TOLERANCE_DAYS:
            problems.add("final_time_mismatch", encounter_id)

        final_is_early = is_early_eligible(final.time_to_tca_days)
        split_row = split_rows.get(encounter_id)
        if split_row is not None:
            if not organiser_usable:
                problems.add("split_unexpected", encounter_id)
            if split_row.final_tier != organiser_tier.value:
                problems.add("split_label_mismatch", encounter_id)
            if split_row.final_is_early is not final_is_early:
                problems.add("final_is_early_mismatch", encounter_id)
        elif organiser_usable:
            problems.add("split_missing", encounter_id)

        records[encounter_id] = LabelRecord(
            encounter_id=encounter_id,
            final_tier=organiser_tier,
            usable=organiser_usable,
            final_observation_id=final.observation_id,
            final_time_to_tca_days=final.time_to_tca_days,
            final_is_early=final_is_early,
            latest_eligible_observation_id=early.observation_id if early else None,
            latest_eligible_time_to_tca_days=early.time_to_tca_days if early else None,
            latest_eligible_rule_tier=_rule_tier(early, problems) if early else None,
            partition=split_row.partition if split_row is not None and organiser_usable else None,
        )

    for encounter_id in split_rows.keys() - organiser.keys():
        problems.add("split_unexpected", encounter_id)
    problems.raise_if_any()
    return records

