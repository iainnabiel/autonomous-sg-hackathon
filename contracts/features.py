"""Which columns may enter inference."""

from __future__ import annotations

from collections.abc import Iterable

from contracts.errors import ContractError
from contracts.policy import FORBIDDEN_INFERENCE_COLUMNS


def assert_inference_columns(columns: Iterable[str], *, early_messages_only: bool) -> None:
    """Reject labels, identifiers, and full-event metadata.

    ``risk`` is the supplied early-message log10(Pc). It is allowed only when
    every input row is already restricted to ``time_to_tca >= 2`` days.
    """

    names = set(columns)
    leaked = {name for name in names if name.startswith("final_") or name in FORBIDDEN_INFERENCE_COLUMNS}
    if leaked:
        raise ContractError(f"forbidden inference columns: {sorted(leaked)}")
    if "risk" in names and not early_messages_only:
        raise ContractError(
            "supplied risk may be a feature only for observations with time_to_tca >= 2 days"
        )
