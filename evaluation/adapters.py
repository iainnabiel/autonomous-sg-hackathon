"""Adapt ML outputs (``ml.train``) to SG-03's canonical prediction rows.

``ml/artifacts/<run>/validation_predictions.csv`` columns:
``encounter_id, latest_row_id, final_tier, final_is_early, persistence_tier,
p_critical, predicted_tier, upgraded``. Its ``final_*`` columns are labels, so
they are split off and only compared with SG-03's own labels.

``model_version`` and the threshold come from ``ml/reports/<run>.json`` (the
CSV has no version column). The source TCA is looked up from the raw message
named by ``latest_row_id``; it is not taken from the ML file.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

from contracts.forecast import ForecastStatus
from evaluation.errors import ProblemCollector
from evaluation.sources import require


@dataclass(frozen=True)
class MLRun:
    run: str
    model_version: str
    threshold: float | None
    threshold_method: str | None
    min_upgrade_precision: float | None
    report: dict


def load_ml_report(path: Path) -> MLRun:
    report = json.loads(require(path).read_text(encoding="utf-8"))
    selection = report.get("config", {}).get("threshold_selection") or {}
    version = report.get("model_version")
    if not version:
        raise ValueError(f"{path} has no model_version")
    return MLRun(
        run=report["config"]["run"],
        model_version=version,
        threshold=selection.get("threshold"),
        threshold_method=selection.get("method"),
        min_upgrade_precision=selection.get("min_upgrade_precision"),
        report=report,
    )


def _bool(value: str) -> bool:
    if value not in ("True", "False"):
        raise ValueError(f"expected True or False, got {value!r}")
    return value == "True"


def from_ml_validation_csv(
    path: Path, run: MLRun, tca_by_observation: dict[str, float], *, scored: bool
) -> tuple[list[dict], dict[str, tuple[str, bool]]]:
    """Canonical rows plus the ML file's own labels (for comparison only)."""

    problems = ProblemCollector()
    rows: list[dict] = []
    ml_labels: dict[str, tuple[str, bool]] = {}
    with open(require(path), newline="", encoding="utf-8") as handle:
        for record in csv.DictReader(handle):
            encounter = record["encounter_id"]
            source = record["latest_row_id"]
            if source not in tca_by_observation:
                problems.add("unknown_source_observation", encounter)
                continue
            if not scored and record["p_critical"] not in ("", "nan", "NaN"):
                problems.add("invalid_score", encounter)  # a rule-only run must not carry a score
                continue
            ml_labels[encounter] = (record["final_tier"], _bool(record["final_is_early"]))
            rows.append(
                {
                    "model_id": run.run,
                    "model_version": run.model_version,
                    "encounter_id": encounter,
                    "forecast_status": ForecastStatus.AVAILABLE.value,
                    "forecast_final_tier": record["predicted_tier"],
                    "persistence_tier": record["persistence_tier"],
                    "upgraded": _bool(record["upgraded"]),
                    "p_critical": record["p_critical"] if scored else None,
                    "source_observation_id": source,
                    "source_time_to_tca_days": tca_by_observation[source],
                }
            )
    problems.raise_if_any()
    return rows, ml_labels
