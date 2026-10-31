# ml/ — Data, model, limitations

Owner: Khaleil. Covers SG-04, SG-05, and SG-06 in the task plan.

**Task:** predict each encounter's final tier (Safe / Elevated / Critical) using only messages sent at least 2 days before closest approach. Approach, metric, and cohort decisions are in [docs/ML_DECISIONS.md](../docs/ML_DECISIONS.md).

## Setup

Run all commands from the repository root.

```bash
python3 -m venv .venv
.venv/bin/pip install -r ml/requirements.txt
# Put train_data.csv, test_data.csv, and train_event_labels.csv from the team Drive into Datasets/
.venv/bin/python -m ml.data        # smoke check: counts, checksums, label reproduction
```

## Data

| File | Grain | Loader |
| --- | --- | --- |
| `train_data.csv` | one row per message | `load_messages("train")` |
| `test_data.csv` | one row per message, all ≥ 2 days out, no outcomes | `load_messages("test")` |
| `train_event_labels.csv` | one row per train encounter | `load_labels()` |

- `early_messages()` keeps messages with `time_to_tca` ≥ 2 days; only these may be model inputs.
- `load_labels()` adds `usable` (has early messages) and `final_is_early` (final message is itself ≥ 2 days out, so excluded from the primary cohort).
- `tier()` applies the organisers' tier rules. It reproduces every label from `train_data.csv`.

## Pipeline

Each stage is one subtask, built on its own branch and PR. Stages marked *stub* raise `NotImplementedError` until their subtask is done.

| Order | Task | Module | Command | Output |
| --- | --- | --- | --- | --- |
| 1 | SG-04.1 Profile data quality | `profile_data.py` | `python -m ml.profile_data` | `reports/data_profile.md` |
| 2 | SG-04.2 Encounter-grouped split | `split.py` | `python -m ml.split` | `splits/train_validation.csv`, `splits/split_meta.json` |
| 3 | SG-04.3 Encounter features | `features.py` | used by stages 4 to 7 | — |
| 4 | SG-05.1 Persistence baseline | `train.py` | `python -m ml.train --model persistence` | `artifacts/<run>/`, `reports/<run>.json` |
| 5 | SG-05.2 Critical-upgrade model | `train.py` | `python -m ml.train --model upgrade --features base` | as above |
| 6 | SG-05.3 With `max_risk_estimate` | `train.py` | `python -m ml.train --model upgrade --features base_mre` | as above |
| 7 | SG-05.4 Package inference | `inference.py` | `python -m ml.inference --source test` | `artifacts/predictions_test.csv`; `predict_encounters()` for the backend |
| 8 | SG-06.1 Select model on validation | `model_card.py` | `python -m ml.model_card` | `reports/model_card.md` |
| 9 | SG-06.2 Missed Critical cases | `failures.py` | `python -m ml.failures` | `reports/failure_analysis.md` |
| 10 | SG-06.3 Freeze and score test | `inference.py`, `model_card.py` | `python -m ml.inference --source test` | `artifacts/predictions_test.csv`; frozen version in `reports/model_card.md` |
| 11 | SG-06.4 Held-out demo histories | `model_card.py` | `python -m ml.model_card` | demo IDs in `reports/model_card.md`; `artifacts/demo_histories.csv` |
| 12 | SG-06.5 *(Next)* Quality sensitivity | to add | — | `reports/sensitivity.md` |
| 13 | SG-06.6 *(Stretch)* Bounded sensitivity experiment | to add | — | experiment spec |

## Reproduce everything

```bash
P=.venv/bin/python
$P -m ml.profile_data && $P -m ml.split
$P -m ml.train --model persistence
$P -m ml.train --model upgrade --features base
$P -m ml.train --model upgrade --features base_mre
$P -m ml.inference --source test && $P -m ml.failures && $P -m ml.model_card
```

## Identifiers

- `row_id = "<source>:<row index>"`, e.g. `train:1234`. This is the 0-based data row in the CSV.
- `encounter_id = "<source>:<event_id>"`, e.g. `test:57`. `event_id` restarts in each file, so never join train and test on it.
- Both stay stable only while the CSV is unchanged, so save the file's SHA-256 with every split and prediction file.

These IDs are provisional until Iain's contracts (SG-01.2) are merged. If the contract field names differ, the contract wins.

## Rules for this folder

- Inputs come only from early messages. `final_*` columns, IDs, and `mission_id` are never features (`check_features()` enforces this).
- Fit everything on the training partition only.
- Encounters with no early message are "unable to assess", never Safe.
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
