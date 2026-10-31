"""Evaluation command line.

    python -m evaluation           confirm the package imports (no metrics)
    python -m evaluation report    write evaluation/reports/metrics.json and metrics.md
"""

from __future__ import annotations

import argparse
from pathlib import Path


def _report(args: argparse.Namespace) -> int:
    from evaluation import report, sources

    ml = Path(args.ml_root) if args.ml_root else sources.REPO_ROOT / "ml"
    runs = tuple(
        report.RunInputs(run.key, run.label, run.role,
                         ml / "artifacts" / run.key / "validation_predictions.csv",
                         ml / "reports" / f"{run.key}.json", run.scored)
        for run in report.default_runs()
    )
    payload = report.build_report(
        train_csv=Path(args.train) if args.train else sources.TRAIN_CSV,
        labels_csv=Path(args.labels) if args.labels else sources.LABELS_CSV,
        split_csv=ml / "splits" / "train_validation.csv",
        split_meta=ml / "splits" / "split_meta.json",
        runs=runs,
        model_bundle=ml / "artifacts" / "upgrade_base" / "model.joblib" if args.with_model_sha else None,
    )
    json_path, md_path = report.write_report(payload, Path(args.out) if args.out else report.REPORTS_DIR)
    print(f"wrote {json_path} and {md_path}")
    for cohort in ("primary", "all_usable"):
        print(payload["sg03"]["comparison"][cohort]["headline"])
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evaluation")
    commands = parser.add_subparsers(dest="command")
    rep = commands.add_parser("report", help="validation detection metrics (SG-03.2) as metrics.json")
    rep.add_argument("--train", help="train_data.csv (default Datasets/train_data.csv)")
    rep.add_argument("--labels", help="organiser train_event_labels.csv (default Datasets/)")
    rep.add_argument("--ml-root", help="ml/ directory holding artifacts/, reports/ and splits/ (default ./ml)")
    rep.add_argument("--with-model-sha", action="store_true", help="record the SHA-256 of the upgrade model bundle")
    rep.add_argument("--out", help="output directory (default evaluation/reports)")
    args = parser.parse_args(argv)
    if args.command == "report":
        return _report(args)
    print("evaluation: owner=Iain; metrics are SG-03")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
