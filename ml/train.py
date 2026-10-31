"""SG-05.1 to SG-05.3 Train and compare models on the validation partition.

Run:    python -m ml.train --model baseline                          # SG-05.1
        python -m ml.train --model hgb --features telemetry          # SG-05.2
        python -m ml.train --model hgb --features telemetry_mre      # SG-05.3
Writes: ml/artifacts/<run>/model.joblib                (gitignored)
        ml/artifacts/<run>/validation_predictions.csv  (row_id, encounter_id, predicted_log_pc)
        ml/reports/<run>.json                          (config, runtime, error, critical detection)

Done when:
- Every run uses ml/splits/train_validation.csv and fits on training only.
- Baseline is a constant log-risk predictor.
- One tree-based regressor (e.g. HistGradientBoostingRegressor); finite outputs.
- Conversion to Pc and any clipping documented; no calibrated-confidence claim.
- SG-05.3 uses the identical split and cohort and discloses dependence on max_risk_estimate.
"""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["baseline", "hgb"], required=True)
    parser.add_argument("--features", choices=["telemetry", "telemetry_mre"], default="telemetry")
    parser.parse_args()
    raise NotImplementedError("SG-05.1 to SG-05.3")


if __name__ == "__main__":
    main()
