"""SG-03.1 prediction records for one evaluation run, validated against labels.

A record is one model's forecast for one encounter. The forecast itself is the
shared ``contracts.forecast.Forecast``, so status, tier and ``p_critical`` rules
come from the contract. This module adds the evaluation rules:

- One record per source-qualified encounter ID, for one ``model_id``.
- Eligibility is the raw one from the labels: at least one message at or above
  the shared cutoff. An eligible encounter needs an assessed forecast; a model
  failure there is never accepted as "no eligible message". An encounter with no
  eligible message needs an explicit ``unable_to_assess`` record whose reason is
  ``no_eligible_observation``, never a tier.
- An assessed forecast (``available`` or ``carried_forward``) must name the
  encounter's latest raw-eligible message and that message's raw TCA. For
  ``carried_forward`` this checks only the named provenance. The original
  forecast is not an input here, so this module does not verify that the values
  were copied unchanged.
- ``unavailable`` means inference failed; it cannot be evaluated.
- One run has one ``model_version`` and one ``model_sha256``. Any non-null value
  on any record counts, whatever its status, so runs cannot mix silently.
- A cohort encounter with no record is reported in ``missing``. Strict
  validation fails on it; it is never treated as Safe or as unable to assess.

Records are built in canonical form by the caller. Adapting ML output files is a
later step.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from contracts.errors import ContractError
from contracts.forecast import Forecast, ForecastStatus, ReasonCode
from contracts.ids import EncounterId, ObservationId
from contracts.tiers import Tier
from evaluation.cohorts import Cohort
from evaluation.errors import ProblemCollector
from evaluation.labels import LABELLED_SOURCE, LabelRecord, encounter_order

CANONICAL_FIELDS = frozenset(
    {
        "model_id",
        "model_version",
        "model_sha256",
        "encounter_id",
        "forecast_status",
        "forecast_final_tier",
        "persistence_tier",
        "upgraded",
        "p_critical",
        "predicted_final_log10_pc",
        "predicted_final_pc",
        "source_observation_id",
        "source_time_to_tca_days",
        "reason_codes",
    }
)
REQUIRED_FIELDS = ("model_id", "encounter_id", "forecast_status")
LABEL_FIELDS = frozenset({"usable_for_training", "usable", "partition"})  # plus any final_* name
_SEVERITY = {tier: rank for rank, tier in enumerate((Tier.SAFE, Tier.ELEVATED, Tier.CRITICAL))}


@dataclass(frozen=True)
class PredictionRecord:
    model_id: str
    encounter_id: EncounterId
    forecast: Forecast
    persistence_tier: Tier | None = None
    upgraded: bool | None = None
    model_sha256: str | None = None


@dataclass(frozen=True)
class PredictionSet:
    """Validated records for one model and one cohort.

    ``predictions`` holds every supplied record, including explicit
    ``unable_to_assess`` ones. ``missing`` lists cohort encounters with no record.
    A non-strict set can be incomplete; check ``complete`` before treating it as a
    full cohort. ``join`` refuses an incomplete set.
    """

    model_id: str
    cohort_id: str
    model_version: str | None
    predictions: Mapping[EncounterId, PredictionRecord]
    missing: tuple[EncounterId, ...]
    strict: bool

    @property
    def unable_to_assess(self) -> tuple[EncounterId, ...]:
        return tuple(
            key for key, record in self.predictions.items()
            if record.forecast.status is ForecastStatus.UNABLE_TO_ASSESS
        )

    @property
    def complete(self) -> bool:
        return not self.missing


def _is_label_field(name: str) -> bool:
    return name.startswith("final_") or name in LABEL_FIELDS


def _blank(value: object) -> bool:
    return value is None or value == ""


def _number(value: object) -> float | None:
    """Canonical numbers: real numbers or numeric strings. Blank means null."""

    if _blank(value):
        return None
    if isinstance(value, bool):
        raise ValueError("boolean is not a number")
    number = float(value)  # type: ignore[arg-type]
    if not math.isfinite(number):
        raise ValueError("non-finite number")
    return number


def _tier(value: object) -> Tier | None:
    return None if _blank(value) else Tier.parse(value)  # type: ignore[arg-type]


def parse_prediction_rows(rows: Iterable[Mapping[str, object]]) -> tuple[PredictionRecord, ...]:
    """Build records from canonical rows; every malformed row is reported together."""

    problems = ProblemCollector()
    records: list[PredictionRecord] = []
    for index, row in enumerate(rows):
        label = str(row.get("encounter_id") or f"<row {index}>")
        for name in row:
            if _is_label_field(name):
                problems.add("label_column_in_predictions", name)
            elif name not in CANONICAL_FIELDS:
                problems.add("unknown_column", name)
        if any(_blank(row.get(name)) for name in REQUIRED_FIELDS):
            problems.add("missing_field", label)
            continue
        try:
            encounter_id = EncounterId.parse(row["encounter_id"])  # type: ignore[arg-type]
            source = row.get("source_observation_id")
            source_id = None if _blank(source) else ObservationId.parse(source)  # type: ignore[arg-type]
        except ContractError:
            problems.add("malformed_id", label)
            continue
        try:
            status = ForecastStatus(row["forecast_status"])
        except ValueError:
            problems.add("invalid_status", label)
            continue
        try:
            tier = _tier(row.get("forecast_final_tier"))
            persistence = _tier(row.get("persistence_tier"))
        except ValueError:
            problems.add("invalid_tier", label)
            continue
        try:
            p_critical = _number(row.get("p_critical"))
        except (TypeError, ValueError):
            problems.add("invalid_score", label)
            continue
        upgraded = row.get("upgraded")
        if not (upgraded is None or isinstance(upgraded, bool)):
            problems.add("invalid_upgrade", label)
            continue
        try:
            reasons = tuple(ReasonCode(code) for code in (row.get("reason_codes") or ()))
            forecast = Forecast(
                status=status,
                forecast_final_tier=tier,
                p_critical=p_critical,
                predicted_final_log10_pc=_number(row.get("predicted_final_log10_pc")),
                predicted_final_pc=_number(row.get("predicted_final_pc")),
                source_observation_id=source_id,
                source_time_to_tca_days=_number(row.get("source_time_to_tca_days")),
                model_version=None if _blank(row.get("model_version")) else str(row["model_version"]),
                reason_codes=reasons,
            )
        except (ContractError, TypeError, ValueError):
            problems.add("invalid_forecast", label)
            continue
        sha = row.get("model_sha256")
        records.append(
            PredictionRecord(
                model_id=str(row["model_id"]),
                encounter_id=encounter_id,
                forecast=forecast,
                persistence_tier=persistence,
                upgraded=upgraded,
                model_sha256=None if _blank(sha) else str(sha),
            )
        )
    problems.raise_if_any()
    return tuple(records)


def _check_assessed(
    record: PredictionRecord, label: LabelRecord, score_required: bool, problems: ProblemCollector
) -> None:
    key = record.encounter_id
    forecast = record.forecast
    source = forecast.source_observation_id
    # The label's latest eligible observation belongs to this encounter, so
    # equality checks identity, encounter membership and raw TCA together.
    if source is not None and source.source != key.source:
        problems.add("source_mismatch", key)
    elif (
        source != label.latest_eligible_observation_id
        or forecast.source_time_to_tca_days != label.latest_eligible_time_to_tca_days
    ):
        problems.add("wrong_source_observation", key)
    if not forecast.model_version:
        problems.add("missing_model_version", key)

    p_critical = forecast.p_critical
    if score_required and (p_critical is None or not 0.0 <= p_critical <= 1.0):
        problems.add("invalid_score", key)
    if not score_required and p_critical is not None:
        problems.add("invalid_score", key)

    tier = forecast.forecast_final_tier
    persistence = record.persistence_tier
    if score_required and (persistence is None or record.upgraded is None):
        problems.add("invalid_upgrade", key)
    if not score_required and record.upgraded:
        problems.add("invalid_upgrade", key)
    if persistence is None or tier is None:
        return
    if label.latest_eligible_rule_tier is None:
        problems.add("persistence_unverifiable", key)
    elif persistence is not label.latest_eligible_rule_tier:
        problems.add("persistence_mismatch", key)
    if _SEVERITY[tier] < _SEVERITY[persistence]:
        problems.add("downgrade", key)
    if record.upgraded is True and (persistence is Tier.CRITICAL or tier is not Tier.CRITICAL):
        problems.add("invalid_upgrade", key)
    if not record.upgraded and tier is not persistence:
        problems.add("invalid_upgrade", key)


def _check_record(
    record: PredictionRecord, label: LabelRecord, score_required: bool, problems: ProblemCollector
) -> None:
    status = record.forecast.status
    key = record.encounter_id
    eligible = label.latest_eligible_observation_id is not None  # raw eligibility
    if status is ForecastStatus.UNAVAILABLE:
        problems.add("inference_unavailable", key)
    elif not eligible:
        reasons = record.forecast.reason_codes
        if status is not ForecastStatus.UNABLE_TO_ASSESS or record.persistence_tier or record.upgraded:
            problems.add("status_eligibility_mismatch", key)
        elif ReasonCode.NO_ELIGIBLE_OBSERVATION not in reasons or ReasonCode.MODEL_UNAVAILABLE in reasons:
            problems.add("unable_to_assess_reason", key)
    elif status is ForecastStatus.UNABLE_TO_ASSESS:
        problems.add("status_eligibility_mismatch", key)
    else:
        _check_assessed(record, label, score_required, problems)


def validate_predictions(
    records: Iterable[PredictionRecord],
    labels: Mapping[EncounterId, LabelRecord],
    cohort: Cohort,
    *,
    model_id: str,
    score_required: bool,
    strict: bool = True,
) -> PredictionSet:
    """Check one model's records against labels for one cohort.

    ``score_required`` is True for a model that must emit ``p_critical`` (the
    upgrade classifier) and False for one that must not (persistence).
    Every record must belong to ``cohort``; select records by partition first.
    With ``strict`` (the default), any cohort encounter without a record fails.
    Without it, those encounters are returned in ``missing`` for reporting.
    """

    problems = ProblemCollector()
    accepted: dict[EncounterId, PredictionRecord] = {}
    for record in records:
        key = record.encounter_id
        if record.model_id != model_id:
            problems.add("wrong_model", key)
            continue
        if key.source != LABELLED_SOURCE:
            problems.add("wrong_source", key)
            continue
        if key in accepted:
            problems.add("duplicate_prediction", key)
            continue
        accepted[key] = record
        label = labels.get(key)
        if label is None or key not in cohort:
            problems.add("unexpected_prediction", key)
            continue
        _check_record(record, label, score_required, problems)

    for key in cohort.encounter_ids:
        if key not in labels:
            problems.add("cohort_label_missing", key)

    missing = tuple(key for key in cohort.encounter_ids if key not in accepted)
    if strict:
        for key in missing:
            problems.add("missing_prediction", key)

    versions = sorted({r.forecast.model_version for r in accepted.values() if r.forecast.model_version})
    if len(versions) > 1:
        for version in versions:
            problems.add("mixed_model_version", version)
    checksums = sorted({r.model_sha256 for r in accepted.values() if r.model_sha256})
    if len(checksums) > 1:
        for checksum in checksums:
            problems.add("mixed_model_sha256", checksum)
    problems.raise_if_any()

    ordered = {key: accepted[key] for key in sorted(accepted, key=encounter_order)}
    return PredictionSet(
        model_id=model_id,
        cohort_id=cohort.cohort_id,
        model_version=versions[0] if versions else None,
        predictions=ordered,
        missing=missing,
        strict=strict,
    )
