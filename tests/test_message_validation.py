"""SG-02.1: message validation, raw cutoff, identity, and missing-versus-invalid.

Run from the repository root:

    python3 -m unittest tests.test_message_validation

RealDataTest is optional. It is skipped, not passed, unless SG_DATA_DIR names a
directory containing train_data.csv and test_data.csv.
"""

from __future__ import annotations

import csv
import math
import os
import unittest
from fractions import Fraction
from pathlib import Path

from backend.message_validation import (
    FIELD_UNITS,
    REQUIRED_FIELDS,
    Issue,
    IssueKind,
    MessageStatus,
    validate_message,
    validate_rows,
)

ROW = {
    "event_id": "57",
    "time_to_tca": "3.2976117476851856",
    "mission_id": "5",
    "risk": "-7.25",
    "max_risk_estimate": "-5.1",
    "miss_distance": "12439.0",
    "relative_speed": "9876.0",
    "relative_position_r": "-120.5",
    "relative_position_t": "8000.0",
    "relative_position_n": "-3000.25",
    "c_sigma_r": "68.4287",
    "t_sigma_r": "4.76426",
    "F10": "72.0",
    "AP": "6.0",
    "c_object_type": "DEBRIS",
}


def check(source: str = "train", row_index: int = 1234, **changes: object):
    return validate_message({**ROW, **changes}, source=source, row_index=row_index)


class ValidMessageTest(unittest.TestCase):
    def test_complete_row_is_valid(self) -> None:
        result = check()
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertEqual(result.issues, ())
        self.assertEqual(result.values["risk"], -7.25)
        self.assertEqual(result.values["miss_distance"], 12439.0)
        self.assertEqual(result.values["c_object_type"], "DEBRIS")

    def test_raw_time_precision_is_kept(self) -> None:
        text = "2.000213078703704"
        result = check(time_to_tca=text)
        self.assertEqual(result.time_to_tca_days, float(text))
        self.assertNotEqual(result.time_to_tca_days, round(float(text), 4))

    def test_minus_thirty_is_a_valid_log10_pc(self) -> None:
        result = check(risk="-30")
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertEqual(result.values["risk"], -30.0)

    def test_range_edges_are_valid(self) -> None:
        for changes in ({"risk": "0"}, {"miss_distance": "0"}, {"relative_speed": "0"}):
            self.assertIs(check(**changes).status, MessageStatus.VALID, changes)

    def test_label_and_prediction_columns_are_never_read(self) -> None:
        result = check(
            final_tier="Critical",
            final_risk_log10_pc="-1.0",
            final_miss_distance_m="10",
            final_time_to_tca_days="0.1",
            p_critical="0.99",
            predicted_tier="Critical",
        )
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertEqual(result.values["risk"], -7.25)
        self.assertFalse(any(key.startswith("final_") for key in result.values))
        self.assertNotIn("p_critical", result.values)
        self.assertNotIn("predicted_tier", result.values)

    def test_model_score_does_not_stand_in_for_supplied_risk(self) -> None:
        result = check(risk="", p_critical="0.99")
        self.assertIs(result.status, MessageStatus.MISSING_REQUIRED)
        self.assertNotIn("risk", result.values)


class TimingTest(unittest.TestCase):
    def test_exactly_two_days_is_eligible(self) -> None:
        for value in ("2.0", "2", 2.0, 2):
            self.assertTrue(check(time_to_tca=value).meets_inference_cutoff, value)

    def test_just_below_two_days_is_not_eligible(self) -> None:
        just_below = math.nextafter(2.0, -math.inf)
        for value in (repr(just_below), just_below, "1.99995"):
            result = check(time_to_tca=value)
            self.assertIs(result.status, MessageStatus.VALID)
            self.assertFalse(result.meets_inference_cutoff, value)
            self.assertTrue(result.meets_upcoming_cutoff)

    def test_tiny_negative_time_stays_negative(self) -> None:
        # Raw event 10630: about -1.6 s, which the workbook displays as -0.0.
        result = check(time_to_tca="-1.8449074074074083e-05")
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertLess(result.time_to_tca_days, 0)
        self.assertFalse(result.meets_upcoming_cutoff)
        self.assertFalse(result.meets_inference_cutoff)

    def test_negative_time_is_a_valid_historical_observation(self) -> None:
        result = check(time_to_tca="-0.1498")
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertFalse(result.meets_upcoming_cutoff)

    def test_zero_is_upcoming(self) -> None:
        for value in ("0", "0.0", "-0.0"):
            result = check(time_to_tca=value)
            self.assertTrue(result.meets_upcoming_cutoff, value)
            self.assertFalse(result.meets_inference_cutoff, value)

    def test_unusable_time_gives_unknown_timing(self) -> None:
        for value in ("", "nan", True):
            result = check(time_to_tca=value)
            self.assertIsNone(result.meets_inference_cutoff, value)
            self.assertIsNone(result.meets_upcoming_cutoff, value)

    def test_timing_does_not_override_status(self) -> None:
        result = check(time_to_tca="3.0", risk="0.5")
        self.assertIs(result.status, MessageStatus.INVALID)
        self.assertTrue(result.meets_inference_cutoff)

    def test_early_row_with_bad_required_data_is_not_inference_ready(self) -> None:
        cases = (
            {"risk": "0.5"},
            {"risk": ""},
            {"miss_distance": "abc"},
            {"miss_distance": None},
            {"event_id": "57.0"},
            {"event_id": ""},
        )
        for changes in cases:
            result = check(time_to_tca="3.0", **changes)
            self.assertTrue(result.meets_inference_cutoff, changes)
            self.assertIsNot(result.status, MessageStatus.VALID, changes)
            self.assertFalse(result.inference_ready, changes)

    def test_inference_ready_needs_both_cutoff_and_valid_status(self) -> None:
        self.assertTrue(check(time_to_tca="2.0").inference_ready)
        self.assertFalse(check(time_to_tca="1.5").inference_ready)
        self.assertFalse(check(time_to_tca="").inference_ready)

    def test_optional_problems_do_not_block_inference_readiness(self) -> None:
        result = check(time_to_tca="3.0", F10="", c_sigma_r="63781363.00000001")
        self.assertTrue(result.inference_ready)


class MissingAndInvalidTest(unittest.TestCase):
    def test_missing_required_field(self) -> None:
        for field in REQUIRED_FIELDS + ("event_id",):
            for empty in ("", None):
                result = check(**{field: empty})
                self.assertIs(result.status, MessageStatus.MISSING_REQUIRED, (field, empty))
                self.assertEqual(result.missing_fields, (field,))
                self.assertEqual(result.invalid_fields, ())
                self.assertNotIn(field, result.values)

    def test_absent_column_counts_as_missing(self) -> None:
        row = {key: value for key, value in ROW.items() if key != "miss_distance"}
        result = validate_message(row, source="train", row_index=0)
        self.assertIs(result.status, MessageStatus.MISSING_REQUIRED)

    def test_malformed_text_is_invalid_not_coerced(self) -> None:
        for text in ("nan", "NaN", "inf", "-inf", "Infinity", "1_000", "-7,5", "abc", "0x10",
                     "1e", ".", "-", "--7", "   ", "- 7.0", "-7.0\n", "-7.0 x",
                     "٣", "-٣.5", "-7 000"):
            result = check(risk=text)
            self.assertIs(result.status, MessageStatus.INVALID, text)
            self.assertIn(Issue("risk", IssueKind.MALFORMED), result.issues, text)
            self.assertNotIn("risk", result.values, text)

    def test_out_of_range_required_values(self) -> None:
        cases = {
            "risk": "0.0001",
            "miss_distance": "-1",
        }
        for field, value in cases.items():
            result = check(**{field: value})
            self.assertIs(result.status, MessageStatus.INVALID, field)
            self.assertIn(Issue(field, IssueKind.OUT_OF_RANGE), result.issues)

    def test_invalid_wins_over_missing(self) -> None:
        result = check(risk="", miss_distance="abc")
        self.assertIs(result.status, MessageStatus.INVALID)
        self.assertEqual(result.missing_fields, ("risk",))
        self.assertEqual(result.invalid_fields, ("miss_distance",))


class NumericTypeTest(unittest.TestCase):
    def test_real_numbers_are_accepted(self) -> None:
        for value in (-7, -7.25, Fraction(-29, 4)):
            result = check(risk=value)
            self.assertIs(result.status, MessageStatus.VALID, value)
            self.assertEqual(result.values["risk"], float(value))

    def test_rejected_numeric_inputs(self) -> None:
        cases = {
            True: IssueKind.BOOLEAN,
            False: IssueKind.BOOLEAN,
            math.nan: IssueKind.NOT_FINITE,
            math.inf: IssueKind.NOT_FINITE,
            -math.inf: IssueKind.NOT_FINITE,
            10**400: IssueKind.NOT_FINITE,
            b"-7.0": IssueKind.UNSUPPORTED_TYPE,
        }
        for value, kind in cases.items():
            result = check(miss_distance=value)
            self.assertIs(result.status, MessageStatus.INVALID, value)
            self.assertIn(Issue("miss_distance", kind), result.issues, value)

    def test_surrounding_spaces_and_tabs_are_ordinary_parsing(self) -> None:
        for text in (" -7.25", "-7.25 ", "\t-7.25\t", "  -7.25e0  "):
            result = check(risk=text)
            self.assertIs(result.status, MessageStatus.VALID, repr(text))
            self.assertEqual(result.values["risk"], -7.25, repr(text))

    def test_unsupported_container_type(self) -> None:
        result = check(time_to_tca=[3.0])
        self.assertIn(Issue("time_to_tca", IssueKind.UNSUPPORTED_TYPE), result.issues)


class IdentityTest(unittest.TestCase):
    def test_keys_are_source_qualified(self) -> None:
        train = check(source="train", row_index=1234)
        test = check(source="test", row_index=1234)
        self.assertEqual((train.observation_key, train.encounter_key), ("train:1234", "train:57"))
        self.assertEqual((test.observation_key, test.encounter_key), ("test:1234", "test:57"))
        self.assertNotEqual(train.encounter_key, test.encounter_key)

    def test_row_and_event_are_different_keys(self) -> None:
        result = check(row_index=57)
        self.assertEqual(result.observation_key, "train:57")
        self.assertEqual(result.encounter_key, "train:57")
        self.assertEqual((result.row_index, result.event_id), (57, 57))

    def test_event_id_parses_ordinary_integers(self) -> None:
        # Leading zeros and padding read as the same integer, as contracts.ids and pandas do.
        for value in ("57", "057", " 57", "57\t", 57):
            result = check(event_id=value)
            self.assertEqual(result.event_id, 57, repr(value))
            self.assertEqual(result.encounter_key, "train:57", repr(value))
        self.assertEqual(check(event_id="0").event_id, 0)
        self.assertEqual(check(event_id="00").event_id, 0)

    def test_event_id_rejects_non_integers(self) -> None:
        cases = {
            "57.0": IssueKind.MALFORMED,
            "-1": IssueKind.MALFORMED,
            "+57": IssueKind.MALFORMED,
            "5 7": IssueKind.MALFORMED,
            "   ": IssueKind.MALFORMED,
            "٣": IssueKind.MALFORMED,
            "5e1": IssueKind.MALFORMED,
            True: IssueKind.BOOLEAN,
            57.0: IssueKind.UNSUPPORTED_TYPE,
            -3: IssueKind.OUT_OF_RANGE,
        }
        for value, kind in cases.items():
            result = check(event_id=value)
            self.assertIs(result.status, MessageStatus.INVALID, value)
            self.assertIn(Issue("event_id", kind), result.issues, value)
            self.assertIsNone(result.encounter_key, value)
            self.assertEqual(result.observation_key, "train:1234")

    def test_caller_identity_errors_raise(self) -> None:
        for source in ("validation", "fixture", "Train", ""):
            with self.assertRaises(ValueError):
                validate_message(ROW, source=source, row_index=0)
        for row_index in (-1, True, 1.0, "3"):
            with self.assertRaises(ValueError):
                validate_message(ROW, source="train", row_index=row_index)

    def test_validate_rows_numbers_rows_from_zero(self) -> None:
        results = validate_rows([ROW, {**ROW, "event_id": "58"}], source="test")
        self.assertEqual([r.observation_key for r in results], ["test:0", "test:1"])
        self.assertEqual([r.encounter_key for r in results], ["test:57", "test:58"])


class EvidencePreservationTest(unittest.TestCase):
    """A bad required field must not discard the other required field's value."""

    def test_valid_risk_kept_when_distance_missing_or_invalid(self) -> None:
        for distance in ("", None, "abc", "-1", "nan"):
            result = check(risk="-3.0", miss_distance=distance)
            self.assertIn(result.status, (MessageStatus.MISSING_REQUIRED, MessageStatus.INVALID))
            self.assertEqual(result.values["risk"], -3.0, distance)
            self.assertNotIn("miss_distance", result.values)

    def test_valid_distance_kept_when_risk_missing_or_invalid(self) -> None:
        for risk in ("", None, "abc", "0.5", True):
            result = check(risk=risk, miss_distance="500")
            self.assertEqual(result.values["miss_distance"], 500.0, risk)
            self.assertNotIn("risk", result.values)

    def test_valid_values_kept_when_identity_is_bad(self) -> None:
        result = check(event_id="57.0")
        self.assertIs(result.status, MessageStatus.INVALID)
        self.assertEqual(result.values["risk"], -7.25)
        self.assertEqual(result.values["miss_distance"], 12439.0)


try:
    from backend.risk_classification import Tier, classify_risk
except ImportError:  # PR #20 not merged into this checkout
    classify_risk = None


@unittest.skipIf(classify_risk is None, "backend.risk_classification (SG-02.2, PR #20) is not in this checkout")
class RiskClassificationCompatibilityTest(unittest.TestCase):
    """Validated values feed SG-02.2 unchanged; classification stays in SG-02.2."""

    def classify(self, result):
        return classify_risk(result.values.get("risk"), result.values.get("miss_distance"))

    def test_critical_trigger_survives_missing_distance(self) -> None:
        result = check(risk="-3.0", miss_distance="")
        self.assertIs(result.status, MessageStatus.MISSING_REQUIRED)
        tier = self.classify(result)
        self.assertIs(tier.tier, Tier.CRITICAL)
        self.assertFalse(tier.is_complete)

    def test_critical_trigger_survives_invalid_risk(self) -> None:
        result = check(risk="abc", miss_distance="500")
        self.assertIs(result.status, MessageStatus.INVALID)
        tier = self.classify(result)
        self.assertIs(tier.tier, Tier.CRITICAL)
        self.assertFalse(tier.is_complete)

    def test_non_critical_evidence_with_a_gap_gives_no_tier(self) -> None:
        for changes in ({"risk": "-5.0", "miss_distance": ""}, {"risk": "", "miss_distance": "3000"}):
            self.assertIsNone(self.classify(check(**changes)).tier, changes)

    def test_complete_valid_row_classifies_completely(self) -> None:
        tier = self.classify(check(risk="-30", miss_distance="12439"))
        self.assertIs(tier.tier, Tier.SAFE)
        self.assertTrue(tier.is_complete)

    def test_number_objects_are_accepted_by_both_or_neither(self) -> None:
        candidates = (-7, -7.25, Fraction(-29, 4), 0, 0.0, 0.5, -0.0, True, False,
                      math.nan, math.inf, -math.inf, 10**400, "-7.25", None, [1.0])
        for value in candidates:
            validated = "risk" in check(risk=value).values
            classified = classify_risk(value, 12439.0).is_complete
            if isinstance(value, str):
                # Text is parsed here; SG-02.2 takes numbers only.
                self.assertTrue(validated)
                self.assertFalse(classified)
            else:
                self.assertEqual(validated, classified, repr(value))


class OptionalFieldTest(unittest.TestCase):
    def test_missing_optional_is_flagged_not_imputed(self) -> None:
        result = check(F10="", AP="", c_sigma_r="")
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertEqual(result.missing_fields, ("c_sigma_r", "F10", "AP"))
        for field in ("F10", "AP", "c_sigma_r"):
            self.assertNotIn(field, result.values)

    def test_sigma_placeholder_is_flagged_and_withheld(self) -> None:
        result = check(c_sigma_r="63781363.00000001", t_sigma_r="63781360.91367132")
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertIn(Issue("c_sigma_r", IssueKind.PLACEHOLDER), result.issues)
        self.assertIn(Issue("t_sigma_r", IssueKind.PLACEHOLDER), result.issues)
        self.assertNotIn("c_sigma_r", result.values)
        self.assertEqual(result.invalid_fields, ())

    def test_placeholder_threshold_is_inclusive(self) -> None:
        self.assertIn(Issue("c_sigma_r", IssueKind.PLACEHOLDER), check(c_sigma_r="6.378136e7").issues)
        value = math.nextafter(6.378136e7, 0)
        self.assertEqual(check(c_sigma_r=value).values["c_sigma_r"], value)

    def test_bad_optional_is_recorded_without_failing_the_message(self) -> None:
        result = check(F10="abc", c_sigma_r="-0.1", relative_speed="-5", c_object_type=3)
        self.assertIs(result.status, MessageStatus.VALID)
        self.assertEqual(result.invalid_fields, ("relative_speed", "c_sigma_r", "F10", "c_object_type"))

    def test_unconfirmed_definitions_get_finiteness_check_only(self) -> None:
        result = check(F10="-1", AP="-1", max_risk_estimate="2.5")
        self.assertEqual(result.invalid_fields, ())

    def test_units_follow_the_organisers_and_sigma_is_not_confidence(self) -> None:
        self.assertEqual(FIELD_UNITS["miss_distance"], "m")
        self.assertEqual(FIELD_UNITS["relative_speed"], "m/s")
        self.assertEqual(FIELD_UNITS["time_to_tca"], "days")
        for field in ("c_sigma_r", "t_sigma_r"):
            self.assertIn("unconfirmed", FIELD_UNITS[field])
            self.assertNotIn("confidence", FIELD_UNITS[field])


def _data_dir() -> Path | None:
    directory = os.environ.get("SG_DATA_DIR")
    if directory and (Path(directory) / "train_data.csv").is_file():
        return Path(directory)
    return None


DATA_DIR = _data_dir()


@unittest.skipIf(DATA_DIR is None, "set SG_DATA_DIR to a directory with train_data.csv and test_data.csv")
class RealDataTest(unittest.TestCase):
    """Optional smoke check. Expected counts were measured from the raw CSVs."""

    def _summarise(self, source: str) -> dict[str, object]:
        with (DATA_DIR / f"{source}_data.csv").open(newline="") as handle:
            results = validate_rows(csv.DictReader(handle), source=source)
        eligible = {r.encounter_key for r in results if r.meets_inference_cutoff}
        upcoming = {r.encounter_key for r in results if r.meets_upcoming_cutoff}
        encounters = {r.encounter_key for r in results}
        issues = [issue for r in results for issue in r.issues]
        return {
            "rows": len(results),
            "statuses": {r.status for r in results},
            "encounters": len(encounters),
            "with_eligible": len(eligible),
            "without_upcoming": len(encounters - upcoming),
            "negative_rows": sum(1 for r in results if r.meets_upcoming_cutoff is False),
            "missing": {f: sum(1 for i in issues if i == Issue(f, IssueKind.MISSING)) for f in ("F10", "AP", "c_sigma_r")},
            "placeholders": {f: sum(1 for i in issues if i == Issue(f, IssueKind.PLACEHOLDER)) for f in ("c_sigma_r", "t_sigma_r")},
            "invalid": sum(1 for r in results if r.invalid_fields),
        }

    def test_train(self) -> None:
        summary = self._summarise("train")
        self.assertEqual(summary["rows"], 162634)
        self.assertEqual(summary["statuses"], {MessageStatus.VALID})
        self.assertEqual(summary["encounters"], 13154)
        self.assertEqual(summary["with_eligible"], 11942)
        self.assertEqual(summary["without_upcoming"], 11)
        self.assertEqual(summary["negative_rows"], 391)
        self.assertEqual(summary["missing"], {"F10": 6822, "AP": 6822, "c_sigma_r": 11})
        # Both placeholder spellings: 63781360.91367132 and 63781363.00000001.
        self.assertEqual(summary["placeholders"], {"c_sigma_r": 2652, "t_sigma_r": 2486})
        self.assertEqual(summary["invalid"], 0)

    def test_test(self) -> None:
        summary = self._summarise("test")
        self.assertEqual(summary["rows"], 24484)
        self.assertEqual(summary["statuses"], {MessageStatus.VALID})
        self.assertEqual(summary["encounters"], 2167)
        self.assertEqual(summary["with_eligible"], 2167)
        self.assertEqual(summary["without_upcoming"], 0)
        self.assertEqual(summary["negative_rows"], 0)
        self.assertEqual(summary["missing"], {"F10": 1329, "AP": 1329, "c_sigma_r": 6})
        self.assertEqual(summary["placeholders"], {"c_sigma_r": 291, "t_sigma_r": 370})
        self.assertEqual(summary["invalid"], 0)


if __name__ == "__main__":
    unittest.main()
