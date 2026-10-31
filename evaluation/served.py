"""SG-03.4 the ``/metrics`` response, for whichever server hosts the route.

``metrics_response()`` returns the committed ``evaluation/reports/metrics.json``
(a ``contracts.schemas.MetricsReport`` plus the ``evidence`` bundle) unchanged,
or an explicit ``not_evaluated`` report with no evidence when it is absent. It never
builds fixtures and never recomputes metrics. An unreadable or wrong-version file
raises, so a server returns an error rather than a misleading result.
"""

from __future__ import annotations

import json
from pathlib import Path

from contracts.policy import POLICY_VERSION
from evaluation.report import REPORTS_DIR, SCHEMA_VERSION

METRICS_JSON = REPORTS_DIR / "metrics.json"
REQUIRED_KEYS = ("cohort_label", "sample_count", "model_version", "policy_version", "metrics", "labels", "evidence")
EVIDENCE_KEYS = ("status", "provenance", "dataset", "models", "test", "sg03")


class MetricsFileError(ValueError):
    """metrics.json exists but cannot be served as-is."""


def not_evaluated(reason: str) -> dict:
    """A ``MetricsReport`` with no evidence: the dashboard shows 'not evaluated'."""

    return {
        "cohort_label": "not evaluated",
        "sample_count": None,
        "model_version": None,
        "policy_version": POLICY_VERSION,
        "metrics": [{"name": "evaluation", "value": None, "state": "not_evaluated", "reason": reason}],
        "labels": [],
        "evidence": None,
    }


def metrics_response(path: Path | str = METRICS_JSON) -> dict:
    path = Path(path)
    if not path.exists():
        return not_evaluated(f"{path.name} has not been generated; run python -m evaluation report")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MetricsFileError(f"{path} is not readable JSON: {exc}") from exc
    missing = [key for key in REQUIRED_KEYS if key not in payload]
    evidence = payload.get("evidence")
    if not isinstance(evidence, dict):
        raise MetricsFileError(f"{path} has no evidence bundle")
    missing += [f"evidence.{key}" for key in EVIDENCE_KEYS if key not in evidence]
    if missing:
        raise MetricsFileError(f"{path} is missing {missing}")
    version = evidence["sg03"].get("schema_version")
    if version != SCHEMA_VERSION:
        raise MetricsFileError(f"{path} has schema {version!r}, expected {SCHEMA_VERSION!r}")
    if evidence["status"] != "evaluated":
        raise MetricsFileError(f"{path} has status {evidence['status']!r}")
    return payload
