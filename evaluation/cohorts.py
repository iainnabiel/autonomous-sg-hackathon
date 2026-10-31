"""SG-03.1 evaluation cohorts (decision D4), built from raw-derived labels.

- ``all_usable``: usable encounters in one partition of the saved split.
- ``primary``: ``all_usable`` without ``final_is_early`` encounters.
- ``final_is_early``: the excluded remainder, reported separately.
- ``unable_to_assess``: encounters with no eligible message, in any partition.
  They are never counted as Safe and are kept out of tier-metric cohorts.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass, field

from contracts.ids import EncounterId
from contracts.tiers import Tier
from evaluation.errors import EvaluationInputError
from evaluation.labels import PARTITIONS, LabelRecord, encounter_order

ALL_USABLE = "all_usable"
PRIMARY = "primary"
FINAL_IS_EARLY = "final_is_early"
UNABLE_TO_ASSESS = "unable_to_assess"


@dataclass(frozen=True)
class Cohort:
    """A fixed, ordered set of encounters with its label support and ID-list hash."""

    cohort_id: str
    partition: str | None
    encounter_ids: tuple[EncounterId, ...]
    support: Mapping[Tier, int]
    id_sha256: str
    members: frozenset[EncounterId] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "members", frozenset(self.encounter_ids))

    @property
    def n(self) -> int:
        return len(self.encounter_ids)

    def __contains__(self, encounter_id: object) -> bool:
        return encounter_id in self.members


def id_list_bytes(encounter_ids: tuple[EncounterId, ...]) -> bytes:
    """Hash input: a compact JSON array of ``[source, event_id]`` pairs, in cohort order."""

    pairs = [[item.source, item.event_id] for item in encounter_ids]
    return json.dumps(pairs, separators=(",", ":")).encode("utf-8")


def _cohort(
    cohort_id: str, partition: str | None, members: list[LabelRecord]
) -> Cohort:
    ordered = tuple(sorted((record.encounter_id for record in members), key=encounter_order))
    support = {tier: 0 for tier in Tier}
    for record in members:
        support[record.final_tier] += 1
    digest = hashlib.sha256(id_list_bytes(ordered)).hexdigest()
    return Cohort(cohort_id, partition, ordered, support, digest)


def build_cohorts(labels: Mapping[EncounterId, LabelRecord], partition: str) -> dict[str, Cohort]:
    """D4 cohorts for one partition, plus the unable-to-assess set across all labels."""

    if partition not in PARTITIONS:
        raise EvaluationInputError({"invalid_split": [partition]})
    in_partition = [record for record in labels.values() if record.usable and record.partition == partition]
    return {
        ALL_USABLE: _cohort(ALL_USABLE, partition, in_partition),
        PRIMARY: _cohort(PRIMARY, partition, [r for r in in_partition if not r.final_is_early]),
        FINAL_IS_EARLY: _cohort(FINAL_IS_EARLY, partition, [r for r in in_partition if r.final_is_early]),
        UNABLE_TO_ASSESS: _cohort(UNABLE_TO_ASSESS, None, [r for r in labels.values() if not r.usable]),
    }
