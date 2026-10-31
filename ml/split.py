"""SG-04.2 Save encounter-grouped split.

Run:    python -m ml.split
Writes: ml/splits/train_validation.csv  (encounter_id, partition)
        ml/splits/split_meta.json       (seed, fraction, train CSV sha256, counts, critical support)

Done when:
- No encounter appears in both partitions (assert it).
- Seed and membership saved; re-running gives identical output.
- Row/encounter counts and critical-case support reported per partition.
- Test file is not read.
"""


def main() -> None:
    raise NotImplementedError("SG-04.2")


if __name__ == "__main__":
    main()
