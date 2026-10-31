"""SG-03.5 reproducibility and serving checks, plus report artifact identity."""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from evaluation.verify import compare_reports, compare_served


def payload(version: str = "upgrade_base-1", sha: str | None = "aa", recall: float = 0.873) -> dict:
    return {
        "status": "evaluated",
        "provenance": {"commit": "x", "note": "generated now"},
        "model_version": version,
        "model_sha256": sha,
        "models": [{"key": "upgrade_base", "model_version": version, "cohorts": {"primary": {"recall": recall}}}],
        "sg03": {"artifacts": {"upgrade_base": {"model_version": version}}, "notes": [],
                 "inputs_sha256": {"train_data.csv": "t", "train_event_labels.csv": "local"}},
    }


class CompareReportsTest(unittest.TestCase):
    def test_retrained_run_reproduces_metrics_but_is_a_different_artifact(self) -> None:
        result = compare_reports(payload(), payload(version="upgrade_base-2", sha="bb"))
        self.assertTrue(result["metrics_identical"])
        self.assertFalse(result["same_model_artifact"])
        self.assertEqual(result["actual_run"]["model_version"], "upgrade_base-2")

    def test_same_artifact(self) -> None:
        result = compare_reports(payload(), payload())
        self.assertTrue(result["metrics_identical"] and result["same_model_artifact"])
        self.assertFalse(compare_reports(payload(sha=None), payload(sha=None))["same_model_artifact"])

    def test_metric_change_is_reported(self) -> None:
        result = compare_reports(payload(), payload(recall=0.9))
        self.assertFalse(result["metrics_identical"])
        self.assertIn("/models[0]/cohorts/primary/recall: 0.873 != 0.9", result["differences"])

    def test_training_data_checksum_is_not_ignored(self) -> None:
        changed = payload()
        changed["sg03"]["inputs_sha256"]["train_data.csv"] = "other"
        self.assertFalse(compare_reports(payload(), changed)["metrics_identical"])


class CompareServedTest(unittest.TestCase):
    def test_http_body_must_equal_the_file(self) -> None:
        body = payload()

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                data = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "metrics.json"
                path.write_text(json.dumps(body))
                url = f"http://127.0.0.1:{server.server_address[1]}/metrics"
                self.assertTrue(compare_served(url, path)["identical"])
                path.write_text(json.dumps(payload(recall=0.5)))
                self.assertFalse(compare_served(url, path)["identical"])
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
