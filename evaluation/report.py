"""SG-03.2 / SG-03.4 evaluation report: validation detection metrics as JSON and Markdown.

``build_report`` returns the evidence bundle. ``write_report`` stores the served
body: ``contracts.schemas.MetricsReport`` at the top level plus that bundle under
``evidence``, which is the dashboard's ``MetricsResponse`` (``frontend/src/api/types.ts``),
so ``/metrics`` serves the file unchanged. SG-03 detail (cohort counts, coverage,
the paired trade-off, input checksums and cross-checks) is under ``evidence.sg03``.
Nothing is fitted or tuned here.
"""

from __future__ import annotations

import json
import subprocess
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from contracts.policy import POLICY_VERSION
from contracts.schemas import MetricResult, MetricsReport, MetricState, test_final_tier_accuracy
from contracts.tiers import Tier
from evaluation import sources
from evaluation.adapters import MLRun, from_ml_validation_csv, load_ml_report
from evaluation.cohorts import ALL_USABLE, FINAL_IS_EARLY, PRIMARY, UNABLE_TO_ASSESS, Cohort, build_cohorts
from evaluation.compare import compare, headline, pair, tradeoff_curve
from evaluation.errors import ProblemCollector
from evaluation.join import JoinedRow, join
from evaluation.labels import LabelRecord, derive_labels
from evaluation.metrics import TIER_ORDER, DetectionResult, average_precision, detect, roc_auc, wilson_interval
from evaluation.predictions import parse_prediction_rows, validate_predictions
from evaluation.ranking import dashboard_view, rank_and_cover

SCHEMA_VERSION = "sg-03.v1"
REPORTS_DIR = sources.REPO_ROOT / "evaluation" / "reports"
PARTITION = "validation"
REPORTED_COHORTS = (PRIMARY, ALL_USABLE)

LIMITATIONS = (
    "Validation partition only (one saved split, seed 42). test_data.csv has no outcomes, so no test metrics exist.",
    "The upgrade threshold was chosen by ML (D7) on 5-fold out-of-fold predictions from the training partition, "
    "then applied to a model refitted on the whole partition. The 25% upgrade-precision budget therefore does not "
    "transfer exactly, and it was checked on the same scores it was tuned on.",
    "The D7 budget is a trade-off constraint. Persistence has one operating point, so the two models are not "
    "compared at an equal false-alarm level.",
    "p_critical is an uncalibrated, class-weighted score for 'final tier is Critical'. It is not a collision "
    "probability (Pc) and is shown only as ranking quality.",
    "Encounters with no eligible early message are unable to assess. They are excluded from tier metrics and "
    "counted separately, never as Safe.",
)


@dataclass(frozen=True)
class RunInputs:
    key: str
    label: str
    role: str  # dashboard ModelResult.role
    predictions_csv: Path
    report_json: Path
    scored: bool


def default_runs() -> tuple[RunInputs, RunInputs]:
    return (
        RunInputs("persistence", "Persistence (rule on latest early message)", "baseline",
                  sources.ML_ARTIFACTS / "persistence" / "validation_predictions.csv",
                  sources.ML_REPORTS / "persistence.json", scored=False),
        RunInputs("upgrade_base", "Critical-upgrade model (shipped)", "shipped",
                  sources.ML_ARTIFACTS / "upgrade_base" / "validation_predictions.csv",
                  sources.ML_REPORTS / "upgrade_base.json", scored=True),
    )


def _git(*args: str) -> str | None:
    try:
        return subprocess.run(["git", *args], cwd=sources.REPO_ROOT, capture_output=True, text=True,
                              check=True).stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def _cohort_result(result: DetectionResult) -> dict:
    """Dashboard ``CohortResult``. Undefined ratios are null, never 0."""

    critical = result.recall(Tier.CRITICAL)
    ci = wilson_interval(critical.numerator, critical.denominator)
    return {
        "n": result.n,
        "confusion_matrix": {"labels": [t.value for t in TIER_ORDER], "rows_actual_cols_predicted": result.matrix},
        "row_normalised": result.row_normalised(),
        "per_tier": {
            t.value: {
                "precision": result.precision(t).value,
                "recall": result.recall(t).value,
                "support": result.support(t),
                "predicted": result.predicted(t),
            }
            for t in TIER_ORDER
        },
        "critical_recall_95ci": list(ci) if ci else None,
        "critical_predicted_safe": result.critical_predicted_safe,
        "false_critical_alarms": result.false_critical_alarms,
        "critical_false_positive_rate": result.critical_false_positive_rate().as_dict(),
        "accuracy_not_headline": result.accuracy().value,
    }


def _support(cohort: Cohort) -> dict:
    return {t.value: cohort.support[t] for t in TIER_ORDER}


def _check_ml_labels(ml_labels: dict[str, tuple[str, bool]], labels: dict, problems: ProblemCollector) -> None:
    by_id = {str(key): record for key, record in labels.items()}
    for encounter, (tier, final_is_early) in ml_labels.items():
        record = by_id.get(encounter)
        if record is None or record.final_tier.value != tier or record.final_is_early is not final_is_early:
            problems.add("ml_label_mismatch", encounter)


def _join_run(rows, labels, cohort: Cohort, run: RunInputs) -> tuple[tuple[JoinedRow, ...], int]:
    records = parse_prediction_rows(rows)
    inside = [r for r in records if r.encounter_id in cohort]
    validated = validate_predictions(inside, labels, cohort, model_id=run.key, score_required=run.scored)
    return join(labels, validated, cohort), len(records) - len(inside)


def _without_curves(result: dict) -> dict:
    """Coverage curves are kept once, in the dashboard's ranking_coverage (primary cohort)."""

    trimmed = dict(result, rankings=[])
    for item in result["rankings"]:
        coverage = {key: value for key, value in item["final_critical"].items() if key != "curve"}
        trimmed["rankings"].append(dict(item, final_critical=coverage))
    return trimmed


def _coverage(labels: dict[object, LabelRecord], cohorts: dict[str, Cohort]) -> dict:
    unable = cohorts[UNABLE_TO_ASSESS]
    return {
        "train_full_dataset": {
            "encounters": len(labels),
            "assessable": sum(record.usable for record in labels.values()),
            "unable_to_assess": unable.n,
            "unable_to_assess_final_tiers": _support(unable),
            "note": "Unable to assess = no message at or above the 2-day cutoff. Never counted as Safe; "
                    "excluded from every tier-metric denominator.",
        },
        f"{PARTITION}_partition": {
            "encounters": cohorts[ALL_USABLE].n,
            "unable_to_assess": 0,
            "note": "The saved split contains assessable encounters only.",
        },
    }


def _bundle_model_version(bundle: Path) -> tuple[str | None, str]:
    """Read ``model_version`` from a joblib bundle when joblib is installed (ML environment)."""

    try:
        import joblib  # optional: only present in the ML environment
    except ImportError:
        return None, "unverified: joblib not installed"
    version = joblib.load(bundle).get("model_version")
    return version, "read from bundle"


def _artifacts(runs: Sequence[RunInputs], ml_runs: dict, model_bundle: Path | None, train_sha: str,
               notes: list[str]) -> dict:
    """Identify the exact ML run and files scored. Equal metrics do not make different runs interchangeable."""

    records = {}
    for run in runs:
        ml_run = ml_runs[run.key]
        used_train = (ml_run.report.get("data") or {}).get("train_sha256")
        if used_train and used_train != train_sha:
            raise ValueError(f"{run.report_json} was produced from a different train_data.csv")
        record = {
            "model_version": ml_run.model_version,
            "report_json": str(run.report_json),
            "report_json_sha256": sources.file_sha256(run.report_json),
            "predictions_csv_sha256": sources.file_sha256(run.predictions_csv),
            "ml_train_sha256": used_train,
        }
        committed = sources.ML_REPORTS / f"{run.key}.json"
        if committed.exists() and committed.resolve() != Path(run.report_json).resolve():
            committed_version = json.loads(committed.read_text(encoding="utf-8")).get("model_version")
            record["repository_report_model_version"] = committed_version
            if committed_version != ml_run.model_version:
                notes.append(f"{run.key}: this report scores run {ml_run.model_version}; the repository's committed "
                             f"ml/reports/{run.key}.json is run {committed_version}. Matching metric values do not "
                             "make the two model artifacts interchangeable.")
        if run.role == "shipped":
            if model_bundle is not None and model_bundle.exists():
                version, check = _bundle_model_version(model_bundle)
                if version is not None and version != ml_run.model_version:
                    raise ValueError(f"{model_bundle} is {version}, but {run.report_json} is {ml_run.model_version}")
                record.update(model_bundle=str(model_bundle), model_bundle_sha256=sources.file_sha256(model_bundle),
                              bundle_model_version=version, bundle_version_check=check)
            else:
                record.update(model_bundle=None, model_bundle_sha256=None, bundle_model_version=None,
                              bundle_version_check="bundle not available; model artifact not identified")
                notes.append("The upgrade model bundle was not available, so its artifact is not identified.")
        records[run.key] = record
    return records


def build_report(
    *,
    train_csv: Path = sources.TRAIN_CSV,
    labels_csv: Path = sources.LABELS_CSV,
    split_csv: Path = sources.SPLIT_CSV,
    split_meta: Path = sources.SPLIT_META,
    runs: Sequence[RunInputs] | None = None,
    model_bundle: Path | None = None,
) -> dict:
    runs = tuple(runs or default_runs())
    messages = sources.load_messages(train_csv)
    labels = derive_labels(messages, sources.load_organiser_labels(labels_csv), sources.load_split(split_csv))
    cohorts = build_cohorts(labels, PARTITION)
    tca = sources.message_tca_by_observation(messages)

    checksums = {
        "train_data.csv": sources.file_sha256(train_csv),
        "train_event_labels.csv": sources.file_sha256(labels_csv),
        "train_validation.csv": sources.file_sha256(split_csv),
    }
    meta = json.loads(sources.require(split_meta).read_text(encoding="utf-8"))
    expected = meta.get("files_sha256", {})
    if expected.get("train_data.csv") != checksums["train_data.csv"]:
        raise ValueError("train_data.csv differs from the file the saved split was built from (split_meta.json)")
    notes = []
    if expected.get("train_event_labels.csv") != checksums["train_event_labels.csv"]:
        notes.append("train_event_labels.csv bytes differ from split_meta.json (for example a local export of the "
                     "organiser sheet). Its content is cross-checked row by row against raw messages and the split.")

    problems = ProblemCollector()
    ml_runs: dict[str, MLRun] = {}
    joined: dict[str, dict[str, tuple[JoinedRow, ...]]] = {}
    filtered: dict[str, dict[str, int]] = {}
    ml_checked: dict[str, int] = {}
    for run in runs:
        ml_run = load_ml_report(run.report_json)
        rows, ml_labels = from_ml_validation_csv(run.predictions_csv, ml_run, tca, scored=run.scored)
        _check_ml_labels(ml_labels, labels, problems)
        ml_checked[run.key] = len(ml_labels)
        problems.raise_if_any()
        ml_runs[run.key] = ml_run
        joined[run.key], filtered[run.key] = {}, {}
        for cohort_id in REPORTED_COHORTS:
            joined[run.key][cohort_id], filtered[run.key][cohort_id] = _join_run(rows, labels, cohorts[cohort_id], run)

    artifacts = _artifacts(runs, ml_runs, model_bundle, checksums["train_data.csv"], notes)
    baseline_run = next(run for run in runs if run.role == "baseline")
    shipped_run = next(run for run in runs if run.role == "shipped")
    shipped = ml_runs[shipped_run.key]
    min_precision = shipped.min_upgrade_precision

    models = []
    detection_rows = []
    for run in runs:
        results = {}
        for cohort_id in REPORTED_COHORTS:
            rows = joined[run.key][cohort_id]
            results[cohort_id] = detect([r.label.final_tier for r in rows],
                                        [r.prediction.forecast.forecast_final_tier for r in rows])
        ranking = None
        if run.scored:
            rows = joined[run.key][PRIMARY]
            positive = [r.label.final_tier is Tier.CRITICAL for r in rows]
            scores = [r.prediction.forecast.p_critical for r in rows]
            ranking = {"roc_auc": roc_auc(positive, scores), "pr_auc": average_precision(positive, scores)}
        primary = results[PRIMARY]
        models.append({
            "key": run.key,
            "label": run.label,
            "role": run.role,
            "model_version": ml_runs[run.key].model_version,
            "threshold": ml_runs[run.key].threshold,
            "upgrades": sum(bool(r.prediction.upgraded) for r in joined[run.key][PRIMARY]) if run.scored else None,
            "cohorts": {cohort_id: _cohort_result(results[cohort_id]) for cohort_id in REPORTED_COHORTS},
            "ranking": ranking,
        })
        detection_rows.append({
            "model": run.key,
            "support": primary.support(Tier.CRITICAL),
            "detected": primary.hits(Tier.CRITICAL),
            "missed": primary.critical_missed,
            "missed_as_safe": primary.critical_predicted_safe,
            "false_alarms": primary.false_critical_alarms,
        })

    comparison = {}
    for cohort_id in REPORTED_COHORTS:
        paired = pair(joined[baseline_run.key][cohort_id], joined[shipped_run.key][cohort_id])
        result = compare(paired, min_upgrade_precision=min_precision)
        label = "Primary validation cohort" if cohort_id == PRIMARY else "All-usable validation cohort"
        result["headline"] = headline(result, label)
        result["tradeoff_curve"] = {
            "note": "Descriptive only. Computed on validation after the threshold was fixed; not used for selection.",
            "points": tradeoff_curve(paired),
        }
        comparison[cohort_id] = result

    snapshot = {f"{m.source}:{m.row_index}": m for m in messages}
    triage = {
        cohort_id: rank_and_cover(joined[shipped_run.key][cohort_id], joined[baseline_run.key][cohort_id],
                                  snapshot, cohort_id)
        for cohort_id in REPORTED_COHORTS
    }

    test_metric = test_final_tier_accuracy()
    return {
        "status": "evaluated",
        "provenance": {
            "source": "evaluation (SG-03)",
            "commit": _git("rev-parse", "HEAD"),
            "branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
            "bundled_on": None,
            "generated_by": "python -m evaluation report",
            "note": f"Generated {datetime.now(timezone.utc):%Y-%m-%dT%H:%MZ} from ML run {shipped.model_version} "
                    "(see sg03.artifacts for the exact files). Nothing was fitted or tuned by SG-03.",
        },
        "dataset": {
            "train_sha256": checksums["train_data.csv"],
            "split": "ml/splits/train_validation.csv (encounter-grouped, seed 42, 80/20), validation partition",
            "cohort": PRIMARY,
            "cohort_definition": "Validation encounters with at least one message at or above the 2-day cutoff "
                                 "whose final message is inside 2 days (final_is_early excluded, decision D4). "
                                 "all_usable also includes final_is_early encounters.",
        },
        "model_version": shipped.model_version,
        "model_sha256": artifacts[shipped_run.key]["model_bundle_sha256"],
        "policy_version": POLICY_VERSION,
        "thresholds": {
            "upgrade_p_critical": shipped.threshold,
            "min_upgrade_precision": min_precision,
            "selection": shipped.threshold_method,
        },
        "models": models,
        "detection": detection_rows,
        "probability_critical": None,
        "cross_validation": None,
        "ranking_coverage": dashboard_view(triage[PRIMARY]),
        "sensitivity": None,
        "test": {"state": test_metric.state.value, "reason": test_metric.reason},
        "limitations": [*LIMITATIONS,
                        f"Critical support is small ({cohorts[PRIMARY].support[Tier.CRITICAL]} primary validation "
                        "encounters), so intervals are wide."],
        "sg03": {
            "schema_version": SCHEMA_VERSION,
            "inputs_sha256": checksums,
            "artifacts": artifacts,
            "notes": notes,
            "cross_checks": {
                "note": "Each check stops the report on any disagreement, so a written report means every check "
                        "passed. Counts are the records checked.",
                "organiser_labels_vs_raw_messages": {"result": "passed", "encounters": len(labels)},
                "split_vs_raw_final_is_early": {"result": "passed",
                                                "encounters": sum(r.partition is not None for r in labels.values())},
                "ml_prediction_labels_vs_sg03_labels": {"result": "passed",
                                                        "rows": {key: checked for key, checked in ml_checked.items()}},
                "forecast_source_is_latest_raw_eligible_message": {
                    "result": "passed",
                    "predictions": {key: len(joined[key][ALL_USABLE]) for key in joined},
                },
            },
            "cohorts": {
                cohort_id: {
                    "partition": cohort.partition,
                    "n": cohort.n,
                    "support": _support(cohort),
                    "id_sha256": cohort.id_sha256,
                }
                for cohort_id, cohort in cohorts.items()
                if cohort_id in (PRIMARY, ALL_USABLE, FINAL_IS_EARLY, UNABLE_TO_ASSESS)
            },
            "predictions_outside_cohort_filtered": filtered,
            "coverage": _coverage(labels, cohorts),
            "ranking": {cohort_id: _without_curves(result) for cohort_id, result in triage.items()},
            "comparison": comparison,
            "methods": {
                "confusion_matrix": "rows actual, columns predicted, order Critical, Elevated, Safe",
                "critical_recall_95ci": "Wilson score interval (ml/reports uses a bootstrap; values differ slightly)",
                "zero_denominator": "null with state 'unavailable' and a zero_denominator reason",
                "ranking": "ROC-AUC and average precision of p_critical for Critical vs rest, primary cohort",
            },
            "not_evaluated": [
                {"name": "test_final_tier_accuracy", "state": test_metric.state.value, "reason": test_metric.reason},
                {"name": "predicted_final_pc_error", "state": "not_evaluated", "reason": "model_predicts_no_pc"},
                {"name": "p_critical_calibration", "state": "not_evaluated",
                 "reason": "p_critical is a class-weighted ranking score"},
                {"name": "imminent_critical_coverage", "state": "not_applicable",
                 "reason": "forecasts are made at least 2 days before TCA, so no encounter is in the 1-day "
                           "urgent window at the snapshot; coverage of final-tier Critical is reported instead"},
            ],
        },
    }


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def to_markdown(payload: dict) -> str:
    lines = [
        "# SG-03 evaluation (validation partition)",
        "",
        f"Generated by `{payload['provenance']['generated_by']}`. Model `{payload['model_version']}`, "
        f"threshold {payload['thresholds']['upgrade_p_critical']}, policy `{payload['policy_version']}`.",
        "",
    ]
    for cohort_id in REPORTED_COHORTS:
        result = payload["sg03"]["comparison"][cohort_id]
        lines += [f"## {cohort_id}", "", result["headline"], "",
                  "| Model | n | Critical recall | Critical precision | False Critical | FPR | Critical→Safe |",
                  "| --- | --- | --- | --- | --- | --- | --- |"]
        for model in payload["models"]:
            c = model["cohorts"][cohort_id]
            crit = c["per_tier"]["Critical"]
            lines.append(f"| {model['label']} | {c['n']} | {_pct(crit['recall'])} | {_pct(crit['precision'])} | "
                         f"{c['false_critical_alarms']} | {_pct(c['critical_false_positive_rate']['value'])} | "
                         f"{c['critical_predicted_safe']} |")
        lines.append("")
    lines += ["## Triage ranking (primary)", "",
              "Coverage of final-tier Critical encounters when reviewing the top 10/20/30% of the cohort.", "",
              "| Ranking | Top 10% | Top 20% | Top 30% |", "| --- | --- | --- | --- |"]
    for item in payload["sg03"]["ranking"][PRIMARY]["rankings"]:
        cells = [_pct(entry["coverage"]) if entry else "n/a" for entry in item["final_critical"]["top"]]
        lines.append(f"| {item['label']} | " + " | ".join(cells) + " |")
    lines.append("")
    coverage = payload["sg03"]["coverage"]["train_full_dataset"]
    lines += [
        "## Coverage",
        "",
        f"Full train dataset: {coverage['encounters']} encounters, {coverage['assessable']} assessable, "
        f"{coverage['unable_to_assess']} unable to assess (final tiers {coverage['unable_to_assess_final_tiers']}). "
        "The validation partition has 0 unable to assess.",
        "",
        "## Limitations",
        "",
        *[f"- {item}" for item in payload["limitations"]],
        "",
    ]
    return "\n".join(lines)


def _metric(name: str, value: float | None, reason: str) -> MetricResult:
    state = MetricState.REPORTED if value is not None else MetricState.UNAVAILABLE
    return MetricResult(name=name, value=value, state=state, reason=reason)


def to_response(evidence: dict) -> dict:
    """The served ``/metrics`` body: ``contracts.schemas.MetricsReport`` plus the evidence bundle.

    This is the dashboard's ``MetricsResponse``. Headline values for the primary
    validation cohort are contract ``MetricResult``s; the full detail is ``evidence``.
    Per-encounter labels are not served (``labels`` is empty).
    """

    primary = evidence["sg03"]["comparison"][PRIMARY]
    n = primary["n"]
    scope = f"validation primary cohort, n={n}"
    metrics = []
    for model in evidence["models"]:
        cohort = model["cohorts"][PRIMARY]
        critical = cohort["per_tier"]["Critical"]
        metrics += [
            _metric(f"critical_recall:{model['key']}", critical["recall"],
                    f"{scope}; {critical['support']} final-tier Critical; {model['model_version']}"),
            _metric(f"false_critical_alarms:{model['key']}", float(cohort["false_critical_alarms"]), scope),
            _metric(f"critical_false_positive_rate:{model['key']}", cohort["critical_false_positive_rate"]["value"],
                    f"{scope}; of {primary['non_critical']} non-Critical encounters"),
        ]
    metrics += [
        _metric("extra_critical_caught", float(primary["extra_critical_caught"]), f"{scope}; model vs persistence"),
        _metric("extra_false_alarms", float(primary["extra_false_alarms"]), f"{scope}; model vs persistence"),
        _metric("upgrade_precision", primary["upgrade_precision"],
                f"{scope}; {primary['upgrades']} upgrades; D7 budget is a trade-off constraint"),
        test_final_tier_accuracy(),
        MetricResult("predicted_final_pc_error", None, MetricState.NOT_EVALUATED, "the model predicts no Pc"),
    ]
    report = MetricsReport(
        cohort_label="validation primary (final_is_early excluded, D4)",
        sample_count=n,
        model_version=evidence["model_version"],
        policy_version=evidence["policy_version"],
        metrics=tuple(metrics),
        labels=(),
    )
    body = asdict(report)
    body["metrics"] = [dict(item, state=item["state"].value) for item in body["metrics"]]
    body["labels"] = []
    body["evidence"] = evidence
    return body


def write_report(payload: dict, out_dir: Path = REPORTS_DIR) -> tuple[Path, Path]:
    """Write the served body (``to_response``) as metrics.json and the evidence as metrics.md."""

    out_dir.mkdir(parents=True, exist_ok=True)
    json_path, md_path = out_dir / "metrics.json", out_dir / "metrics.md"
    json_path.write_text(json.dumps(to_response(payload), indent=2, allow_nan=False) + "\n", encoding="utf-8")
    md_path.write_text(to_markdown(payload), encoding="utf-8")
    return json_path, md_path
