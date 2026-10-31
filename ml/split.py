"""SG-04.2 Save encounter-grouped split.

Run:    python -m ml.split
Writes: ml/splits/train_validation.csv  (encounter_id, partition, final_tier, final_is_early)
        ml/splits/split_meta.json       (seed, fraction, file checksums, tier support)

Usable train encounters only, split 80/20 by encounter and stratified by final_tier.
Labels are one row per encounter, so a split over label rows cannot put one encounter
in both partitions; the assertion below checks it anyway. test_data.csv is not read.
"""

import json

import pandas as pd
from sklearn.model_selection import train_test_split

from ml.config import LABELS_CSV, SEED, SPLITS_DIR, TIERS, TRAIN_CSV, VALIDATION_FRACTION
from ml.data import file_sha256, load_labels

SPLIT_CSV = SPLITS_DIR / "train_validation.csv"
SPLIT_META = SPLITS_DIR / "split_meta.json"


def load_split() -> pd.DataFrame:
    """Saved split, indexed by encounter_id. Run python -m ml.split first."""
    if not SPLIT_CSV.exists():
        raise FileNotFoundError(f"{SPLIT_CSV} not found; run python -m ml.split")
    return pd.read_csv(SPLIT_CSV).set_index("encounter_id")


def _support(split: pd.DataFrame) -> dict:
    out = {}
    for partition, part in split.groupby("partition"):
        primary = part[~part["final_is_early"]]
        out[partition] = {
            "encounters": len(part),
            "all_usable": part["final_tier"].value_counts().reindex(TIERS, fill_value=0).to_dict(),
            "primary_cohort": primary["final_tier"].value_counts().reindex(TIERS, fill_value=0).to_dict(),
        }
    return out


def main() -> None:
    labels = load_labels()
    usable = labels[labels["usable"]]
    train_ids, validation_ids = train_test_split(
        usable.index.to_numpy(),
        test_size=VALIDATION_FRACTION,
        random_state=SEED,
        stratify=usable["final_tier"],
    )
    split = usable.loc[:, ["final_tier", "final_is_early"]].copy()
    split.insert(0, "partition", "train")
    split.loc[validation_ids, "partition"] = "validation"
    split = split.sort_index()

    assert set(train_ids).isdisjoint(validation_ids), "encounter in both partitions"
    assert split.index.is_unique

    meta = {
        "task": "SG-04.2",
        "seed": SEED,
        "validation_fraction": VALIDATION_FRACTION,
        "stratified_by": "final_tier",
        "cohort": "usable train encounters (at least one message with time_to_tca >= 2 days)",
        "files_sha256": {TRAIN_CSV.name: file_sha256(TRAIN_CSV), LABELS_CSV.name: file_sha256(LABELS_CSV)},
        "support": _support(split),
    }

    SPLITS_DIR.mkdir(parents=True, exist_ok=True)
    split.to_csv(SPLIT_CSV)
    SPLIT_META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    for partition, info in meta["support"].items():
        print(f"{partition}: {info['encounters']} encounters, primary cohort {info['primary_cohort']}")


if __name__ == "__main__":
    main()
