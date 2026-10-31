"""SG-03.1 strict one-to-one join of labels and validated predictions.

The key is the source-qualified ``EncounterId`` (``train:57``), never an
observation ID. Output order is ``(source, event_id)``, so input row order
cannot change results.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from contracts.ids import EncounterId
from evaluation.cohorts import Cohort
from evaluation.errors import ProblemCollector
from evaluation.labels import LabelRecord
from evaluation.predictions import PredictionRecord, PredictionSet


@dataclass(frozen=True)
class JoinedRow:
    encounter_id: EncounterId
    label: LabelRecord
    prediction: PredictionRecord


def join(
    labels: Mapping[EncounterId, LabelRecord], predictions: PredictionSet, cohort: Cohort
) -> tuple[JoinedRow, ...]:
    """Exactly one label and one prediction for every cohort encounter, or fail."""

    problems = ProblemCollector()
    if predictions.cohort_id != cohort.cohort_id:
        problems.add("cohort_mismatch", f"{predictions.cohort_id}!={cohort.cohort_id}")
        problems.raise_if_any()

    for key in predictions.missing:
        problems.add("missing_prediction", key)
    for key in predictions.predictions.keys() - cohort.members:
        problems.add("unexpected_prediction", key)
    rows = []
    for key in cohort.encounter_ids:
        label = labels.get(key)
        prediction = predictions.predictions.get(key)
        if label is None:
            problems.add("cohort_label_missing", key)
            continue
        if label.partition != cohort.partition:
            problems.add("cohort_mismatch", key)
        if prediction is None:
            problems.add("missing_prediction", key)
            continue
        rows.append(JoinedRow(key, label, prediction))
    problems.raise_if_any()
    return tuple(rows)
