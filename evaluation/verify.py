"""SG-03.5 reproducibility and serving checks.

``compare_reports(expected, actual)`` separates two questions:

- **Metrics:** are all evaluated values identical once run identity and
  generation details are set aside?
- **Run identity:** do the two reports score the same ML run and artifact?
  A retrained model can reproduce every number and still be a different
  artifact, so this is reported separately and never treated as a match.

``compare_served(url, path)`` checks that an HTTP ``/metrics`` response equals a
file exactly.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

# Run identity and generation details: compared separately from metric values.
IDENTITY_PATHS = (
    ("model_version",),
    ("evidence", "provenance"),
    ("evidence", "model_version"),
    ("evidence", "model_sha256"),
    ("evidence", "sg03", "artifacts"),
    ("evidence", "sg03", "notes"),
    ("evidence", "sg03", "inputs_sha256", "train_event_labels.csv"),  # a local export may differ in bytes
)


def _strip(payload: dict) -> dict:
    data = json.loads(json.dumps(payload))
    for path in IDENTITY_PATHS:
        node = data
        for key in path[:-1]:
            node = node.get(key, {})
        node.pop(path[-1], None)
    for model in (data.get("evidence") or {}).get("models", []):
        model.pop("model_version", None)
    for metric in data.get("metrics", []):
        if metric.get("name", "").startswith("critical_recall:"):
            metric["reason"] = metric["reason"].rsplit(";", 1)[0]  # drops the run's model_version
    return data


def _differences(a, b, path: str = "") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                out.append(f"{path}/{key}: present in only one report")
            else:
                out += _differences(a[key], b[key], f"{path}/{key}")
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: length {len(a)} != {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in _differences(x, y, f"{path}[{i}]")]
    return [] if a == b else [f"{path}: {a!r} != {b!r}"]


def _identity(payload: dict) -> dict:
    evidence = payload.get("evidence") or {}
    artifacts = evidence.get("sg03", {}).get("artifacts", {})
    return {
        "model_version": payload.get("model_version"),
        "model_sha256": evidence.get("model_sha256"),
        "runs": {key: record.get("model_version") for key, record in artifacts.items()},
    }


def compare_reports(expected: dict, actual: dict) -> dict:
    differences = _differences(_strip(expected), _strip(actual))
    same_run = _identity(expected) == _identity(actual) and _identity(expected)["model_sha256"] is not None
    return {
        "metrics_identical": not differences,
        "differences": differences[:50],
        "same_model_artifact": same_run,
        "expected_run": _identity(expected),
        "actual_run": _identity(actual),
    }


def compare_served(url: str, path: Path) -> dict:
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 - local verification URL
        status = response.status
        served = json.loads(response.read().decode("utf-8"))
    expected = json.loads(path.read_text(encoding="utf-8"))
    return {"url": url, "http_status": status, "identical": served == expected,
            "differences": _differences(expected, served)[:20]}
