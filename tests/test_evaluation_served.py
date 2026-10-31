"""SG-03.4 /metrics response checks."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from evaluation.served import METRICS_JSON, MetricsFileError, metrics_response


class ServedMetricsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "metrics.json"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_missing_file_is_not_evaluated_never_fixtures(self) -> None:
        response = metrics_response(self.path)
        self.assertEqual(response["cohort_label"], "not evaluated")
        self.assertIsNone(metrics_response(str(self.path))["evidence"])  # a plain str path works
        self.assertIsNone(response["evidence"])
        self.assertIsNone(response["sample_count"])
        self.assertEqual(response["metrics"][0]["state"], "not_evaluated")

    def test_committed_report_is_served_unchanged(self) -> None:
        if not METRICS_JSON.exists():
            self.skipTest("evaluation/reports/metrics.json not present")
        response = metrics_response()
        self.assertEqual(response, json.loads(METRICS_JSON.read_text(encoding="utf-8")))
        evidence = response["evidence"]
        self.assertEqual(evidence["status"], "evaluated")
        self.assertEqual({m["key"] for m in evidence["models"]}, {"persistence", "upgrade_base"})
        self.assertIn("primary", evidence["sg03"]["comparison"])
        self.assertEqual(evidence["ranking_coverage"]["urgent_subset_n"], 0)
        self.assertEqual(response["sample_count"], evidence["sg03"]["comparison"]["primary"]["n"])
        states = {m["name"]: m["state"] for m in response["metrics"]}
        self.assertEqual(states["test_final_tier_accuracy"], "unavailable")
        self.assertEqual(states["critical_recall:upgrade_base"], "reported")

    def test_bad_files_raise(self) -> None:
        top = {"cohort_label": "x", "sample_count": 1, "model_version": "v", "policy_version": "p",
               "metrics": [], "labels": []}
        evidence = {key: {} for key in ("provenance", "dataset", "models", "test")} | {"status": "evaluated"}
        for content in ("{not json", json.dumps({"status": "evaluated"}), json.dumps(top | {"evidence": None}),
                        json.dumps(top | {"evidence": evidence | {"sg03": {"schema_version": "old"}}}),
                        json.dumps(top | {"evidence": evidence | {"status": "not_evaluated",
                                                                  "sg03": {"schema_version": "sg-03.v1"}}})):
            self.path.write_text(content, encoding="utf-8")
            with self.assertRaises(MetricsFileError):
                metrics_response(self.path)


if __name__ == "__main__":
    unittest.main()
