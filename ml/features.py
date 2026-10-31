"""SG-04.3 Build encounter features from early messages.

Library module, used by ml.train and ml.inference:
    build_features(messages) -> DataFrame, one row per encounter_id

Only messages with time_to_tca >= 2 days are used; others are dropped here so callers
can pass every message they have. The same function serves train and test.

Columns:
- Metadata (never features): latest_row_id, persistence_tier, n_early.
- Latest early message: message columns, c_object_type (fixed categories, unseen -> NaN).
- Physics-informed: log10 miss distance, combined radial sigma, miss distance / sigma.
- Trends across early messages: first/min miss distance, max risk, changes, slopes.
- Quality indicators: sigma_placeholder (6.378136e7 sentinel, see data_profile.md),
  space_weather_missing (F10/AP absent). The model handles NaN natively; these flags
  let receipts name what was missing.
"""

import numpy as np
import pandas as pd

from ml.config import MESSAGE_NUMERIC, RISK_FEATURE, TIERS
from ml.data import check_features, early_messages, tier

SIGMA_PLACEHOLDER = 6.378136e7
OBJECT_TYPES = ["DEBRIS", "PAYLOAD", "ROCKET BODY", "TBA", "UNKNOWN"]
TIER_LEVEL = {"Safe": 0, "Elevated": 1, "Critical": 2}

METADATA = ["latest_row_id", "persistence_tier"]

_LATEST = [c for c in MESSAGE_NUMERIC] + ["c_object_type"]
_DERIVED = [
    "persistence_level",
    "n_early",
    "early_span_days",
    "log10_miss",
    "log10_sigma_combined",
    "miss_over_sigma",
    "sigma_placeholder",
    "space_weather_missing",
    "first_miss",
    "min_miss",
    "max_risk",
    "miss_change",
    "risk_change",
    "last_step_miss_change",
    "last_step_risk_change",
    "miss_slope_per_day",
    "risk_slope_per_day",
]

FEATURE_SETS = {
    "base": _LATEST + _DERIVED,
    "base_mre": _LATEST + [RISK_FEATURE] + _DERIVED,
}


def _slope(df: pd.DataFrame, y: str) -> pd.Series:
    """Least-squares slope of y against time_to_tca per encounter (NaN with < 2 messages)."""
    g = df.assign(_t=df["time_to_tca"], _y=df[y], _ty=df["time_to_tca"] * df[y], _tt=df["time_to_tca"] ** 2)
    s = g.groupby("encounter_id")[["_t", "_y", "_ty", "_tt"]].sum()
    n = df.groupby("encounter_id").size()
    var = s["_tt"] - s["_t"] ** 2 / n
    cov = s["_ty"] - s["_t"] * s["_y"] / n
    return (cov / var).where((n >= 2) & (var > 1e-12))


def build_features(messages: pd.DataFrame) -> pd.DataFrame:
    early = early_messages(messages).sort_values(["encounter_id", "time_to_tca"])
    if early.empty:
        return pd.DataFrame(columns=METADATA + FEATURE_SETS["base_mre"]).rename_axis("encounter_id")

    by_enc = early.groupby("encounter_id")
    latest = by_enc.head(1).set_index("encounter_id")  # smallest time_to_tca >= 2 days
    first = by_enc.tail(1).set_index("encounter_id")  # earliest message
    second = by_enc.nth(1).set_index("encounter_id")  # message before the latest

    f = latest[_LATEST + [RISK_FEATURE]].copy()
    f["c_object_type"] = pd.Categorical(f["c_object_type"], categories=OBJECT_TYPES)
    f.insert(0, "latest_row_id", latest["row_id"])
    f.insert(1, "persistence_tier", tier(latest["risk"], latest["miss_distance"]))

    f["persistence_level"] = f["persistence_tier"].map(TIER_LEVEL)
    f["n_early"] = by_enc.size()
    f["early_span_days"] = first["time_to_tca"] - latest["time_to_tca"]

    placeholder = (latest["c_sigma_r"] >= SIGMA_PLACEHOLDER) | (latest["t_sigma_r"] >= SIGMA_PLACEHOLDER)
    sigma = np.sqrt(latest["c_sigma_r"] ** 2 + latest["t_sigma_r"] ** 2).where(~placeholder)
    f["log10_miss"] = np.log10(latest["miss_distance"].clip(lower=1))
    f["log10_sigma_combined"] = np.log10(sigma)
    f["miss_over_sigma"] = latest["miss_distance"] / sigma
    f["sigma_placeholder"] = placeholder.astype(int)
    f["space_weather_missing"] = (latest["F10"].isna() | latest["AP"].isna()).astype(int)

    f["first_miss"] = first["miss_distance"]
    f["min_miss"] = by_enc["miss_distance"].min()
    f["max_risk"] = by_enc["risk"].max()
    f["miss_change"] = latest["miss_distance"] - first["miss_distance"]
    f["risk_change"] = latest["risk"] - first["risk"]
    f["last_step_miss_change"] = latest["miss_distance"] - second["miss_distance"].reindex(f.index)
    f["last_step_risk_change"] = latest["risk"] - second["risk"].reindex(f.index)
    f["miss_slope_per_day"] = _slope(early, "miss_distance")
    f["risk_slope_per_day"] = _slope(early, "risk")

    check_features(FEATURE_SETS["base_mre"])
    return f[METADATA + FEATURE_SETS["base_mre"]]


if __name__ == "__main__":
    # Smoke check: python -m ml.features
    from ml.data import load_messages

    for source in ("train", "test"):
        feats = build_features(load_messages(source))
        print(f"{source}: {feats.shape[0]} encounters x {len(FEATURE_SETS['base_mre'])} features")
        print(f"  persistence tiers: {feats['persistence_tier'].value_counts().reindex(TIERS).to_dict()}")
        print(f"  sigma placeholder: {feats['sigma_placeholder'].sum()}, "
              f"space weather missing: {feats['space_weather_missing'].sum()}")
        nan = feats[FEATURE_SETS["base_mre"]].isna().mean()
        print(f"  columns with NaN: {nan[nan > 0].round(3).to_dict()}")
