"""SG-03.3 ranking checks (R1-R5). Hand-ordered synthetic encounters only."""

from __future__ import annotations

import unittest

from contracts.forecast import available_forecast
from contracts.ids import EncounterId, ObservationId
from contracts.tiers import Tier
from evaluation.join import JoinedRow
from evaluation.labels import LabelRecord, RawMessage
from evaluation.predictions import PredictionRecord
from evaluation.ranking import dashboard_view, rank_and_cover

C, E, S = Tier.CRITICAL, Tier.ELEVATED, Tier.SAFE

# event: (final tier, rule tier at snapshot, model forecast, snapshot tca, risk, miss)
R1 = {
    1: (C, C, C, 3.0, -3.0, 500.0),     # High
    2: (S, S, C, 2.5, -7.0, 9000.0),    # High via the model's upgrade
    3: (C, E, E, 4.0, -5.0, 3000.0),    # Scheduled
    4: (S, S, S, 2.2, -9.0, 20000.0),   # Routine
    5: (C, S, S, 5.0, -8.0, 15000.0),   # Routine: a Critical the rule and model both miss
    **{e: (S, S, S, float(e), -9.0, 20000.0 + e) for e in range(6, 11)},
}


def build(spec: dict, *, persistence: bool = False):
    rows, snapshot = [], {}
    for event in sorted(spec):
        final, rule, forecast_tier, tca, risk, miss = spec[event]
        observation = ObservationId("train", event * 10)
        encounter = EncounterId("train", event)
        label = LabelRecord(encounter, final, True, ObservationId("train", event * 10 + 1), 0.5, False,
                            observation, tca, rule, "validation")
        tier = rule if persistence else forecast_tier
        forecast = available_forecast(tier=tier, source_observation_id=observation, source_time_to_tca_days=tca,
                                      model_version="v", p_critical=None if persistence else 0.5)
        rows.append(JoinedRow(encounter, label, PredictionRecord("m", encounter, forecast, rule, tier is not rule)))
        snapshot[str(observation)] = RawMessage("train", event * 10, event, tca, risk, miss)
    return rows, snapshot


def ranked(spec: dict) -> dict:
    model, snapshot = build(spec)
    persistence, _ = build(spec, persistence=True)
    result = rank_and_cover(model, persistence, snapshot, "primary")
    return {item["key"]: item for item in result["rankings"]} | {"_result": result}


def top(item: dict) -> list:
    return [entry["coverage"] if entry else None for entry in item["final_critical"]["top"]]


class RankingTest(unittest.TestCase):
    def test_R1_hand_ordered_coverage(self) -> None:
        r = ranked(R1)
        self.assertEqual(top(r["proposed_queue"]), [0.0, 1 / 3, 2 / 3])      # e2, e1, e3
        self.assertEqual(top(r["persistence_queue"]), [1 / 3, 2 / 3, 2 / 3])  # e1, e3, e4
        self.assertEqual(top(r["risk_first"]), [1 / 3, 2 / 3, 2 / 3])         # e1, e3, e2
        self.assertEqual(top(r["distance_first"]), [1 / 3, 2 / 3, 2 / 3])     # e1, e3, e2
        self.assertEqual(top(r["tca_first"]), [0.0, 0.0, 1 / 3])              # e4, e2, e1
        self.assertEqual([e["reviewed"] for e in r["tca_first"]["final_critical"]["top"]], [1, 2, 3])
        self.assertEqual(r["proposed_queue"]["final_critical"]["positives"], 3)
        self.assertEqual(r["proposed_queue"]["bands"],
                         {"Immediate": 0, "High": 2, "Scheduled": 1, "Routine": 7, "Incomplete": 0})

    def test_R2_ties_break_by_numeric_event_id(self) -> None:
        spec = {10: (C, S, S, 3.0, -9.0, 20000.0), 9: (S, S, S, 3.0, -9.0, 20000.0)}
        r = ranked(spec)
        for key in ("proposed_queue", "risk_first", "distance_first", "tca_first"):
            self.assertEqual(top(r[key])[0], 0.0, key)  # train:9 is reviewed before train:10

    def test_R3_no_positives_is_not_applicable(self) -> None:
        r = ranked({1: (S, S, S, 3.0, -9.0, 20000.0), 2: (E, E, E, 2.5, -9.0, 3000.0)})
        item = r["proposed_queue"]["final_critical"]
        self.assertEqual(item["state"], "not_applicable")
        self.assertEqual(item["top"], [None, None, None])
        view = dashboard_view(r["_result"])
        self.assertEqual(view["rankings"][0]["top_10_20_30_all"], [None, None, None])

    def test_R4_urgent_band_is_empty_at_the_early_warning_snapshot(self) -> None:
        r = ranked(R1)
        self.assertEqual(r["_result"]["urgent_subset_n"], 0)
        self.assertEqual(r["proposed_queue"]["urgent_subset"]["state"], "not_applicable")
        view = dashboard_view(r["_result"])
        self.assertEqual((view["urgent_subset_n"], view["imminent_critical_n"], view["all_critical_n"]), (0, 0, 3))
        self.assertEqual(view["rankings"][0]["top_10_20_30_imminent"], [None, None, None])

    def test_R6_missing_supplied_values_sort_last(self) -> None:
        from evaluation.ranking import _missing_last
        values = [3.0, None, float("nan"), -1.0]
        ordered = sorted(values, key=_missing_last)
        self.assertEqual(ordered[:2], [-1.0, 3.0])
        self.assertTrue(all(v is None or v != v for v in ordered[2:]))

    def test_R5_curve_is_cumulative_and_ends_at_full_coverage(self) -> None:
        curve = ranked(R1)["proposed_queue"]["final_critical"]["curve"]
        self.assertEqual(curve[0], [0.0, 0.0])
        self.assertEqual(curve[-1], [1.0, 1.0])
        self.assertEqual(len(curve), 101)
        self.assertTrue(all(a[1] <= b[1] for a, b in zip(curve, curve[1:])))


if __name__ == "__main__":
    unittest.main()
