"""SG-02.5: relative-time radar over the same encounters as the queue.

Each encounter in the upcoming queue is counted once, in the bin of its
current observation's hours to closest approach, by prioritisation tier (the
queue's tier); a null tier counts as incomplete. Excluded encounters (every
message after closest approach) are not counted.

Bin edges are the dashboard's existing hour bins. Bins are closed on the right
so the 0-24 h window includes both 0 and 24 h, as SG-02.5 requires: the first
bin is [0, 6], later bins are (lo, hi], and the last is (168, open). Hours are
relative to each encounter's own closest approach; there is no calendar time.
"""

from __future__ import annotations

from collections.abc import Iterable

from backend.assessment import Assessment
from backend.views import hours, lower

BIN_EDGES_HOURS = (0, 6, 12, 24, 48, 72, 120, 168)
COUNT_KEYS = ("critical", "elevated", "safe", "incomplete")


def _bins() -> list[dict]:
    bins = []
    for index, low in enumerate(BIN_EDGES_HOURS):
        high = BIN_EDGES_HOURS[index + 1] if index + 1 < len(BIN_EDGES_HOURS) else None
        interval = f"[{low}, {high}]" if index == 0 else (f"({low}, {high}]" if high is not None else f"({low}, open)")
        bins.append({"from_hours": low, "to_hours": high, "interval": interval, **{key: 0 for key in COUNT_KEYS}})
    return bins


def bin_index(value_hours: float) -> int | None:
    if value_hours < 0:
        return None
    for index in range(len(BIN_EDGES_HOURS) - 1):
        if value_hours <= BIN_EDGES_HOURS[index + 1]:
            return index
    return len(BIN_EDGES_HOURS) - 1


def radar(assessments: Iterable[Assessment], *, cohort: str, caveat: str) -> dict:
    bins = _bins()
    counted: set[str] = set()
    for assessment in assessments:
        if not assessment.in_queue:
            continue
        key = str(assessment.encounter_id)
        if key in counted:
            raise ValueError(f"{key} counted twice")
        value = hours(assessment.assessed_message)
        index = None if value is None else bin_index(value)
        if index is None:
            continue
        counted.add(key)
        bins[index][lower(assessment.decision.prioritisation_tier) or "incomplete"] += 1
    within = sum(b[k] for b in bins if b["to_hours"] is not None and b["to_hours"] <= 24 for k in COUNT_KEYS)
    return {
        "bins": bins,
        "cohort": cohort,
        "caveat": caveat,
        "encounters_counted": len(counted),
        "within_24h": within,
        "bin_rule": "first bin [0, 6]; later bins (lo, hi]; hours to each encounter's own closest approach",
    }
