"""SG-03.3 triage usefulness: coverage of final-tier Critical encounters by review order.

Every ranking orders the same predetermined cohort. Each encounter is placed at
its early-warning snapshot: its latest message with raw ``time_to_tca`` at or
above the cutoff, which is also the forecast's source. No outcome enters a ranking.

- ``proposed_queue``: the SG-01.4 prototype policy exactly as ``contracts.triage``
  orders it (``assign_review``, then ``sort_upcoming`` band by band). It does not
  read ``p_critical``.
- ``persistence_queue``: the same policy with the persistence forecast, to isolate
  the model's effect on the queue.
- ``risk_first``, ``distance_first``, ``tca_first``: supplied snapshot values.

Baseline ties break by ``(source, event_id)``, as ``sort_upcoming`` does.
Positives are encounters whose final tier is Critical. No forecast is made
inside 1 day of TCA, so the policy's urgent (Immediate) band is empty at the
snapshot. Its coverage is reported as not applicable, never as zero.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

from contracts.schemas import PriorityBand
from contracts.tiers import Tier
from contracts.triage import assign_review, sort_upcoming
from evaluation.errors import EvaluationInputError
from evaluation.join import JoinedRow
from evaluation.labels import RawMessage, encounter_order

TOP_FRACTIONS = (0.1, 0.2, 0.3)
CURVE_STEPS = 100  # coverage curve at every 1% of the queue


def _queue_order(rows: Sequence[JoinedRow]) -> tuple[list[JoinedRow], dict[str, int]]:
    by_id = {row.encounter_id: row for row in rows}
    decisions = [
        assign_review(
            encounter_id=row.encounter_id,
            current_rule_tier=row.label.latest_eligible_rule_tier,
            current_time_to_tca_days=row.label.latest_eligible_time_to_tca_days,
            forecast=row.prediction.forecast,
        )
        for row in rows
    ]
    outside = [str(d.encounter_id) for d in decisions if not d.in_upcoming_queue or d.priority is None]
    if outside:
        raise EvaluationInputError({"not_in_queue": outside})
    bands = sort_upcoming(decisions)
    ordered = [by_id[d.encounter_id] for members in bands.values() for d in members]
    return ordered, {band.value: len(members) for band, members in bands.items()}


def _missing_last(value: float | None) -> tuple[bool, float]:
    missing = value is None or math.isnan(value)
    return (missing, 0.0 if missing else value)


def _sorted_by(rows: Sequence[JoinedRow], key) -> list[JoinedRow]:
    """Missing supplied values sort last so they never reach the top of a baseline."""

    return sorted(rows, key=lambda row: (_missing_last(key(row)), encounter_order(row.encounter_id)))


def _coverage(ordered: Sequence[JoinedRow], positive) -> dict:
    flags = [positive(row) for row in ordered]
    total = sum(flags)
    n = len(flags)
    if total == 0 or n == 0:
        return {"positives": total, "top": [None] * len(TOP_FRACTIONS), "curve": [], "state": "not_applicable"}
    cumulative = [0]
    for flag in flags:
        cumulative.append(cumulative[-1] + flag)
    top = []
    for fraction in TOP_FRACTIONS:
        reviewed = math.ceil(fraction * n)
        top.append({"fraction": fraction, "reviewed": reviewed, "captured": cumulative[reviewed],
                    "coverage": cumulative[reviewed] / total})
    curve = [[step / CURVE_STEPS, cumulative[math.ceil(step / CURVE_STEPS * n)] / total]
             for step in range(CURVE_STEPS + 1)]
    return {"positives": total, "top": top, "curve": curve, "state": "reported"}


def rank_and_cover(
    model_rows: Sequence[JoinedRow],
    persistence_rows: Sequence[JoinedRow],
    snapshot: Mapping[str, RawMessage],
    cohort_id: str,
) -> dict:
    """Coverage per ranking. ``snapshot`` maps observation IDs to raw messages."""

    if [r.encounter_id for r in model_rows] != [r.encounter_id for r in persistence_rows]:
        raise EvaluationInputError({"cohort_mismatch": ["model and persistence rows differ"]})

    def message(row: JoinedRow) -> RawMessage:
        return snapshot[str(row.label.latest_eligible_observation_id)]

    proposed, proposed_bands = _queue_order(model_rows)
    persistence, persistence_bands = _queue_order(persistence_rows)
    rankings = [
        ("proposed_queue", "Proposed queue (SG-01.4 policy, model forecast)", proposed, proposed_bands),
        ("persistence_queue", "Same policy, persistence forecast", persistence, persistence_bands),
        ("risk_first", "Supplied log10 Pc, highest first", _sorted_by(model_rows, lambda r: None if message(r).risk_log10_pc is None else -message(r).risk_log10_pc), None),
        ("distance_first", "Supplied miss distance, smallest first", _sorted_by(model_rows, lambda r: message(r).miss_distance_m), None),
        ("tca_first", "Time to closest approach, soonest first", _sorted_by(model_rows, lambda r: message(r).time_to_tca_days), None),
    ]
    final_critical = lambda row: row.label.final_tier is Tier.CRITICAL  # noqa: E731
    urgent = proposed_bands.get(PriorityBand.IMMEDIATE.value, 0)

    results = []
    for key, label, ordered, bands in rankings:
        coverage = _coverage(ordered, final_critical)
        results.append({
            "key": key,
            "label": label,
            "bands": bands,
            "final_critical": coverage,
            "urgent_subset": {"n": bands.get(PriorityBand.IMMEDIATE.value, 0) if bands else None,
                              "state": "not_applicable",
                              "reason": "no encounter is within 1 day of TCA at the early-warning snapshot"},
        })
    return {
        "cohort": cohort_id,
        "n": len(model_rows),
        "snapshot_definition": "each encounter's latest message at or above the 2-day cutoff (the forecast source)",
        "positive_definition": "final tier Critical",
        "tie_rule": "within a band: time_to_tca, source, event_id (contracts.triage.sort_upcoming); "
                    "baselines: the sort key, then source, event_id",
        "urgent_subset_n": urgent,
        "rankings": results,
    }


def dashboard_view(result: dict) -> dict:
    """The dashboard's ``RankingCoverage`` shape. 'Imminent' fields are not applicable (null or empty)."""

    rankings = []
    for item in result["rankings"]:
        coverage = item["final_critical"]
        top = [entry["coverage"] if entry else None for entry in coverage["top"]]
        rankings.append({
            "key": item["key"],
            "label": item["label"],
            "imminent": [],
            "all": coverage["curve"],
            "top_10_20_30_imminent": [None, None, None],
            "top_10_20_30_all": top,
        })
    positives = result["rankings"][0]["final_critical"]["positives"] if result["rankings"] else 0
    return {
        "cohort": result["cohort"],
        "urgent_subset_n": result["urgent_subset_n"],
        "imminent_critical_n": 0,
        "all_critical_n": positives,
        "rankings": rankings,
    }
