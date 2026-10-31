"""Source-qualified identifiers.

Encounter IDs and observation IDs share a ``source:integer`` spelling and are
different types. ``train:57`` as an encounter is event 57. ``train:57`` as an
observation is CSV row 57. They must not be joined to each other.

``event_id`` restarts in each file, so the source prefix is required.
"""

from __future__ import annotations

from dataclasses import dataclass

from contracts.errors import ContractError

SOURCES = ("train", "test", "fixture")


def _parse(value: str, kind: str) -> tuple[str, int]:
    if not isinstance(value, str):
        raise ContractError(f"{kind} must be a string, got {type(value).__name__}")
    source, separator, raw_index = value.partition(":")
    if separator != ":" or source not in SOURCES or not raw_index.isdigit():
        allowed = ", ".join(SOURCES)
        raise ContractError(
            f"{kind} must look like 'train:57' with source one of {allowed} and a nonnegative integer"
        )
    return source, int(raw_index)


@dataclass(frozen=True)
class EncounterId:
    """One encounter in one file. The integer is ``event_id``, not a row index."""

    source: str
    event_id: int

    def __post_init__(self) -> None:
        if self.source not in SOURCES or not isinstance(self.event_id, int) or self.event_id < 0:
            raise ContractError(f"invalid encounter id source={self.source!r} event_id={self.event_id!r}")

    @classmethod
    def parse(cls, value: str) -> EncounterId:
        source, event_id = _parse(value, "encounter id")
        return cls(source, event_id)

    def __str__(self) -> str:
        return f"{self.source}:{self.event_id}"


@dataclass(frozen=True)
class ObservationId:
    """One CSV row in one file. The integer is the 0-based row index, not ``event_id``."""

    source: str
    row_index: int

    def __post_init__(self) -> None:
        if self.source not in SOURCES or not isinstance(self.row_index, int) or self.row_index < 0:
            raise ContractError(f"invalid observation id source={self.source!r} row_index={self.row_index!r}")

    @classmethod
    def parse(cls, value: str) -> ObservationId:
        source, row_index = _parse(value, "observation id")
        return cls(source, row_index)

    def __str__(self) -> str:
        return f"{self.source}:{self.row_index}"
