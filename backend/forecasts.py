"""SG-02.3: turn the real model's per-encounter output into ``contracts.Forecast``.

The model is ``ml.inference.predict_encounters`` (SG-05.4). It sees only
messages with raw ``time_to_tca >= 2`` days, predicts the encounter's final
tier, and can only raise the persistence tier to Critical. ``p_critical`` is
its uncalibrated ranking score for a Critical final tier, not a collision
probability.

Statuses stay distinct:

- ``unable_to_assess``: the encounter has no eligible early message (normal).
- ``unavailable``: the bundle could not be loaded, inference raised, or a
  record failed a consistency check. No tier and no score; ``problem`` says why.

Nothing is fabricated. A record is accepted only if its source observation is
the encounter's latest eligible message, that message passed SG-02.1 with
status VALID, the model's persistence tier equals SG-02.2 on that message, the
predicted tier never lowers persistence, the upgrade matches the bundle
threshold, and ``p_critical`` is finite in [0, 1]. The last-message check also
guards against ``ml.data.tier`` reading a NaN input as Safe.

``adapt_predictions`` is standard library only. ``run_model`` imports the ML
stack (pandas, scikit-learn) when called.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from pathlib import Path

from backend.message_validation import MessageCheck
from backend.tiers import SEVERITY, rule_tier
from contracts.errors import ContractError
from contracts.forecast import Forecast, ReasonCode, available_forecast, unable_to_assess, unavailable_forecast
from contracts.ids import EncounterId, ObservationId
from contracts.schemas import QualityFlag
from contracts.tiers import Tier

# ml.inference emits these names; the shared QualityFlag spells two of them differently.
ML_QUALITY_FLAGS = {
    "sigma_placeholder": QualityFlag.SIGMA_PLACEHOLDER,
    "space_weather_missing": QualityFlag.OPTIONAL_INPUT_MISSING,
    "single_early_message": QualityFlag.SINGLE_EARLY_OBSERVATION,
}


@dataclass(frozen=True)
class ModelInfo:
    model_version: str
    model_sha256: str | None
    threshold: float
    feature_set: str | None


@dataclass(frozen=True)
class ForecastResult:
    encounter_id: EncounterId
    forecast: Forecast
    persistence_tier: Tier | None
    upgraded: bool
    upgrade_reasons: tuple[str, ...]
    model_quality_flags: tuple[str, ...]
    problem: str | None


def model_info(bundle: Mapping[str, object]) -> ModelInfo:
    return ModelInfo(
        model_version=str(bundle["model_version"]),
        model_sha256=bundle.get("model_sha256"),
        threshold=float(bundle["threshold"]),
        feature_set=bundle.get("feature_set"),
    )


def _unavailable(encounter_id: EncounterId, problem: str) -> ForecastResult:
    return ForecastResult(encounter_id, unavailable_forecast(), None, False, (), (), problem)


def unavailable_for(encounters: Iterable[EncounterId], problem: str) -> dict[EncounterId, ForecastResult]:
    """Every encounter gets an explicit unavailable forecast; nothing is defaulted."""

    return {encounter_id: _unavailable(encounter_id, problem) for encounter_id in encounters}


def _tier(value: object) -> Tier | None:
    try:
        return Tier(value)
    except ValueError:
        return None


def _flag_list(value: object) -> tuple[str, ...]:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ()
    return tuple(str(item) for item in value)


def _quality_flags(value: object) -> tuple[str, ...] | None:
    """Shared QualityFlag values, or None if the model emitted an unknown flag."""
    flags = []
    for item in _flag_list(value):
        if item not in ML_QUALITY_FLAGS:
            return None
        flags.append(ML_QUALITY_FLAGS[item].value)
    return tuple(dict.fromkeys(flags))


def _check_record(
    record: Mapping[str, object],
    encounter_id: EncounterId,
    early_source: ObservationId | None,
    messages: Mapping[str, MessageCheck],
    model: ModelInfo,
) -> ForecastResult:
    if record.get("model_version") != model.model_version:
        return _unavailable(encounter_id, "prediction model_version does not match the loaded bundle")

    status = record.get("status")
    if status == "unable_to_assess":
        if early_source is not None:
            return _unavailable(encounter_id, "model reported no early message, but the encounter has one")
        return ForecastResult(encounter_id, unable_to_assess(), None, False, (), (), None)
    if status != "assessed":
        return _unavailable(encounter_id, f"unknown prediction status {status!r}")
    if early_source is None:
        return _unavailable(encounter_id, "model scored an encounter with no eligible early message")

    try:
        source = ObservationId.parse(str(record.get("latest_early_row_id")))
    except ContractError:
        return _unavailable(encounter_id, "prediction has no valid source observation id")
    if source != early_source:
        return _unavailable(encounter_id, f"model source {source} is not the latest eligible message {early_source}")
    message = messages.get(str(source))
    if message is None or message.encounter_key != str(encounter_id):
        return _unavailable(encounter_id, f"source observation {source} does not belong to {encounter_id}")
    if not message.inference_ready:
        return _unavailable(encounter_id, f"source observation {source} has missing or invalid required inputs")

    persistence = _tier(record.get("persistence_tier"))
    predicted = _tier(record.get("predicted_tier"))
    if persistence is None or predicted is None:
        return _unavailable(encounter_id, "prediction tiers are not Safe, Elevated or Critical")
    expected, _ = rule_tier(message.values.get("risk"), message.values.get("miss_distance"))
    if persistence is not expected:
        return _unavailable(encounter_id, f"model persistence tier {persistence.value} differs from the rule tier of {source}")

    try:
        p_critical = float(record.get("p_critical"))
    except (TypeError, ValueError):
        return _unavailable(encounter_id, "p_critical is not a number")
    if not math.isfinite(p_critical) or not 0.0 <= p_critical <= 1.0:
        return _unavailable(encounter_id, "p_critical is not a finite score in [0, 1]")

    upgraded = bool(record.get("upgraded"))
    if SEVERITY[predicted] < SEVERITY[persistence]:
        return _unavailable(encounter_id, "predicted tier is lower than persistence; the model may not downgrade")
    should_upgrade = persistence is not Tier.CRITICAL and p_critical >= model.threshold
    if upgraded != should_upgrade or (predicted is Tier.CRITICAL) != (upgraded or persistence is Tier.CRITICAL):
        return _unavailable(encounter_id, "upgrade flag, predicted tier and threshold are inconsistent")

    quality = _quality_flags(record.get("quality_flags"))
    if quality is None:
        return _unavailable(encounter_id, "prediction has a quality flag outside the shared vocabulary")

    forecast = available_forecast(
        tier=predicted,
        source_observation_id=source,
        source_time_to_tca_days=message.time_to_tca_days,
        model_version=model.model_version,
        p_critical=p_critical,
    )
    if upgraded:
        forecast = replace(forecast, reason_codes=(ReasonCode.MODEL_UPGRADE_TO_CRITICAL,))
    return ForecastResult(
        encounter_id,
        forecast,
        persistence,
        upgraded,
        _flag_list(record.get("upgrade_reasons")) if upgraded else (),
        quality,
        None,
    )


def adapt_predictions(
    records: Iterable[Mapping[str, object]],
    *,
    early_sources: Mapping[EncounterId, ObservationId | None],
    messages: Mapping[str, MessageCheck],
    model: ModelInfo,
) -> dict[EncounterId, ForecastResult]:
    """Map ``predict_encounters`` records onto the expected encounters.

    ``early_sources`` names every expected encounter and its latest eligible
    early observation (or None). ``messages`` maps observation keys
    (``train:1234``) to their SG-02.1 checks.
    """

    results: dict[EncounterId, ForecastResult] = {}
    seen: set[EncounterId] = set()
    for record in records:
        try:
            encounter_id = EncounterId.parse(str(record.get("encounter_id")))
        except ContractError as exc:
            raise ContractError(f"prediction with invalid encounter id: {exc}") from exc
        if encounter_id not in early_sources:
            raise ContractError(f"prediction for unexpected encounter {encounter_id}")
        if encounter_id in seen:
            raise ContractError(f"duplicate prediction for {encounter_id}")
        seen.add(encounter_id)
        results[encounter_id] = _check_record(record, encounter_id, early_sources[encounter_id], messages, model)
    for encounter_id in early_sources:
        if encounter_id not in results:
            results[encounter_id] = _unavailable(encounter_id, "model returned no prediction for this encounter")
    return results


def run_model(
    model_dir: Path | str,
    messages_frame: object,
    *,
    early_sources: Mapping[EncounterId, ObservationId | None],
    messages: Mapping[str, MessageCheck],
) -> tuple[ModelInfo | None, dict[EncounterId, ForecastResult], str | None]:
    """Load the real bundle and score ``messages_frame`` (an ``ml.data.load_messages`` frame).

    Any failure gives an unavailable forecast for every encounter, with the error.
    """

    try:
        from ml.inference import load_model, predict_encounters

        bundle = load_model(model_dir)
        info = model_info(bundle)
        frame = predict_encounters(bundle, messages_frame)
        records = frame.to_dict("records")
    except Exception as exc:  # explicit failure, never a fallback forecast
        problem = f"model unavailable: {type(exc).__name__}: {exc}"
        return None, unavailable_for(early_sources, problem), problem
    return info, adapt_predictions(records, early_sources=early_sources, messages=messages, model=info), None
