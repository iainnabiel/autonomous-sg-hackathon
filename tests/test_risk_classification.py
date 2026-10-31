"""SG-02.2: risk tiers, exact thresholds, and missing-input handling.

Run from the repository root:

    python3 -m unittest tests.test_risk_classification

TrainingDataTest is an optional check on local data. It is skipped, not
passed, when train_data.csv is absent; set SG_DATA_DIR to run it.
"""

from __future__ import annotations

import csv
import math
import os
import unittest
from fractions import Fraction
from pathlib import Path

from backend.risk_classification import (
    LOG10_PC,
    MISS_DISTANCE_M,
    RiskRule,
    Tier,
    classify_risk,
)

ROOT = Path(__file__).resolve().parents[1]

FAR_M = 50_000.0
NEGLIGIBLE_LOG10_PC = -20.0


def below(value: float) -> float:
    return math.nextafter(value, -math.inf)


def above(value: float) -> float:
    return math.nextafter(value, math.inf)


class TierValueTest(unittest.TestCase):
    def test_tiers_use_title_case(self) -> None:
        self.assertEqual([tier.value for tier in Tier], ["Safe", "Elevated", "Critical"])
        self.assertEqual(Tier("Critical"), Tier.CRITICAL)


class ProbabilityThresholdTest(unittest.TestCase):
    def assert_tier(self, log10_pc: float, expected: Tier) -> None:
        result = classify_risk(log10_pc, FAR_M)
        self.assertIs(result.tier, expected, log10_pc)
        self.assertTrue(result.is_complete)

    def test_critical_starts_at_minus_four(self) -> None:
        self.assert_tier(-4.0, Tier.CRITICAL)
        self.assert_tier(below(-4.0), Tier.ELEVATED)

    def test_elevated_starts_at_minus_six(self) -> None:
        self.assert_tier(-6.0, Tier.ELEVATED)
        self.assert_tier(below(-6.0), Tier.SAFE)

    def test_certain_collision_is_critical(self) -> None:
        self.assert_tier(0.0, Tier.CRITICAL)

    def test_minus_thirty_is_treated_as_negligible_probability(self) -> None:
        # Organisers' tier_rules: -30 is a placeholder meaning Pc ~ 0.
        self.assert_tier(-30.0, Tier.SAFE)
        result = classify_risk(-30.0, 500.0)
        self.assertIs(result.tier, Tier.CRITICAL)
        self.assertEqual(result.triggered_rules, (RiskRule.DISTANCE_CRITICAL,))
        self.assertTrue(result.is_complete)

    def test_raw_probability_is_rejected(self) -> None:
        result = classify_risk(1e-5, FAR_M)
        self.assertIsNone(result.tier)
        self.assertEqual(result.invalid_inputs, (LOG10_PC,))


class DistanceThresholdTest(unittest.TestCase):
    def assert_tier(self, distance_m: float, expected: Tier) -> None:
        result = classify_risk(NEGLIGIBLE_LOG10_PC, distance_m)
        self.assertIs(result.tier, expected, distance_m)
        self.assertTrue(result.is_complete)

    def test_critical_is_strictly_below_1000_m(self) -> None:
        self.assert_tier(below(1000.0), Tier.CRITICAL)
        self.assert_tier(1000.0, Tier.ELEVATED)

    def test_elevated_includes_5000_m(self) -> None:
        self.assert_tier(5000.0, Tier.ELEVATED)
        self.assert_tier(above(5000.0), Tier.SAFE)

    def test_zero_distance_is_critical(self) -> None:
        self.assert_tier(0.0, Tier.CRITICAL)

    def test_kilometre_values_are_not_rescaled(self) -> None:
        # 5.0 passed by mistake for 5 km is 5 m, so Critical.
        self.assert_tier(5.0, Tier.CRITICAL)


class CombinedRulesTest(unittest.TestCase):
    def test_safe_requires_both_inputs_safe(self) -> None:
        result = classify_risk(NEGLIGIBLE_LOG10_PC, FAR_M)
        self.assertIs(result.tier, Tier.SAFE)
        self.assertEqual(result.triggered_rules, ())

    def test_critical_is_checked_before_elevated(self) -> None:
        cases = {
            (-5.0, 500.0): (RiskRule.PROBABILITY_ELEVATED, RiskRule.DISTANCE_CRITICAL),
            (-3.0, 3000.0): (RiskRule.PROBABILITY_CRITICAL, RiskRule.DISTANCE_ELEVATED),
        }
        for (log10_pc, distance_m), rules in cases.items():
            result = classify_risk(log10_pc, distance_m)
            self.assertIs(result.tier, Tier.CRITICAL)
            self.assertEqual(result.triggered_rules, rules)

    def test_rules_name_the_cause_of_escalation(self) -> None:
        self.assertEqual(
            classify_risk(-3.0, FAR_M).triggered_rules,
            (RiskRule.PROBABILITY_CRITICAL,),
        )
        self.assertEqual(
            classify_risk(NEGLIGIBLE_LOG10_PC, 200.0).triggered_rules,
            (RiskRule.DISTANCE_CRITICAL,),
        )
        self.assertEqual(
            classify_risk(-2.0, 200.0).triggered_rules,
            (RiskRule.PROBABILITY_CRITICAL, RiskRule.DISTANCE_CRITICAL),
        )

    def test_integer_inputs_are_accepted(self) -> None:
        self.assertIs(classify_risk(-4, 10_000).tier, Tier.CRITICAL)

    def test_non_builtin_real_numbers_are_accepted(self) -> None:
        result = classify_risk(Fraction(-3), Fraction(500))
        self.assertIs(result.tier, Tier.CRITICAL)
        self.assertTrue(result.is_complete)


class InvalidInputTest(unittest.TestCase):
    INVALID = (None, math.nan, math.inf, -math.inf, "-3.0", True, 10**400)

    def test_known_critical_trigger_survives_missing_distance(self) -> None:
        for bad in self.INVALID:
            result = classify_risk(-3.0, bad)
            self.assertIs(result.tier, Tier.CRITICAL, bad)
            self.assertFalse(result.is_complete)
            self.assertEqual(result.invalid_inputs, (MISS_DISTANCE_M,))
            self.assertEqual(result.triggered_rules, (RiskRule.PROBABILITY_CRITICAL,))

    def test_known_critical_trigger_survives_missing_probability(self) -> None:
        for bad in self.INVALID:
            result = classify_risk(bad, 500.0)
            self.assertIs(result.tier, Tier.CRITICAL, bad)
            self.assertEqual(result.invalid_inputs, (LOG10_PC,))
            self.assertEqual(result.triggered_rules, (RiskRule.DISTANCE_CRITICAL,))

    def test_missing_input_never_yields_safe(self) -> None:
        for bad in self.INVALID:
            self.assertIsNone(classify_risk(NEGLIGIBLE_LOG10_PC, bad).tier, bad)
            self.assertIsNone(classify_risk(bad, FAR_M).tier, bad)

    def test_elevated_evidence_is_kept_without_claiming_a_tier(self) -> None:
        for result in (classify_risk(-5.0, None), classify_risk(None, 3000.0)):
            self.assertIsNone(result.tier)
            self.assertFalse(result.is_complete)
        self.assertEqual(
            classify_risk(-5.0, None).triggered_rules, (RiskRule.PROBABILITY_ELEVATED,)
        )
        self.assertEqual(
            classify_risk(None, 3000.0).triggered_rules, (RiskRule.DISTANCE_ELEVATED,)
        )

    def test_out_of_range_values_are_invalid(self) -> None:
        self.assertEqual(classify_risk(above(0.0), FAR_M).invalid_inputs, (LOG10_PC,))
        self.assertEqual(
            classify_risk(NEGLIGIBLE_LOG10_PC, below(0.0)).invalid_inputs,
            (MISS_DISTANCE_M,),
        )

    def test_both_inputs_invalid(self) -> None:
        result = classify_risk(None, None)
        self.assertIsNone(result.tier)
        self.assertEqual(result.triggered_rules, ())
        self.assertEqual(result.invalid_inputs, (LOG10_PC, MISS_DISTANCE_M))


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


@unittest.skipIf(TRAIN_DATA is None, "local train_data.csv not found; set SG_DATA_DIR")
class TrainingDataTest(unittest.TestCase):
    """Optional smoke check on local data. Correctness is established above.

    miss_distance is passed through as metres, per the organisers' data_notes.
    """

    def test_every_labelled_row_gets_a_tier(self) -> None:
        counts = {tier: 0 for tier in Tier}
        with TRAIN_DATA.open(newline="") as handle:
            for row in csv.DictReader(handle):
                log10_pc = float(row["risk"])
                distance_m = float(row["miss_distance"])
                result = classify_risk(log10_pc, distance_m)
                self.assertTrue(result.is_complete, row["event_id"])
                if log10_pc >= -4.0 or distance_m < 1000.0:
                    self.assertIs(result.tier, Tier.CRITICAL, row["event_id"])
                counts[result.tier] += 1
        for tier, count in counts.items():
            self.assertGreater(count, 0, tier)


if __name__ == "__main__":
    unittest.main()
