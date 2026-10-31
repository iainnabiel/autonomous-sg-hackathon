"""SG-03.1 cohort checks (C1-C3). Synthetic records only; no dataset files."""

from __future__ import annotations

import hashlib
import random
import unittest

from contracts.ids import EncounterId
from contracts.tiers import Tier
from evaluation.cohorts import (
    ALL_USABLE,
    FINAL_IS_EARLY,
    PRIMARY,
    UNABLE_TO_ASSESS,
    build_cohorts,
    id_list_bytes,
)
from evaluation.errors import EvaluationInputError
from evaluation.labels import OrganiserLabel, RawMessage, SplitRow, derive_labels

CRITICAL = (-3.0, 20000.0)
ELEVATED = (-9.0, 3000.0)
SAFE = (-9.0, 20000.0)

# (row, event, time_to_tca, (risk, miss)); hand-checked outcomes in WORLD_LABELS.
WORLD_MESSAGES = [
    (0, 1, 3.0, SAFE), (1, 1, 0.5, CRITICAL),       # primary, final Critical
    (2, 2, 2.5, SAFE), (3, 2, 6.0, SAFE),           # final_is_early
    (4, 3, 0.4, SAFE), (5, 3, 1.7, SAFE),           # unable to assess
    (6, 4, 4.0, ELEVATED), (7, 4, -0.5, ELEVATED),  # train partition, negative final
    (8, 5, 5.0, CRITICAL), (9, 5, 1.0, SAFE),       # primary, final Safe
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


def world(order_seed: int | None = None):
    messages = [RawMessage("train", row, event, tca, *inputs) for row, event, tca, inputs in WORLD_MESSAGES]
    organiser = [OrganiserLabel(e, t, "yes" if u else "no", f) for e, t, u, f, _, _ in WORLD_LABELS]
    split = [SplitRow(f"train:{e}", p, t, early) for e, t, _, _, p, early in WORLD_LABELS if p]
    if order_seed is not None:
        rng = random.Random(order_seed)
        for items in (messages, organiser, split):
            rng.shuffle(items)
    return derive_labels(messages, organiser, split)


def ids(*events: int) -> tuple[EncounterId, ...]:
    return tuple(EncounterId("train", event) for event in events)


class CohortTest(unittest.TestCase):
    def test_validation_cohorts_match_hand_counts(self) -> None:
        cohorts = build_cohorts(world(), "validation")
        self.assertEqual(cohorts[ALL_USABLE].encounter_ids, ids(1, 2, 5, 10))
        self.assertEqual(cohorts[PRIMARY].encounter_ids, ids(1, 5, 10))
        self.assertEqual(cohorts[FINAL_IS_EARLY].encounter_ids, ids(2))
        self.assertEqual(cohorts[UNABLE_TO_ASSESS].encounter_ids, ids(3))
        self.assertIsNone(cohorts[UNABLE_TO_ASSESS].partition)
        self.assertEqual(dict(cohorts[PRIMARY].support), {Tier.SAFE: 1, Tier.ELEVATED: 0, Tier.CRITICAL: 2})
        self.assertEqual(cohorts[PRIMARY].n, 3)
        self.assertIn(EncounterId("train", 5), cohorts[PRIMARY])
        self.assertNotIn(EncounterId("test", 5), cohorts[PRIMARY])

    def test_C1_primary_and_final_is_early_partition_all_usable(self) -> None:
        cohorts = build_cohorts(world(), "validation")
        primary, early = set(cohorts[PRIMARY].encounter_ids), set(cohorts[FINAL_IS_EARLY].encounter_ids)
        self.assertFalse(primary & early)
        self.assertEqual(primary | early, set(cohorts[ALL_USABLE].encounter_ids))
        self.assertFalse(set(cohorts[UNABLE_TO_ASSESS].encounter_ids) & set(cohorts[ALL_USABLE].encounter_ids))

    def test_C2_partitions_are_disjoint_and_usable(self) -> None:
        labels = world()
        validation = build_cohorts(labels, "validation")[ALL_USABLE].encounter_ids
        train = build_cohorts(labels, "train")[ALL_USABLE].encounter_ids
        self.assertEqual(train, ids(4))
        self.assertFalse(set(validation) & set(train))
        self.assertTrue(all(labels[key].usable for key in validation + train))
        with self.assertRaises(EvaluationInputError) as caught:
            build_cohorts(labels, "test")
        self.assertEqual(caught.exception.codes, ("invalid_split",))

    def test_C3_order_and_hash_are_stable_under_shuffles(self) -> None:
        reference = build_cohorts(world(), "validation")
        for seed in range(5):
            shuffled = build_cohorts(world(order_seed=seed), "validation")
            for name, cohort in reference.items():
                self.assertEqual(shuffled[name].encounter_ids, cohort.encounter_ids)
                self.assertEqual(shuffled[name].id_sha256, cohort.id_sha256)
        self.assertNotEqual(reference[PRIMARY].id_sha256, reference[ALL_USABLE].id_sha256)

    def test_hash_input_is_an_unambiguous_source_qualified_serialization(self) -> None:
        cohort = build_cohorts(world(), "validation")[PRIMARY]
        expected = b'[["train",1],["train",5],["train",10]]'
        self.assertEqual(id_list_bytes(cohort.encounter_ids), expected)
        self.assertEqual(cohort.id_sha256, hashlib.sha256(expected).hexdigest())
        self.assertNotEqual(id_list_bytes(ids(1)), id_list_bytes((EncounterId("test", 1),)))
        self.assertNotEqual(id_list_bytes(ids(1, 10)), id_list_bytes(ids(11, 0)))
        self.assertEqual(id_list_bytes(()), b"[]")

    def test_numeric_event_order(self) -> None:
        cohort = build_cohorts(world(), "validation")[PRIMARY]
        self.assertEqual([str(key) for key in cohort.encounter_ids], ["train:1", "train:5", "train:10"])


if __name__ == "__main__":
    unittest.main()
