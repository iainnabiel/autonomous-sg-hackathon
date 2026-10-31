"""SG-05.1 to SG-05.3 Persistence baseline and Critical-upgrade model.

Approach (decision D3): the persistence rule assigns a tier from the latest early
message; a binary "will this end Critical?" classifier can only upgrade it to Critical.

Run:    python -m ml.train --model persistence                    # SG-05.1
        python -m ml.train --model upgrade --features base        # SG-05.2
        python -m ml.train --model upgrade --features base_mre    # SG-05.3 (+ max_risk_estimate)
Writes: ml/artifacts/<run>/model.joblib                (gitignored)
        ml/artifacts/<run>/validation_predictions.csv  (gitignored)
        ml/reports/<run>.json                          (config, runtime, metrics)

The upgrade threshold is chosen on out-of-fold predictions from the training partition,
never on validation (decision D7): the threshold that catches the most extra Critical
encounters while upgrades stay right at least MIN_UPGRADE_PRECISION of the time, i.e. at
most 3 false alarms per extra catch. Validation is scored once with that fixed threshold.
p_critical is also exported so the backend can rank the review queue by it.
"""

import argparse
import json
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from ml.config import ARTIFACTS_DIR, MIN_UPGRADE_PRECISION, REPORTS_DIR, SEED, TIERS, TRAIN_CSV
from ml.data import check_features, file_sha256, load_labels, load_messages
from ml.features import FEATURE_SETS, build_features
from ml.split import load_split

N_BOOTSTRAP = 1000


def make_classifier() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        learning_rate=0.05,
        max_iter=400,
        max_leaf_nodes=31,
        min_samples_leaf=40,
        l2_regularization=1.0,
        class_weight="balanced",
        categorical_features="from_dtype",
        early_stopping=False,
        random_state=SEED,
    )


def apply_upgrade(persistence_tier: pd.Series, p_critical: np.ndarray, threshold: float) -> tuple[pd.Series, pd.Series]:
    upgraded = (persistence_tier != "Critical") & (p_critical >= threshold)
    return persistence_tier.where(~upgraded, "Critical"), upgraded


def _critical_pr(y: pd.Series, pred: pd.Series) -> tuple[float, float]:
    tp = ((pred == "Critical") & (y == "Critical")).sum()
    p = tp / (pred == "Critical").sum() if (pred == "Critical").any() else float("nan")
    r = tp / (y == "Critical").sum() if (y == "Critical").any() else float("nan")
    return p, r


def choose_threshold(y: pd.Series, persistence: pd.Series, p_critical: np.ndarray) -> dict:
    """Most extra Critical catches with upgrade precision >= MIN_UPGRADE_PRECISION (out-of-fold, training)."""
    base_precision, base_recall = _critical_pr(y, persistence)
    best = {"threshold": 1.0, "extra_caught": 0, "extra_false_alarms": 0}
    for t in np.round(np.arange(0.05, 1.0, 0.01), 2):
        _, upgraded = apply_upgrade(persistence, p_critical, t)
        n_up = int(upgraded.sum())
        caught = int((upgraded & (y == "Critical")).sum())
        if n_up and caught / n_up >= MIN_UPGRADE_PRECISION and caught > best["extra_caught"]:
            best = {"threshold": float(t), "extra_caught": caught, "extra_false_alarms": n_up - caught}
    pred, _ = apply_upgrade(persistence, p_critical, best["threshold"])
    precision, recall = _critical_pr(y, pred)
    best.update(
        min_upgrade_precision=MIN_UPGRADE_PRECISION,
        critical_precision=float(precision),
        critical_recall=float(recall),
        persistence_precision=float(base_precision),
        persistence_recall=float(base_recall),
    )
    return best


def evaluate(y: pd.Series, pred: pd.Series, rng: np.random.Generator) -> dict:
    cm = confusion_matrix(y, pred, labels=TIERS)
    per_tier = {}
    for i, t in enumerate(TIERS):
        predicted, actual = cm[:, i].sum(), cm[i, :].sum()
        per_tier[t] = {
            "precision": float(cm[i, i] / predicted) if predicted else None,
            "recall": float(cm[i, i] / actual) if actual else None,
            "support": int(actual),
            "predicted": int(predicted),
        }
    crit = (y == "Critical").to_numpy()
    hit = (pred == "Critical").to_numpy() & crit
    idx = np.flatnonzero(crit)
    boot = [hit[rng.choice(idx, len(idx))].mean() for _ in range(N_BOOTSTRAP)] if len(idx) else []
    return {
        "n": int(len(y)),
        "confusion_matrix": {"labels": TIERS, "rows_actual_cols_predicted": cm.tolist()},
        "per_tier": per_tier,
        "critical_recall_95ci": [float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))] if boot else None,
        "critical_predicted_safe": int(cm[0, 2]),
        "false_critical_alarms": int(cm[1:, 0].sum()),
        "accuracy_not_headline": float(np.trace(cm) / cm.sum()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["persistence", "upgrade"], required=True)
    parser.add_argument("--features", choices=list(FEATURE_SETS), default="base")
    args = parser.parse_args()
    run = "persistence" if args.model == "persistence" else f"upgrade_{args.features}"
    started = time.perf_counter()
    rng = np.random.default_rng(SEED)

    feats = build_features(load_messages("train"))
    labels = load_labels()
    split = load_split()
    data = feats.join(split, how="inner")
    assert len(data) == len(split), "every split encounter needs features"
    train, val = data[data["partition"] == "train"], data[data["partition"] == "validation"]

    config = {"run": run, "model": args.model, "seed": SEED}
    bundle = None
    if args.model == "persistence":
        val_pred, val_upgraded = val["persistence_tier"], pd.Series(False, index=val.index)
        p_val = np.full(len(val), np.nan)
    else:
        cols = FEATURE_SETS[args.features]
        check_features(cols)
        y_train = train["final_tier"].eq("Critical").astype(int)
        oof = cross_val_predict(
            make_classifier(), train[cols], y_train,
            cv=StratifiedKFold(5, shuffle=True, random_state=SEED), method="predict_proba",
        )[:, 1]
        primary = ~train["final_is_early"].to_numpy()
        choice = choose_threshold(train["final_tier"][primary], train["persistence_tier"][primary], oof[primary])
        clf = make_classifier().fit(train[cols], y_train)
        p_val = clf.predict_proba(val[cols])[:, 1]
        val_pred, val_upgraded = apply_upgrade(val["persistence_tier"], p_val, choice["threshold"])
        config.update(
            features=args.features,
            feature_columns=cols,
            classifier=clf.get_params(),
            threshold_selection={"method": "5-fold out-of-fold on training partition, primary cohort", **choice},
        )
        bundle = {"classifier": clf, "feature_set": args.features, "feature_columns": cols, "threshold": choice["threshold"]}

    version = f"{run}-{datetime.now(timezone.utc):%Y%m%d%H%M}"
    out_dir = ARTIFACTS_DIR / run
    out_dir.mkdir(parents=True, exist_ok=True)
    if bundle is not None:
        bundle.update(
            model_version=version,
            sklearn_version=sklearn.__version__,
            train_sha256=file_sha256(TRAIN_CSV),
        )
        joblib.dump(bundle, out_dir / "model.joblib")
    pd.DataFrame(
        {
            "latest_row_id": val["latest_row_id"],
            "final_tier": val["final_tier"],
            "final_is_early": val["final_is_early"],
            "persistence_tier": val["persistence_tier"],
            "p_critical": p_val,
            "predicted_tier": val_pred,
            "upgraded": val_upgraded,
        }
    ).to_csv(out_dir / "validation_predictions.csv")

    primary = ~val["final_is_early"]
    report = {
        "task": "SG-05",
        "model_version": version,
        "config": config,
        "data": {"train_sha256": file_sha256(TRAIN_CSV), "train_encounters": len(train), "validation_encounters": len(val)},
        "validation": {
            "primary_cohort": evaluate(val["final_tier"][primary], val_pred[primary], rng),
            "all_usable": evaluate(val["final_tier"], val_pred, rng),
            "upgraded_encounters_primary": int(val_upgraded[primary].sum()),
        },
        "runtime_seconds": round(time.perf_counter() - started, 1),
        "not_evaluated": "test_data.csv has no outcomes; it is scored only for demo predictions (SG-06.3).",
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / f"{run}.json").write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    m = report["validation"]["primary_cohort"]
    crit = m["per_tier"]["Critical"]
    print(
        f"{run}: primary cohort n={m['n']}  Critical recall {crit['recall']:.3f} "
        f"(95% CI {m['critical_recall_95ci'][0]:.3f}-{m['critical_recall_95ci'][1]:.3f})  "
        f"precision {crit['precision']:.3f}  Critical->Safe {m['critical_predicted_safe']}  "
        f"false Critical {m['false_critical_alarms']}  upgraded {report['validation']['upgraded_encounters_primary']}"
    )


if __name__ == "__main__":
    main()
