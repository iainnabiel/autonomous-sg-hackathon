"""SG-03.1 label checks (L1-L15). Synthetic records only; no dataset files."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path
from unittest import mock

import contracts.observations
from contracts.ids import EncounterId, ObservationId
from contracts.tiers import Tier, current_rule_tier
from evaluation.errors import EvaluationInputError
from evaluation.labels import OrganiserLabel, RawMessage, SplitRow, derive_labels

ROOT = Path(__file__).resolve().parents[1]
E1_MODULES = ("errors", "labels", "cohorts", "predictions", "join", "metrics", "compare", "adapters",
              "sources", "report", "ranking", "served", "verify", "__main__")

SAFE = dict(risk=-9.0, miss=20000.0)
ELEVATED = dict(risk=-9.0, miss=3000.0)
CRITICAL = dict(risk=-3.0, miss=20000.0)


def msg(row: int, event: int, tca: float, risk: float | None = -9.0, miss: float | None = 20000.0,
        source: str = "train") -> RawMessage:
    return RawMessage(source, row, event, tca, risk, miss)


def org(event: int, tier: str, usable: bool, final_tca: float) -> OrganiserLabel:
    return OrganiserLabel(event, tier, "yes" if usable else "no", round(final_tca, 4))


def spl(event: int, tier: str, final_is_early: bool, partition: str = "validation") -> SplitRow:
    return SplitRow(f"train:{event}", partition, tier, final_is_early)


def enc(event: int) -> EncounterId:
    return EncounterId("train", event)


def obs(row: int) -> ObservationId:
    return ObservationId("train", row)


class SelectionTest(unittest.TestCase):
    def test_L1_exactly_two_days_is_eligible(self) -> None:
        labels = derive_labels(
            [msg(0, 1, 2.0), msg(1, 1, 3.0)], [org(1, "Safe", True, 2.0)], [spl(1, "Safe", True)]
        )
        record = labels[enc(1)]
        self.assertEqual(record.latest_eligible_observation_id, obs(0))
        self.assertEqual(record.latest_eligible_time_to_tca_days, 2.0)
        self.assertTrue(record.final_is_early)

    def test_L2_raw_value_below_cutoff_is_ineligible_even_if_it_rounds_up(self) -> None:
        raw = 1.999976
        self.assertGreaterEqual(round(raw, 4), 2.0)  # rounding would wrongly make it eligible
        labels = derive_labels(
            [msg(2, 2, raw), msg(3, 2, 3.0)], [org(2, "Safe", True, raw)], [spl(2, "Safe", False)]
        )
        record = labels[enc(2)]
        self.assertEqual(record.final_observation_id, obs(2))
        self.assertEqual(record.latest_eligible_observation_id, obs(3))
        self.assertFalse(record.final_is_early)

    def test_L3_negative_final_is_the_label_message(self) -> None:
        labels = derive_labels(
            [msg(4, 3, -0.5), msg(5, 3, 1.0), msg(6, 3, 4.0)],
            [org(3, "Safe", True, -0.5)],
            [spl(3, "Safe", False)],
        )
        record = labels[enc(3)]
        self.assertEqual(record.final_observation_id, obs(4))
        self.assertEqual(record.final_time_to_tca_days, -0.5)
        self.assertEqual(record.latest_eligible_observation_id, obs(6))
        self.assertFalse(record.final_is_early)

    def test_L4_tiny_negative_final_stays_negative(self) -> None:
        tiny = -2.2962962962962965e-05  # displays as -0.0 at 4 dp
        labels = derive_labels(
            [msg(7, 4, tiny, **CRITICAL), msg(8, 4, 2.5)],
            [OrganiserLabel(4, "Critical", "yes", -0.0)],
            [spl(4, "Critical", False)],
        )
        record = labels[enc(4)]
        self.assertEqual(record.final_observation_id, obs(7))
        self.assertLess(record.final_time_to_tca_days, 0.0)

    def test_L5_final_is_early_from_raw_values(self) -> None:
        labels = derive_labels(
            [msg(9, 5, 2.5), msg(10, 5, 6.0)], [org(5, "Safe", True, 2.5)], [spl(5, "Safe", True)]
        )
        self.assertTrue(labels[enc(5)].final_is_early)
        self.assertEqual(labels[enc(5)].partition, "validation")

    def test_L6_no_eligible_message_is_not_usable_and_has_no_partition(self) -> None:
        labels = derive_labels([msg(11, 6, 0.4), msg(12, 6, 1.7)], [org(6, "Safe", False, 0.4)], [])
        record = labels[enc(6)]
        self.assertFalse(record.usable)
        self.assertIsNone(record.latest_eligible_observation_id)
        self.assertIsNone(record.partition)

    def test_L7_tie_at_final_uses_smaller_row_index(self) -> None:
        labels = derive_labels(
            [msg(17, 7, 0.3), msg(14, 7, 0.3), msg(15, 7, 3.0)],
            [org(7, "Safe", True, 0.3)],
            [spl(7, "Safe", False)],
        )
        self.assertEqual(labels[enc(7)].final_observation_id, obs(14))

    def test_L8_tie_at_latest_eligible_uses_smaller_row_index(self) -> None:
        labels = derive_labels(
            [msg(21, 8, 2.2), msg(20, 8, 2.2), msg(22, 8, 0.1)],
            [org(8, "Safe", True, 0.1)],
            [spl(8, "Safe", False)],
        )
        self.assertEqual(labels[enc(8)].latest_eligible_observation_id, obs(20))

    def test_L9_only_negative_messages(self) -> None:
        labels = derive_labels([msg(23, 9, -1.0), msg(24, 9, -0.2)], [org(9, "Safe", False, -1.0)], [])
        record = labels[enc(9)]
        self.assertEqual(record.final_observation_id, obs(23))
        self.assertFalse(record.usable)

    def test_cutoff_comes_from_shared_contract(self) -> None:
        with mock.patch.object(contracts.observations, "EARLY_CUTOFF_DAYS", 3.0):
            labels = derive_labels(
                [msg(25, 10, 2.5), msg(26, 10, 3.5)], [org(10, "Safe", True, 2.5)], [spl(10, "Safe", False)]
            )
        self.assertEqual(labels[enc(10)].latest_eligible_observation_id, obs(26))
        self.assertFalse(labels[enc(10)].final_is_early)

    def test_latest_eligible_rule_tier_is_recorded(self) -> None:
        labels = derive_labels(
            [msg(27, 11, 3.0, **ELEVATED), msg(28, 11, 0.5, **CRITICAL)],
            [org(11, "Critical", True, 0.5)],
            [spl(11, "Critical", False)],
        )
        self.assertIs(labels[enc(11)].latest_eligible_rule_tier, Tier.ELEVATED)
        self.assertIs(labels[enc(11)].final_tier, Tier.CRITICAL)


class CrossCheckTest(unittest.TestCase):
    def assertFails(self, code: str, messages, organiser, split, ids: tuple[str, ...]) -> EvaluationInputError:
        with self.assertRaises(EvaluationInputError) as caught:
            derive_labels(messages, organiser, split)
        self.assertIn(code, caught.exception.codes)
        self.assertEqual(caught.exception.ids(code), ids)
        return caught.exception

    def test_L10_organiser_label_disagreement_fails_and_is_not_replaced(self) -> None:
        error = self.assertFails(
            "label_mismatch",
            [msg(0, 1, 0.5, **CRITICAL), msg(1, 1, 3.0)],
            [org(1, "Safe", True, 0.5)],
            [spl(1, "Safe", False)],
            ("train:1",),
        )
        self.assertNotIn("split_label_mismatch", error.codes)  # split agrees with the organiser

    def test_L11_usable_disagreement(self) -> None:
        self.assertFails(
            "usable_mismatch", [msg(0, 1, 0.5), msg(1, 1, 3.0)], [org(1, "Safe", False, 0.5)], [],
            ("train:1",),
        )

    def test_L12_split_final_is_early_disagreement(self) -> None:
        self.assertFails(
            "final_is_early_mismatch",
            [msg(0, 1, 0.5), msg(1, 1, 3.0)],
            [org(1, "Safe", True, 0.5)],
            [spl(1, "Safe", True)],
            ("train:1",),
        )

    def test_L13_workbook_final_time_off_by_more_than_rounding(self) -> None:
        self.assertFails(
            "final_time_mismatch",
            [msg(0, 1, 0.5), msg(1, 1, 3.0)],
            [OrganiserLabel(1, "Safe", "yes", 0.5002)],
            [spl(1, "Safe", False)],
            ("train:1",),
        )

    def test_L14_non_finite_message_input(self) -> None:
        self.assertFails(
            "invalid_message",
            [msg(0, 1, 0.5, risk=float("nan")), msg(1, 1, 3.0)],
            [org(1, "Safe", True, 0.5)],
            [spl(1, "Safe", False)],
            ("train:0",),
        )

    def test_L15_final_message_without_classification_inputs(self) -> None:
        self.assertFails(
            "invalid_classification_input",
            [msg(0, 1, 0.5, risk=None, miss=None), msg(1, 1, 3.0)],
            [org(1, "Safe", True, 0.5)],
            [spl(1, "Safe", False)],
            ("train:0",),
        )

    def test_one_missing_input_is_rejected_even_when_the_rule_would_say_critical(self) -> None:
        self.assertIs(current_rule_tier(None, 500.0), Tier.CRITICAL)  # contract tolerates it
        self.assertFails(
            "invalid_classification_input",
            [msg(0, 1, 0.5, risk=None, miss=500.0), msg(1, 1, 3.0)],
            [org(1, "Critical", True, 0.5)],
            [spl(1, "Critical", False)],
            ("train:0",),
        )

    def test_out_of_range_inputs_are_rejected_on_final_and_latest_eligible_rows(self) -> None:
        error = self.assertFails(
            "invalid_classification_input",
            [msg(0, 1, 0.5, risk=0.5), msg(1, 1, 3.0, miss=-1.0), msg(2, 2, 0.5), msg(3, 2, 3.0, risk=-30.0)],
            [org(1, "Critical", True, 0.5), org(2, "Safe", True, 0.5)],
            [spl(1, "Critical", False), spl(2, "Safe", False)],
            ("train:0", "train:1"),
        )
        self.assertEqual(error.codes, ("invalid_classification_input",))  # -30 is the valid reporting floor

    def test_inputs_on_rows_not_used_for_classification_may_be_missing(self) -> None:
        labels = derive_labels(
            [msg(0, 1, 0.5), msg(1, 1, 3.0), msg(2, 1, 6.0, risk=None)],
            [org(1, "Safe", True, 0.5)],
            [spl(1, "Safe", False)],
        )
        self.assertIs(labels[enc(1)].latest_eligible_rule_tier, Tier.SAFE)

    def test_split_and_label_coverage_failures(self) -> None:
        error = self.assertFails(
            "split_missing",
            [msg(0, 1, 0.5), msg(1, 1, 3.0), msg(2, 2, 0.4)],
            [org(1, "Safe", True, 0.5), org(2, "Safe", False, 0.4)],
            [spl(2, "Safe", False), spl(3, "Safe", False)],
            ("train:1",),
        )
        self.assertEqual(error.ids("split_unexpected"), ("train:2", "train:3"))

    def test_missing_labels_and_messages(self) -> None:
        error = self.assertFails(
            "label_missing", [msg(0, 1, 0.5)], [org(2, "Safe", False, 0.5)], [], ("train:1",)
        )
        self.assertEqual(error.ids("messages_missing"), ("train:2",))

    def test_structural_errors_are_all_reported(self) -> None:
        with self.assertRaises(EvaluationInputError) as caught:
            derive_labels(
                [msg(0, 1, 0.5), msg(0, 1, 0.6), msg(1, 1, 3.0, source="test")],
                [org(1, "Safe", True, 0.5), org(1, "Safe", True, 0.5), OrganiserLabel(2, "critical", "yes", 1.0)],
                [spl(4, "Safe", False, partition="holdout"), SplitRow("57", "train", "Safe", False)],
            )
        error = caught.exception
        self.assertEqual(error.ids("duplicate_observation"), ("train:0",))
        self.assertEqual(error.ids("wrong_source"), ("test:1",))
        self.assertEqual(error.ids("duplicate_label"), ("train:1",))
        self.assertEqual(error.ids("invalid_label"), ("train:2",))
        self.assertEqual(error.ids("invalid_split"), ("train:4",))
        self.assertEqual(error.ids("malformed_id"), ("57",))


def _numeric_literal(value: object) -> bool:
    return type(value) is float or (type(value) is int and abs(value) >= 4)


class ModuleHygieneTest(unittest.TestCase):
    """E1 imports only stdlib and contracts, and copies no thresholds or cutoff."""

    def test_imports_are_stdlib_contracts_or_evaluation(self) -> None:
        forbidden = {"ml", "backend", "pandas", "numpy", "sklearn"}
        for name in E1_MODULES:
            tree = ast.parse((ROOT / "evaluation" / f"{name}.py").read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    roots = {alias.name.split(".")[0] for alias in node.names}
                elif isinstance(node, ast.ImportFrom):
                    roots = {(node.module or "").split(".")[0]}
                else:
                    continue
                self.assertFalse(roots & forbidden, f"{name}.py imports {roots & forbidden}")

    def test_no_copied_cutoff_or_tier_thresholds(self) -> None:
        copied = {2.0, -4.0, -6.0, 1000.0, 5000.0}  # cutoff and tier thresholds live in contracts
        for name in E1_MODULES:
            tree = ast.parse((ROOT / "evaluation" / f"{name}.py").read_text(encoding="utf-8"))
            numbers = set()
            for node in ast.walk(tree):
                # Small integers are arithmetic (for example halving a rank), not a copied cutoff.
                if isinstance(node, ast.Constant) and _numeric_literal(node.value):
                    numbers.add(float(node.value))
                if (isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub)
                        and isinstance(node.operand, ast.Constant) and _numeric_literal(node.operand.value)):
                    numbers.add(-float(node.operand.value))
            self.assertFalse(numbers & copied, f"{name}.py has literal {numbers & copied}")


if __name__ == "__main__":
    unittest.main()
