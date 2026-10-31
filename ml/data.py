"""Load raw CSVs with source-qualified, stable identifiers.

row_id       = "<source>:<0-based data row in the CSV>"   e.g. "train:1234"
encounter_id = "<source>:<event_id>"                     e.g. "test:57"

Row IDs are stable only while the CSV is unchanged, so record file_sha256() next
to any saved split or prediction file.
"""

import hashlib
from pathlib import Path

import pandas as pd

from ml.config import ENCOUNTER_COL, FEATURE_SETS, FORBIDDEN_FEATURES, TEST_CSV, TRAIN_CSV

SOURCES = {"train": TRAIN_CSV, "test": TEST_CSV}


def load(source: str) -> pd.DataFrame:
    path = SOURCES[source]
    if not path.exists():
        raise FileNotFoundError(f"{path} not found; download the datasets from the team Drive into Datasets/")
    df = pd.read_csv(path)
    df.insert(0, "source", source)
    df.insert(1, "row_id", [f"{source}:{i}" for i in range(len(df))])
    df.insert(2, "encounter_id", source + ":" + df[ENCOUNTER_COL].astype(str))
    return df


def feature_columns(feature_set: str) -> list[str]:
    cols = FEATURE_SETS[feature_set]
    leaked = FORBIDDEN_FEATURES.intersection(cols)
    if leaked:
        raise ValueError(f"forbidden columns in feature set {feature_set!r}: {sorted(leaked)}")
    return cols


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


if __name__ == "__main__":
    # Smoke check: python -m ml.data
    for name, path in SOURCES.items():
        df = load(name)
        print(f"{name}: {len(df)} rows, {df['encounter_id'].nunique()} encounters, sha256 {file_sha256(path)[:12]}")
        missing = [c for cols in FEATURE_SETS.values() for c in cols if c not in df.columns]
        print(f"  missing feature columns: {sorted(set(missing)) or 'none'}")
