"""Build one cohort's backend state from the real data files and model bundle.

Cohorts:

- ``test``: every ``test_data.csv`` encounter. Test files have no outcomes, so
  these are demo predictions, never measured performance. Every test message
  is at least 2 days out, so nothing is within 24 h.
- ``validation``: the held-out validation encounters of the saved split
  (``ml/splits/train_validation.csv``), never used to fit the model. Only
  ``encounter_id`` and ``partition`` are read from that file; its label
  columns are never loaded. Histories include messages inside 2 days, so the
  current observation can reveal the outcome: a labelled historical replay,
  not evaluation evidence.

Messages are validated from the raw CSV text (SG-02.1). The model scores the
same file through ``ml.data.load_messages``, whose row ids match.
"""

from __future__ import annotations

import csv
import hashlib
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from backend.assessment import Assessment, assess_all, group_messages, queue_order
from backend.forecasts import ForecastResult, ModelInfo, run_model
from backend.message_validation import MessageCheck, validate_message
from contracts.ids import EncounterId
from ml.config import SPLITS_DIR, TEST_CSV, TRAIN_CSV

COHORTS = {
    "test": {
        "source": "test",
        "label": "test_data.csv demo predictions (no outcomes available)",
        "caveat": "Test encounters: every message is at least 2 days before closest approach, so the 24-hour window "
        "is empty by construction. Hours are relative to each encounter's own closest approach. No outcomes "
        "exist, so these are not performance results.",
    },
    "validation": {
        "source": "train",
        "label": "held-out validation replay (never used to fit the model; outcome may be visible)",
        "caveat": "Historical held-out validation encounters. The current observation is each encounter's latest "
        "non-negative message, which can show the outcome, so this view is not evaluation evidence. Hours are "
        "relative to each encounter's own closest approach. Not a live clock.",
    },
}

SPLIT_FILE = SPLITS_DIR / "train_validation.csv"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validation_encounters(split_file: Path = SPLIT_FILE) -> set[str]:
    with open(split_file, newline="") as handle:
        return {row["encounter_id"] for row in csv.DictReader(handle) if row["partition"] == "validation"}


def read_checks(path: Path, source: str, keep: set[str] | None = None) -> list[MessageCheck]:
    """Validate every row; keep original 0-based row indexes. ``keep`` filters by encounter key."""

    checks = []
    with open(path, newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle)):
            check = validate_message(row, source=source, row_index=index)
            if keep is None or check.encounter_key in keep:
                checks.append(check)
    return checks


@dataclass
class CohortState:
    cohort: str
    view_label: str
    caveat: str
    data_sha256: str
    model: ModelInfo | None
    model_problem: str | None
    assessments: dict[EncounterId, Assessment]
    queue: list[Assessment]
    excluded: list[Assessment]
    messages_without_encounter: int
    status_counts: dict[str, int] = field(default_factory=dict)

    def find(self, encounter_key: str) -> Assessment | None:
        try:
            return self.assessments.get(EncounterId.parse(encounter_key))
        except ValueError:
            return None


def build_from_checks(
    cohort: str,
    checks: list[MessageCheck],
    forecasts: dict[EncounterId, ForecastResult],
    *,
    model: ModelInfo | None,
    model_problem: str | None,
    data_sha256: str,
) -> CohortState:
    grouped = group_messages(checks)
    assessments = assess_all(grouped, forecasts)
    queue, excluded = queue_order(assessments)
    meta = COHORTS[cohort]
    return CohortState(
        cohort=cohort,
        view_label=meta["label"],
        caveat=meta["caveat"],
        data_sha256=data_sha256,
        model=model,
        model_problem=model_problem,
        assessments=assessments,
        queue=queue,
        excluded=excluded,
        messages_without_encounter=grouped.without_encounter,
        status_counts=dict(Counter(check.status.value for check in checks)),
    )


def build_cohort(cohort: str, model_dir: Path | str) -> CohortState:
    if cohort not in COHORTS:
        raise ValueError(f"cohort must be one of {', '.join(COHORTS)}")
    source = COHORTS[cohort]["source"]
    path = TRAIN_CSV if source == "train" else TEST_CSV
    if not path.is_file():
        raise FileNotFoundError(f"{path} not found; put the challenge CSVs in Datasets/ (see ml/README.md)")
    keep = validation_encounters() if cohort == "validation" else None
    checks = read_checks(path, source, keep)
    grouped = group_messages(checks)

    from ml.data import load_messages

    frame = load_messages(source)
    if keep is not None:
        frame = frame[frame["encounter_id"].isin(keep)]
    model, forecasts, problem = run_model(
        model_dir, frame, early_sources=grouped.early_sources(), messages=grouped.checks_by_key()
    )
    return build_from_checks(cohort, checks, forecasts, model=model, model_problem=problem,
                             data_sha256=file_sha256(path))
