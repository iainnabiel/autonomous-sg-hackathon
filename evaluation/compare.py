"""SG-03.2 paired comparison of the upgrade model against persistence.

Both are scored on the same joined encounters. The upgrade only raises tiers to
Critical (D3), so the model's Critical set contains persistence's. Its false
alarms can therefore never be lower, and an equal-false-alarm comparison is not
possible. The D7 budget is reported as a trade-off constraint, not as evidence
of a comparable false-alarm level.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass
from math import comb

from contracts.tiers import Tier
from evaluation.errors import EvaluationInputError
from evaluation.join import JoinedRow
from evaluation.metrics import detect, wilson_interval

BOOTSTRAP_RESAMPLES = 2000
BOOTSTRAP_SEED = 42
CURVE_THRESHOLDS = tuple(round(0.05 + 0.01 * i, 2) for i in range(95))  # 0.05 to 0.99, ML's grid


@dataclass(frozen=True)
class PairedRow:
    actual: Tier
    baseline: Tier
    model: Tier
    persistence_tier: Tier
    p_critical: float | None
    upgraded: bool


def pair(baseline: Sequence[JoinedRow], model: Sequence[JoinedRow]) -> tuple[PairedRow, ...]:
    """Align two joins of the same cohort; fail if their encounters differ."""

    base_ids = [row.encounter_id for row in baseline]
    model_ids = [row.encounter_id for row in model]
    if base_ids != model_ids:
        raise EvaluationInputError({"cohort_mismatch": sorted(set(map(str, base_ids)) ^ set(map(str, model_ids)))
                                    or ["encounter order differs"]})
    rows = []
    for b, m in zip(baseline, model):
        rows.append(
            PairedRow(
                actual=b.label.final_tier,
                baseline=b.prediction.forecast.forecast_final_tier,
                model=m.prediction.forecast.forecast_final_tier,
                persistence_tier=m.prediction.persistence_tier or b.prediction.forecast.forecast_final_tier,
                p_critical=m.prediction.forecast.p_critical,
                upgraded=bool(m.prediction.upgraded),
            )
        )
    return tuple(rows)


def _exact_one_sided(b: int, c: int) -> float | None:
    """P(X >= b) for X ~ Binomial(b + c, 0.5): exact McNemar, model better."""

    n = b + c
    if n == 0:
        return None
    return sum(comb(n, k) for k in range(b, n + 1)) / 2**n


def _percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    low, high = int(position), min(int(position) + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def _bootstrap(rows: Sequence[PairedRow]) -> dict:
    """Paired bootstrap over encounters of recall and false-alarm differences."""

    critical = [row.actual is Tier.CRITICAL for row in rows]
    gain = [int(c and row.model is Tier.CRITICAL) - int(c and row.baseline is Tier.CRITICAL)
            for c, row in zip(critical, rows)]
    extra_alarm = [int(not c and row.model is Tier.CRITICAL) - int(not c and row.baseline is Tier.CRITICAL)
                   for c, row in zip(critical, rows)]
    rng = random.Random(BOOTSTRAP_SEED)
    recall_diffs, alarm_diffs = [], []
    indices = range(len(rows))
    for _ in range(BOOTSTRAP_RESAMPLES):
        sample = rng.choices(indices, k=len(rows))
        positives = sum(critical[i] for i in sample)
        alarm_diffs.append(sum(extra_alarm[i] for i in sample))
        if positives:
            recall_diffs.append(sum(gain[i] for i in sample) / positives)
    def interval(values: list[float]) -> list[float] | None:
        return [_percentile(values, 0.025), _percentile(values, 0.975)] if values else None
    return {
        "method": f"paired bootstrap over encounters, {BOOTSTRAP_RESAMPLES} resamples, seed {BOOTSTRAP_SEED}, "
                  "percentile 95% interval",
        "recall_difference_95ci": interval(recall_diffs),
        "extra_false_alarms_95ci": interval(alarm_diffs),
    }


def tradeoff_curve(rows: Sequence[PairedRow]) -> list[dict]:
    """Extra catches and false alarms per threshold. Descriptive only, never used to select."""

    curve = []
    for threshold in CURVE_THRESHOLDS:
        caught = alarms = 0
        for row in rows:
            if row.persistence_tier is not Tier.CRITICAL and row.p_critical is not None and row.p_critical >= threshold:
                if row.actual is Tier.CRITICAL:
                    caught += 1
                else:
                    alarms += 1
        curve.append({"threshold": threshold, "extra_critical_caught": caught, "extra_false_alarms": alarms})
    return curve


def compare(rows: Sequence[PairedRow], *, min_upgrade_precision: float) -> dict:
    actual = [row.actual for row in rows]
    base = detect(actual, [row.baseline for row in rows])
    model = detect(actual, [row.model for row in rows])
    critical = [row.actual is Tier.CRITICAL for row in rows]
    extra = sum(c and row.model is Tier.CRITICAL and row.baseline is not Tier.CRITICAL for c, row in zip(critical, rows))
    lost = sum(c and row.baseline is Tier.CRITICAL and row.model is not Tier.CRITICAL for c, row in zip(critical, rows))
    if lost:
        raise EvaluationInputError({"downgrade": [f"{lost} Critical encounters lost by the upgrade model"]})
    upgrades = sum(row.upgraded for row in rows)
    upgrade_hits = sum(row.upgraded and row.actual is Tier.CRITICAL for row in rows)
    upgrade_precision = upgrade_hits / upgrades if upgrades else None
    ci = wilson_interval(upgrade_hits, upgrades)
    return {
        "n": len(rows),
        "critical_support": base.support(Tier.CRITICAL),
        "non_critical": base.non_critical,
        "baseline": {
            "critical_caught": base.hits(Tier.CRITICAL),
            "critical_recall": base.recall(Tier.CRITICAL).value,
            "false_critical_alarms": base.false_critical_alarms,
            "critical_false_positive_rate": base.critical_false_positive_rate().value,
            "critical_predicted_safe": base.critical_predicted_safe,
        },
        "model": {
            "critical_caught": model.hits(Tier.CRITICAL),
            "critical_recall": model.recall(Tier.CRITICAL).value,
            "false_critical_alarms": model.false_critical_alarms,
            "critical_false_positive_rate": model.critical_false_positive_rate().value,
            "critical_predicted_safe": model.critical_predicted_safe,
        },
        "extra_critical_caught": extra,
        "lost_critical": lost,
        "extra_false_alarms": model.false_critical_alarms - base.false_critical_alarms,
        "upgrades": upgrades,
        "upgrade_precision": upgrade_precision,
        "upgrade_precision_95ci_wilson": list(ci) if ci else None,
        "d7_constraint": {
            "min_upgrade_precision": min_upgrade_precision,
            "validation_upgrade_precision": upgrade_precision,
            "validation_at_or_above": None if upgrade_precision is None else upgrade_precision >= min_upgrade_precision,
            "note": "A trade-off budget (at most 3 false alarms per extra Critical caught), enforced on training "
                    "out-of-fold predictions. It is not evidence of a comparable false-alarm level.",
        },
        "mcnemar_exact_one_sided_p": _exact_one_sided(extra, lost),
        "uncertainty": _bootstrap(rows),
    }


def _rate(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1%}"


def headline(result: dict, cohort_label: str) -> str:
    b, m = result["baseline"], result["model"]
    precision = result["upgrade_precision"]
    ci = result["uncertainty"]["recall_difference_95ci"]
    ci_text = f"; paired 95% CI of the recall gain {ci[0]:+.3f} to {ci[1]:+.3f}" if ci else ""
    precision_text = "no upgrades" if precision is None else f"upgrades correct {precision:.0%}"
    return (
        f"{cohort_label}: at its fixed threshold the upgrade model catches {m['critical_caught']} of "
        f"{result['critical_support']} Critical encounters vs {b['critical_caught']} for persistence "
        f"(+{result['extra_critical_caught']}{ci_text}). False Critical alarms rise from "
        f"{b['false_critical_alarms']} to {m['false_critical_alarms']} (false-positive rate "
        f"{_rate(b['critical_false_positive_rate'])} to {_rate(m['critical_false_positive_rate'])} of "
        f"{result['non_critical']} non-Critical encounters); {result['upgrades']} upgrades, {precision_text} "
        f"(D7 budget {result['d7_constraint']['min_upgrade_precision']:.0%} on training folds). "
        "This is a trade-off, not an equal-false-alarm comparison."
    )
