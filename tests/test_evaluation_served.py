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
        self.assertEqual(response["status"], "not_evaluated")
        self.assertEqual(metrics_response(str(self.path))["status"], "not_evaluated")  # a plain str path works
        self.assertEqual(response["models"], [])
        self.assertIsNone(response["ranking_coverage"])
        self.assertEqual(response["test"]["state"], "unavailable")

    def test_committed_report_is_served_unchanged(self) -> None:
        if not METRICS_JSON.exists():
            self.skipTest("evaluation/reports/metrics.json not present")
        response = metrics_response()
        self.assertEqual(response, json.loads(METRICS_JSON.read_text(encoding="utf-8")))
        self.assertEqual(response["status"], "evaluated")
        self.assertEqual({m["key"] for m in response["models"]}, {"persistence", "upgrade_base"})
        self.assertIn("primary", response["sg03"]["comparison"])
        self.assertEqual(response["ranking_coverage"]["urgent_subset_n"], 0)

    def test_bad_files_raise(self) -> None:
        for content in ("{not json", json.dumps({"status": "evaluated"}),
                        json.dumps({key: {} for key in ("provenance", "dataset", "model_version", "policy_version",
                                                        "models", "test")} | {"status": "evaluated",
                                                                              "sg03": {"schema_version": "old"}})):
            self.path.write_text(content, encoding="utf-8")
            with self.assertRaises(MetricsFileError):
                metrics_response(self.path)


if __name__ == "__main__":
    unittest.main()
