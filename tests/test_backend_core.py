"""SG-02.3 to SG-02.6 backend core on synthetic data.

Run from the repository root (standard library only):

    python3 -m unittest tests.test_backend_core

Prediction records here are hand-written stand-ins for ``ml.inference``
output, labelled with model version ``MOCK-synthetic``. They test the adapter,
assessment, receipts, radar and API, not model quality. The real model is
exercised by ``tests.test_backend_real``.
"""

from __future__ import annotations

import json
import math
import random
import threading
import unittest
from pathlib import Path
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from backend.api import encounter, health, make_handler, queue
from backend.assessment import group_messages, queue_order
from backend.forecasts import ModelInfo, adapt_predictions, unavailable_for
from backend.message_validation import validate_message
from backend.radar import bin_index, radar
from backend.receipts import build_receipt
from backend.service import build_from_checks
from backend.tiers import rule_tier
from contracts.errors import ContractError
from contracts.forecast import ForecastStatus, ReasonCode
from contracts.ids import EncounterId, ObservationId
from contracts.schemas import PriorityBand
from contracts.tiers import Tier, current_rule_tier
from contracts.triage import PriorityReason

def _has_served() -> bool:
    import importlib.util
    try:
        return importlib.util.find_spec("evaluation.served") is not None
    except ModuleNotFoundError:
        return False


MOCK = ModelInfo(model_version="MOCK-synthetic", model_sha256=None, threshold=0.12, feature_set="base")


class Data:
    """Builds rows for one source file, numbering rows in insertion order."""

    def __init__(self, source: str = "test") -> None:
        self.source = source
        self.checks = []

    def add(self, event: int, tca: object, risk: object = "-20", miss: object = "20000", **extra) -> str:
        row = {"event_id": str(event), "time_to_tca": tca if isinstance(tca, str) else repr(tca),
               "risk": risk, "miss_distance": miss, "relative_speed": "10000", "relative_position_r": "1",
               "relative_position_t": "2", "relative_position_n": "3", "c_sigma_r": "10", "t_sigma_r": "5",
               "F10": "70", "AP": "5", "max_risk_estimate": "-8", "c_object_type": "DEBRIS", **extra}
        check = validate_message(row, source=self.source, row_index=len(self.checks))
        self.checks.append(check)
        return check.observation_key

    def grouped(self):
        return group_messages(self.checks)


def record(encounter_key: str, source_key: str | None, persistence: str = "Safe", p: float = 0.01,
           upgraded: bool = False, predicted: str | None = None, **changes) -> dict:
    if source_key is None:
        base = {"encounter_id": encounter_key, "status": "unable_to_assess", "model_version": MOCK.model_version}
    else:
        base = {"encounter_id": encounter_key, "status": "assessed", "model_version": MOCK.model_version,
                "latest_early_row_id": source_key, "persistence_tier": persistence, "p_critical": p,
                "predicted_tier": predicted or ("Critical" if upgraded else persistence), "upgraded": upgraded,
                "upgrade_reasons": ["synthetic reason"] if upgraded else [], "quality_flags": []}
    base.update(changes)
    return base


def forecasts_for(data: Data, records: list[dict]):
    grouped = data.grouped()
    return adapt_predictions(records, early_sources=grouped.early_sources(), messages=grouped.checks_by_key(), model=MOCK)


def state_for(data: Data, records: list[dict], model: ModelInfo | None = MOCK, problem: str | None = None):
    grouped = data.grouped()
    forecasts = (adapt_predictions(records, early_sources=grouped.early_sources(), messages=grouped.checks_by_key(), model=model)
                 if model else unavailable_for(grouped.early_sources(), problem))
    cohort = "test" if data.source == "test" else "validation"
    return build_from_checks(cohort, data.checks, forecasts, model=model, model_problem=problem, data_sha256="synthetic")


E1 = EncounterId("test", 1)


class ForecastAdapterTest(unittest.TestCase):
    def test_assessed_record_becomes_available_forecast(self) -> None:
        d = Data()
        d.add(1, 4.0)
        src = d.add(1, 2.5, risk="-5")
        result = forecasts_for(d, [record("test:1", src, persistence="Elevated", p=0.3, upgraded=True)])[E1]
        self.assertIs(result.forecast.status, ForecastStatus.AVAILABLE)
        self.assertIs(result.forecast.forecast_final_tier, Tier.CRITICAL)
        self.assertEqual(result.forecast.source_observation_id, ObservationId.parse(src))
        self.assertEqual(result.forecast.source_time_to_tca_days, 2.5)
        self.assertEqual(result.forecast.p_critical, 0.3)
        self.assertIsNone(result.forecast.predicted_final_pc)
        self.assertTrue(result.upgraded)
        self.assertEqual(result.upgrade_reasons, ("synthetic reason",))

    def test_unable_to_assess_when_no_early_message(self) -> None:
        d = Data("train")
        d.add(1, 1.5)
        result = forecasts_for(d, [record("train:1", None)])[EncounterId("train", 1)]
        self.assertIs(result.forecast.status, ForecastStatus.UNABLE_TO_ASSESS)
        self.assertIsNone(result.forecast.forecast_final_tier)
        self.assertIsNone(result.forecast.p_critical)
        self.assertIsNone(result.problem)

    def test_unable_to_assess_contradicting_data_is_unavailable(self) -> None:
        d = Data()
        d.add(1, 3.0)
        result = forecasts_for(d, [record("test:1", None)])[E1]
        self.assertIs(result.forecast.status, ForecastStatus.UNAVAILABLE)

    def test_model_failure_makes_every_forecast_unavailable(self) -> None:
        d = Data()
        d.add(1, 3.0)
        d.add(2, 3.0)
        results = unavailable_for(d.grouped().early_sources(), "model unavailable: FileNotFoundError")
        for result in results.values():
            self.assertIs(result.forecast.status, ForecastStatus.UNAVAILABLE)
            self.assertIsNone(result.forecast.forecast_final_tier)
            self.assertIsNone(result.forecast.p_critical)
            self.assertIn("FileNotFoundError", result.problem)

    def test_missing_duplicate_and_unexpected_records(self) -> None:
        d = Data()
        src = d.add(1, 3.0)
        d.add(2, 3.0)
        results = forecasts_for(d, [record("test:1", src)])
        self.assertIs(results[EncounterId("test", 2)].forecast.status, ForecastStatus.UNAVAILABLE)
        with self.assertRaises(ContractError):
            forecasts_for(d, [record("test:1", src), record("test:1", src)])
        with self.assertRaises(ContractError):
            forecasts_for(d, [record("test:9", src)])
        with self.assertRaises(ContractError):
            forecasts_for(d, [record("train:1", src)])

    def test_inconsistent_records_are_rejected(self) -> None:
        cases = {
            "downgrade": dict(persistence="Critical", predicted="Elevated"),
            "upgrade below threshold": dict(p=0.05, upgraded=True),
            "missing upgrade": dict(p=0.5, upgraded=False),
            "score above 1": dict(p=1.5),
            "score NaN": dict(p=math.nan),
            "unknown tier": dict(persistence="safe"),
            "wrong version": dict(model_version="other"),
            "persistence differs from rule": dict(persistence="Elevated", p=0.01),
        }
        for name, changes in cases.items():
            d = Data()
            src = d.add(1, 3.0)  # Safe by the rules
            result = forecasts_for(d, [record("test:1", src, **changes)])[E1]
            self.assertIs(result.forecast.status, ForecastStatus.UNAVAILABLE, name)
            self.assertIsNotNone(result.problem, name)

    def test_source_must_be_latest_eligible_message(self) -> None:
        d = Data()
        older = d.add(1, 4.0)
        d.add(1, 2.5)
        result = forecasts_for(d, [record("test:1", older)])[E1]
        self.assertIs(result.forecast.status, ForecastStatus.UNAVAILABLE)

    def test_invalid_source_inputs_never_yield_a_safe_forecast(self) -> None:
        # ml.data.tier would read a NaN risk as Safe; the adapter refuses it.
        d = Data()
        src = d.add(1, 3.0, risk="")
        result = forecasts_for(d, [record("test:1", src, persistence="Safe")])[E1]
        self.assertIs(result.forecast.status, ForecastStatus.UNAVAILABLE)
        self.assertIn("missing or invalid", result.problem)

    def test_upgrade_carries_the_shared_reason_code(self) -> None:
        d = Data()
        src = d.add(1, 3.0)
        result = forecasts_for(d, [record("test:1", src, p=0.5, upgraded=True)])[E1]
        self.assertEqual(result.forecast.reason_codes, (ReasonCode.MODEL_UPGRADE_TO_CRITICAL,))
        plain = forecasts_for(d, [record("test:1", src)])[E1]
        self.assertEqual(plain.forecast.reason_codes, ())

    def test_model_flags_map_to_shared_quality_flags(self) -> None:
        d = Data()
        src = d.add(1, 3.0)
        flags = ["sigma_placeholder", "space_weather_missing", "single_early_message"]
        result = forecasts_for(d, [record("test:1", src, quality_flags=flags)])[E1]
        self.assertEqual(result.model_quality_flags,
                         ("sigma_placeholder", "optional_input_missing", "single_early_observation"))
        unknown = forecasts_for(d, [record("test:1", src, quality_flags=["made_up"])])[E1]
        self.assertIs(unknown.forecast.status, ForecastStatus.UNAVAILABLE)

    def test_exactly_two_days_is_the_eligible_source(self) -> None:
        d = Data()
        d.add(1, math.nextafter(2.0, -math.inf))
        src = d.add(1, 2.0)
        self.assertEqual(d.grouped().early_sources()[E1], ObservationId.parse(src))


class SharedRuleParityTest(unittest.TestCase):
    """SG-02.2's classify_risk and contracts.tiers.current_rule_tier must agree."""

    def test_same_tier_on_every_edge_input(self) -> None:
        values_pc = (None, math.nan, math.inf, True, 0.5, 0.0, -3.0, -4.0, math.nextafter(-4.0, -math.inf),
                     -5.0, -6.0, math.nextafter(-6.0, -math.inf), -30.0)
        values_m = (None, math.nan, -math.inf, -1.0, 0.0, 500.0, math.nextafter(1000.0, 0), 1000.0, 3000.0,
                    5000.0, math.nextafter(5000.0, math.inf), 50000.0)
        for pc in values_pc:
            for miss in values_m:
                ours, _ = rule_tier(pc, miss)
                self.assertIs(ours, current_rule_tier(pc, miss), (pc, miss))


class AssessmentTest(unittest.TestCase):
    def test_upcoming_ties_break_by_row_index(self) -> None:
        d = Data()
        first = d.add(1, 3.0)
        d.add(1, 3.0)
        self.assertEqual(d.grouped().encounters[E1].upcoming.observation_key, first)

    def test_forecast_is_carried_forward_inside_two_days(self) -> None:
        d = Data("train")
        src = d.add(1, 2.4)
        current = d.add(1, 0.5, miss="3000")
        s = state_for(d, [record("train:1", src)])
        a = s.find("train:1")
        self.assertEqual(a.assessed_message.observation_key, current)
        self.assertIs(a.forecast.status, ForecastStatus.CARRIED_FORWARD)
        self.assertEqual(str(a.forecast.source_observation_id), src)
        self.assertEqual(a.forecast.source_time_to_tca_days, 2.4)
        self.assertIs(a.decision.priority, PriorityBand.HIGH)  # current Elevated within 1 day
        self.assertIn(PriorityReason.CARRIED_FORWARD, a.decision.reasons)

    def test_no_early_message(self) -> None:
        d = Data("train")
        d.add(1, 0.5, miss="500")  # current Critical by distance
        d.add(2, 0.5)  # current Safe
        s = state_for(d, [record("train:1", None), record("train:2", None)])
        self.assertIs(s.find("train:1").decision.priority, PriorityBand.IMMEDIATE)
        self.assertIs(s.find("train:2").decision.priority, PriorityBand.INCOMPLETE)

    def test_all_negative_encounter_is_excluded_but_reachable(self) -> None:
        d = Data("train")
        d.add(1, -0.1)
        d.add(1, "-1.8449074074074083e-05")
        s = state_for(d, [record("train:1", None)])
        a = s.find("train:1")
        self.assertFalse(a.in_queue)
        self.assertIsNone(a.current)
        self.assertEqual(a.decision.reasons, (PriorityReason.EXCLUDED_NEGATIVE_TCA,))
        self.assertEqual([x.encounter_id for x in s.excluded], [a.encounter_id])
        self.assertEqual(s.queue, [])

    def test_band_and_within_band_order_is_deterministic(self) -> None:
        d = Data()
        sources = {}
        for event, tca, miss in ((5, 3.0, "500"), (3, 2.5, "500"), (4, 2.5, "500"), (1, 4.0, "20000"), (2, 3.0, "3000")):
            sources[event] = d.add(event, tca, miss=miss)
        tiers = {5: "Critical", 3: "Critical", 4: "Critical", 1: "Safe", 2: "Elevated"}
        records = [record(f"test:{e}", sources[e], persistence=tiers[e]) for e in sources]
        expected = ["test:3", "test:4", "test:5", "test:2", "test:1"]
        self.assertEqual([str(a.encounter_id) for a in state_for(d, records).queue], expected)
        shuffled = Data()
        rows = list(zip(d.checks, records))
        random.Random(7).shuffle(rows)
        for check, rec in rows:
            src = shuffled.add(check.event_id, check.time_to_tca_days, miss=repr(check.values["miss_distance"]))
            rec["latest_early_row_id"] = src
        self.assertEqual([str(a.encounter_id) for a in state_for(shuffled, [r for _, r in rows]).queue], expected)

    def test_model_upgrade_escalates_band(self) -> None:
        d = Data()
        src = d.add(1, 3.0, miss="3000")
        a = state_for(d, [record("test:1", src, persistence="Elevated", p=0.5, upgraded=True)]).find("test:1")
        self.assertIs(a.current_rule_tier, Tier.ELEVATED)
        self.assertIs(a.decision.prioritisation_tier, Tier.CRITICAL)
        self.assertIs(a.decision.priority, PriorityBand.HIGH)
        self.assertIn(PriorityReason.FORECAST_ESCALATION, a.decision.reasons)

    def test_unavailable_forecast_keeps_known_critical_urgent(self) -> None:
        d = Data("train")
        d.add(1, 0.5, risk="-3", miss="")  # Critical by probability, distance missing
        s = state_for(d, [], model=None, problem="model unavailable: test")
        a = s.find("train:1")
        self.assertIs(a.current_rule_tier, Tier.CRITICAL)
        self.assertFalse(a.classification.is_complete)
        self.assertIs(a.decision.priority, PriorityBand.IMMEDIATE)
        item = queue(s)["items"][0]
        self.assertEqual((item["status"], item["model_status"]), ("incomplete", "unavailable"))
        self.assertIn("missing_required_input", item["quality_flags"])

    def test_unavailable_forecast_never_routine(self) -> None:
        d = Data()
        d.add(1, 3.0)
        a = state_for(d, [], model=None, problem="model unavailable: test").find("test:1")
        self.assertIs(a.decision.priority, PriorityBand.INCOMPLETE)

    def test_history_in_update_order(self) -> None:
        d = Data()
        d.add(1, 2.5)
        d.add(1, 5.0)
        d.add(1, 3.0)
        src = d.checks[0].observation_key
        detail = encounter(state_for(d, [record("test:1", src)]), "test:1")
        self.assertEqual([h["tca_hours"] for h in detail["history"]], [120.0, 72.0, 60.0])
        self.assertEqual([h["update_index"] for h in detail["history"]], [1, 2, 3])

    def test_duplicate_observation_and_unplaceable_messages(self) -> None:
        d = Data()
        d.add(1, 3.0)
        with self.assertRaises(ValueError):
            group_messages(d.checks + d.checks[:1])
        d.add(2, 3.0, event_id="2.0")
        self.assertEqual(d.grouped().without_encounter, 1)

    def test_payloads_have_no_label_fields(self) -> None:
        d = Data()
        src = d.add(1, 3.0, final_tier="Critical", final_risk_log10_pc="-1")
        s = state_for(d, [record("test:1", src)])
        text = json.dumps({"q": queue(s), "e": encounter(s, "test:1")})
        self.assertNotIn("final_tier", text)
        self.assertNotIn("final_risk", text)


class ReceiptTest(unittest.TestCase):
    def test_distance_cause_and_supplied_distance_wording(self) -> None:
        d = Data()
        src = d.add(1, 3.0, miss="500")
        a = state_for(d, [record("test:1", src, persistence="Critical", p=0.9)]).find("test:1")
        r = build_receipt(a, MOCK)
        self.assertEqual(r["escalation_causes"], ["distance"])
        self.assertFalse(r["urgency_raised_band"])
        miss = next(i for i in r["inputs"] if i["field"] == "miss_distance")
        self.assertIn("not a model prediction", miss["note"])
        self.assertEqual(r["policy_version"], "triage-prototype-sg-01.4")
        self.assertEqual(r["thresholds"]["upgrade_p_critical"], 0.12)

    def test_model_cause_and_score_definition(self) -> None:
        d = Data()
        src = d.add(1, 3.0)
        r = build_receipt(state_for(d, [record("test:1", src, p=0.4, upgraded=True)]).find("test:1"), MOCK)
        self.assertEqual(r["escalation_causes"], ["model"])
        self.assertTrue(r["upgraded"])
        self.assertEqual(r["persistence_tier"], "safe")
        self.assertIn("not a collision probability", r["p_critical_definition"])
        self.assertIn("raised it to Critical", r["escalation_summary"])

    def test_carried_forward_and_urgency(self) -> None:
        d = Data("train")
        src = d.add(1, 2.2, miss="500")
        d.add(1, 0.25, miss="500")
        r = build_receipt(state_for(d, [record("train:1", src, persistence="Critical", p=0.9)]).find("train:1"), MOCK)
        self.assertEqual(r["forecast_status"], "carried_forward")
        self.assertEqual(r["forecast_source_observation_id"], src)
        self.assertTrue(r["urgency_raised_band"])
        self.assertIn("Carried forward", r["escalation_summary"])

    def test_unavailable_and_unable_to_assess_reasons(self) -> None:
        d = Data("train")
        d.add(1, 1.0)
        r = build_receipt(state_for(d, [record("train:1", None)]).find("train:1"), MOCK)
        self.assertEqual(r["model_status"], "unable_to_assess")
        self.assertIn("no_eligible_observation", [h["flag"] for h in r["quality_handling"]])
        d = Data()
        d.add(1, 3.0)
        r = build_receipt(state_for(d, [], model=None, problem="model unavailable: X").find("test:1"), None)
        self.assertEqual(r["forecast_problem"], "model unavailable: X")
        self.assertIsNone(r["model_version"])


class RadarTest(unittest.TestCase):
    def test_boundaries(self) -> None:
        self.assertEqual(bin_index(0.0), 0)
        self.assertEqual(bin_index(6.0), 0)
        self.assertEqual(bin_index(math.nextafter(6.0, math.inf)), 1)
        self.assertEqual(bin_index(24.0), 2)  # (12, 24]: 24 h is inside the 0-24 h window
        self.assertEqual(bin_index(500.0), 7)
        self.assertIsNone(bin_index(-0.01))

    def test_counts_match_queue(self) -> None:
        d = Data("train")
        d.add(1, 0.0, miss="500")
        d.add(2, 1.0, miss="3000")
        d.add(3, -0.5)
        s = state_for(d, [record(f"train:{e}", None) for e in (1, 2, 3)])
        r = radar(s.assessments.values(), cohort="c", caveat="x")
        self.assertEqual(r["encounters_counted"], len(s.queue))
        self.assertEqual(r["within_24h"], 2)
        self.assertEqual(r["bins"][0]["critical"], 1)
        self.assertEqual(r["bins"][2]["elevated"], 1)
        self.assertEqual(sum(b[k] for b in r["bins"] for k in ("critical", "elevated", "safe", "incomplete")), 2)


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        d = Data()
        src = d.add(1, 3.0, miss="500")
        d.add(2, 2.5)
        cls.state = state_for(d, [record("test:1", src, persistence="Critical", p=0.9),
                                  record("test:2", d.checks[1].observation_key)])
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.state))
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def get(self, path: str, method: str = "GET"):
        request = urllib.request.Request(self.base + path, method=method, data=b"{}" if method == "POST" else None)
        try:
            with urllib.request.urlopen(request) as response:
                body = response.read()
                return response.status, (json.loads(body) if body else None), response.headers
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.loads(error.read()), error.headers

    def test_endpoints(self) -> None:
        status, body, headers = self.get("/health")
        self.assertEqual((status, body["queued"], body["model_version"]), (200, 2, "MOCK-synthetic"))
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        status, body, _ = self.get("/queue")
        self.assertEqual([i["encounter_id"] for i in body["items"]], ["test:1", "test:2"])
        self.assertEqual(body["items"][0]["priority"], "high")
        status, body, _ = self.get("/encounters/test:1")
        self.assertEqual((status, body["summary"]["risk_tier"], body["changes"]), (200, "critical", None))
        self.assertEqual(self.get("/radar")[0], 200)

    def test_errors(self) -> None:
        self.assertEqual(self.get("/encounters/test:57.0")[0], 400)
        self.assertEqual(self.get("/encounters/train:1")[0], 404)
        self.assertEqual(self.get("/nope")[0], 404)
        self.assertEqual(self.get("/encounters/test:1/review", method="POST")[0], 501)
        self.assertEqual(self.get("/queue", method="OPTIONS")[0], 204)

    def test_metrics_without_sg_03_4_package_is_503(self) -> None:
        import sys
        if "evaluation.served" in sys.modules or _has_served():
            self.skipTest("evaluation.served is installed")
        self.assertEqual(self.get("/metrics")[0], 503)

    def test_metrics_passthrough_with_stand_in_module(self) -> None:
        # Stand-in for SG-03.4's evaluation.served (PR #33), not the real module.
        import sys
        import types

        class MetricsFileError(ValueError):
            pass

        payloads = {"ok": {"status": "evaluated", "models": []}, "absent": {"status": "not_evaluated"}}

        def metrics_response(path=Path("evaluation/reports/metrics.json")):
            assert isinstance(path, Path), "the real metrics_response takes a Path"
            if str(path) == "bad":
                raise MetricsFileError("metrics.json has the wrong schema")
            return payloads["absent" if str(path) == "absent" else "ok"]

        fake = types.ModuleType("evaluation.served")
        fake.MetricsFileError, fake.metrics_response = MetricsFileError, metrics_response
        saved = sys.modules.get("evaluation.served")
        sys.modules["evaluation.served"] = fake
        try:
            from backend.api import metrics
            self.assertEqual(metrics(None), (200, payloads["ok"]))
            self.assertEqual(metrics("absent"), (200, payloads["absent"]))
            self.assertEqual(metrics("bad"), (500, {"error": "metrics.json has the wrong schema"}))
            status, body, _ = self.get("/metrics")
            self.assertEqual((status, body), (200, payloads["ok"]))
        finally:
            if saved is None:
                sys.modules.pop("evaluation.served", None)
            else:
                sys.modules["evaluation.served"] = saved

    def test_responses_are_deterministic(self) -> None:
        self.assertEqual(json.dumps(queue(self.state)), json.dumps(queue(self.state)))
        self.assertEqual(health(self.state)["policy_version"], "triage-prototype-sg-01.4")


if __name__ == "__main__":
    unittest.main()
