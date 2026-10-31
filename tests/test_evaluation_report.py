"""SG-03.2 end-to-end report on synthetic files (labelled fixtures, no dataset).

This exercises file loading, the ML adapter, validation, joins, metrics and the
payload. It does not prove compatibility with real ML outputs; the real-data
run is documented in evaluation/README.md.
"""

from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from evaluation.errors import EvaluationInputError
from evaluation.report import RunInputs, build_report, to_markdown, write_report

# Same hand-checked world as the join tests. Validation primary: train:1, :5, :10; final_is_early: train:2.
MESSAGES = [
    (1, 3.0, -9.0, 20000.0), (1, 0.5, -3.0, 20000.0),
    (2, 2.5, -9.0, 20000.0), (2, 6.0, -9.0, 20000.0),
    (3, 0.4, -9.0, 20000.0), (3, 1.7, -9.0, 20000.0),
    (4, 4.0, -9.0, 3000.0), (4, -0.5, -9.0, 3000.0),
    (5, 5.0, -3.0, 20000.0), (5, 1.0, -9.0, 20000.0),
    (10, 2.1, -9.0, 3000.0), (10, 0.2, -3.0, 20000.0),
]
LABELS = [(1, 0.5, "Critical", "yes"), (2, 2.5, "Safe", "yes"), (3, 0.4, "Safe", "no"),
          (4, -0.5, "Elevated", "yes"), (5, 1.0, "Safe", "yes"), (10, 0.2, "Critical", "yes")]
SPLIT = [("train:1", "validation", "Critical", False), ("train:10", "validation", "Critical", False),
         ("train:2", "validation", "Safe", True), ("train:4", "train", "Elevated", False),
         ("train:5", "validation", "Safe", False)]
# encounter, latest_row_id, final_tier, final_is_early, persistence, p_critical, predicted, upgraded
UPGRADE = [("train:1", "train:0", "Critical", False, "Safe", 0.9, "Critical", True),
           ("train:10", "train:10", "Critical", False, "Elevated", 0.1, "Elevated", False),
           ("train:2", "train:2", "Safe", True, "Safe", 0.1, "Safe", False),
           ("train:5", "train:8", "Safe", False, "Critical", 0.7, "Critical", False)]


def _write_csv(path: Path, header: list[str], rows: list) -> None:
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def _joblib_available() -> bool:
    try:
        import joblib  # noqa: F401
    except ImportError:
        return False
    return True


class ReportTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.train = root / "train_data.csv"
        _write_csv(self.train, ["event_id", "time_to_tca", "risk", "miss_distance"], MESSAGES)
        self.labels = root / "train_event_labels.csv"
        with open(self.labels, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerows([["synthetic fixture note line"], []])
            writer.writerow(["event_id", "final_time_to_tca_days", "final_tier", "usable_for_training"])
            writer.writerows(LABELS)
        self.split = root / "train_validation.csv"
        _write_csv(self.split, ["encounter_id", "partition", "final_tier", "final_is_early"], SPLIT)
        self.meta = root / "split_meta.json"
        self.meta.write_text(json.dumps({"files_sha256": {
            "train_data.csv": hashlib.sha256(self.train.read_bytes()).hexdigest()}}))
        header = ["encounter_id", "latest_row_id", "final_tier", "final_is_early", "persistence_tier",
                  "p_critical", "predicted_tier", "upgraded"]
        self.upgrade_csv, self.persistence_csv = root / "upgrade.csv", root / "persistence.csv"
        _write_csv(self.upgrade_csv, header, UPGRADE)
        _write_csv(self.persistence_csv, header,
                   [(e, r, t, early, p, "", p, False) for e, r, t, early, p, _, _, _ in UPGRADE])
        self.upgrade_json, self.persistence_json = root / "upgrade.json", root / "persistence.json"
        self.upgrade_json.write_text(json.dumps({"model_version": "upgrade_base-fixture", "config": {
            "run": "upgrade_base", "threshold_selection": {"threshold": 0.5, "method": "fixture",
                                                           "min_upgrade_precision": 0.25}}}))
        self.persistence_json.write_text(json.dumps({"model_version": "persistence-fixture",
                                                     "config": {"run": "persistence"}}))

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def runs(self, upgrade_csv: Path | None = None) -> tuple[RunInputs, RunInputs]:
        return (RunInputs("persistence", "Persistence", "baseline", self.persistence_csv, self.persistence_json, False),
                RunInputs("upgrade_base", "Upgrade", "shipped", upgrade_csv or self.upgrade_csv, self.upgrade_json, True))

    def build(self, **changes) -> dict:
        args = dict(train_csv=self.train, labels_csv=self.labels, split_csv=self.split, split_meta=self.meta,
                    runs=self.runs())
        args.update(changes)
        return build_report(**args)

    def test_payload_matches_hand_counts(self) -> None:
        payload = self.build()
        persistence, upgrade = payload["models"]
        self.assertEqual(payload["status"], "evaluated")
        self.assertEqual(persistence["cohorts"]["primary"]["confusion_matrix"]["rows_actual_cols_predicted"],
                         [[0, 1, 1], [0, 0, 0], [1, 0, 0]])
        self.assertEqual(upgrade["cohorts"]["primary"]["confusion_matrix"]["rows_actual_cols_predicted"],
                         [[1, 1, 0], [0, 0, 0], [1, 0, 0]])
        self.assertIsNone(upgrade["cohorts"]["primary"]["per_tier"]["Elevated"]["recall"])  # no actual Elevated
        self.assertEqual(upgrade["upgrades"], 1)
        self.assertEqual(upgrade["cohorts"]["all_usable"]["n"], 4)
        primary = payload["sg03"]["comparison"]["primary"]
        self.assertEqual((primary["extra_critical_caught"], primary["extra_false_alarms"]), (1, 0))
        self.assertEqual(payload["sg03"]["cohorts"]["unable_to_assess"]["n"], 1)
        self.assertEqual(payload["sg03"]["coverage"]["train_full_dataset"]["unable_to_assess"], 1)
        self.assertEqual(payload["sg03"]["coverage"]["validation_partition"]["unable_to_assess"], 0)
        self.assertEqual(payload["sg03"]["predictions_outside_cohort_filtered"]["upgrade_base"]["primary"], 1)
        self.assertEqual(payload["test"]["state"], "unavailable")
        self.assertEqual(payload["ranking_coverage"]["all_critical_n"], 2)
        self.assertEqual(payload["ranking_coverage"]["urgent_subset_n"], 0)
        self.assertEqual(payload["thresholds"]["upgrade_p_critical"], 0.5)
        self.assertTrue(payload["sg03"]["notes"])  # the label file checksum is not in split_meta

    def test_report_writes_strict_json_and_markdown(self) -> None:
        payload = self.build()
        json_path, md_path = write_report(payload, Path(self.tmp.name) / "out")
        self.assertEqual(json.loads(json_path.read_text())["model_version"], "upgrade_base-fixture")
        self.assertIn("trade-off", md_path.read_text())
        self.assertIn("unable to assess", to_markdown(payload))

    def test_ml_label_disagreement_fails(self) -> None:
        bad = Path(self.tmp.name) / "bad.csv"
        rows = list(UPGRADE)
        rows[0] = ("train:1", "train:0", "Safe", False, "Safe", 0.9, "Critical", True)
        _write_csv(bad, ["encounter_id", "latest_row_id", "final_tier", "final_is_early", "persistence_tier",
                         "p_critical", "predicted_tier", "upgraded"], rows)
        with self.assertRaises(EvaluationInputError) as caught:
            self.build(runs=self.runs(bad))
        self.assertEqual(caught.exception.ids("ml_label_mismatch"), ("train:1",))

    def test_missing_prediction_fails_the_report(self) -> None:
        short = Path(self.tmp.name) / "short.csv"
        _write_csv(short, ["encounter_id", "latest_row_id", "final_tier", "final_is_early", "persistence_tier",
                           "p_critical", "predicted_tier", "upgraded"], UPGRADE[:3])
        with self.assertRaises(EvaluationInputError) as caught:
            self.build(runs=self.runs(short))
        self.assertEqual(caught.exception.ids("missing_prediction"), ("train:5",))

    def test_artifact_identity_is_recorded(self) -> None:
        payload = self.build()
        artifacts = payload["sg03"]["artifacts"]
        self.assertEqual(artifacts["upgrade_base"]["model_version"], "upgrade_base-fixture")
        self.assertEqual(len(artifacts["upgrade_base"]["predictions_csv_sha256"]), 64)
        self.assertIsNone(payload["model_sha256"])  # no bundle in the fixture: not identified, never guessed
        self.assertIn("not identified", artifacts["upgrade_base"]["bundle_version_check"])
        bundle = Path(self.tmp.name) / "model.joblib"
        bundle.write_bytes(b"synthetic bundle bytes")
        with_bundle = self.build(model_bundle=bundle) if not _joblib_available() else None
        if with_bundle is not None:
            self.assertEqual(with_bundle["model_sha256"], hashlib.sha256(b"synthetic bundle bytes").hexdigest())
            self.assertEqual(with_bundle["sg03"]["artifacts"]["upgrade_base"]["bundle_version_check"],
                             "unverified: joblib not installed")

    def test_prediction_run_on_other_training_data_fails(self) -> None:
        report = json.loads(self.upgrade_json.read_text())
        report["data"] = {"train_sha256": "0" * 64}
        self.upgrade_json.write_text(json.dumps(report))
        with self.assertRaises(ValueError):
            self.build()

    def test_different_training_file_fails(self) -> None:
        self.meta.write_text(json.dumps({"files_sha256": {"train_data.csv": "0" * 64}}))
        with self.assertRaises(ValueError):
            self.build()


if __name__ == "__main__":
    unittest.main()
