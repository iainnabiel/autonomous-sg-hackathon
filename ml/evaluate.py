"""Full score panel on validation, plus 5-fold cross-validation over all usable train encounters.

Run:    python -m ml.evaluate      (after python -m ml.train for persistence and upgrade_base)
Writes: ml/reports/evaluation.md, ml/reports/evaluation.json

Validation: the saved SG-04.2 split, scored once (same numbers as ml.train).
Cross-validation: every usable train encounter is scored exactly once by a model that never
saw it. Each outer fold repeats the full recipe on its own training folds, including choosing
the upgrade threshold by inner 5-fold out-of-fold predictions, so no fold sees its test labels.
Folds are stratified by final_tier and grouped by encounter (one row per encounter).
All metrics are on the primary cohort (final_is_early excluded, decision D4).
"""

import json

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    cohen_kappa_score,
    f1_score,
    fbeta_score,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from ml.config import ARTIFACTS_DIR, REPORTS_DIR, SEED, TIERS
from ml.data import load_labels, load_messages
from ml.features import FEATURE_SETS, build_features
from ml.train import apply_upgrade, choose_threshold, make_classifier

N_FOLDS = 5
FEATURES = FEATURE_SETS["base"]


def score(y: pd.Series, pred: pd.Series, p_critical: np.ndarray | None = None) -> dict:
    """Score panel for 3-tier predictions; Critical-vs-rest metrics on top."""
    p, r, f, s = precision_recall_fscore_support(y, pred, labels=TIERS, zero_division=0)
    yc, pc = (y == "Critical").to_numpy(), (pred == "Critical").to_numpy()
    out = {
        "n": int(len(y)),
        "accuracy": accuracy_score(y, pred),
        "balanced_accuracy": balanced_accuracy_score(y, pred),
        "macro_f1": f1_score(y, pred, labels=TIERS, average="macro", zero_division=0),
        "weighted_f1": f1_score(y, pred, labels=TIERS, average="weighted", zero_division=0),
        "cohen_kappa": cohen_kappa_score(y, pred, labels=TIERS),
        "per_tier": {t: {"precision": p[i], "recall": r[i], "f1": f[i], "support": int(s[i])} for i, t in enumerate(TIERS)},
        "critical_f1": f1_score(yc, pc, zero_division=0),
        "critical_f2": fbeta_score(yc, pc, beta=2, zero_division=0),
        "critical_missed_as_safe": int((yc & (pred == "Safe").to_numpy()).sum()),
        "false_critical": int((~yc & pc).sum()),
    }
    if p_critical is not None:
        out["critical_roc_auc"] = roc_auc_score(yc, p_critical)
        out["critical_pr_auc"] = average_precision_score(yc, p_critical)
    return out


def _validation() -> dict:
    res = {}
    for run in ("persistence", "upgrade_base"):
        path = ARTIFACTS_DIR / run / "validation_predictions.csv"
        if not path.exists():
            raise FileNotFoundError(f"{path} not found; run python -m ml.train for {run}")
        v = pd.read_csv(path)
        v = v[~v["final_is_early"]]
        res[run] = score(v["final_tier"], v["predicted_tier"], v["p_critical"].to_numpy() if run != "persistence" else None)
    return res


def _cross_validate() -> tuple[dict, pd.DataFrame]:
    feats = build_features(load_messages("train"))
    labels = load_labels()
    data = feats.join(labels.loc[labels["usable"], ["final_tier", "final_is_early"]], how="inner")
    outer = StratifiedKFold(N_FOLDS, shuffle=True, random_state=SEED)
    preds, thresholds = [], []
    for fold, (tr_idx, te_idx) in enumerate(outer.split(data, data["final_tier"])):
        train, test = data.iloc[tr_idx], data.iloc[te_idx]
        y = train["final_tier"].eq("Critical").astype(int)
        oof = cross_val_predict(
            make_classifier(), train[FEATURES], y,
            cv=StratifiedKFold(N_FOLDS, shuffle=True, random_state=SEED), method="predict_proba",
        )[:, 1]
        primary = ~train["final_is_early"].to_numpy()
        threshold = choose_threshold(train["final_tier"][primary], train["persistence_tier"][primary], oof[primary])["threshold"]
        clf = make_classifier().fit(train[FEATURES], y)
        p = clf.predict_proba(test[FEATURES])[:, 1]
        tier, upgraded = apply_upgrade(test["persistence_tier"], p, threshold)
        preds.append(pd.DataFrame({"fold": fold, "final_tier": test["final_tier"], "final_is_early": test["final_is_early"],
                                   "persistence_tier": test["persistence_tier"], "p_critical": p,
                                   "predicted_tier": tier, "upgraded": upgraded}, index=test.index))
        thresholds.append(threshold)
        print(f"  fold {fold}: threshold {threshold}, upgraded {int(upgraded.sum())}")
    cv = pd.concat(preds)
    cv = cv[~cv["final_is_early"]]

    def per_fold(col: str, metric) -> list[float]:
        return [metric(g) for _, g in cv.groupby("fold")]

    result = {
        "folds": N_FOLDS,
        "thresholds": thresholds,
        "pooled": {
            "persistence": score(cv["final_tier"], cv["persistence_tier"]),
            "upgrade_base": score(cv["final_tier"], cv["predicted_tier"], cv["p_critical"].to_numpy()),
        },
        "per_fold": {
            name: {
                metric: per_fold(col, lambda g, c=col, m=metric: score(g["final_tier"], g[c])[m] if m != "critical_recall"
                                 else score(g["final_tier"], g[c])["per_tier"]["Critical"]["recall"])
                for metric in ("critical_recall", "critical_f1", "macro_f1")
            }
            for name, col in (("persistence", "persistence_tier"), ("upgrade_base", "predicted_tier"))
        },
    }
    return result, cv


def _row(name: str, m: dict) -> dict:
    c = m["per_tier"]["Critical"]
    return {
        "model": name,
        "n": m["n"],
        "Critical P": f"{c['precision']:.3f}", "Critical R": f"{c['recall']:.3f}", "Critical F1": f"{m['critical_f1']:.3f}",
        "Critical F2": f"{m['critical_f2']:.3f}",
        "Elevated F1": f"{m['per_tier']['Elevated']['f1']:.3f}", "Safe F1": f"{m['per_tier']['Safe']['f1']:.3f}",
        "macro F1": f"{m['macro_f1']:.3f}", "weighted F1": f"{m['weighted_f1']:.3f}",
        "balanced acc": f"{m['balanced_accuracy']:.3f}", "accuracy": f"{m['accuracy']:.3f}", "kappa": f"{m['cohen_kappa']:.3f}",
        "Crit→Safe": m["critical_missed_as_safe"], "false Crit": m["false_critical"],
    }


def _ms(values: list[float]) -> str:
    return f"{np.mean(values):.3f} ± {np.std(values):.3f}"


def main() -> None:
    val = _validation()
    print("cross-validating...")
    cv, cv_preds = _cross_validate()
    cv_preds.to_csv(ARTIFACTS_DIR / "cv_predictions.csv")

    pooled = cv["pooled"]
    support = pooled["persistence"]["per_tier"]
    lines = [
        "# Evaluation",
        "",
        "Generated by `python -m ml.evaluate`. All scores are on the primary cohort: usable train encounters "
        "whose final message is inside 2 days of closest approach (decision D4). `test_data.csv` has no "
        "outcomes, so there are no test scores.",
        "",
        "Critical P / R / F1 / F2 treat Critical vs not-Critical. F2 weights recall twice as much as precision, "
        "which matches the cost of a missed Critical. Accuracy is shown for completeness but is not a headline: "
        "predicting everything Safe would already score about 0.73.",
        "",
        "## Validation split (SG-04.2, scored once)",
        "",
        pd.DataFrame([_row("Persistence (rule only)", val["persistence"]), _row("Upgrade model, shipped", val["upgrade_base"])]).set_index("model").T.to_markdown(),
        "",
        f"Ranking quality of `p_critical` for Critical vs rest: ROC-AUC {val['upgrade_base']['critical_roc_auc']:.3f}, "
        f"PR-AUC {val['upgrade_base']['critical_pr_auc']:.3f}.",
        "",
        f"## {N_FOLDS}-fold cross-validation (every usable train encounter scored once)",
        "",
        f"Support: Critical {support['Critical']['support']:,}, Elevated {support['Elevated']['support']:,}, "
        f"Safe {support['Safe']['support']:,}. Thresholds chosen per fold on inner folds: {cv['thresholds']}.",
        "",
        "### Pooled over all folds",
        "",
        pd.DataFrame([_row("Persistence (rule only)", pooled["persistence"]), _row("Upgrade model, shipped", pooled["upgrade_base"])]).set_index("model").T.to_markdown(),
        "",
        f"Ranking quality of `p_critical`: ROC-AUC {pooled['upgrade_base']['critical_roc_auc']:.3f}, "
        f"PR-AUC {pooled['upgrade_base']['critical_pr_auc']:.3f}.",
        "",
        "### Spread across folds (mean ± standard deviation)",
        "",
        pd.DataFrame(
            {name: {m: _ms(v) for m, v in metrics.items()} for name, metrics in cv["per_fold"].items()}
        ).rename(columns={"persistence": "Persistence", "upgrade_base": "Upgrade model"}).to_markdown(),
        "",
    ]
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "evaluation.md").write_text("\n".join(lines), encoding="utf-8")
    (REPORTS_DIR / "evaluation.json").write_text(json.dumps({"validation": val, "cross_validation": cv}, indent=2, default=float) + "\n", encoding="utf-8")
    print("wrote ml/reports/evaluation.md and ml/reports/evaluation.json")


if __name__ == "__main__":
    main()
