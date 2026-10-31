"""Shared paths, column lists, and constants for the ML pipeline (SG-04 to SG-06).

Task (organisers' data_notes.csv): predict each encounter's final_tier using only
messages with time_to_tca >= 2 days. Decisions are recorded in docs/ML_DECISIONS.md.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = REPO_ROOT / "Datasets"  # raw data, never committed
TRAIN_CSV = DATA_DIR / "train_data.csv"  # one row per message
TEST_CSV = DATA_DIR / "test_data.csv"  # one row per message, no outcomes
LABELS_CSV = DATA_DIR / "train_event_labels.csv"  # one row per train encounter
LABELS_SKIPROWS = 2  # the file starts with a note line and a blank line

ML_DIR = REPO_ROOT / "ml"
REPORTS_DIR = ML_DIR / "reports"  # small, committed: profiles, metrics, model cards
SPLITS_DIR = ML_DIR / "splits"  # small, committed: fixed split membership
ARTIFACTS_DIR = ML_DIR / "artifacts"  # gitignored: models and prediction files

SEED = 42
VALIDATION_FRACTION = 0.2

ENCOUNTER_COL = "event_id"  # restarts per file: always use source-qualified encounter_id
EARLY_CUTOFF_DAYS = 2.0  # only messages with time_to_tca >= this may be model inputs
TARGET_COL = "final_tier"
TIERS = ["Critical", "Elevated", "Safe"]  # severity order
RISK_FLOOR = -30.0  # placeholder for Pc too small to compute (treat as Pc ~ 0)

# Per-message columns the encounter features are built from (organisers' recommended set).
# risk is allowed here because it comes from early messages only (decision D1).
MESSAGE_NUMERIC = [
    "time_to_tca",
    "risk",
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
MESSAGE_CATEGORICAL = ["c_object_type"]
RISK_FEATURE = "max_risk_estimate"  # only in the SG-05.3 comparison

# Never model inputs: identifiers and anything describing the final message.
FORBIDDEN_FEATURES = {
    ENCOUNTER_COL,
    "mission_id",  # strong shortcut (mission 16 is never Safe); excluded unless the team decides otherwise
    "source",
    "row_id",
    "encounter_id",
    TARGET_COL,
    "final_time_to_tca_days",
    "final_risk_log10_pc",
    "final_miss_distance_m",
}

# Organisers' tier_rules.csv (precedence Critical, Elevated, Safe). Iain owns the
# operational rules (SG-02.2); switch to contracts/ once SG-01.2 lands.
CRITICAL_LOG_PC = -4.0
ELEVATED_LOG_PC = -6.0
CRITICAL_DISTANCE_M = 1000.0
ELEVATED_DISTANCE_M = 5000.0

# Decision D7: an upgrade to Critical must be right at least this often on training
# folds, i.e. at most 3 false alarms per extra Critical caught.
MIN_UPGRADE_PRECISION = 0.25
