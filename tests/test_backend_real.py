"""Real integration: the backend on the challenge CSVs with a real model bundle.

Optional. Skipped, not passed, unless all of these are available:

- the ML stack (``pip install -r ml/requirements.txt``);
- ``Datasets/train_data.csv`` and ``Datasets/test_data.csv``;
- ``SG_MODEL_DIR``: a bundle from ``python -m ml.train --model upgrade --features base``.

    SG_MODEL_DIR=ml/artifacts/upgrade_base python -m unittest tests.test_backend_real
"""

from __future__ import annotations

import json
import os
import unittest
from collections import Counter

from ml.config import TEST_CSV, TRAIN_CSV

try:
    import pandas  # noqa: F401
    import sklearn  # noqa: F401

    ML_STACK = True
except ImportError:
    ML_STACK = False

MODEL_DIR = os.environ.get("SG_MODEL_DIR")
READY = ML_STACK and MODEL_DIR and TRAIN_CSV.is_file() and TEST_CSV.is_file()


@unittest.skipUnless(READY, "needs the ML stack, Datasets/ CSVs and SG_MODEL_DIR")
class RealBackendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from backend.service import build_cohort

        cls.states = {cohort: build_cohort(cohort, MODEL_DIR) for cohort in ("test", "validation")}

    def test_model_loaded_and_every_forecast_checked(self) -> None:
        for cohort, state in self.states.items():
            self.assertIsNotNone(state.model, cohort)
            problems = [a.forecast_result.problem for a in state.assessments.values() if a.forecast_result.problem]
            self.assertEqual(problems, [], cohort)

    def test_forecasts_match_independent_inference(self) -> None:
        from ml.data import load_messages
        from ml.inference import load_model, predict_encounters

        state = self.states["test"]
        expected = predict_encounters(load_model(MODEL_DIR), load_messages("test")).set_index("encounter_id")
        self.assertEqual(len(expected), len(state.assessments))
        for encounter_id, assessment in state.assessments.items():
            row = expected.loc[str(encounter_id)]
            forecast = assessment.forecast
            self.assertEqual(forecast.forecast_final_tier.value, row["predicted_tier"])
            self.assertEqual(forecast.p_critical, float(row["p_critical"]))
            self.assertEqual(assessment.forecast_result.upgraded, bool(row["upgraded"]))
            self.assertEqual(str(forecast.source_observation_id), row["latest_early_row_id"])

    def test_test_cohort_is_honest(self) -> None:
        from backend.radar import radar

        state = self.states["test"]
        self.assertEqual(len(state.assessments), 2167)
        self.assertEqual(state.excluded, [])
        bands = Counter(a.decision.priority.value for a in state.queue)
        self.assertNotIn("Immediate", bands)  # no test message is within 1 day
        self.assertEqual(radar(state.assessments.values(), cohort="", caveat="")["within_24h"], 0)

    def test_validation_cohort_carries_forecasts_forward(self) -> None:
        state = self.states["validation"]
        self.assertEqual(len(state.assessments), 2389)
        statuses = Counter(a.forecast.status.value for a in state.assessments.values())
        self.assertEqual(set(statuses), {"available", "carried_forward"})
        for a in state.assessments.values():
            if a.forecast.status.value == "carried_forward":
                self.assertLess(a.assessed_message.time_to_tca_days, 2.0)
                self.assertGreaterEqual(a.forecast.source_time_to_tca_days, 2.0)

    def test_messages_inside_two_days_do_not_change_forecasts(self) -> None:
        from backend.forecasts import run_model
        from backend.service import read_checks, validation_encounters
        from backend.assessment import group_messages
        from ml.data import load_messages

        keep = validation_encounters()
        checks = read_checks(TRAIN_CSV, "train", keep)
        grouped = group_messages(checks)
        frame = load_messages("train")
        frame = frame[frame["encounter_id"].isin(keep)]
        kwargs = dict(early_sources=grouped.early_sources(), messages=grouped.checks_by_key())
        _, full, _ = run_model(MODEL_DIR, frame, **kwargs)
        _, early_only, _ = run_model(MODEL_DIR, frame[frame["time_to_tca"] >= 2.0], **kwargs)
        self.assertEqual({k: v.forecast for k, v in full.items()}, {k: v.forecast for k, v in early_only.items()})

    def test_payloads_encode_strictly(self) -> None:
        from backend.api import encounter, queue
        from backend.radar import radar

        for state in self.states.values():
            json.dumps(queue(state), allow_nan=False)
            json.dumps(radar(state.assessments.values(), cohort="", caveat=""), allow_nan=False)
            for encounter_id in state.assessments:
                json.dumps(encounter(state, str(encounter_id)), allow_nan=False)


if __name__ == "__main__":
    unittest.main()
