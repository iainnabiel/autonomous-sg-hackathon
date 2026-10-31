"""SG-03 file loading with checksums. CSV only, stdlib only.

Raw data is local and never committed. ``Datasets/`` follows ``ml/README.md``:
``train_data.csv`` plus the organisers' ``train_event_labels.csv`` (a note line,
a blank line, then the header).
"""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path

from evaluation.labels import LABELLED_SOURCE, OrganiserLabel, RawMessage, SplitRow

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "Datasets"
TRAIN_CSV = DATA_DIR / "train_data.csv"
LABELS_CSV = DATA_DIR / "train_event_labels.csv"
SPLIT_CSV = REPO_ROOT / "ml" / "splits" / "train_validation.csv"
SPLIT_META = REPO_ROOT / "ml" / "splits" / "split_meta.json"
ML_ARTIFACTS = REPO_ROOT / "ml" / "artifacts"
ML_REPORTS = REPO_ROOT / "ml" / "reports"


def require(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"{path} not found; see evaluation/README.md for the local inputs")
    return path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(require(path), "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _optional_float(value: str) -> float | None:
    return None if value == "" else float(value)


def load_messages(path: Path = TRAIN_CSV) -> list[RawMessage]:
    with open(require(path), newline="", encoding="utf-8") as handle:
        return [
            RawMessage(
                source=LABELLED_SOURCE,
                row_index=index,
                event_id=int(row["event_id"]),
                time_to_tca_days=float(row["time_to_tca"]),
                risk_log10_pc=_optional_float(row["risk"]),
                miss_distance_m=_optional_float(row["miss_distance"]),
            )
            for index, row in enumerate(csv.DictReader(handle))
        ]


def load_organiser_labels(path: Path = LABELS_CSV) -> list[OrganiserLabel]:
    """Rows after the header line that starts with ``event_id``; note lines are skipped."""

    with open(require(path), newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    start = next(i for i, row in enumerate(rows) if row and row[0] == "event_id")
    header = rows[start]
    labels = []
    for values in rows[start + 1:]:
        if not values:
            continue
        row = dict(zip(header, values))
        labels.append(
            OrganiserLabel(
                event_id=int(row["event_id"]),
                final_tier=row["final_tier"],
                usable_for_training=row["usable_for_training"],
                final_time_to_tca_days=float(row["final_time_to_tca_days"]),
            )
        )
    return labels


def _bool(value: str) -> bool:
    if value not in ("True", "False"):
        raise ValueError(f"expected True or False, got {value!r}")
    return value == "True"


def load_split(path: Path = SPLIT_CSV) -> list[SplitRow]:
    with open(require(path), newline="", encoding="utf-8") as handle:
        return [
            SplitRow(row["encounter_id"], row["partition"], row["final_tier"], _bool(row["final_is_early"]))
            for row in csv.DictReader(handle)
        ]


def message_tca_by_observation(messages: list[RawMessage]) -> dict[str, float]:
    """Raw ``time_to_tca`` per observation ID, to fill a prediction's source TCA."""

    return {f"{m.source}:{m.row_index}": m.time_to_tca_days for m in messages}
