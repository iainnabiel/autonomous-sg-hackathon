"""SG-03.2 detection metrics on joined encounter rows. Pure functions, stdlib only.

Confusion matrix rows are actual tiers and columns are predicted tiers, in
``TIER_ORDER`` (Critical, Elevated, Safe), matching ``ml/reports`` and the
dashboard. A ratio with a zero denominator is ``None`` with a reason, never 0.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from contracts.tiers import Tier

TIER_ORDER = (Tier.CRITICAL, Tier.ELEVATED, Tier.SAFE)
WILSON_Z = 1.959963984540054  # two-sided 95%


@dataclass(frozen=True)
class Ratio:
    numerator: int
    denominator: int
    reason: str  # why the value is undefined when the denominator is zero

    @property
    def value(self) -> float | None:
        return self.numerator / self.denominator if self.denominator else None

    def as_dict(self) -> dict:
        state = "reported" if self.denominator else "unavailable"
        return {
            "value": self.value,
            "numerator": self.numerator,
            "denominator": self.denominator,
            "state": state,
            "reason": None if self.denominator else f"zero_denominator:{self.reason}",
        }


def confusion_matrix(actual: Sequence[Tier], predicted: Sequence[Tier]) -> list[list[int]]:
    if len(actual) != len(predicted):
        raise ValueError("actual and predicted must have the same length")
    index = {tier: i for i, tier in enumerate(TIER_ORDER)}
    matrix = [[0] * len(TIER_ORDER) for _ in TIER_ORDER]
    for a, p in zip(actual, predicted):
        matrix[index[a]][index[p]] += 1
    return matrix


def wilson_interval(successes: int, trials: int) -> tuple[float, float] | None:
    if trials == 0:
        return None
    p = successes / trials
    z2 = WILSON_Z**2
    centre = (p + z2 / (2 * trials)) / (1 + z2 / trials)
    half = WILSON_Z * math.sqrt(p * (1 - p) / trials + z2 / (4 * trials**2)) / (1 + z2 / trials)
    return (max(0.0, centre - half), min(1.0, centre + half))


@dataclass(frozen=True)
class DetectionResult:
    matrix: list[list[int]]

    @property
    def n(self) -> int:
        return sum(map(sum, self.matrix))

    def support(self, tier: Tier) -> int:
        return sum(self.matrix[TIER_ORDER.index(tier)])

    def predicted(self, tier: Tier) -> int:
        j = TIER_ORDER.index(tier)
        return sum(row[j] for row in self.matrix)

    def hits(self, tier: Tier) -> int:
        i = TIER_ORDER.index(tier)
        return self.matrix[i][i]

    def precision(self, tier: Tier) -> Ratio:
        return Ratio(self.hits(tier), self.predicted(tier), "no_predictions_of_tier")

    def recall(self, tier: Tier) -> Ratio:
        return Ratio(self.hits(tier), self.support(tier), "no_actual_of_tier")

    @property
    def critical_predicted_safe(self) -> int:
        return self.matrix[TIER_ORDER.index(Tier.CRITICAL)][TIER_ORDER.index(Tier.SAFE)]

    @property
    def false_critical_alarms(self) -> int:
        return self.predicted(Tier.CRITICAL) - self.hits(Tier.CRITICAL)

    @property
    def critical_missed(self) -> int:
        return self.support(Tier.CRITICAL) - self.hits(Tier.CRITICAL)

    @property
    def non_critical(self) -> int:
        return self.n - self.support(Tier.CRITICAL)

    def critical_false_positive_rate(self) -> Ratio:
        return Ratio(self.false_critical_alarms, self.non_critical, "no_non_critical")

    def accuracy(self) -> Ratio:
        return Ratio(sum(self.matrix[i][i] for i in range(len(TIER_ORDER))), self.n, "empty_cohort")

    def row_normalised(self) -> list[list[float | None]]:
        return [[cell / sum(row) if sum(row) else None for cell in row] for row in self.matrix]


def detect(actual: Sequence[Tier], predicted: Sequence[Tier]) -> DetectionResult:
    return DetectionResult(confusion_matrix(actual, predicted))


def roc_auc(positive: Sequence[bool], score: Sequence[float]) -> float | None:
    """Mann-Whitney AUC with average ranks for ties; None without both classes."""

    n_pos = sum(positive)
    n_neg = len(positive) - n_pos
    if n_pos == 0 or n_neg == 0:
        return None
    order = sorted(range(len(score)), key=lambda i: score[i])
    ranks = [0.0] * len(score)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and score[order[j + 1]] == score[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    rank_sum = sum(r for r, is_pos in zip(ranks, positive) if is_pos)
    return (rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def average_precision(positive: Sequence[bool], score: Sequence[float]) -> float | None:
    """Step-wise average precision over distinct score thresholds (scikit-learn's definition)."""

    n_pos = sum(positive)
    if n_pos == 0:
        return None
    pairs = sorted(zip(score, positive), key=lambda item: -item[0])
    tp = fp = 0
    previous_recall = 0.0
    total = 0.0
    i = 0
    while i < len(pairs):
        threshold = pairs[i][0]
        while i < len(pairs) and pairs[i][0] == threshold:
            tp += pairs[i][1]
            fp += not pairs[i][1]
            i += 1
        recall = tp / n_pos
        total += (recall - previous_recall) * (tp / (tp + fp))
        previous_recall = recall
    return total
