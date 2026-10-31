"""SG-02.2: operational risk tiers from one message's log10(Pc) and miss distance.

Thresholds follow the organisers' tier_rules, evaluated critical first:

- Critical: log10(Pc) >= -4, or miss distance < 1000 m.
- Elevated: log10(Pc) >= -6, or miss distance <= 5000 m.
- Safe: otherwise.

The inputs are the values a conjunction message supplies (the dataset's
``risk`` and ``miss_distance``), not model output. The model predicts an
encounter's final tier separately (docs/ML_DECISIONS.md, D3); this module
does not predict or upgrade tiers, and it does not assign queue priority.

Accepted inputs, both real numbers:

- ``log10_pc`` is log10(Pc), not Pc, finite and <= 0. A raw Pc such as 1e-5
  would be read as log10(Pc) = 0.00001 and rejected as out of range.
- ``miss_distance_m`` is metres, finite and >= 0, as the organisers' data_notes
  state for the dataset's ``miss_distance``. No unit conversion is needed.

An invalid or missing input never yields Safe. If one input is unusable but the
other alone is critical, the assessment stays Critical and is marked
incomplete; otherwise the tier is ``None``, even when the valid input is
Elevated, because the missing input could still be Critical.

``log10_pc = -30`` is the organisers' placeholder for a probability too small
to compute, to be treated as Pc ~ 0. It is a valid input here and is Safe on
probability, so the tier depends on distance. Callers should not mark it
invalid: that would stop a distant -30 message from being Safe.

Temporary duplication: ``Tier`` and the four thresholds repeat the shared
definitions proposed in contracts/tiers.py and contracts/policy.py (PR #18,
unmerged) and ml/config.py. Names and values match so this module can import
them once SG-01.2 merges. ``RiskRule`` has no shared equivalent yet.
"""

from __future__ import annotations

import math
import numbers
from dataclasses import dataclass
from enum import Enum

CRITICAL_LOG10_PC = -4.0
ELEVATED_LOG10_PC = -6.0
CRITICAL_MISS_DISTANCE_M = 1000.0
ELEVATED_MISS_DISTANCE_M = 5000.0

LOG10_PC = "log10_pc"
MISS_DISTANCE_M = "miss_distance_m"


class Tier(str, Enum):
    SAFE = "Safe"
    ELEVATED = "Elevated"
    CRITICAL = "Critical"


class RiskRule(str, Enum):
    """A threshold that an input met."""

    PROBABILITY_CRITICAL = "probability_critical"
    PROBABILITY_ELEVATED = "probability_elevated"
    DISTANCE_CRITICAL = "distance_critical"
    DISTANCE_ELEVATED = "distance_elevated"


_SEVERITY = {Tier.SAFE: 0, Tier.ELEVATED: 1, Tier.CRITICAL: 2}


@dataclass(frozen=True)
class RiskClassification:
    """Result of classifying one observation.

    ``tier`` is ``None`` when the available inputs cannot rule out a higher tier.
    ``triggered_rules`` lists every threshold met by a valid input, so a receipt
    can say whether probability, distance, or both caused the tier.
    """

    tier: Tier | None
    triggered_rules: tuple[RiskRule, ...]
    invalid_inputs: tuple[str, ...]

    @property
    def is_complete(self) -> bool:
        return not self.invalid_inputs


def _finite_number(value: object) -> float | None:
    # numbers.Real also admits NumPy scalars, which are not int/float subclasses.
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        return None
    try:
        number = float(value)
    except (OverflowError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _probability_tier(log10_pc: float) -> Tier:
    if log10_pc >= CRITICAL_LOG10_PC:
        return Tier.CRITICAL
    if log10_pc >= ELEVATED_LOG10_PC:
        return Tier.ELEVATED
    return Tier.SAFE


def _distance_tier(distance_m: float) -> Tier:
    if distance_m < CRITICAL_MISS_DISTANCE_M:
        return Tier.CRITICAL
    if distance_m <= ELEVATED_MISS_DISTANCE_M:
        return Tier.ELEVATED
    return Tier.SAFE


_PROBABILITY_RULES = {
    Tier.CRITICAL: RiskRule.PROBABILITY_CRITICAL,
    Tier.ELEVATED: RiskRule.PROBABILITY_ELEVATED,
}
_DISTANCE_RULES = {
    Tier.CRITICAL: RiskRule.DISTANCE_CRITICAL,
    Tier.ELEVATED: RiskRule.DISTANCE_ELEVATED,
}


def classify_risk(log10_pc: object, miss_distance_m: object) -> RiskClassification:
    """Classify one observation.

    ``log10_pc`` must be finite and <= 0. ``miss_distance_m`` is in metres and
    must be finite and >= 0. Anything else, including ``None``, NaN,
    infinities, strings, booleans, and values too large for a float, is
    treated as an invalid input.
    """
    tiers: list[Tier] = []
    rules: list[RiskRule] = []
    invalid: list[str] = []

    probability = _finite_number(log10_pc)
    if probability is None or probability > 0:
        invalid.append(LOG10_PC)
    else:
        tier = _probability_tier(probability)
        tiers.append(tier)
        if tier in _PROBABILITY_RULES:
            rules.append(_PROBABILITY_RULES[tier])

    distance = _finite_number(miss_distance_m)
    if distance is None or distance < 0:
        invalid.append(MISS_DISTANCE_M)
    else:
        tier = _distance_tier(distance)
        tiers.append(tier)
        if tier in _DISTANCE_RULES:
            rules.append(_DISTANCE_RULES[tier])

    worst = max(tiers, key=_SEVERITY.__getitem__, default=None)
    if invalid and worst is not Tier.CRITICAL:
        worst = None
    return RiskClassification(worst, tuple(rules), tuple(invalid))
