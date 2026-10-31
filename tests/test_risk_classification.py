"""SG-02.2: risk tiers, exact thresholds, and missing-input handling."""

from __future__ import annotations

import csv
import math
import os
import unittest
from fractions import Fraction
from pathlib import Path

from backend.risk_classification import (
    LOG_RISK,
    MISS_DISTANCE_KM,
    RiskRule,
    RiskTier,
    classify_risk,
)

ROOT = Path(__file__).resolve().parents[1]

FAR_KM = 50.0
NEGLIGIBLE_LOG_RISK = -20.0


def below(value: float) -> float:
    return math.nextafter(value, -math.inf)


def above(value: float) -> float:
    return math.nextafter(value, math.inf)


class ProbabilityThresholdTest(unittest.TestCase):
    def assert_tier(self, log_risk: float, expected: RiskTier) -> None:
        result = classify_risk(log_risk, FAR_KM)
        self.assertIs(result.tier, expected, log_risk)
        self.assertTrue(result.is_complete)

    def test_critical_starts_at_minus_four(self) -> None:
        self.assert_tier(-4.0, RiskTier.CRITICAL)
        self.assert_tier(below(-4.0), RiskTier.ELEVATED)

    def test_elevated_starts_at_minus_six(self) -> None:
        self.assert_tier(-6.0, RiskTier.ELEVATED)
        self.assert_tier(below(-6.0), RiskTier.SAFE)

    def test_certain_collision_is_critical(self) -> None:
        self.assert_tier(0.0, RiskTier.CRITICAL)

    def test_minus_thirty_is_treated_as_negligible_probability(self) -> None:
        # Organisers' tier_rules: -30 is a placeholder meaning Pc ~ 0.
        self.assert_tier(-30.0, RiskTier.SAFE)
        result = classify_risk(-30.0, 0.5)
        self.assertIs(result.tier, RiskTier.CRITICAL)
        self.assertEqual(result.triggered_rules, (RiskRule.DISTANCE_CRITICAL,))
        self.assertTrue(result.is_complete)

    def test_raw_probability_is_rejected(self) -> None:
        result = classify_risk(1e-5, FAR_KM)
        self.assertIsNone(result.tier)
        self.assertEqual(result.invalid_inputs, (LOG_RISK,))


class DistanceThresholdTest(unittest.TestCase):
    def assert_tier(self, distance_km: float, expected: RiskTier) -> None:
        result = classify_risk(NEGLIGIBLE_LOG_RISK, distance_km)
        self.assertIs(result.tier, expected, distance_km)
        self.assertTrue(result.is_complete)

    def test_critical_is_strictly_below_one_km(self) -> None:
        self.assert_tier(below(1.0), RiskTier.CRITICAL)
        self.assert_tier(1.0, RiskTier.ELEVATED)

    def test_elevated_includes_five_km(self) -> None:
        self.assert_tier(5.0, RiskTier.ELEVATED)
        self.assert_tier(above(5.0), RiskTier.SAFE)

    def test_zero_distance_is_critical(self) -> None:
        self.assert_tier(0.0, RiskTier.CRITICAL)


class CombinedRulesTest(unittest.TestCase):
    def test_safe_requires_both_inputs_safe(self) -> None:
        result = classify_risk(NEGLIGIBLE_LOG_RISK, FAR_KM)
        self.assertIs(result.tier, RiskTier.SAFE)
        self.assertEqual(result.triggered_rules, ())

    def test_critical_is_checked_before_elevated(self) -> None:
        cases = {
            (-5.0, 0.5): (RiskRule.PROBABILITY_ELEVATED, RiskRule.DISTANCE_CRITICAL),
            (-3.0, 3.0): (RiskRule.PROBABILITY_CRITICAL, RiskRule.DISTANCE_ELEVATED),
        }
        for (log_risk, distance_km), rules in cases.items():
            result = classify_risk(log_risk, distance_km)
            self.assertIs(result.tier, RiskTier.CRITICAL)
            self.assertEqual(result.triggered_rules, rules)

    def test_rules_name_the_cause_of_escalation(self) -> None:
        self.assertEqual(
            classify_risk(-3.0, FAR_KM).triggered_rules,
            (RiskRule.PROBABILITY_CRITICAL,),
        )
        self.assertEqual(
            classify_risk(NEGLIGIBLE_LOG_RISK, 0.2).triggered_rules,
            (RiskRule.DISTANCE_CRITICAL,),
        )
        self.assertEqual(
            classify_risk(-2.0, 0.2).triggered_rules,
            (RiskRule.PROBABILITY_CRITICAL, RiskRule.DISTANCE_CRITICAL),
        )

    def test_integer_inputs_are_accepted(self) -> None:
        self.assertIs(classify_risk(-4, 10).tier, RiskTier.CRITICAL)

    def test_non_builtin_real_numbers_are_accepted(self) -> None:
        result = classify_risk(Fraction(-3), Fraction(1, 2))
        self.assertIs(result.tier, RiskTier.CRITICAL)
        self.assertTrue(result.is_complete)


class InvalidInputTest(unittest.TestCase):
    INVALID = (None, math.nan, math.inf, -math.inf, "-3.0", True, 10**400)

    def test_known_critical_trigger_survives_missing_distance(self) -> None:
        for bad in self.INVALID:
            result = classify_risk(-3.0, bad)
            self.assertIs(result.tier, RiskTier.CRITICAL, bad)
            self.assertFalse(result.is_complete)
            self.assertEqual(result.invalid_inputs, (MISS_DISTANCE_KM,))
            self.assertEqual(result.triggered_rules, (RiskRule.PROBABILITY_CRITICAL,))

    def test_known_critical_trigger_survives_missing_probability(self) -> None:
        for bad in self.INVALID:
            result = classify_risk(bad, 0.5)
            self.assertIs(result.tier, RiskTier.CRITICAL, bad)
            self.assertEqual(result.invalid_inputs, (LOG_RISK,))
            self.assertEqual(result.triggered_rules, (RiskRule.DISTANCE_CRITICAL,))

    def test_missing_input_never_yields_safe(self) -> None:
        for bad in self.INVALID:
            self.assertIsNone(classify_risk(NEGLIGIBLE_LOG_RISK, bad).tier, bad)
            self.assertIsNone(classify_risk(bad, FAR_KM).tier, bad)

    def test_elevated_evidence_is_kept_without_claiming_a_tier(self) -> None:
        result = classify_risk(-5.0, None)
        self.assertIsNone(result.tier)
        self.assertEqual(result.triggered_rules, (RiskRule.PROBABILITY_ELEVATED,))

    def test_out_of_range_values_are_invalid(self) -> None:
        self.assertEqual(classify_risk(above(0.0), FAR_KM).invalid_inputs, (LOG_RISK,))
        self.assertEqual(
            classify_risk(NEGLIGIBLE_LOG_RISK, below(0.0)).invalid_inputs,
            (MISS_DISTANCE_KM,),
        )

    def test_both_inputs_invalid(self) -> None:
        result = classify_risk(None, None)
        self.assertIsNone(result.tier)
        self.assertEqual(result.triggered_rules, ())
        self.assertEqual(result.invalid_inputs, (LOG_RISK, MISS_DISTANCE_KM))


def _local_train_data() -> Path | None:
    candidates = [ROOT / "data", ROOT / "Datasets"]
    if os.environ.get("SG_DATA_DIR"):
        candidates.insert(0, Path(os.environ["SG_DATA_DIR"]))
    for directory in candidates:
        path = directory / "train_data.csv"
        if path.is_file():
            return path
    return None


TRAIN_DATA = _local_train_data()

# The organisers' data_notes state miss_distance is in metres. SG-02.1 owns the
# real conversion; this smoke check does its own.
METRES_PER_KM = 1000


@unittest.skipIf(TRAIN_DATA is None, "local train_data.csv not found; set SG_DATA_DIR")
class TrainingDataTest(unittest.TestCase):
    """Optional smoke check on local data. Correctness is established above."""

    def test_every_labelled_row_gets_a_tier(self) -> None:
        counts = {tier: 0 for tier in RiskTier}
        with TRAIN_DATA.open(newline="") as handle:
            for row in csv.DictReader(handle):
                log_risk = float(row["risk"])
                distance_km = float(row["miss_distance"]) / METRES_PER_KM
                result = classify_risk(log_risk, distance_km)
                self.assertTrue(result.is_complete, row["event_id"])
                if log_risk >= -4.0 or distance_km < 1.0:
                    self.assertIs(result.tier, RiskTier.CRITICAL, row["event_id"])
                counts[result.tier] += 1
        for tier, count in counts.items():
            self.assertGreater(count, 0, tier)


if __name__ == "__main__":
    unittest.main()
