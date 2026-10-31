"""SG-04.2 Save encounter-grouped split.

Run:    python -m ml.split
Writes: ml/splits/train_validation.csv  (encounter_id, partition, final_tier, final_is_early)
        ml/splits/split_meta.json       (seed, fraction, train/labels sha256, counts per tier)

Done when:
- Only usable train encounters; 80/20 by encounter, stratified by final_tier.
- No encounter appears in both partitions (assert it); re-running gives identical output.
- Tier support per partition reported, with and without final_is_early encounters.
- test_data.csv is not read.
"""


def main() -> None:
    raise NotImplementedError("SG-04.2")


if __name__ == "__main__":
    main()
