# SG-03.5: Reproduce the evaluation from a clean checkout

This procedure regenerates `evaluation/reports/metrics.json` from raw data and checks it. It then serves the file through the backend `/metrics` route and shows it on the dashboard. Nothing in it commits data or model files.

## What you need

| Need | Notes |
| --- | --- |
| Python 3.12+ | Tested with 3.14.2 |
| `ml/requirements.txt` | `joblib`, `numpy`, `pandas`, `scikit-learn`, `tabulate` |
| `openpyxl` | Only to export the organiser label sheet |
| Node 20+ and npm | Only for the dashboard check |
| Organiser files, **local only** | `train_data.csv`, `test_data.csv`, `challenge1_event_labels.xlsx`. Get them from the team Drive. `Datasets/` and `data/` are gitignored. |

## Steps

Run every command from the repository root.

```bash
git clone https://github.com/iainnabiel/autonomous-sg-hackathon && cd autonomous-sg-hackathon
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt openpyxl

# 1. Local data (gitignored; never commit)
mkdir -p Datasets
cp /path/to/train_data.csv /path/to/test_data.csv Datasets/
.venv/bin/python -m evaluation export-labels /path/to/challenge1_event_labels.xlsx
.venv/bin/python -m ml.data            # labels reproduced from train_data + tier rules: 100.0%

# 2. Model runs (do not run ml.split; the committed split is the evaluation split)
.venv/bin/python -m ml.train --model persistence
.venv/bin/python -m ml.train --model upgrade --features base

# 3. Rerun the evaluation into a scratch directory and compare with the committed report
.venv/bin/python -m evaluation report --out /tmp/sg03-rerun
.venv/bin/python -m evaluation verify --actual /tmp/sg03-rerun/metrics.json

# 4. Serve the committed report through the backend, then compare the HTTP body with the file
.venv/bin/python -m backend.api --cohort validation --model-dir ml/artifacts/upgrade_base --port 8000 &
.venv/bin/python -m evaluation verify --served http://localhost:8000/metrics

# 5. Dashboard (optional)
cd frontend && npm ci && VITE_API_URL=http://localhost:8000 npx vite --port 5173
# open http://localhost:5173/evaluation
```

`ml.train` rewrites `ml/reports/persistence.json` and `ml/reports/upgrade_base.json` with a new `model_version` timestamp. Don't commit those changes, or `git restore ml/reports` them, unless the team intends to replace the shipped run.

## Expected output

### Steps 1 and 2: data and model runs

- `export-labels` writes 13,154 label rows.
- `ml.train` prints:
  - `persistence: primary cohort n=1786  Critical recall 0.802 … false Critical 31  upgraded 0`
  - `upgrade_base: … Critical recall 0.873 … false Critical 52  upgraded 30`

### Step 3: evaluation rerun

`verify --actual` exits 0 and prints the following.

| Field | Expected | Meaning |
| --- | --- | --- |
| `"metrics_identical"` | `true` | Every evaluated value matches the committed report. |
| `"same_model_artifact"` | `false` after retraining | A fresh `ml.train` run gets a new `model_version` timestamp and model SHA-256. The numbers reproduce, but it is a different artifact; the two are not interchangeable. |
| `expected_run` / `actual_run` | Both runs | Identify the two runs being compared. |

Committed report values:

| Item | Value |
| --- | --- |
| Primary validation cohort | n = 1,786, 126 final-tier Critical |
| Persistence | 101 caught, 31 false Critical (FPR 1.9%) |
| Upgrade model, threshold 0.12 | 110 caught, 52 false Critical (FPR 3.1%); 30 upgrades, 30% correct |
| All-usable cohort | n = 2,389. Persistence 142/167, upgrade 151/167 |
| Unable to assess | 1,212 over the full train dataset; 0 in the validation partition |
| Top-10% coverage of final-tier Critical, proposed queue | 0.873 |
| Top-10% coverage, persistence queue | 0.802 |
| Top-10% coverage, miss distance first | **0.913** |
| Top-10% coverage, supplied risk first | 0.302 |
| Top-10% coverage, TCA first | 0.079 |

Ranking by miss distance alone beats the proposed queue at the top 10%. This is reported as found. It was not tuned away on validation.

### Step 4: served `/metrics`

`verify --served` exits 0 and reports `"http_status": 200` and `"identical": true`.

The served body is `contracts.schemas.MetricsReport`:

- `cohort_label`, `sample_count`, `model_version`, `policy_version`, `metrics`, `labels`;
- the full evidence under `evidence`;
- `labels` is empty, because per-encounter outcomes are not served.

### Step 5: dashboard

The Evaluation page shows:

- the metrics report (`cohort validation primary …`, `n 1,786`);
- the model comparison and confusion matrices;
- the ranking-coverage chart.

## Run identity

`evidence.sg03.artifacts` records, for each run:

- the `model_version`;
- SHA-256s of the ML report and the prediction file;
- the training data checksum the run used.

For the shipped run it also records the model bundle's SHA-256, plus its `model_version`, read from the bundle when joblib is installed.

- **Mismatches stop the report:** a run on other training data, or a bundle from another run.
- **Version drift is noted:** if the repository's committed `ml/reports` describe a different run than the one scored, `evidence.sg03.notes` says so.

The committed `metrics.json` scores local run `upgrade_base-202610310747` (bundle SHA-256 `317f021c…`). The committed `ml/reports/upgrade_base.json` describes run `…0654`. Their metric values are identical, but they are separate artifacts.

## Verified so far, and what still needs a teammate

**Verified by the SG-03 agent on 31 Oct 2026**, from a fresh clone of `feature/sg-03-5-reproducibility` with main merged, on macOS and Python 3.14.2:

- steps 1–4;
- the committed report reproduced exactly, with `same_model_artifact` false as expected;
- the backend served the file identically.

**Still required:** an independent teammate rerun on their own machine with their own copy of the organiser files. That is the SG-03.5 acceptance check. The agent's run is not a substitute.
