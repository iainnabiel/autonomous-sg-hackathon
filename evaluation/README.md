# Evaluation

**Owner:** Iain

Held-out scoring of final-tier detection and queue usefulness (SG-03). Metric definitions and the `/metrics` payload are SG-03.

## Startup

From the repository root:

```bash
python -m evaluation
```

The command confirms the package imports. It does not compute metrics.

## Validation report (SG-03.2)

```bash
python -m ml.train --model persistence                 # writes ml/artifacts/persistence/ and ml/reports/
python -m ml.train --model upgrade --features base     # writes ml/artifacts/upgrade_base/
python -m evaluation report --with-model-sha           # writes evaluation/reports/metrics.json and metrics.md
python -m unittest discover -s tests -p 'test_evaluation_*.py'
```

Local inputs, never committed (see `ml/README.md`):

- `Datasets/train_data.csv`, and the organisers' labels as `Datasets/train_event_labels.csv`: a note line, a blank line, then the header. Other locations can be passed with `--train` and `--labels`.
- `ml/artifacts/*/validation_predictions.csv` from `ml.train`, or from another checkout via `--ml-root <path>/ml`.

What the report does:

- **Labels:** the organisers' `final_tier` and `usable_for_training` are the labels of record. Raw messages only cross-check them, and any disagreement stops the run.
- **Cohorts (D4):** `primary` (validation, final message inside 2 days) and `all_usable`, reported separately. Unable-to-assess encounters are counted over the full train dataset and are never treated as Safe.
- **Joins:** predictions and labels are joined one-to-one on source-qualified encounter IDs (`train:57`). Missing, duplicate or unexpected predictions stop the run.
- **Checks against ML:** the labels inside the ML prediction file are compared with SG-03's labels, and each forecast must name the encounter's latest raw-eligible message.
- **Comparison:** the upgrade model and persistence are compared on the same encounters. The output reports catches, false alarms, false-positive rates, upgrade precision against the D7 budget, a paired bootstrap interval and exact McNemar. **It is a trade-off, not an equal-false-alarm comparison.**
- **Nothing is fitted or tuned here.** The threshold comes from `ml/reports/upgrade_base.json`.

The top level of `metrics.json` follows the dashboard's provisional `MetricsResponse` (`frontend/src/api/types.ts`). SG-03 detail is under `sg03`. SG-03.3 ranking coverage is in `ranking_coverage` (the dashboard shape) and `sg03.ranking`. It covers the proposed queue (`contracts.triage`, no `p_critical`), the same queue with persistence, and supplied-risk, distance and TCA baselines, all ranked at each encounter's early-warning snapshot. Positives are final-tier Critical encounters.

## Serving `/metrics` (SG-03.4)

`evaluation.served.metrics_response()` returns `evaluation/reports/metrics.json` unchanged. If the file has not been generated it returns `{"status": "not_evaluated", ...}`. A malformed file, or one with the wrong schema version, raises `MetricsFileError`. It never returns fixtures or recomputes anything. The backend `/metrics` route (SG-02 API) should return this value. Until that exists, `python -m ml.demo_api --metrics evaluation/reports/metrics.json` (#28) serves the same file.
