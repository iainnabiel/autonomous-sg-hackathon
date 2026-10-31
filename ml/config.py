"""Shared paths, column lists, and constants for the ML pipeline (SG-04 to SG-06)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = REPO_ROOT / "Datasets"  # raw data, never committed
TRAIN_CSV = DATA_DIR / "train_data.csv"
TEST_CSV = DATA_DIR / "test_data.csv"

ML_DIR = REPO_ROOT / "ml"
REPORTS_DIR = ML_DIR / "reports"  # small, committed: profiles, metrics, model cards
SPLITS_DIR = ML_DIR / "splits"  # small, committed: fixed split membership
ARTIFACTS_DIR = ML_DIR / "artifacts"  # gitignored: models and prediction files

SEED = 42
VALIDATION_FRACTION = 0.2

ENCOUNTER_COL = "event_id"
TARGET_COL = "risk"  # log10(Pc); label only, never an input
RISK_FLOOR = -30.0  # possible reporting floor, see SG-04.1

# The brief's allowed columns, minus event_id and the label.
NUMERIC_FEATURES = [
    "time_to_tca",
    "miss_distance",
    "relative_speed",
    "relative_position_r",
    "relative_position_t",
    "relative_position_n",
    "c_sigma_r",
    "t_sigma_r",
    "F10",
    "AP",
]
CATEGORICAL_FEATURES = ["c_object_type"]
RISK_FEATURE = "max_risk_estimate"  # only in the SG-05.3 comparison

FEATURE_SETS = {
    "telemetry": NUMERIC_FEATURES + CATEGORICAL_FEATURES,
    "telemetry_mre": NUMERIC_FEATURES + [RISK_FEATURE] + CATEGORICAL_FEATURES,
}

# Columns that must never reach the feature matrix.
FORBIDDEN_FEATURES = {TARGET_COL, ENCOUNTER_COL, "source", "row_id", "encounter_id"}

# Mirror of the brief's thresholds, used only for offline detection metrics.
# Iain owns the operational rules (SG-02.2); switch to contracts/ once SG-01.2 lands.
CRITICAL_LOG_PC = -4.0
ELEVATED_LOG_PC = -6.0
CRITICAL_DISTANCE_M = 1000.0
ELEVATED_DISTANCE_M = 5000.0
