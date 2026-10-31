"""SG-03.1 prediction validation and join checks (J1-J21). Synthetic records only."""

from __future__ import annotations

import random
import unittest

from contracts.forecast import ForecastStatus
from contracts.ids import EncounterId
from evaluation.cohorts import PRIMARY, UNABLE_TO_ASSESS, build_cohorts
from evaluation.errors import EvaluationInputError
from evaluation.join import join
from evaluation.labels import OrganiserLabel, RawMessage, SplitRow, derive_labels
from evaluation.predictions import parse_prediction_rows, validate_predictions

CRITICAL = (-3.0, 20000.0)
ELEVATED = (-9.0, 3000.0)
SAFE = (-9.0, 20000.0)

# Same hand-checked world as test_evaluation_cohorts. Validation primary: train:1, :5, :10.
WORLD_MESSAGES = [
    (0, 1, 3.0, SAFE), (1, 1, 0.5, CRITICAL),
    (2, 2, 2.5, SAFE), (3, 2, 6.0, SAFE),
    (4, 3, 0.4, SAFE), (5, 3, 1.7, SAFE),
    (6, 4, 4.0, ELEVATED), (7, 4, -0.5, ELEVATED),
    (8, 5, 5.0, CRITICAL), (9, 5, 1.0, SAFE),
    (10, 10, 2.1, ELEVATED), (11, 10, 0.2, CRITICAL),
]
WORLD_LABELS = [
    (1, "Critical", True, 0.5, "validation", False),
    (2, "Safe", True, 2.5, "validation", True),
    (3, "Safe", False, 0.4, None, False),
    (4, "Elevated", True, -0.5, "train", False),
    (5, "Safe", True, 1.0, "validation", False),
    (10, "Critical", True, 0.2, "validation", False),
]
UPGRADE = "upgrade_base"
PERSISTENCE = "persistence"


def labels():
    return derive_labels(
        [RawMessage("train", row, event, tca, *inputs) for row, event, tca, inputs in WORLD_MESSAGES],
        [OrganiserLabel(e, t, "yes" if u else "no", f) for e, t, u, f, _, _ in WORLD_LABELS],
        [SplitRow(f"train:{e}", p, t, early) for e, t, _, _, p, early in WORLD_LABELS if p],
    )


def row(event, tier, persistence, upgraded, p, source_row, tca, **changes) -> dict:
    base = {
        "model_id": UPGRADE,
        "model_version": "upgrade_base-test",
        "encounter_id": f"train:{event}",
        "forecast_status": "available",
        "forecast_final_tier": tier,
        "persistence_tier": persistence,
        "upgraded": upgraded,
        "p_critical": p,
        "source_observation_id": f"train:{source_row}",
        "source_time_to_tca_days": tca,
    }
    base.update(changes)
    return base


def upgrade_rows() -> list[dict]:
    """Valid upgrade-model rows for the validation primary cohort."""

    return [
        row(1, "Critical", "Safe", True, 0.9, 0, 3.0),          # upgraded from Safe
        row(5, "Critical", "Critical", False, 0.7, 8, 5.0),     # persistence already Critical
        row(10, "Elevated", "Elevated", False, 0.1, 10, 2.1),
    ]


def persistence_rows() -> list[dict]:
    rows = []
    for item in upgrade_rows():
        item = dict(item, model_id=PERSISTENCE, model_version="persistence-test", p_critical=None,
                    upgraded=None, forecast_final_tier=item["persistence_tier"])
        rows.append(item)
    return rows


def unable_row(event: int) -> dict:
    return {"model_id": UPGRADE, "model_version": "upgrade_base-test", "encounter_id": f"train:{event}",
            "forecast_status": "unable_to_assess", "reason_codes": ["no_eligible_observation"]}


class Fixture(unittest.TestCase):
    def setUp(self) -> None:
        self.labels = labels()
        self.cohorts = build_cohorts(self.labels, "validation")
        self.primary = self.cohorts[PRIMARY]

    def validate(self, rows, *, cohort=None, model_id=UPGRADE, score_required=True, strict=True):
        return validate_predictions(
            parse_prediction_rows(rows), self.labels, cohort or self.primary,
            model_id=model_id, score_required=score_required, strict=strict,
        )

    def assertFails(self, code: str, call, ids: tuple[str, ...] | None = None) -> EvaluationInputError:
        with self.assertRaises(EvaluationInputError) as caught:
            call()
        self.assertIn(code, caught.exception.codes, str(caught.exception))
        if ids is not None:
            self.assertEqual(caught.exception.ids(code), ids)
        return caught.exception


class ValidRunTest(Fixture):
    def test_upgrade_and_persistence_runs_join(self) -> None:
        for rows, model_id, scored in ((upgrade_rows(), UPGRADE, True), (persistence_rows(), PERSISTENCE, False)):
            result = self.validate(rows, model_id=model_id, score_required=scored)
            self.assertTrue(result.complete)
            joined = join(self.labels, result, self.primary)
            self.assertEqual([str(r.encounter_id) for r in joined], ["train:1", "train:5", "train:10"])
            self.assertEqual([r.label.final_tier.value for r in joined], ["Critical", "Safe", "Critical"])
        self.assertEqual(self.validate(upgrade_rows()).model_version, "upgrade_base-test")


class RecordFailureTest(Fixture):
    def test_J1_malformed_ids(self) -> None:
        self.assertFails("malformed_id", lambda: parse_prediction_rows([row(1, "Critical", "Safe", True, 0.9, 0, 3.0,
                                                                            encounter_id="train57")]))
        self.assertFails("malformed_id", lambda: parse_prediction_rows([row(1, "Critical", "Safe", True, 0.9, 0, 3.0,
                                                                            source_observation_id="row-0")]))

    def test_J2_wrong_source(self) -> None:
        rows = upgrade_rows() + [row(1, "Critical", "Safe", True, 0.9, 0, 3.0, encounter_id="test:1",
                                     source_observation_id="test:0")]
        self.assertFails("wrong_source", lambda: self.validate(rows), ("test:1",))

    def test_J3_observation_from_another_source(self) -> None:
        rows = upgrade_rows()
        rows[0]["source_observation_id"] = "test:0"
        self.assertFails("source_mismatch", lambda: self.validate(rows), ("train:1",))

    def test_J4_duplicate_prediction_even_if_identical(self) -> None:
        rows = upgrade_rows() + [upgrade_rows()[1]]
        self.assertFails("duplicate_prediction", lambda: self.validate(rows), ("train:5",))

    def test_J5_duplicate_label_is_rejected_upstream(self) -> None:
        with self.assertRaises(EvaluationInputError) as caught:
            derive_labels([RawMessage("train", 0, 1, 3.0, *SAFE)],
                          [OrganiserLabel(1, "Safe", "yes", 3.0)] * 2, [SplitRow("train:1", "validation", "Safe", True)])
        self.assertEqual(caught.exception.ids("duplicate_label"), ("train:1",))

    def test_J6_missing_prediction_is_reported_never_dropped(self) -> None:
        rows = upgrade_rows()[:1]
        self.assertFails("missing_prediction", lambda: self.validate(rows), ("train:5", "train:10"))
        partial = self.validate(rows, strict=False)
        self.assertEqual([str(key) for key in partial.missing], ["train:5", "train:10"])
        self.assertFalse(partial.complete)
        self.assertFalse(partial.strict)
        self.assertTrue(self.validate(upgrade_rows()).strict)
        self.assertEqual(partial.unable_to_assess, ())
        self.assertFails("missing_prediction", lambda: join(self.labels, partial, self.primary),
                         ("train:5", "train:10"))

    def test_J7_unexpected_predictions(self) -> None:
        early = row(2, "Safe", "Safe", False, 0.1, 2, 2.5)  # final_is_early: not in primary
        unknown = row(99, "Safe", "Safe", False, 0.1, 50, 3.0)
        self.assertFails("unexpected_prediction", lambda: self.validate(upgrade_rows() + [early, unknown]),
                         ("train:2", "train:99"))

    def test_J8_status_must_match_eligibility(self) -> None:
        rows = upgrade_rows()
        rows[2] = unable_row(10)
        self.assertFails("status_eligibility_mismatch", lambda: self.validate(rows), ("train:10",))
        assessed_unusable = row(3, "Safe", "Safe", False, 0.1, 5, 1.7)
        self.assertFails("invalid_forecast", lambda: parse_prediction_rows([assessed_unusable]))  # contract: TCA < 2
        self.assertFails("status_eligibility_mismatch",
                         lambda: self.validate([dict(unable_row(3), persistence_tier="Safe")],
                                               cohort=self.cohorts[UNABLE_TO_ASSESS]), ("train:3",))

    def test_unable_to_assess_must_mean_no_eligible_message(self) -> None:
        cohort = self.cohorts[UNABLE_TO_ASSESS]
        failure = dict(unable_row(3), reason_codes=["no_eligible_observation", "model_unavailable"])
        self.assertFails("unable_to_assess_reason", lambda: self.validate([failure], cohort=cohort), ("train:3",))
        silent = dict(unable_row(3), reason_codes=[])
        self.assertFails("unable_to_assess_reason", lambda: self.validate([silent], cohort=cohort), ("train:3",))
        rows = upgrade_rows()
        rows[0] = unable_row(1)  # eligible encounter: a failure cannot pass as "no early message"
        self.assertFails("status_eligibility_mismatch", lambda: self.validate(rows), ("train:1",))

    def test_explicit_unable_to_assess_is_distinct_from_absent(self) -> None:
        cohort = self.cohorts[UNABLE_TO_ASSESS]
        explicit = self.validate([unable_row(3)], cohort=cohort)
        self.assertEqual(explicit.unable_to_assess, (EncounterId("train", 3),))
        self.assertEqual(explicit.missing, ())
        absent = self.validate([], cohort=cohort, strict=False)
        self.assertEqual(absent.unable_to_assess, ())
        self.assertEqual(absent.missing, (EncounterId("train", 3),))
        self.assertFails("missing_prediction", lambda: self.validate([], cohort=cohort), ("train:3",))

    def test_J9_invalid_tier(self) -> None:
        self.assertFails("invalid_tier", lambda: parse_prediction_rows([row(1, "critical", "Safe", True, 0.9, 0, 3.0)]))
        self.assertFails("invalid_forecast",
                         lambda: parse_prediction_rows([row(1, None, "Safe", False, 0.9, 0, 3.0)]))

    def test_J10_unavailable_inference_cannot_be_evaluated(self) -> None:
        rows = upgrade_rows()
        rows[0] = {"model_id": UPGRADE, "encounter_id": "train:1", "forecast_status": "unavailable",
                   "reason_codes": ["model_unavailable"]}
        self.assertFails("inference_unavailable", lambda: self.validate(rows), ("train:1",))

    def test_J11_carried_forward_needs_the_same_eligible_provenance(self) -> None:
        reasons = {"forecast_status": "carried_forward", "reason_codes": ["forecast_carried_forward"]}
        rows = upgrade_rows()
        rows[0].update(reasons)
        result = self.validate(rows)
        self.assertIs(result.predictions[EncounterId("train", 1)].forecast.status, ForecastStatus.CARRIED_FORWARD)
        moved = upgrade_rows()
        moved[0].update(reasons, source_observation_id="train:1", source_time_to_tca_days=0.5)
        self.assertFails("invalid_forecast", lambda: parse_prediction_rows(moved))  # contract: source TCA < 2
        earlier = upgrade_rows()
        earlier[1].update(reasons, source_observation_id="train:8", source_time_to_tca_days=5.5)
        self.assertFails("wrong_source_observation", lambda: self.validate(earlier), ("train:5",))
        without_reason = upgrade_rows()
        without_reason[0]["forecast_status"] = "carried_forward"
        self.assertFails("invalid_forecast", lambda: parse_prediction_rows(without_reason))

    def test_J12_source_must_be_latest_raw_eligible_message(self) -> None:
        rows = upgrade_rows()
        rows[1]["source_observation_id"] = "train:2"  # belongs to train:2
        rows[2]["source_time_to_tca_days"] = 2.2      # right row, wrong TCA
        self.assertFails("wrong_source_observation", lambda: self.validate(rows), ("train:5", "train:10"))

    def test_J13_score_presence_follows_the_model_kind(self) -> None:
        rows = persistence_rows()
        rows[0]["p_critical"] = 0.4
        self.assertFails("invalid_score", lambda: self.validate(rows, model_id=PERSISTENCE, score_required=False),
                         ("train:1",))
        rows = upgrade_rows()
        rows[0]["p_critical"] = None
        self.assertFails("invalid_score", lambda: self.validate(rows), ("train:1",))
        rows = upgrade_rows()
        rows[0]["p_critical"] = 1.5
        self.assertFails("invalid_score", lambda: self.validate(rows), ("train:1",))
        rows[0]["p_critical"] = "nan"
        self.assertFails("invalid_score", lambda: parse_prediction_rows(rows))

    def test_J14_upgrade_flag_consistency(self) -> None:
        rows = upgrade_rows()
        rows[2]["upgraded"] = True  # Elevated is not an upgrade to Critical
        rows[0]["upgraded"] = False  # tier changed without an upgrade
        self.assertFails("invalid_upgrade", lambda: self.validate(rows), ("train:1", "train:10"))
        rows = upgrade_rows()
        rows[0]["upgraded"] = None
        self.assertFails("invalid_upgrade", lambda: self.validate(rows), ("train:1",))
        rows[0]["upgraded"] = "yes"
        self.assertFails("invalid_upgrade", lambda: parse_prediction_rows(rows))

    def test_J15_downgrade_is_rejected(self) -> None:
        rows = upgrade_rows()
        rows[1]["forecast_final_tier"] = "Elevated"
        self.assertFails("downgrade", lambda: self.validate(rows), ("train:5",))

    def test_J16_mixed_model_versions(self) -> None:
        rows = upgrade_rows()
        rows[2]["model_version"] = "upgrade_base-other"
        self.assertFails("mixed_model_version", lambda: self.validate(rows),
                         ("upgrade_base-other", "upgrade_base-test"))

    def test_versions_on_any_status_cannot_mix_runs(self) -> None:
        unusable = derive_labels(
            [RawMessage("train", 0, 3, 0.4, *SAFE), RawMessage("train", 1, 6, 1.2, *SAFE)],
            [OrganiserLabel(3, "Safe", "no", 0.4), OrganiserLabel(6, "Safe", "no", 1.2)],
            [],
        )
        cohort = build_cohorts(unusable, "validation")[UNABLE_TO_ASSESS]
        rows = [unable_row(3), dict(unable_row(6), model_version="upgrade_base-other")]
        with self.assertRaises(EvaluationInputError) as caught:
            validate_predictions(parse_prediction_rows(rows), unusable, cohort, model_id=UPGRADE, score_required=True)
        self.assertEqual(caught.exception.ids("mixed_model_version"), ("upgrade_base-other", "upgrade_base-test"))
        rows = [unable_row(3), dict(unable_row(6), model_version=None)]  # contract allows a null version here
        result = validate_predictions(parse_prediction_rows(rows), unusable, cohort, model_id=UPGRADE,
                                      score_required=True)
        self.assertEqual(result.model_version, "upgrade_base-test")

    def test_mixed_model_checksums(self) -> None:
        rows = upgrade_rows()
        rows[0]["model_sha256"] = "aa"
        rows[1]["model_sha256"] = "bb"
        self.assertFails("mixed_model_sha256", lambda: self.validate(rows), ("aa", "bb"))

    def test_J17_other_record_failures(self) -> None:
        rows = upgrade_rows()
        rows[0]["model_id"] = PERSISTENCE
        rows[1]["persistence_tier"] = "Elevated"  # rule tier of train:8 is Critical
        rows[2]["model_version"] = None
        error = self.assertFails("wrong_model", lambda: self.validate(rows), ("train:1",))
        self.assertEqual(error.ids("persistence_mismatch"), ("train:5",))
        self.assertEqual(error.ids("missing_model_version"), ("train:10",))
        self.assertIn("missing_prediction", error.codes)  # the wrong-model row does not count
        self.assertFails("missing_field", lambda: parse_prediction_rows([{"model_id": UPGRADE, "encounter_id": "train:1"}]))
        self.assertFails("invalid_status",
                         lambda: parse_prediction_rows([row(1, "Critical", "Safe", True, 0.9, 0, 3.0,
                                                            forecast_status="assessed")]))
        self.assertFails("unknown_column",
                         lambda: parse_prediction_rows([row(1, "Critical", "Safe", True, 0.9, 0, 3.0, tier_name="x")]),
                         ("tier_name",))


class JoinInvariantTest(Fixture):
    def test_J18_row_order_does_not_change_results(self) -> None:
        reference = join(self.labels, self.validate(upgrade_rows()), self.primary)
        for seed in range(5):
            rows = upgrade_rows()
            random.Random(seed).shuffle(rows)
            self.assertEqual(join(self.labels, self.validate(rows), self.primary), reference)

    def test_J19_train_and_test_ids_never_match(self) -> None:
        self.assertNotEqual(EncounterId.parse("train:10"), EncounterId.parse("test:10"))
        rows = upgrade_rows()
        rows[2].update(encounter_id="test:10", source_observation_id="test:10")
        error = self.assertFails("wrong_source", lambda: self.validate(rows), ("test:10",))
        self.assertEqual(error.ids("missing_prediction"), ("train:10",))

    def test_J20_observation_id_is_not_an_encounter_id(self) -> None:
        rows = upgrade_rows()
        rows[1]["source_observation_id"] = "train:5"  # row 5 belongs to encounter train:3
        rows[1]["source_time_to_tca_days"] = 5.0
        self.assertFails("wrong_source_observation", lambda: self.validate(rows), ("train:5",))

    def test_J21_label_columns_are_rejected_on_the_prediction_side(self) -> None:
        rows = upgrade_rows()
        rows[0]["final_tier"] = "Critical"
        rows[1]["final_is_early"] = False
        rows[2]["partition"] = "validation"
        self.assertFails("label_column_in_predictions", lambda: parse_prediction_rows(rows),
                         ("final_is_early", "final_tier", "partition"))

    def test_join_rejects_a_set_built_for_another_cohort(self) -> None:
        result = self.validate(upgrade_rows())
        self.assertFails("cohort_mismatch", lambda: join(self.labels, result, self.cohorts["all_usable"]))


if __name__ == "__main__":
    unittest.main()
