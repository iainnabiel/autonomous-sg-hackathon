"""Bridge SG-02.2's provisional ``Tier`` to the shared ``contracts.tiers.Tier``.

``backend.risk_classification`` (PR #20) still defines its own title-case
``Tier`` until it is migrated onto the contracts (SG-02 plan, increment I2).
The values are identical, so conversion is by value. Remove this module once
SG-02.2 imports the shared type.

The current rule tier comes from SG-02.2's ``classify_risk`` because it also
returns the triggered rules and invalid inputs that receipts need.
``contracts.tiers.current_rule_tier`` now applies the same agreed policy (no
tier for a lone Elevated input); ``tests.test_backend_core`` checks the two
agree.
"""

from __future__ import annotations

from backend.risk_classification import RiskClassification, classify_risk
from contracts.tiers import Tier

SEVERITY = {Tier.SAFE: 0, Tier.ELEVATED: 1, Tier.CRITICAL: 2}


def shared_tier(tier: object) -> Tier | None:
    return None if tier is None else Tier(tier.value)


def rule_tier(log10_pc: object, miss_distance_m: object) -> tuple[Tier | None, RiskClassification]:
    result = classify_risk(log10_pc, miss_distance_m)
    return shared_tier(result.tier), result
