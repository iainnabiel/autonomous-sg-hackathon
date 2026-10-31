"""SG-04.1 Profile data quality.

Run:    python -m ml.profile_data
Writes: ml/reports/data_profile.md

Done when:
- Schema, types, missingness, and extreme values reported for train and test messages.
- Labels reproduced from train_data + tier rules (check the match rate).
- Counts reported: usable encounters, final_is_early encounters, negative-TCA finals,
  tier support, and Critical split by cause (Pc vs distance).
- risk = -30 identified as a reporting floor; suspected sentinels investigated, not dropped.
"""


def main() -> None:
    raise NotImplementedError("SG-04.1")


if __name__ == "__main__":
    main()
