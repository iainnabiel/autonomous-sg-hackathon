"""Title-case tiers and the organiser rule for the current message.

The forecast final tier is a model output. This module only classifies the
message in hand. A known Critical trigger stays Critical when the other input
is missing. Missing inputs never become Safe.
"""

from __future__ import annotations

from enum import Enum

from contracts.policy import (
    CRITICAL_LOG10_PC,
    CRITICAL_MISS_DISTANCE_M,
    ELEVATED_LOG10_PC,
    ELEVATED_MISS_DISTANCE_M,
)


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


def current_rule_tier(log10_pc: float | None, miss_distance_m: float | None) -> Tier | None:
    """Organiser ``tier_rules`` sheet, critical first.

    Returns None when the supplied inputs cannot place the message. None is
    not Safe.
    """

    critical_by_probability = log10_pc is not None and log10_pc >= CRITICAL_LOG10_PC
    critical_by_distance = miss_distance_m is not None and miss_distance_m < CRITICAL_MISS_DISTANCE_M
    if critical_by_probability or critical_by_distance:
        return Tier.CRITICAL

    elevated_by_probability = (
        log10_pc is not None and ELEVATED_LOG10_PC <= log10_pc < CRITICAL_LOG10_PC
    )
    elevated_by_distance = (
        miss_distance_m is not None
        and CRITICAL_MISS_DISTANCE_M <= miss_distance_m <= ELEVATED_MISS_DISTANCE_M
    )
    if elevated_by_probability or elevated_by_distance:
        return Tier.ELEVATED

    if (
        log10_pc is not None
        and miss_distance_m is not None
        and log10_pc < ELEVATED_LOG10_PC
        and miss_distance_m > ELEVATED_MISS_DISTANCE_M
    ):
        return Tier.SAFE
    return None
