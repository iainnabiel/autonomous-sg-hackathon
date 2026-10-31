"""SG-03.4 the ``/metrics`` response, for whichever server hosts the route.

``metrics_response()`` returns the committed ``evaluation/reports/metrics.json``
unchanged, or an explicit ``not_evaluated`` response when it is absent. It never
builds fixtures and never recomputes metrics. An unreadable or wrong-version file
raises, so a server returns an error rather than a misleading result.
"""

from __future__ import annotations

import json
from pathlib import Path

from evaluation.report import REPORTS_DIR, SCHEMA_VERSION

METRICS_JSON = REPORTS_DIR / "metrics.json"
REQUIRED_KEYS = ("status", "provenance", "dataset", "model_version", "policy_version", "models", "test", "sg03")


class MetricsFileError(ValueError):
    """metrics.json exists but cannot be served as-is."""


def not_evaluated(reason: str) -> dict:
    return {
        "status": "not_evaluated",
        "reason": reason,
        "sg03": {"schema_version": SCHEMA_VERSION},
        "models": [],
        "detection": [],
        "ranking_coverage": None,
        "test": {"state": "unavailable", "reason": "test_data.csv has no final outcomes"},
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
    if missing:
        raise MetricsFileError(f"{path} is missing {missing}")
    version = payload["sg03"].get("schema_version")
    if version != SCHEMA_VERSION:
        raise MetricsFileError(f"{path} has schema {version!r}, expected {SCHEMA_VERSION!r}")
    if payload["status"] != "evaluated":
        raise MetricsFileError(f"{path} has status {payload['status']!r}")
    return payload
