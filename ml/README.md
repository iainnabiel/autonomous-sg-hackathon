# ml/ — Data, model, limitations

Owner: Khaleil. Covers SG-04, SG-05, and SG-06 in the task plan.

## Setup

Run all commands from the repository root.

```bash
python3 -m venv .venv
.venv/bin/pip install -r ml/requirements.txt
# Put train_data.csv and test_data.csv from the team Drive into Datasets/
.venv/bin/python -m ml.data        # smoke check: row/encounter counts and file checksums
```

## Pipeline

Each stage is one subtask, built on its own branch and PR. Stages marked *stub* raise `NotImplementedError` until their subtask is done.

| Order | Task | Module | Command | Output |
| --- | --- | --- | --- | --- |
| 1 | SG-04.1 Profile data quality | `profile_data.py` (stub) | `python -m ml.profile_data` | `reports/data_profile.md` |
| 2 | SG-04.2 Encounter-grouped split | `split.py` (stub) | `python -m ml.split` | `splits/train_validation.csv`, `splits/split_meta.json` |
| 3 | SG-04.3 Preprocessing | `preprocess.py` (stub) | used by stages 4 to 6 | — |
| 4 | SG-05.1 Constant baseline | `train.py` (stub) | `python -m ml.train --model baseline` | `artifacts/<run>/`, `reports/<run>.json` |
| 5 | SG-05.2 Telemetry model | `train.py` (stub) | `python -m ml.train --model hgb --features telemetry` | as above |
| 6 | SG-05.3 With `max_risk_estimate` | `train.py` (stub) | `python -m ml.train --model hgb --features telemetry_mre` | as above |
| 7 | SG-05.4 Package inference | `inference.py` (stub) | `from ml.inference import predict_rows` | model bundle for the backend |
| 8 | SG-06.1 Select model on validation | to add | — | `reports/model_selection.md` |
| 9 | SG-06.2 Missed critical cases | to add | — | `reports/failure_analysis.md` |
| 10 | SG-06.3 Freeze and score test | to add | — | final test predictions + metrics |
| 11 | SG-06.4 Held-out demo histories | to add | — | demo encounter export |
| 12 | SG-06.5 *(Next)* Quality sensitivity | to add | — | `reports/sensitivity.md` |
| 13 | SG-06.6 *(Stretch)* Bounded sensitivity experiment | to add | — | experiment spec |

Shared code:
- `config.py`: paths, seed, feature sets, forbidden columns, and risk thresholds.
- `data.py`: `load("train" | "test")` adds `source`, `row_id`, and `encounter_id`; `feature_columns()` rejects leaked columns; `file_sha256()` gives data checksums.

## Identifiers

- `row_id = "<source>:<row index>"`, e.g. `train:1234`. This is the 0-based data row in the CSV.
- `encounter_id = "<source>:<event_id>"`, e.g. `test:57`.
- Both stay stable only while the CSV is unchanged, so save the file's SHA-256 with every split and prediction file.

These IDs are provisional until Iain's contracts (SG-01.2) are merged. If the contract field names differ, the contract wins.

## Rules for this folder

- `risk` is the label only. It and the encounter IDs must never be features (`feature_columns()` enforces this).
- Fit everything on the training partition only. Use the test file only at SG-06.3, after the model is frozen, and disclose any later changes.
- Commit only small outputs (`reports/`, `splits/`). `artifacts/` is gitignored; share models through the Drive with a checksum and version.

## Per-subtask routine

```bash
git fetch origin
git switch -c feature/sg-04.1-profile-data origin/main   # one branch per subtask
# implement the stub, then run its command and the smoke check
git add ml/<files for this task>                          # never Datasets/ or ml/artifacts/
git commit -m "SG-04.1: profile data quality"
git push -u origin feature/sg-04.1-profile-data
gh pr create --base main --reviewer <teammate>            # a teammate approves, a human merges
```

Each stage's acceptance criteria are in its module docstring and in [docs/TASK_PLAN.md](../docs/TASK_PLAN.md).
