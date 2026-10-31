"""SG-04.1 Profile data quality.

Run:    python -m ml.profile_data
Writes: ml/reports/data_profile.md

Done when:
- Schema, types, missingness, and extreme values reported for train and test.
- Required fields and any exclusions listed.
- Negative time_to_tca rows counted.
- risk = -30 identified as a possible reporting floor (count and share).
- Suspected sentinel values investigated, not silently removed.
"""


def main() -> None:
    raise NotImplementedError("SG-04.1")


if __name__ == "__main__":
    main()
