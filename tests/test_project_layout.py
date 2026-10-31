"""SG-01.1: owned directories, startup commands, and gitignore rules."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

OWNED_DIRECTORIES = {
    "contracts": "Iain",
    "backend": "Iain",
    "evaluation": "Iain",
    "ml": "Khaleil",
    "frontend": "Shanya",
}

STARTUP_COMMANDS = {
    "contracts": "schemas are SG-01.2",
    "backend": "API routes are SG-02",
    "evaluation": "metrics are SG-03",
}

IGNORED_PATHS = (
    "Datasets/train_data.csv",
    "data/train_data.csv",
    "data/test_data.csv",
    "data/challenge1_event_labels.xlsx",
    "challenge1_event_labels.xlsx",
    "notes/challenge1_event_labels.xlsx",
    "data.zip",
    "data(1).zip",
    ".env",
    "credentials.json",
    "secrets.json",
    "ml/artifacts/model.joblib",
    "ml/checkpoints/model.pt",
    "backend/weights.pkl",
    "evaluation/cache.npy",
)

TRACKED_PATHS = (
    "README.md",
    "contracts/__init__.py",
    "backend/__main__.py",
    "evaluation/__main__.py",
    "ml/README.md",
    "frontend/README.md",
    "docs/TASK_PLAN.md",
    ".env.example",
    "docs/sample.xlsx",
    "notes/archive.zip",
)


class ProjectLayoutTest(unittest.TestCase):
    def test_directories_document_their_owner(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for directory, owner in OWNED_DIRECTORIES.items():
            package = ROOT / directory
            self.assertTrue(package.is_dir(), directory)
            package_readme = (package / "README.md").read_text(encoding="utf-8")
            self.assertIn(f"**Owner:** {owner}", package_readme)
            self.assertIn(f"`{directory}/`", readme)
            self.assertIn(owner, readme)

    def test_startup_commands_match_their_packages(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for package, expected in STARTUP_COMMANDS.items():
            self.assertIn(f"python -m {package}", readme)
            result = subprocess.run(
                [sys.executable, "-m", package],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(expected, result.stdout)
            self.assertIn("owner=Iain", result.stdout)

        deferred = {
            "ml": "No training or inference command yet",
            "frontend": "No dashboard command yet",
        }
        for package, expected in deferred.items():
            package_readme = (ROOT / package / "README.md").read_text(encoding="utf-8")
            self.assertIn(expected, package_readme)
            self.assertNotIn(f"python -m {package}", readme)

    def test_datasets_secrets_and_artifacts_are_ignored(self) -> None:
        for path in IGNORED_PATHS:
            result = subprocess.run(
                ["git", "check-ignore", "-q", path],
                cwd=ROOT,
                check=False,
            )
            self.assertEqual(result.returncode, 0, f"expected {path} to be ignored")

    def test_source_files_are_not_ignored(self) -> None:
        for path in TRACKED_PATHS:
            result = subprocess.run(
                ["git", "check-ignore", "-q", path],
                cwd=ROOT,
                check=False,
            )
            self.assertEqual(result.returncode, 1, f"expected {path} to stay trackable")


if __name__ == "__main__":
    unittest.main()
