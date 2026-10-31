"""Evaluation command line.

    python -m evaluation           confirm the package imports (no metrics)
    python -m evaluation report    write evaluation/reports/metrics.json and metrics.md
    python -m evaluation verify    compare a rerun or a served /metrics with metrics.json
    python -m evaluation export-labels <workbook>   organiser label sheet -> Datasets/train_event_labels.csv
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
        model_bundle=ml / "artifacts" / "upgrade_base" / "model.joblib",
    )
    json_path, md_path = report.write_report(payload, Path(args.out) if args.out else report.REPORTS_DIR)
    print(f"wrote {json_path} and {md_path}")
    for cohort in ("primary", "all_usable"):
        print(payload["sg03"]["comparison"][cohort]["headline"])
    return 0


def _verify(args: argparse.Namespace) -> int:
    import json

    from evaluation import verify

    ok = True
    if args.actual:
        result = verify.compare_reports(json.loads(Path(args.expected).read_text(encoding="utf-8")),
                                        json.loads(Path(args.actual).read_text(encoding="utf-8")))
        print(json.dumps(result, indent=2))
        ok &= result["metrics_identical"]
    if args.served:
        result = verify.compare_served(args.served, Path(args.expected))
        print(json.dumps(result, indent=2))
        ok &= result["http_status"] == 200 and result["identical"]
    return 0 if ok else 1


def _export_labels(args: argparse.Namespace) -> int:
    from evaluation import sources

    out = Path(args.out) if args.out else sources.LABELS_CSV
    print(f"wrote {sources.export_organiser_labels(Path(args.workbook), out)} label rows to {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evaluation")
    commands = parser.add_subparsers(dest="command")
    rep = commands.add_parser("report", help="validation detection metrics (SG-03.2) as metrics.json")
    rep.add_argument("--train", help="train_data.csv (default Datasets/train_data.csv)")
    rep.add_argument("--labels", help="organiser train_event_labels.csv (default Datasets/)")
    rep.add_argument("--ml-root", help="ml/ directory holding artifacts/, reports/ and splits/ (default ./ml)")
    rep.add_argument("--with-model-sha", action="store_true", help="accepted for compatibility; the bundle is always recorded when present")
    rep.add_argument("--out", help="output directory (default evaluation/reports)")
    ver = commands.add_parser("verify", help="compare a rerun report and/or a served /metrics with a file")
    ver.add_argument("--expected", default=str(Path(__file__).resolve().parent / "reports" / "metrics.json"))
    ver.add_argument("--actual", help="a freshly generated metrics.json to compare with --expected")
    ver.add_argument("--served", help="URL of a running /metrics endpoint to compare with --expected")
    exp = commands.add_parser("export-labels", help="write the organiser label sheet as Datasets/train_event_labels.csv")
    exp.add_argument("workbook", help="organiser workbook, e.g. data/challenge1_event_labels.xlsx (local, never committed)")
    exp.add_argument("--out", help="output CSV (default Datasets/train_event_labels.csv)")
    args = parser.parse_args(argv)
    if args.command == "export-labels":
        return _export_labels(args)
    if args.command == "report":
        return _report(args)
    if args.command == "verify":
        return _verify(args)
    print("evaluation: owner=Iain; metrics are SG-03")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
