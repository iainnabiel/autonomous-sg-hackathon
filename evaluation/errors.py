"""Errors for SG-03 evaluation input validation."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

MAX_LISTED_IDS = 20


def _id_key(value: str) -> tuple[str, int, int, str]:
    """Sort ``train:9`` before ``train:10``; other strings sort as text."""

    prefix, separator, rest = value.partition(":")
    if separator and rest.isdigit():
        return (prefix, 0, int(rest), "")
    return (value, 1, 0, value)


class EvaluationInputError(ValueError):
    """Evaluation inputs break a label, cohort, prediction, or join rule.

    ``problems`` maps each failure code to every affected ID, sorted. The message
    lists up to ``MAX_LISTED_IDS`` IDs per code with the full count, so nothing is
    dropped without being reported.
    """

    def __init__(self, problems: Mapping[str, Iterable[object]]) -> None:
        cleaned = {
            code: tuple(sorted({str(item) for item in ids}, key=_id_key))
            for code, ids in sorted(problems.items())
        }
        if not cleaned or any(not ids for ids in cleaned.values()):
            raise ValueError("EvaluationInputError needs at least one code, each with an affected ID")
        self.problems: dict[str, tuple[str, ...]] = cleaned
        super().__init__(_describe(cleaned))

    @property
    def codes(self) -> tuple[str, ...]:
        return tuple(self.problems)

    def ids(self, code: str) -> tuple[str, ...]:
        return self.problems.get(code, ())


def _describe(problems: Mapping[str, tuple[str, ...]]) -> str:
    parts = []
    for code, ids in problems.items():
        listed = ", ".join(ids[:MAX_LISTED_IDS])
        more = f" (+{len(ids) - MAX_LISTED_IDS} more)" if len(ids) > MAX_LISTED_IDS else ""
        parts.append(f"{code} [{len(ids)}]: {listed}{more}")
    return "; ".join(parts)


class ProblemCollector:
    """Collect every failure before raising, so one run reports all affected IDs."""

    def __init__(self) -> None:
        self._problems: dict[str, set[str]] = {}

    def add(self, code: str, item: object) -> None:
        self._problems.setdefault(code, set()).add(str(item))

    def __bool__(self) -> bool:
        return bool(self._problems)

    def raise_if_any(self) -> None:
        if self._problems:
            raise EvaluationInputError(self._problems)
