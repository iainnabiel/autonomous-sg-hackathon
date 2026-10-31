"""SG-05.1 to SG-05.3 Persistence baseline and Critical-upgrade model.

Approach (decision D3): the persistence rule assigns a tier from the latest early
message; a binary "will this end Critical?" classifier can only upgrade it to Critical.

Run:    python -m ml.train --model persistence                    # SG-05.1
        python -m ml.train --model upgrade --features base        # SG-05.2
        python -m ml.train --model upgrade --features base_mre    # SG-05.3 (+ max_risk_estimate)
Writes: ml/artifacts/<run>/model.joblib                (gitignored)
        ml/artifacts/<run>/validation_predictions.csv  (encounter_id, persistence_tier,
                                                        p_critical, predicted_tier, upgraded)
        ml/reports/<run>.json                          (config, runtime, metrics)

Done when:
- Every run uses ml/splits/train_validation.csv; fit on the training partition only.
- Headline metric: Critical recall vs persistence at a comparable false-alarm level,
  on the cohort excluding final_is_early (decision D4); also report it including them.
- Report confusion matrices, per-tier precision/recall with support, and the
  Critical -> Safe misses; no accuracy-only claims.
- Upgrade threshold chosen on validation and recorded; no calibrated-confidence claim.
- SG-05.3 uses the identical split and discloses dependence on max_risk_estimate.
"""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["persistence", "upgrade"], required=True)
    parser.add_argument("--features", choices=["base", "base_mre"], default="base")
    parser.parse_args()
    raise NotImplementedError("SG-05.1 to SG-05.3")


if __name__ == "__main__":
    main()
