"""Bundle the ML team's committed validation reports into one JSON the dashboard can show.

Usage:
    python3 frontend/scripts/bundle_evidence.py <ml/reports dir> <git commit> <branch>

Reads ml/reports/{persistence,upgrade_base,upgrade_base_mre,evaluation}.json plus the
markdown tables in failure_analysis.md and sensitivity.md, and writes
frontend/src/evidence/validation.json. Nothing is computed here: every number is copied
from the reports, and the output records where it came from. This bundle stands in for
the SG-03.4 /metrics endpoint until the backend serves it.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

reports = Path(sys.argv[1])
commit = sys.argv[2]
branch = sys.argv[3]
out = Path(__file__).resolve().parent.parent / "src" / "evidence" / "validation.json"


def load(name):
    return json.loads((reports / name).read_text())


def md_tables(path):
    """All pipe tables in a markdown file, as lists of dict rows keyed by header."""
    tables, rows, header = [], [], None
    for line in (reports / path).read_text().splitlines() + [""]:
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if header is None:
                header = cells
            elif all(re.fullmatch(r":?-+:?", c) for c in cells):
                continue
            else:
                rows.append(dict(zip(header, cells)))
        else:
            if header is not None:
                tables.append(rows)
            rows, header = [], None
    return tables


def num(s):
    s = s.replace(",", "").strip()
    if s in ("n/a", "—", "-", ""):
        return None
    return float(s)


persistence, base, mre, evaluation = load("persistence.json"), load("upgrade_base.json"), load("upgrade_base_mre.json"), load("evaluation.json")


def cohort(v):
    return {
        "n": v["n"],
        "confusion_matrix": v["confusion_matrix"],
        "per_tier": v["per_tier"],
        "critical_recall_95ci": v["critical_recall_95ci"],
        "critical_predicted_safe": v["critical_predicted_safe"],
        "false_critical_alarms": v["false_critical_alarms"],
        "accuracy_not_headline": v["accuracy_not_headline"],
    }


def model(key, label, role, report, threshold, ranking):
    v = report["validation"]
    return {
        "key": key,
        "label": label,
        "role": role,
        "model_version": report["model_version"],
        "threshold": threshold,
        "upgrades": v.get("upgraded_encounters_primary"),
        "cohorts": {"primary": cohort(v["primary_cohort"]), "all_usable": cohort(v["all_usable"])},
        "ranking": ranking,
    }


ev_val = evaluation["validation"]
models = [
    model("persistence", "Persistence rule (SG-05.1)", "baseline", persistence, None, None),
    model("upgrade_base", "Upgrade, base features (SG-05.2)", "shipped", base, base["config"]["threshold_selection"]["threshold"],
          {"roc_auc": ev_val["upgrade_base"]["critical_roc_auc"], "pr_auc": ev_val["upgrade_base"]["critical_pr_auc"]}),
    model("upgrade_base_mre", "Upgrade + max_risk_estimate (SG-05.3)", "comparison", mre, mre["config"]["threshold_selection"]["threshold"], None),
]

cv = evaluation["cross_validation"]
pooled = {}
for k in ("persistence", "upgrade_base"):
    p = cv["pooled"][k]
    pooled[k] = {
        "critical_precision": p["per_tier"]["Critical"]["precision"],
        "critical_recall": p["per_tier"]["Critical"]["recall"],
        "critical_f1": p["critical_f1"],
        "critical_f2": p["critical_f2"],
        "macro_f1": p["macro_f1"],
        "false_critical": p["false_critical"],
        "critical_missed_as_safe": p["critical_missed_as_safe"],
    }
support = {t: cv["pooled"]["persistence"]["per_tier"][t]["support"] for t in ("Critical", "Elevated", "Safe")}

failure = md_tables("failure_analysis.md")
detect = failure[0]
pc_rows = [r for r in detect if "Pc-critical" in r["model"]]
pc_subset = {
    "support": int(num(pc_rows[0]["Critical support"])),
    "rows": [{"model": r["model"], "detected": int(num(r["detected"])), "missed": int(num(r["missed"])), "false_alarms": int(num(r["false Critical alarms"]))} for r in pc_rows],
    "note": "Probability-critical (final log10 Pc >= -4) encounters are rare in this cohort. Any recall on that subset is anecdotal.",
}
missed = [r for r in detect if r["model"].startswith("Upgrade (base)")][0]
detection = [
    {"model": r["model"], "support": int(num(r["Critical support"])), "detected": int(num(r["detected"])), "missed": int(num(r["missed"])), "missed_as_safe": int(num(r["missed as Safe"])), "false_alarms": int(num(r["false Critical alarms"]))}
    for r in detect if "Pc-critical" not in r["model"]
]

sens = md_tables("sensitivity.md")
tca_bands = [
    {"condition": r["condition"], "encounters": int(num(r["encounters"])), "critical": int(num(r["Critical"])), "rule_recall": num(r["rule Critical recall"]), "model_recall": num(r["model Critical recall"]), "model_precision": num(r["model Critical precision"]), "false_critical": int(num(r["false Critical"]))}
    for r in sens[0]
]
masked = [
    {"condition": r["condition"], "encounters": int(num(r["encounters"])), "critical": int(num(r["Critical"])), "rule_recall": num(r["rule Critical recall"]), "model_recall": num(r["model Critical recall"]), "model_precision": num(r["model Critical precision"]), "false_critical": int(num(r["false Critical"])), "tiers_changed": int(num(r["tiers changed"]))}
    for r in sens[1]
]
importance = [{"feature": r["feature"], "mean_drop_pr_auc": num(r["mean drop in PR-AUC"]), "std": num(r["std"])} for r in sens[2]]
sens_version = re.search(r"Frozen model `([^`]+)`", (reports / "sensitivity.md").read_text()).group(1)

card = (reports / "model_card.md").read_text()
sha = re.search(r"Bundle SHA-256 \| `([0-9a-f]+)`", card).group(1)

bundle = {
    "status": "evaluated",
    "provenance": {
        "source": "ml/reports (persistence.json, upgrade_base.json, upgrade_base_mre.json, evaluation.json, failure_analysis.md, sensitivity.md, model_card.md)",
        "commit": commit,
        "branch": branch,
        "bundled_on": date.today().isoformat(),
        "generated_by": "python -m ml.train, ml.evaluate, ml.failures, ml.sensitivity, ml.model_card (Khaleil, SG-05/SG-06)",
        "note": "Bundled copy of committed validation reports. Not served by a live /metrics endpoint (SG-03.4). Numbers are copied, not recomputed.",
    },
    "dataset": {
        "train_sha256": base["data"]["train_sha256"],
        "split": f"encounter-grouped, seed {base['config']['seed']}, {base['data']['train_encounters']} train / {base['data']['validation_encounters']} validation encounters (SG-04.2)",
        "cohort": "validation partition, primary cohort",
        "cohort_definition": "usable encounters (at least one message >= 2 days before closest approach) whose final message is inside 2 days, so the label is not visible in the inputs (decision D4). 'All usable' adds the encounters whose final message is itself early.",
    },
    "model_version": base["model_version"],
    "model_sha256": sha,
    "policy_version": "triage-policy-0.1 (prototype)",
    "thresholds": {
        "upgrade_p_critical": base["config"]["threshold_selection"]["threshold"],
        "min_upgrade_precision": base["config"]["threshold_selection"]["min_upgrade_precision"],
        "selection": base["config"]["threshold_selection"]["method"],
    },
    "models": models,
    "detection": detection,
    "probability_critical": pc_subset,
    "cross_validation": {
        "folds": cv["folds"],
        "n": cv["pooled"]["persistence"]["n"],
        "support": support,
        "thresholds": cv["thresholds"],
        "pooled": pooled,
        "per_fold": {k: {"critical_recall": cv["per_fold"][k]["critical_recall"]} for k in ("persistence", "upgrade_base")},
    },
    "ranking_coverage": None,
    "sensitivity": {"model_version": sens_version, "tca_bands": tca_bands, "masked_inputs": masked, "importance": importance},
    "test": {"state": "unavailable", "reason": base["not_evaluated"]},
    "limitations": [
        "Messages inside 2 days of closest approach are not model inputs, so late geometry changes are invisible to the forecast (see failure analysis, e.g. train:8732).",
        "p_critical is a ranking score from class-weighted training, not a calibrated probability.",
        "Almost all Critical labels come from miss distance; only 3 validation encounters are Critical by Pc.",
        "The sigma value 6.378136e7 is treated as a placeholder; this is an inference, not confirmed.",
        "Validation only: there are no test outcomes and no claim of operational reliability.",
        "ROC-AUC 0.98 includes the easy encounters the rule already flags; within rule misses it is about 0.90.",
    ],
}
out.write_text(json.dumps(bundle, indent=2) + "\n")
print(f"wrote {out.relative_to(out.parents[2])} from {reports} @ {commit}: {len(models)} models, {len(tca_bands)} TCA bands, {len(masked)} masked rows")
