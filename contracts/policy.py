"""Constants taken from the organiser notes and the merged ML decisions.

Organiser workbook sheets ``data_notes`` and ``tier_rules`` (local, not committed):

- Distance and relative position are metres.
- Relative speed is m/s.
- ``time_to_tca`` is days.
- Predict ``final_tier`` from messages with ``time_to_tca >= 2`` days.
- Test messages are all at least 2 days out and have no final outcomes.
- ``event_id`` restarts in each file.

``docs/ML_DECISIONS.md`` on main is the merged decision record (D1–D6).
The merged SG-05 upgrade classifier is cited only for what ``p_critical``
is. Its threshold rule is SG-05 work and is not an operational policy here.
Sigma units are not stated in the organiser notes.
"""

from __future__ import annotations

EARLY_CUTOFF_DAYS = 2.0
HOURS_PER_DAY = 24.0

CRITICAL_LOG10_PC = -4.0
ELEVATED_LOG10_PC = -6.0
CRITICAL_MISS_DISTANCE_M = 1000.0
ELEVATED_MISS_DISTANCE_M = 5000.0

POLICY_VERSION = "sg-01.2-sg-01.3"
TRIAGE_POLICY_VERSION = "triage-prototype-sg-01.4"
UPCOMING_URGENCY_DAYS = 1.0
SPLIT_SEED = 42
VALIDATION_FRACTION = 0.2

# Merged D4 counts, recorded in docs/ML_DECISIONS.md. Not recomputed here.
USABLE_ENCOUNTERS = 11942
TRAIN_ENCOUNTERS = 13154
FINAL_IS_EARLY_ENCOUNTERS = 3050
PRIMARY_COHORT_ENCOUNTERS = 8892

# Names that must never be model inputs. ``final_*`` is also rejected by prefix.
FORBIDDEN_INFERENCE_COLUMNS = frozenset(
    {
        "event_id",
        "encounter_id",
        "row_id",
        "observation_id",
        "source",
        "mission_id",
        "final_tier",
        "final_time_to_tca_days",
        "final_risk_log10_pc",
        "final_miss_distance_m",
        "final_is_early",
        "usable_for_training",
        "cdm_count",
        "cdm_count_2d_or_more",
    }
)

P_CRITICAL_DEFINITION = (
    "p_critical is the upgrade classifier's score for the question "
    "'will this encounter's final tier be Critical?'. "
    "The SG-05 classifier computes it as "
    "HistGradientBoostingClassifier.predict_proba for the Critical class "
    "with class_weight='balanced', so the number is not a calibrated probability. "
    "It is not a collision probability and must not be displayed as a percentage chance. "
    "It applies only when that upgrade classifier is run on an encounter with at least "
    "one observation at time_to_tca >= 2 days. "
    "It is absent for the persistence baseline, when no eligible observation exists, "
    "and when inference is unavailable. "
    "final_is_early encounters can still receive a score; the primary cohort is an "
    "evaluation filter, not a requirement for the score to exist. "
    "The optional predicted final log10(Pc) is a different field and is null for this model."
)


def tca_hours(time_to_tca_days: float) -> float:
    """Display conversion. Stored ``time_to_tca`` remains in days."""

    return time_to_tca_days * HOURS_PER_DAY
