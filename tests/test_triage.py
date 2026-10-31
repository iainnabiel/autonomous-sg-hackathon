"""SG-01.4 prototype triage policy. No queue service is started."""

from __future__ import annotations

import inspect
import math
import unittest

from contracts.errors import ContractError
from contracts.forecast import ForecastStatus, available_forecast, carry_forward, unable_to_assess, unavailable_forecast
from contracts.ids import EncounterId, ObservationId
from contracts.policy import TRIAGE_POLICY_VERSION
from contracts.schemas import PriorityBand
from contracts.tiers import Tier, current_rule_tier
from contracts.triage import PriorityReason, PROTOTYPE_NOTICE, assign_review, sort_upcoming


def _review(
    *,
    event: int = 7,
    current: Tier | None,
    tca: float,
    forecast,
    source_event: int | None = None,
    source: str = "train",
):
    return assign_review(
        encounter_id=EncounterId(source, event),
        current_rule_tier=current,
        current_time_to_tca_days=tca,
        forecast=forecast,
        source_encounter_id=None if source_event is None else EncounterId(source, source_event),
    )


def _available(tier: Tier, row: int = 4, tca: float = 2.5, event_source: str = "train") -> object:
    return available_forecast(
        tier=tier,
        source_observation_id=ObservationId(event_source, row),
        source_time_to_tca_days=tca,
        model_version="upgrade-base",
        p_critical=0.4,
    )


class PolicyBoundaryTest(unittest.TestCase):
    def test_policy_is_a_labelled_prototype_and_ignores_class_score(self) -> None:
        self.assertEqual(TRIAGE_POLICY_VERSION, "triage-prototype-sg-01.4")
        self.assertIn("not a certified operational standard", PROTOTYPE_NOTICE)
        self.assertIn("not an instruction to execute a manoeuvre", PROTOTYPE_NOTICE)
        self.assertNotIn("p_critical", inspect.signature(assign_review).parameters)
        decision = _review(current=Tier.CRITICAL, tca=0.0, forecast=_available(Tier.CRITICAL), source_event=7)
        self.assertEqual(decision.policy_version, TRIAGE_POLICY_VERSION)
        self.assertTrue(decision.prototype)
        self.assertEqual(decision.priority, PriorityBand.IMMEDIATE)

    def test_exact_zero_and_one_day_boundaries(self) -> None:
        at_zero = _review(current=Tier.CRITICAL, tca=0.0, forecast=_available(Tier.CRITICAL), source_event=7)
        at_one = _review(current=Tier.CRITICAL, tca=1.0, forecast=_available(Tier.SAFE), source_event=7)
        after_one = _review(
            current=Tier.CRITICAL,
            tca=math.nextafter(1.0, 2.0),
            forecast=_available(Tier.CRITICAL),
            source_event=7,
        )
        elevated_at_one = _review(current=Tier.ELEVATED, tca=1.0, forecast=_available(Tier.ELEVATED), source_event=7)
        elevated_after = _review(
            current=Tier.ELEVATED,
            tca=math.nextafter(1.0, 2.0),
            forecast=_available(Tier.SAFE),
            source_event=7,
        )
        self.assertEqual(at_zero.priority, PriorityBand.IMMEDIATE)
        self.assertEqual(at_one.priority, PriorityBand.IMMEDIATE)
        self.assertIn(PriorityReason.TIME_WITHIN_ONE_DAY, at_one.reasons)
        self.assertEqual(after_one.priority, PriorityBand.HIGH)
        self.assertNotIn(PriorityReason.TIME_WITHIN_ONE_DAY, after_one.reasons)
        self.assertEqual(elevated_at_one.priority, PriorityBand.HIGH)
        self.assertEqual(elevated_after.priority, PriorityBand.SCHEDULED)

    def test_current_critical_is_not_downgraded_by_a_safe_forecast(self) -> None:
        decision = _review(current=Tier.CRITICAL, tca=0.5, forecast=_available(Tier.SAFE), source_event=7)
        self.assertEqual(decision.current_rule_tier, Tier.CRITICAL)
        self.assertEqual(decision.forecast_final_tier, Tier.SAFE)
        self.assertEqual(decision.prioritisation_tier, Tier.CRITICAL)
        self.assertEqual(decision.priority, PriorityBand.IMMEDIATE)
        self.assertIn(PriorityReason.CURRENT_EVIDENCE, decision.reasons)
        self.assertIn(PriorityReason.CURRENT_NOT_DOWNGRADED, decision.reasons)
        self.assertNotIn(PriorityReason.FORECAST_ESCALATION, decision.reasons)

    def test_safe_current_plus_critical_forecast_is_escalated(self) -> None:
        soon = _review(current=Tier.SAFE, tca=0.5, forecast=_available(Tier.CRITICAL), source_event=7)
        later = _review(current=Tier.SAFE, tca=2.0, forecast=_available(Tier.CRITICAL), source_event=7)
        self.assertEqual(soon.current_rule_tier, Tier.SAFE)
        self.assertEqual(soon.forecast_final_tier, Tier.CRITICAL)
        self.assertEqual(soon.priority, PriorityBand.IMMEDIATE)
        self.assertIn(PriorityReason.FORECAST, soon.reasons)
        self.assertIn(PriorityReason.FORECAST_ESCALATION, soon.reasons)
        self.assertIn(PriorityReason.TIME_WITHIN_ONE_DAY, soon.reasons)
        self.assertEqual(later.priority, PriorityBand.HIGH)
        self.assertNotIn(PriorityReason.TIME_WITHIN_ONE_DAY, later.reasons)

    def test_known_critical_evidence_stays_urgent_when_forecast_is_missing(self) -> None:
        decision = _review(current=Tier.CRITICAL, tca=0.0, forecast=unavailable_forecast())
        self.assertIsNone(decision.forecast_final_tier)
        self.assertEqual(decision.forecast_status, ForecastStatus.UNAVAILABLE)
        self.assertEqual(decision.priority, PriorityBand.IMMEDIATE)
        self.assertIn(PriorityReason.CURRENT_EVIDENCE, decision.reasons)
        self.assertIn(PriorityReason.FORECAST_NOT_TREATED_AS_SAFE, decision.reasons)
        self.assertNotEqual(decision.priority, PriorityBand.ROUTINE)
        forecast_only = _review(current=None, tca=1.0, forecast=_available(Tier.CRITICAL), source_event=7)
        self.assertEqual(forecast_only.priority, PriorityBand.IMMEDIATE)
        self.assertIn(PriorityReason.FORECAST, forecast_only.reasons)
        self.assertIsNone(forecast_only.current_rule_tier)

    def test_known_elevated_keeps_its_band_when_the_forecast_is_unavailable(self) -> None:
        at_one = _review(current=Tier.ELEVATED, tca=1.0, forecast=unavailable_forecast())
        after_one = _review(
            current=Tier.ELEVATED,
            tca=math.nextafter(1.0, 2.0),
            forecast=unavailable_forecast(),
        )
        unable = _review(current=Tier.ELEVATED, tca=1.0, forecast=unable_to_assess())
        self.assertIsNone(current_rule_tier(None, None))
        self.assertEqual(at_one.current_rule_tier, Tier.ELEVATED)
        self.assertIsNone(at_one.forecast_final_tier)
        self.assertEqual(at_one.forecast_status, ForecastStatus.UNAVAILABLE)
        self.assertNotEqual(at_one.prioritisation_tier, Tier.SAFE)
        self.assertEqual(at_one.priority, PriorityBand.HIGH)
        self.assertIn(PriorityReason.FORECAST_NOT_TREATED_AS_SAFE, at_one.reasons)
        self.assertIn(PriorityReason.TIME_WITHIN_ONE_DAY, at_one.reasons)
        self.assertEqual(after_one.priority, PriorityBand.SCHEDULED)
        self.assertEqual(after_one.current_rule_tier, Tier.ELEVATED)
        self.assertIsNone(after_one.forecast_final_tier)
        self.assertNotIn(PriorityReason.TIME_WITHIN_ONE_DAY, after_one.reasons)
        self.assertIn(PriorityReason.FORECAST_NOT_TREATED_AS_SAFE, after_one.reasons)
        self.assertEqual(unable.priority, PriorityBand.HIGH)
        self.assertIn(PriorityReason.FORECAST_NOT_TREATED_AS_SAFE, unable.reasons)
        absent = _review(current=None, tca=1.0, forecast=unavailable_forecast())
        safe = _review(current=Tier.SAFE, tca=1.0, forecast=unavailable_forecast())
        self.assertEqual(absent.priority, PriorityBand.INCOMPLETE)
        self.assertIsNone(absent.current_rule_tier)
        self.assertEqual(safe.current_rule_tier, Tier.SAFE)
        self.assertIsNone(safe.forecast_final_tier)
        self.assertEqual(safe.priority, PriorityBand.INCOMPLETE)
        bands = sort_upcoming([at_one, after_one, absent, safe])
        self.assertEqual([item.encounter_id.event_id for item in bands[PriorityBand.HIGH]], [7])
        self.assertEqual(len(bands[PriorityBand.SCHEDULED]), 1)
        self.assertEqual(len(bands[PriorityBand.INCOMPLETE]), 2)
        self.assertEqual(bands[PriorityBand.ROUTINE], ())

    def test_missing_forecast_does_not_become_safe_or_routine(self) -> None:
        unable = _review(current=Tier.SAFE, tca=0.2, forecast=unable_to_assess())
        unavailable = _review(current=None, tca=0.2, forecast=unavailable_forecast())
        self.assertEqual(unable.priority, PriorityBand.INCOMPLETE)
        self.assertIsNone(unable.forecast_final_tier)
        self.assertIn(PriorityReason.INCOMPLETE_REVIEW, unable.reasons)
        self.assertIn(PriorityReason.FORECAST_NOT_TREATED_AS_SAFE, unable.reasons)
        self.assertEqual(unavailable.priority, PriorityBand.INCOMPLETE)
        bands = sort_upcoming([unable, unavailable])
        self.assertEqual(bands[PriorityBand.ROUTINE], ())
        self.assertEqual(len(bands[PriorityBand.INCOMPLETE]), 2)

    def test_negative_tca_is_left_out_of_upcoming_bands(self) -> None:
        decision = _review(current=Tier.CRITICAL, tca=-0.01, forecast=_available(Tier.CRITICAL), source_event=7)
        self.assertFalse(decision.in_upcoming_queue)
        self.assertIsNone(decision.priority)
        self.assertIn(PriorityReason.EXCLUDED_NEGATIVE_TCA, decision.reasons)
        self.assertEqual(decision.current_rule_tier, Tier.CRITICAL)
        bands = sort_upcoming([decision])
        self.assertTrue(all(not members for members in bands.values()))

    def test_carried_forward_uses_current_tca_and_same_encounter(self) -> None:
        forecast = carry_forward(_available(Tier.CRITICAL, row=40, tca=3.0))
        decision = _review(current=Tier.SAFE, tca=0.25, forecast=forecast, source_event=7)
        self.assertEqual(decision.priority, PriorityBand.IMMEDIATE)
        self.assertEqual(decision.source_observation_id, ObservationId("train", 40))
        self.assertEqual(decision.source_time_to_tca_days, 3.0)
        self.assertEqual(decision.current_time_to_tca_days, 0.25)
        self.assertIn(PriorityReason.CARRIED_FORWARD, decision.reasons)
        self.assertIn(PriorityReason.FORECAST_ESCALATION, decision.reasons)
        with self.assertRaises(ContractError):
            _review(current=Tier.SAFE, tca=0.25, forecast=forecast, source_event=99)
        with self.assertRaises(ContractError):
            _review(current=Tier.SAFE, tca=0.25, forecast=forecast, source_event=None)

    def test_upcoming_order_is_tca_then_encounter_id(self) -> None:
        first = _review(event=20, current=Tier.CRITICAL, tca=0.2, forecast=_available(Tier.CRITICAL), source_event=20)
        second = _review(event=3, current=Tier.CRITICAL, tca=0.2, forecast=_available(Tier.CRITICAL), source_event=3)
        sooner = _review(event=9, current=Tier.CRITICAL, tca=0.1, forecast=_available(Tier.CRITICAL), source_event=9)
        ordered = sort_upcoming([first, second, sooner])[PriorityBand.IMMEDIATE]
        self.assertEqual(
            [item.encounter_id.event_id for item in ordered],
            [9, 3, 20],
        )


if __name__ == "__main__":
    unittest.main()
