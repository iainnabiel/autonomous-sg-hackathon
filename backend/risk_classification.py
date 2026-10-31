"""SG-02.2: operational risk tiers from one message's log10(Pc) and miss distance.

Thresholds follow the organisers' tier_rules, evaluated critical first:

- Critical: log10(Pc) >= -4, or miss distance < 1 km.
- Elevated: log10(Pc) >= -6, or miss distance <= 5 km.
- Safe: otherwise.

The inputs are the values a conjunction message supplies (the dataset's
``risk`` and ``miss_distance``), not model output. The model predicts an
encounter's final tier separately (docs/ML_DECISIONS.md, D3); this module
does not predict or upgrade tiers, and it does not assign queue priority.

Accepted inputs, both real numbers:

- ``log_risk`` is log10(Pc), not Pc, finite and <= 0. A raw Pc such as 1e-5
  would be read as log10(Pc) = 0.00001 and rejected as out of range.
- ``miss_distance_km`` is kilometres, finite and >= 0. The organisers state the
  dataset's ``miss_distance`` is metres; converting it is SG-02.1, not done here.

An invalid or missing input never yields Safe. If one input is unusable but the
other alone is critical, the assessment stays Critical and is marked
incomplete; otherwise the tier is ``None``.

``log_risk = -30`` is the organisers' placeholder for a probability too small
to compute, to be treated as Pc ~ 0. It is a valid input here and is Safe on
probability, so the tier depends on distance. Callers should not mark it
invalid: that would stop a distant -30 message from being Safe.

The tier and rule names below are provisional until the SG-01.2 contracts
define the shared risk-tier type.
"""

from __future__ import annotations

import math
import numbers
from dataclasses import dataclass
from enum import Enum

CRITICAL_LOG_RISK = -4.0
ELEVATED_LOG_RISK = -6.0
CRITICAL_DISTANCE_KM = 1.0
ELEVATED_DISTANCE_KM = 5.0

LOG_RISK = "log_risk"
MISS_DISTANCE_KM = "miss_distance_km"


class RiskTier(str, Enum):
    SAFE = "safe"
    ELEVATED = "elevated"
    CRITICAL = "critical"


class RiskRule(str, Enum):
    """A threshold that an input met."""

    PROBABILITY_CRITICAL = "probability_critical"
    PROBABILITY_ELEVATED = "probability_elevated"
    DISTANCE_CRITICAL = "distance_critical"
    DISTANCE_ELEVATED = "distance_elevated"


_SEVERITY = {RiskTier.SAFE: 0, RiskTier.ELEVATED: 1, RiskTier.CRITICAL: 2}


@dataclass(frozen=True)
class RiskClassification:
    """Result of classifying one observation.

    ``tier`` is ``None`` when the available inputs cannot rule out a higher tier.
    ``triggered_rules`` lists every threshold met by a valid input, so a receipt
    can say whether probability, distance, or both caused the tier.
    """

    tier: RiskTier | None
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


def _probability_tier(log_risk: float) -> RiskTier:
    if log_risk >= CRITICAL_LOG_RISK:
        return RiskTier.CRITICAL
    if log_risk >= ELEVATED_LOG_RISK:
        return RiskTier.ELEVATED
    return RiskTier.SAFE


def _distance_tier(distance_km: float) -> RiskTier:
    if distance_km < CRITICAL_DISTANCE_KM:
        return RiskTier.CRITICAL
    if distance_km <= ELEVATED_DISTANCE_KM:
        return RiskTier.ELEVATED
    return RiskTier.SAFE


_PROBABILITY_RULES = {
    RiskTier.CRITICAL: RiskRule.PROBABILITY_CRITICAL,
    RiskTier.ELEVATED: RiskRule.PROBABILITY_ELEVATED,
}
_DISTANCE_RULES = {
    RiskTier.CRITICAL: RiskRule.DISTANCE_CRITICAL,
    RiskTier.ELEVATED: RiskRule.DISTANCE_ELEVATED,
}


def classify_risk(log_risk: object, miss_distance_km: object) -> RiskClassification:
    """Classify one observation.

    ``log_risk`` is log10(Pc) and must be finite and <= 0. ``miss_distance_km``
    is in kilometres and must be finite and >= 0. Anything else, including
    ``None``, NaN, infinities, strings, booleans, and values too large for a
    float, is treated as an invalid input.
    """
    tiers: list[RiskTier] = []
    rules: list[RiskRule] = []
    invalid: list[str] = []

    probability = _finite_number(log_risk)
    if probability is None or probability > 0:
        invalid.append(LOG_RISK)
    else:
        tier = _probability_tier(probability)
        tiers.append(tier)
        if tier in _PROBABILITY_RULES:
            rules.append(_PROBABILITY_RULES[tier])

    distance = _finite_number(miss_distance_km)
    if distance is None or distance < 0:
        invalid.append(MISS_DISTANCE_KM)
    else:
        tier = _distance_tier(distance)
        tiers.append(tier)
        if tier in _DISTANCE_RULES:
            rules.append(_DISTANCE_RULES[tier])

    worst = max(tiers, key=_SEVERITY.__getitem__, default=None)
    if invalid and worst is not RiskTier.CRITICAL:
        worst = None
    return RiskClassification(worst, tuple(rules), tuple(invalid))
