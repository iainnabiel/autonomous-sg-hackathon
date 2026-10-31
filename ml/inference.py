"""SG-05.4 Package inference.

Backend usage (Iain, SG-02.3):
    from ml.data import load_messages
    from ml.inference import load_model, predict_encounters
    model = load_model()                                  # ml/artifacts/upgrade_base by default
    records = predict_encounters(model, load_messages("test"))

`messages` needs an encounter_id column (ml.data.load_messages adds it) and the message
columns. Messages with time_to_tca < 2 days are ignored.

One record per encounter (field names follow contracts/ once SG-01.2 lands):
    encounter_id, status ("assessed" | "unable_to_assess"), latest_early_row_id,
    persistence_tier, p_critical, predicted_tier, upgraded, upgrade_reasons,
    quality_flags, model_version, model_sha256

p_critical is a ranking score (class-weighted training), not a calibrated probability.
Encounters with no early message get status "unable_to_assess" and no tier, never Safe.
"""

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.config import ARTIFACTS_DIR, CRITICAL_DISTANCE_M
from ml.data import file_sha256, load_messages
from ml.features import build_features
from ml.train import apply_upgrade

DEFAULT_MODEL_DIR = ARTIFACTS_DIR / "upgrade_base"


def load_model(path: Path | str = DEFAULT_MODEL_DIR) -> dict:
    """Load a saved model bundle; raises if it is missing, never falls back to a default."""
    model_file = Path(path) / "model.joblib"
    if not model_file.exists():
        raise FileNotFoundError(
            f"{model_file} not found; run `python -m ml.train --model upgrade --features base` "
            "or download the bundle from the team Drive"
        )
    bundle = joblib.load(model_file)
    bundle["model_sha256"] = file_sha256(model_file)
    return bundle


def _reasons(row: pd.Series) -> list[str]:
    """Observable facts behind an upgrade, for the decision receipt (not model attributions)."""
    reasons = []
    if row["min_miss"] < CRITICAL_DISTANCE_M <= row["miss_distance"]:
        reasons.append(f"an earlier early message was {row['min_miss']:.0f} m apart (< {CRITICAL_DISTANCE_M:.0f} m)")
    if row["miss_distance"] <= 2 * CRITICAL_DISTANCE_M:
        reasons.append(f"latest early miss distance {row['miss_distance']:.0f} m is within 2 km")
    if pd.notna(row["miss_slope_per_day"]) and row["miss_slope_per_day"] > 0:
        reasons.append(f"miss distance shrinking about {row['miss_slope_per_day']:.0f} m per day closer to TCA")
    if row["risk_change"] > 1:
        reasons.append(f"log10 Pc rose by {row['risk_change']:.1f} across early messages")
    return reasons or ["model score above threshold; no single dominant signal"]


def _quality(row: pd.Series) -> list[str]:
    flags = []
    if row["sigma_placeholder"]:
        flags.append("sigma_placeholder")
    if row["space_weather_missing"]:
        flags.append("space_weather_missing")
    if row["n_early"] == 1:
        flags.append("single_early_message")
    return flags


def predict_encounters(model: dict, messages: pd.DataFrame) -> pd.DataFrame:
    if "encounter_id" not in messages.columns:
        raise ValueError("messages need an encounter_id column; use ml.data.load_messages")

    feats = build_features(messages)
    out = pd.DataFrame(index=pd.Index(sorted(messages["encounter_id"].unique()), name="encounter_id"))
    out["status"] = np.where(out.index.isin(feats.index), "assessed", "unable_to_assess")
    out["model_version"] = model["model_version"]
    out["model_sha256"] = model["model_sha256"]

    assessed = pd.DataFrame(
        index=feats.index,
        columns=["latest_early_row_id", "persistence_tier", "p_critical", "predicted_tier", "upgraded",
                 "upgrade_reasons", "quality_flags"],
    )
    if not feats.empty:
        p = model["classifier"].predict_proba(feats[model["feature_columns"]])[:, 1]
        tier, upgraded = apply_upgrade(feats["persistence_tier"], p, model["threshold"])
        assessed = pd.DataFrame(
            {
                "latest_early_row_id": feats["latest_row_id"],
                "persistence_tier": feats["persistence_tier"],
                "p_critical": p,
                "predicted_tier": tier,
                "upgraded": upgraded,
                "upgrade_reasons": [_reasons(r) if u else [] for (_, r), u in zip(feats.iterrows(), upgraded)],
                "quality_flags": [_quality(r) for _, r in feats.iterrows()],
            },
            index=feats.index,
        )
    return out.join(assessed).reset_index()


def main() -> None:
    parser = argparse.ArgumentParser(description="Score encounters with the saved model.")
    parser.add_argument("--source", choices=["train", "test"], default="test")
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR))
    args = parser.parse_args()

    model = load_model(args.model_dir)
    records = predict_encounters(model, load_messages(args.source))
    out = ARTIFACTS_DIR / f"predictions_{args.source}.csv"
    records.to_csv(out, index=False)
    assessed = records[records["status"] == "assessed"]
    print(f"wrote {out.relative_to(ARTIFACTS_DIR.parent.parent)}: {len(records)} encounters, "
          f"{(records['status'] == 'unable_to_assess').sum()} unable to assess")
    print(f"  predicted tiers: {assessed['predicted_tier'].value_counts().to_dict()}, upgraded: {int(assessed['upgraded'].sum())}")
    print(f"  model {model['model_version']} sha256 {model['model_sha256'][:12]}")


if __name__ == "__main__":
    main()
