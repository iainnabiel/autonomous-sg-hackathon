"""SG-03.2 metric checks (M1-M3, ranking scores, P1-P4). Hand-calculated fixtures only."""

from __future__ import annotations

import unittest

from contracts.ids import EncounterId, ObservationId
from contracts.forecast import ForecastStatus, Forecast
from contracts.tiers import Tier
from evaluation.compare import PairedRow, compare, headline, pair, tradeoff_curve
from evaluation.errors import EvaluationInputError
from evaluation.join import JoinedRow
from evaluation.metrics import average_precision, detect, roc_auc, wilson_interval

C, E, S = Tier.CRITICAL, Tier.ELEVATED, Tier.SAFE


def tiers_from_matrix(matrix: list[list[int]]) -> tuple[list[Tier], list[Tier]]:
    order = (C, E, S)
    actual, predicted = [], []
    for i, row in enumerate(matrix):
        for j, count in enumerate(row):
            actual += [order[i]] * count
            predicted += [order[j]] * count
    return actual, predicted


class DetectionTest(unittest.TestCase):
    def test_M1_hand_calculated_matrix(self) -> None:
        result = detect(*tiers_from_matrix([[3, 1, 1], [1, 2, 0], [0, 1, 1]]))
        self.assertEqual(result.matrix, [[3, 1, 1], [1, 2, 0], [0, 1, 1]])
        self.assertEqual(result.precision(C).value, 3 / 4)
        self.assertEqual(result.recall(C).value, 3 / 5)
        self.assertEqual(result.precision(E).value, 2 / 4)
        self.assertEqual(result.recall(E).value, 2 / 3)
        self.assertEqual(result.precision(S).value, 1 / 2)
        self.assertEqual(result.recall(S).value, 1 / 2)
        self.assertEqual(result.critical_predicted_safe, 1)
        self.assertEqual(result.false_critical_alarms, 1)
        self.assertEqual(result.critical_missed, 2)
        self.assertEqual(result.non_critical, 5)
        self.assertEqual(result.critical_false_positive_rate().value, 1 / 5)
        self.assertEqual(result.accuracy().value, 6 / 10)
        self.assertEqual(result.row_normalised()[0], [0.6, 0.2, 0.2])

    def test_M2_zero_denominators_are_null_with_reasons(self) -> None:
        result = detect([E, S], [E, E])
        self.assertIsNone(result.recall(C).value)
        self.assertEqual(result.recall(C).as_dict()["reason"], "zero_denominator:no_actual_of_tier")
        self.assertEqual(result.recall(C).as_dict()["state"], "unavailable")
        self.assertIsNone(result.precision(S).value)
        self.assertEqual(result.row_normalised()[0], [None, None, None])
        self.assertEqual(result.recall(E).as_dict()["state"], "reported")

    def test_M3_empty_cohort(self) -> None:
        result = detect([], [])
        self.assertEqual(result.n, 0)
        self.assertIsNone(result.accuracy().value)
        self.assertIsNone(result.critical_false_positive_rate().value)
        with self.assertRaises(ValueError):
            detect([C], [])

    def test_wilson_interval(self) -> None:
        low, high = wilson_interval(9, 30)
        self.assertAlmostEqual(low, 0.16665, places=4)
        self.assertAlmostEqual(high, 0.47876, places=4)
        self.assertEqual(wilson_interval(0, 4)[0], 0.0)
        self.assertIsNone(wilson_interval(0, 0))

    def test_ranking_scores(self) -> None:
        positive, score = [True, False, True, False], [0.9, 0.8, 0.7, 0.1]
        self.assertEqual(roc_auc(positive, score), 3 / 4)
        self.assertAlmostEqual(average_precision(positive, score), 0.5 + 0.5 * 2 / 3)
        self.assertEqual(roc_auc([True, False], [0.5, 0.5]), 0.5)
        self.assertIsNone(roc_auc([True, True], [0.1, 0.2]))
        self.assertIsNone(average_precision([False], [0.1]))


def paired(actual, baseline, model, p=None) -> list[PairedRow]:
    p = p or [None] * len(actual)
    return [PairedRow(a, b, m, b, s, m is C and b is not C) for a, b, m, s in zip(actual, baseline, model, p)]


class CompareTest(unittest.TestCase):
    def setUp(self) -> None:
        # P1: 4 Critical (persistence catches 2), 3 upgrades of which 1 is Critical.
        self.rows = paired(
            actual=[C, C, C, C, E, S, S, E],
            baseline=[C, C, E, S, E, S, E, S],
            model=[C, C, C, S, C, S, C, S],
            p=[0.9, 0.8, 0.5, 0.01, 0.6, 0.02, 0.3, 0.03],
        )

    def test_P1_paired_increment(self) -> None:
        result = compare(self.rows, min_upgrade_precision=0.25)
        self.assertEqual(result["extra_critical_caught"], 1)
        self.assertEqual(result["lost_critical"], 0)
        self.assertEqual(result["extra_false_alarms"], 2)
        self.assertEqual(result["upgrades"], 3)
        self.assertAlmostEqual(result["upgrade_precision"], 1 / 3)
        self.assertEqual(result["baseline"]["critical_recall"], 0.5)
        self.assertEqual(result["model"]["critical_recall"], 0.75)
        self.assertEqual(result["baseline"]["critical_false_positive_rate"], 0.0)
        self.assertEqual(result["model"]["critical_false_positive_rate"], 2 / 4)
        self.assertTrue(result["d7_constraint"]["validation_at_or_above"])
        self.assertIn("not an equal-false-alarm comparison", headline(result, "Fixture"))

    def test_P2_lost_critical_is_rejected(self) -> None:
        rows = paired([C], [C], [E])
        with self.assertRaises(EvaluationInputError):
            compare(rows, min_upgrade_precision=0.25)

    def test_P3_bootstrap_is_deterministic_and_contains_the_estimate(self) -> None:
        first = compare(self.rows, min_upgrade_precision=0.25)["uncertainty"]
        second = compare(self.rows, min_upgrade_precision=0.25)["uncertainty"]
        self.assertEqual(first, second)
        low, high = first["recall_difference_95ci"]
        self.assertLessEqual(low, 0.25)
        self.assertGreaterEqual(high, 0.25)

    def test_P4_exact_mcnemar(self) -> None:
        self.assertEqual(compare(self.rows, min_upgrade_precision=0.25)["mcnemar_exact_one_sided_p"], 0.5)
        none = paired([C, S], [C, S], [C, S])
        self.assertIsNone(compare(none, min_upgrade_precision=0.25)["mcnemar_exact_one_sided_p"])

    def test_tradeoff_curve_is_monotone_and_starts_at_the_grid_floor(self) -> None:
        curve = tradeoff_curve(self.rows)
        self.assertEqual(curve[0]["threshold"], 0.05)
        self.assertEqual(curve[-1]["threshold"], 0.99)
        self.assertEqual((curve[0]["extra_critical_caught"], curve[0]["extra_false_alarms"]), (1, 2))
        for earlier, later in zip(curve, curve[1:]):
            self.assertGreaterEqual(earlier["extra_false_alarms"], later["extra_false_alarms"])

    def test_pair_requires_identical_encounters(self) -> None:
        def joined(event: int) -> JoinedRow:
            forecast = Forecast(ForecastStatus.AVAILABLE, S, None, None, None, ObservationId("train", event),
                                3.0, "v", ())
            return JoinedRow(EncounterId("train", event), None, type("P", (), {"forecast": forecast,  # noqa: E731
                                                                              "persistence_tier": S,
                                                                              "upgraded": False})())
        with self.assertRaises(EvaluationInputError):
            pair([joined(1)], [joined(2)])


if __name__ == "__main__":
    unittest.main()
