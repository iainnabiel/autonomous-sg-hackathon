"""Load messages and labels with source-qualified, stable identifiers.

row_id       = "<source>:<0-based data row in the CSV>"   e.g. "train:1234"
encounter_id = "<source>:<event_id>"                     e.g. "test:57"

event_id restarts in each file, so never join train and test on it. Row IDs are
stable only while the CSV is unchanged, so record file_sha256() next to any saved
split or prediction file.
"""

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd

from ml.config import (
    CRITICAL_DISTANCE_M,
    CRITICAL_LOG_PC,
    EARLY_CUTOFF_DAYS,
    ELEVATED_DISTANCE_M,
    ELEVATED_LOG_PC,
    ENCOUNTER_COL,
    FORBIDDEN_FEATURES,
    LABELS_CSV,
    LABELS_SKIPROWS,
    TEST_CSV,
    TRAIN_CSV,
)

SOURCES = {"train": TRAIN_CSV, "test": TEST_CSV}


def _require(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"{path} not found; download the datasets from the team Drive into Datasets/")


def load_messages(source: str) -> pd.DataFrame:
    """All messages from train_data.csv or test_data.csv, one row per message."""
    path = SOURCES[source]
    _require(path)
    df = pd.read_csv(path)
    df.insert(0, "source", source)
    df.insert(1, "row_id", [f"{source}:{i}" for i in range(len(df))])
    df.insert(2, "encounter_id", source + ":" + df[ENCOUNTER_COL].astype(str))
    return df


def early_messages(messages: pd.DataFrame) -> pd.DataFrame:
    """Messages a model may use: time_to_tca >= 2 days."""
    return messages[messages["time_to_tca"] >= EARLY_CUTOFF_DAYS]


def load_labels() -> pd.DataFrame:
    """Train encounter labels, one row per encounter, indexed by encounter_id.

    final_is_early marks encounters whose final message is itself >= 2 days out;
    their label is visible in the inputs, so they are reported separately (decision D4).
    """
    _require(LABELS_CSV)
    labels = pd.read_csv(LABELS_CSV, skiprows=LABELS_SKIPROWS)
    labels["encounter_id"] = "train:" + labels[ENCOUNTER_COL].astype(str)
    labels["usable"] = labels["usable_for_training"].eq("yes")
    labels["final_is_early"] = labels["final_time_to_tca_days"] >= EARLY_CUTOFF_DAYS
    return labels.set_index("encounter_id")


def tier(log_pc, miss_distance_m) -> np.ndarray:
    """Organisers' tier rules, critical first. Mirror of Iain's SG-02.2 for offline use."""
    log_pc = np.asarray(log_pc, dtype=float)
    miss = np.asarray(miss_distance_m, dtype=float)
    critical = (log_pc >= CRITICAL_LOG_PC) | (miss < CRITICAL_DISTANCE_M)
    elevated = (log_pc >= ELEVATED_LOG_PC) | (miss <= ELEVATED_DISTANCE_M)
    return np.where(critical, "Critical", np.where(elevated, "Elevated", "Safe"))


def check_features(columns) -> None:
    leaked = FORBIDDEN_FEATURES.intersection(columns)
    if leaked:
        raise ValueError(f"forbidden columns in feature matrix: {sorted(leaked)}")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


if __name__ == "__main__":
    # Smoke check: python -m ml.data
    for name, path in SOURCES.items():
        df = load_messages(name)
        early = early_messages(df)
        print(
            f"{name}: {len(df)} messages, {df['encounter_id'].nunique()} encounters "
            f"({early['encounter_id'].nunique()} with early messages), sha256 {file_sha256(path)[:12]}"
        )
    labels = load_labels()
    train = load_messages("train").sort_values(["encounter_id", "time_to_tca"])
    final = train.groupby("encounter_id").head(1).set_index("encounter_id").loc[labels.index]
    recomputed = tier(final["risk"], final["miss_distance"])
    print(f"labels: {len(labels)} encounters, {labels['usable'].sum()} usable, {labels['final_is_early'].sum()} final_is_early")
    print(f"  labels reproduced from train_data + tier rules: {(recomputed == labels['final_tier']).mean():.1%}")
