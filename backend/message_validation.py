"""SG-02.1: validate one conjunction message before it is classified or scored.

Provisional boundary. The shared ``contracts.Observation`` type (SG-01.2, PR #18)
is not on main yet, so this module returns its own internal result rather than
a public schema. Field names stay the dataset's column names; once the contract
merges, an adapter maps them explicitly. ``IssueKind`` codes are internal
diagnostics, not quality-flag wire values.

Input is one raw ``train_data.csv`` / ``test_data.csv`` row as read by
``csv.DictReader`` (text), or real numbers. An empty cell or ``None`` is
missing. A numeric NaN is non-finite and invalid, not missing; pass raw text
(or read with pandas ``keep_default_na=False``) to keep the two apart.

Parsing is ordinary CSV number parsing, with no repair or imputation:

- Numbers are ASCII decimal or scientific notation. Surrounding spaces or
  tabs are ignored, as ``float`` and pandas do. A blank-but-not-empty cell,
  internal spaces, ``"nan"``, ``"inf"``, ``"1_000"``, thousands separators and
  non-ASCII digits are malformed.
- ``event_id`` is a non-negative ASCII integer. Leading zeros are allowed and
  canonicalised (``"057"`` is event 57), as ``contracts.ids`` and pandas read
  it. ``"57.0"`` is malformed.
- Real-number objects follow SG-02.2's rule: any ``numbers.Real`` except
  ``bool`` (NumPy scalars included); non-finite or too large for a float is
  invalid.

Units are the organisers' (``data_notes``): metres, m/s, days. Values are kept
as supplied; no unit conversion is needed. Hours are a display conversion done
elsewhere. Sigma units are not stated by the organisers, and sigma is supplied
telemetry uncertainty, never model confidence.

``risk`` is the message's supplied log10 collision probability (Pc). It is not
the model's ``p_critical`` score for an eventual Critical final tier; this
module never reads prediction or label columns (``p_critical``, ``final_*``).

Status:

Required fields are ``event_id``, ``time_to_tca``, ``risk`` and ``miss_distance``.

- ``VALID``: all required fields are usable.
- ``MISSING_REQUIRED``: a required field is empty and none is malformed.
- ``INVALID``: a required field is malformed, non-finite, boolean, the wrong
  type, or outside the range its definition allows.

Problems with optional fields are recorded but do not change the status.

The status never discards evidence. Each field is checked on its own, and every
field that passes stays in ``values`` even when the message is
``MISSING_REQUIRED`` or ``INVALID``. That lets SG-02.2 keep a valid Critical
trigger when the other required input is unusable; this module does not
classify.

Timing is separate from status. ``time_to_tca`` keeps its raw precision.

- ``meets_inference_cutoff``: temporal only, raw ``time_to_tca >= 2.0`` days
  (exactly 2.0 qualifies). It says nothing about data quality.
- ``inference_ready``: meets the cutoff *and* the status is ``VALID``.
- ``meets_upcoming_cutoff``: temporal only, raw ``time_to_tca >= 0``.
  Negative values are valid historical observations, excluded only from
  upcoming views; ``-0.0`` equals zero and is not negative.

The temporal properties are ``None`` when ``time_to_tca`` is unusable.
"""

from __future__ import annotations

import math
import numbers
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType

from ml.config import ENCOUNTER_COL, EARLY_CUTOFF_DAYS, MESSAGE_CATEGORICAL, MESSAGE_NUMERIC, RISK_FEATURE

SOURCES = ("train", "test")

TIME_TO_TCA = "time_to_tca"
RISK = "risk"
MISS_DISTANCE = "miss_distance"
REQUIRED_FIELDS = (TIME_TO_TCA, RISK, MISS_DISTANCE)

# Temporary duplicate of ml.features.SIGMA_PLACEHOLDER: same value, same
# `>=` comparison. ml.features imports NumPy, so it cannot be imported here.
# Replace with a shared constant once one exists. ML applies the rule to the
# latest early message's features; this module applies it to every message.
# The data stores two spellings, 63781360.91367132 and 63781363.00000001; no
# real value lies between 6.0e7 and this threshold.
SIGMA_PLACEHOLDER = 6.378136e7
SIGMA_FIELDS = ("c_sigma_r", "t_sigma_r")


class _Range(Enum):
    ANY = "any finite value"
    NON_NEGATIVE = ">= 0"
    NON_POSITIVE = "<= 0"


# Range rules only where the field's definition requires one. F10, AP and
# max_risk_estimate have no organiser definition, so only finiteness is checked.
_NUMERIC_RANGES = {
    TIME_TO_TCA: _Range.ANY,
    RISK: _Range.NON_POSITIVE,
    MISS_DISTANCE: _Range.NON_NEGATIVE,
    "relative_speed": _Range.NON_NEGATIVE,
    "relative_position_r": _Range.ANY,
    "relative_position_t": _Range.ANY,
    "relative_position_n": _Range.ANY,
    "c_sigma_r": _Range.NON_NEGATIVE,
    "t_sigma_r": _Range.NON_NEGATIVE,
    "F10": _Range.ANY,
    "AP": _Range.ANY,
    RISK_FEATURE: _Range.ANY,
}
assert set(MESSAGE_NUMERIC) | {RISK_FEATURE} == set(_NUMERIC_RANGES)

FIELD_UNITS = MappingProxyType(
    {
        TIME_TO_TCA: "days",
        RISK: "log10(Pc), supplied",
        MISS_DISTANCE: "m",
        "relative_speed": "m/s",
        "relative_position_r": "m",
        "relative_position_t": "m",
        "relative_position_n": "m",
        "c_sigma_r": "unconfirmed (supplied position uncertainty)",
        "t_sigma_r": "unconfirmed (supplied position uncertainty)",
        "F10": "unconfirmed",
        "AP": "unconfirmed",
        RISK_FEATURE: "unconfirmed",
    }
)

# [0-9], not \d: \d also matches non-ASCII digits, which float() would accept.
_DECIMAL = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
_EVENT_ID = re.compile(r"[0-9]+")
_PADDING = " \t"


class MessageStatus(str, Enum):
    VALID = "valid"
    MISSING_REQUIRED = "missing_required"
    INVALID = "invalid"


class IssueKind(str, Enum):
    """Internal diagnostic codes. Not quality-flag wire values."""

    MISSING = "missing"
    MALFORMED = "malformed"
    NOT_FINITE = "not_finite"
    OUT_OF_RANGE = "out_of_range"
    BOOLEAN = "boolean"
    UNSUPPORTED_TYPE = "unsupported_type"
    PLACEHOLDER = "placeholder"


_INVALID_KINDS = frozenset(IssueKind) - {IssueKind.MISSING, IssueKind.PLACEHOLDER}


@dataclass(frozen=True)
class Issue:
    field: str
    kind: IssueKind


@dataclass(frozen=True)
class MessageCheck:
    """Validation result for one message.

    ``values`` holds only fields that passed, at full precision. A sigma
    placeholder is kept out of ``values`` and reported as ``PLACEHOLDER``.
    Keys are provisional strings in ``ml.data``'s format (``train:1234`` for
    the row, ``train:57`` for the encounter), not the SG-01.2 id types.
    """

    source: str
    row_index: int
    event_id: int | None
    status: MessageStatus
    values: Mapping[str, float | str]
    issues: tuple[Issue, ...]

    @property
    def observation_key(self) -> str:
        return f"{self.source}:{self.row_index}"

    @property
    def encounter_key(self) -> str | None:
        return None if self.event_id is None else f"{self.source}:{self.event_id}"

    @property
    def time_to_tca_days(self) -> float | None:
        return self.values.get(TIME_TO_TCA)

    @property
    def meets_inference_cutoff(self) -> bool | None:
        """Temporal only: raw time_to_tca >= 2 days. Not a data-quality check."""
        tca = self.time_to_tca_days
        return None if tca is None else tca >= EARLY_CUTOFF_DAYS

    @property
    def inference_ready(self) -> bool:
        """Meets the 2-day cutoff and every required field is valid."""
        return self.status is MessageStatus.VALID and bool(self.meets_inference_cutoff)

    @property
    def meets_upcoming_cutoff(self) -> bool | None:
        """Temporal only: raw time_to_tca >= 0."""
        tca = self.time_to_tca_days
        return None if tca is None else tca >= 0

    @property
    def missing_fields(self) -> tuple[str, ...]:
        return tuple(issue.field for issue in self.issues if issue.kind is IssueKind.MISSING)

    @property
    def invalid_fields(self) -> tuple[str, ...]:
        return tuple(issue.field for issue in self.issues if issue.kind in _INVALID_KINDS)


def _number(value: object) -> float | IssueKind:
    if value is None or value == "":
        return IssueKind.MISSING
    if isinstance(value, bool):
        return IssueKind.BOOLEAN
    if isinstance(value, str):
        text = value.strip(_PADDING)
        if not _DECIMAL.fullmatch(text):
            return IssueKind.MALFORMED
        number = float(text)
    elif isinstance(value, numbers.Real):
        try:
            number = float(value)
        except (OverflowError, ValueError):
            return IssueKind.NOT_FINITE
    else:
        return IssueKind.UNSUPPORTED_TYPE
    return number if math.isfinite(number) else IssueKind.NOT_FINITE


def _in_range(number: float, rule: _Range) -> bool:
    if rule is _Range.NON_NEGATIVE:
        return number >= 0
    if rule is _Range.NON_POSITIVE:
        return number <= 0
    return True


def _event_id(value: object) -> int | IssueKind:
    if value is None or value == "":
        return IssueKind.MISSING
    if isinstance(value, bool):
        return IssueKind.BOOLEAN
    if isinstance(value, str):
        text = value.strip(_PADDING)
        return int(text) if _EVENT_ID.fullmatch(text) else IssueKind.MALFORMED
    if isinstance(value, numbers.Integral):
        return int(value) if value >= 0 else IssueKind.OUT_OF_RANGE
    return IssueKind.UNSUPPORTED_TYPE


def validate_message(row: Mapping[str, object], *, source: str, row_index: int) -> MessageCheck:
    """Validate one message. ``row_index`` is its 0-based data row in the source file."""

    if source not in SOURCES:
        raise ValueError(f"source must be one of {', '.join(SOURCES)}, got {source!r}")
    if isinstance(row_index, bool) or not isinstance(row_index, int) or row_index < 0:
        raise ValueError(f"row_index must be a non-negative int, got {row_index!r}")

    values: dict[str, float | str] = {}
    issues: list[Issue] = []

    event_id = _event_id(row.get(ENCOUNTER_COL))
    if isinstance(event_id, IssueKind):
        issues.append(Issue(ENCOUNTER_COL, event_id))
        event_id = None

    for field, rule in _NUMERIC_RANGES.items():
        result = _number(row.get(field))
        if isinstance(result, IssueKind):
            issues.append(Issue(field, result))
        elif not _in_range(result, rule):
            issues.append(Issue(field, IssueKind.OUT_OF_RANGE))
        elif field in SIGMA_FIELDS and result >= SIGMA_PLACEHOLDER:
            issues.append(Issue(field, IssueKind.PLACEHOLDER))
        else:
            values[field] = result

    for field in MESSAGE_CATEGORICAL:
        value = row.get(field)
        if value is None or value == "":
            issues.append(Issue(field, IssueKind.MISSING))
        elif not isinstance(value, str):
            issues.append(Issue(field, IssueKind.UNSUPPORTED_TYPE))
        else:
            values[field] = value

    required_kinds = {issue.kind for issue in issues if issue.field in REQUIRED_FIELDS + (ENCOUNTER_COL,)}
    if required_kinds & _INVALID_KINDS:
        status = MessageStatus.INVALID
    elif IssueKind.MISSING in required_kinds:
        status = MessageStatus.MISSING_REQUIRED
    else:
        status = MessageStatus.VALID

    return MessageCheck(
        source=source,
        row_index=row_index,
        event_id=event_id,
        status=status,
        values=MappingProxyType(values),
        issues=tuple(issues),
    )


def validate_rows(rows: Iterable[Mapping[str, object]], *, source: str) -> list[MessageCheck]:
    """Validate a file's rows in order; row indexes start at 0, as in ``ml.data``."""

    return [validate_message(row, source=source, row_index=index) for index, row in enumerate(rows)]
