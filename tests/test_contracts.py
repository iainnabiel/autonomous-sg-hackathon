"""SG-01.2 and SG-01.3 contract checks. These do not score a model."""

from __future__ import annotations

import math
import unittest

from contracts.errors import ContractError
from contracts.features import assert_inference_columns
from contracts.fixtures import synthetic_examples
from contracts.forecast import (
    Forecast,
    ForecastStatus,
    ReasonCode,
    available_forecast,
    carry_forward,
    describe_p_critical,
    unable_to_assess,
    unavailable_forecast,
)
from contracts.ids import EncounterId, ObservationId
from contracts.observations import (
    Observation,
    is_early_eligible,
    refuse_unsupported_inference,
    select_early_observation,
    select_label_observation,
    select_upcoming_observation,
)
from contracts.policy import P_CRITICAL_DEFINITION
from contracts.schemas import (
    INFERENCE_FIELDS,
    MetricState,
    reject_fabricated_test_accuracy,
    test_final_tier_accuracy,
)
from contracts.tiers import Tier, current_rule_tier


def _obs(row: int, tca: float, event: int = 7) -> Observation:
    return Observation(
        observation_id=ObservationId("train", row),
        encounter_id=EncounterId("train", event),
        time_to_tca_days=tca,
    )


class IdAndEnumTest(unittest.TestCase):
    def test_encounter_and_observation_ids_are_different_types(self) -> None:
        encounter = EncounterId.parse("train:57")
        observation = ObservationId.parse("train:1234")
        self.assertEqual(str(encounter), "train:57")
        self.assertEqual(str(observation), "train:1234")
        self.assertNotIsInstance(encounter, ObservationId)
        self.assertNotIsInstance(observation, EncounterId)
        self.assertEqual(encounter.event_id, 57)
        self.assertEqual(observation.row_index, 1234)

    def test_invalid_ids_and_tiers_are_rejected(self) -> None:
        for value in ("57", "live:1", "train:-1", "train:12.5", "train:", ""):
            with self.assertRaises(ContractError):
                EncounterId.parse(value)
            with self.assertRaises(ContractError):
                ObservationId.parse(value)
        with self.assertRaises(ValueError):
            Tier.parse("critical")
        self.assertEqual(Tier.parse("Safe"), Tier.SAFE)

    def test_title_case_tiers_and_exact_rule_boundaries(self) -> None:
        self.assertEqual(current_rule_tier(-4.0, 8000.0), Tier.CRITICAL)
        self.assertEqual(current_rule_tier(-4.0000001, 999.0), Tier.CRITICAL)
        self.assertEqual(current_rule_tier(-6.0, 8000.0), Tier.ELEVATED)
        self.assertEqual(current_rule_tier(-7.0, 1000.0), Tier.ELEVATED)
        self.assertEqual(current_rule_tier(-7.0, 5000.0), Tier.ELEVATED)
        self.assertEqual(current_rule_tier(-7.0, 5000.1), Tier.SAFE)
        self.assertIsNone(current_rule_tier(None, None))
        self.assertEqual(current_rule_tier(None, 640.0), Tier.CRITICAL)


class ForecastConsistencyTest(unittest.TestCase):
    def test_null_status_pairs(self) -> None:
        unable = unable_to_assess()
        self.assertEqual(unable.status, ForecastStatus.UNABLE_TO_ASSESS)
        self.assertIsNone(unable.forecast_final_tier)
        self.assertIsNone(unable.p_critical)
        missing = unavailable_forecast()
        self.assertIsNone(missing.forecast_final_tier)
        with self.assertRaises(ContractError):
            Forecast(
                status=ForecastStatus.UNABLE_TO_ASSESS,
                forecast_final_tier=Tier.SAFE,
                p_critical=None,
                predicted_final_log10_pc=None,
                predicted_final_pc=None,
                source_observation_id=None,
                source_time_to_tca_days=None,
                model_version=None,
                reason_codes=(ReasonCode.NO_ELIGIBLE_OBSERVATION,),
            )

    def test_class_score_is_not_collision_probability(self) -> None:
        text = describe_p_critical()
        self.assertIn("will this encounter's final tier be Critical", text)
        self.assertIn("not a calibrated probability", text)
        self.assertIn("not a collision probability", text)
        self.assertNotIn("calibrated percentage", P_CRITICAL_DEFINITION)
        forecast = available_forecast(
            tier=Tier.CRITICAL,
            source_observation_id=ObservationId("train", 4),
            source_time_to_tca_days=2.0,
            model_version="upgrade-base",
            p_critical=0.62,
        )
        self.assertEqual(forecast.p_critical, 0.62)
        self.assertIsNone(forecast.predicted_final_log10_pc)
        self.assertIsNone(forecast.predicted_final_pc)
        with self.assertRaises(ContractError):
            Forecast(
                status=ForecastStatus.AVAILABLE,
                forecast_final_tier=Tier.CRITICAL,
                p_critical=0.62,
                predicted_final_log10_pc=0.62,
                predicted_final_pc=None,
                source_observation_id=ObservationId("train", 4),
                source_time_to_tca_days=2.0,
                model_version="upgrade-base",
                reason_codes=(),
            )

    def test_exact_two_day_boundary_and_refusal(self) -> None:
        self.assertTrue(is_early_eligible(2.0))
        self.assertFalse(is_early_eligible(math.nextafter(2.0, 1.0)))
        self.assertFalse(is_early_eligible(-0.1))
        refuse_unsupported_inference(2.0)
        with self.assertRaises(ContractError):
            refuse_unsupported_inference(math.nextafter(2.0, 1.0))

    def test_carried_forward_keeps_source_metadata(self) -> None:
        source = ObservationId("train", 8)
        original = available_forecast(
            tier=Tier.ELEVATED,
            source_observation_id=source,
            source_time_to_tca_days=2.0,
            model_version="upgrade-base",
            p_critical=0.2,
        )
        carried = carry_forward(original)
        self.assertEqual(carried.status, ForecastStatus.CARRIED_FORWARD)
        self.assertEqual(carried.source_observation_id, source)
        self.assertEqual(carried.source_time_to_tca_days, 2.0)
        self.assertIn(ReasonCode.FORECAST_CARRIED_FORWARD, carried.reason_codes)
        self.assertEqual(carried.p_critical, 0.2)
        with self.assertRaises(ContractError):
            Forecast(
                status=ForecastStatus.CARRIED_FORWARD,
                forecast_final_tier=Tier.ELEVATED,
                p_critical=None,
                predicted_final_log10_pc=None,
                predicted_final_pc=None,
                source_observation_id=source,
                source_time_to_tca_days=1.5,
                model_version="upgrade-base",
                reason_codes=(ReasonCode.FORECAST_CARRIED_FORWARD,),
            )

    def test_final_labels_cannot_enter_inference(self) -> None:
        assert_inference_columns(["risk", "miss_distance"], early_messages_only=True)
        with self.assertRaises(ContractError):
            assert_inference_columns(["risk", "final_tier"], early_messages_only=True)
        with self.assertRaises(ContractError):
            assert_inference_columns(["cdm_count", "mission_id"], early_messages_only=True)
        with self.assertRaises(ContractError):
            assert_inference_columns(["risk"], early_messages_only=False)
        self.assertNotIn("final_tier", INFERENCE_FIELDS)

    def test_test_final_outcome_metric_is_unavailable(self) -> None:
        metric = test_final_tier_accuracy()
        self.assertIsNone(metric.value)
        self.assertEqual(metric.state, MetricState.UNAVAILABLE)
        with self.assertRaises(ContractError):
            reject_fabricated_test_accuracy(0.8)


class SelectionTest(unittest.TestCase):
    def test_label_upcoming_and_early_selection(self) -> None:
        rows = [_obs(3, 1.0), _obs(1, -0.2), _obs(2, 2.0), _obs(4, 2.0)]
        self.assertEqual(select_label_observation(rows).observation_id.row_index, 1)
        self.assertEqual(select_upcoming_observation(rows).observation_id.row_index, 3)
        early = select_early_observation(rows)
        self.assertEqual(early.observation_id.row_index, 2)
        self.assertEqual(early.time_to_tca_days, 2.0)
        self.assertIsNone(select_early_observation([_obs(9, 1.9)]))
        self.assertIsNone(select_upcoming_observation([_obs(9, -1.0)]))

    def test_tiny_negative_raw_tca_zero_and_no_upcoming_observation(self) -> None:
        """Events 10630 and 12907 are negative in the raw file and −0 in the workbook."""

        event_10630 = -1.8449074074074083e-05
        event_12907 = -2.2962962962962965e-05
        self.assertLess(event_10630, 0.0)
        self.assertLess(event_12907, 0.0)
        self.assertNotEqual(event_10630, -0.0)
        self.assertFalse((-0.0) < 0.0)

        labelled = [
            _obs(1, event_10630, event=10630),
            _obs(2, 3.0, event=10630),
        ]
        self.assertEqual(select_label_observation(labelled).time_to_tca_days, event_10630)
        self.assertEqual(select_upcoming_observation(labelled).time_to_tca_days, 3.0)

        other = [
            _obs(3, 1.0, event=12907),
            _obs(4, event_12907, event=12907),
        ]
        self.assertEqual(select_label_observation(other).time_to_tca_days, event_12907)
        self.assertEqual(select_upcoming_observation(other).time_to_tca_days, 1.0)

        with_zero = [_obs(5, event_12907, event=8), _obs(6, 0.0, event=8)]
        self.assertEqual(select_label_observation(with_zero).time_to_tca_days, event_12907)
        self.assertEqual(select_upcoming_observation(with_zero).time_to_tca_days, 0.0)
        self.assertEqual(select_upcoming_observation(with_zero).observation_id.row_index, 6)

        no_upcoming = [_obs(7, event_10630, event=9), _obs(8, event_12907, event=9)]
        self.assertEqual(select_label_observation(no_upcoming).time_to_tca_days, event_12907)
        self.assertIsNone(select_upcoming_observation(no_upcoming))


class FixtureTest(unittest.TestCase):
    def test_examples_are_labelled_synthetic_and_cover_forecast_states(self) -> None:
        examples = {item.name: item for item in synthetic_examples()}
        self.assertEqual(set(examples), {"successful", "unable_to_assess", "unavailable", "carried_forward"})
        for example in examples.values():
            self.assertTrue(example.synthetic)
            self.assertIn("synthetic", example.label)
            self.assertEqual(example.item.encounter_id.source, "fixture")
        success = examples["successful"]
        self.assertEqual(success.item.forecast.forecast_final_tier, Tier.CRITICAL)
        self.assertIsNone(success.item.forecast.predicted_final_log10_pc)
        incomplete = examples["unable_to_assess"]
        self.assertIsNone(incomplete.item.forecast.forecast_final_tier)
        self.assertEqual(incomplete.item.current_rule_tier, Tier.CRITICAL)
        carried = examples["carried_forward"].item.forecast
        self.assertEqual(carried.source_observation_id, ObservationId("fixture", 40))
        self.assertEqual(carried.source_time_to_tca_days, 2.0)
        self.assertLess(examples["carried_forward"].item.time_to_tca_days, 2.0)


if __name__ == "__main__":
    unittest.main()
