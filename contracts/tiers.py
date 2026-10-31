"""Title-case tiers and the organiser rule for the current message.

The forecast final tier is a model output. This module only classifies the
message in hand. A known Critical trigger stays Critical when the other input
is missing or unusable. An Elevated input with the other input missing stays
unrated, because that missing input could still be Critical. Missing or
unusable inputs never become Safe.
"""

from __future__ import annotations

import math
from enum import Enum

from contracts.policy import (
    CRITICAL_LOG10_PC,
    CRITICAL_MISS_DISTANCE_M,
    ELEVATED_LOG10_PC,
    ELEVATED_MISS_DISTANCE_M,
)


_SEVERITY = {"Safe": 0, "Elevated": 1, "Critical": 2}


class Tier(str, Enum):
    SAFE = "Safe"
    ELEVATED = "Elevated"
    CRITICAL = "Critical"

    @classmethod
    def parse(cls, value: str) -> Tier:
        try:
            return cls(value)
        except ValueError as exc:
            allowed = ", ".join(item.value for item in cls)
            raise ValueError(f"tier must be one of {allowed}, got {value!r}") from exc


def _usable_number(value: object) -> float | None:
    """A finite real number. Booleans, NaN, and infinities are unusable."""

    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value)


def current_rule_tier(log10_pc: float | None, miss_distance_m: float | None) -> Tier | None:
    """Organiser ``tier_rules`` sheet, critical first.

    Returns None when the supplied inputs cannot place the message. None is
    not Safe. ``log10(Pc) > 0`` and a negative distance are unusable, not
    evidence. A lone Elevated input stays unrated.
    """

    probability = _usable_number(log10_pc)
    distance = _usable_number(miss_distance_m)
    probability_ok = probability is not None and probability <= 0
    distance_ok = distance is not None and distance >= 0
    tiers: list[Tier] = []
    if probability_ok:
        assert probability is not None
        if probability >= CRITICAL_LOG10_PC:
            tiers.append(Tier.CRITICAL)
        elif probability >= ELEVATED_LOG10_PC:
            tiers.append(Tier.ELEVATED)
        else:
            tiers.append(Tier.SAFE)
    if distance_ok:
        assert distance is not None
        if distance < CRITICAL_MISS_DISTANCE_M:
            tiers.append(Tier.CRITICAL)
        elif distance <= ELEVATED_MISS_DISTANCE_M:
            tiers.append(Tier.ELEVATED)
        else:
            tiers.append(Tier.SAFE)
    if not tiers:
        return None
    worst = max(tiers, key=lambda tier: _SEVERITY[tier.value])
    if (not probability_ok or not distance_ok) and worst is not Tier.CRITICAL:
        return None
    return worst
