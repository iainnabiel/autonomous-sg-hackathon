# Backend

**Owner:** Iain

Review queue, encounter history, radar summaries, and decision receipts (SG-02).

## Startup

From the repository root:

```bash
python -m backend
```

The command confirms the package imports. It does not listen on a port.

## Review-queue API

Needs the ML stack, the challenge CSVs in `Datasets/`, and a model bundle:

```bash
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt
.venv/bin/python -m ml.train --model upgrade --features base     # writes ml/artifacts/upgrade_base/
.venv/bin/python -m backend.api --cohort validation --model-dir ml/artifacts/upgrade_base --port 8000
```

Then start the dashboard with `VITE_API_URL=http://localhost:8000`.

| Cohort | Encounters | Meaning |
| --- | --- | --- |
| `validation` (default) | 2,389 held-out encounters of the saved split | Historical replay. The current message can show the outcome, so this is not evaluation evidence. |
| `test` | 2,167 `test_data.csv` encounters | Demo predictions. No outcomes exist; nothing is within 24 h. |

Endpoints: `GET /health`, `/queue`, `/encounters/{id}`, `/radar`. `POST /encounters/{id}/review` returns 501 (SG-02.8 is not built). `/metrics` belongs to SG-03.4.

A missing or broken model bundle does not stop the server: every forecast is `unavailable`, the reason is in `/health` and each receipt, and no encounter is filed as Routine.

## Modules

| Module | Task | Role |
| --- | --- | --- |
| `message_validation.py` | SG-02.1 | Validate raw CSV rows; missing versus invalid; time-only cutoff flags |
| `risk_classification.py` | SG-02.2 | Organiser tier rules on one message |
| `forecasts.py` | SG-02.3 | Check `ml.inference.predict_encounters` records and map them to `contracts.Forecast` |
| `assessment.py` | SG-02.4 | Current, latest-early and label selection; carry-forward; SG-01.4 triage; queue order |
| `receipts.py` | SG-02.6 | Decision receipt |
| `radar.py` | SG-02.5 | Counts by hours to closest approach and tier |
| `views.py` | | Render contract objects in the dashboard's provisional shape |
| `service.py`, `api.py` | | Build a cohort from real files; HTTP server |
| `tiers.py` | | Temporary bridge from SG-02.2's `Tier` to `contracts.tiers.Tier` |

## Checks

```bash
python3 -m unittest tests.test_message_validation tests.test_risk_classification tests.test_backend_core
SG_MODEL_DIR=ml/artifacts/upgrade_base .venv/bin/python -m unittest tests.test_backend_real   # real model; skipped otherwise
```
