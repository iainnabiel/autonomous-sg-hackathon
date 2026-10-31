# Autonomous SG Hackathon

Shared project for the Autonomous SG Hackathon. Changes to `main` are merged through pull requests.

## Team Git Workflow

Everyone, including the repository owner, follows this process.

- **Never push directly to `main`.**
- **Never merge your own pull request without another teammate’s approval.**
- **Do not force-push to `main`.**
- **Prefer squash merging**, performed manually after a teammate approves.
- **These rules apply to everyone, including the owner.**

GitHub enforces protection on `main` for everyone, including administrators. A pull request and at least one approving review are required, stale approvals are dismissed when new commits are pushed, review conversations must be resolved, and force pushes and branch deletion are blocked. No one can bypass these rules.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Layout and ownership

Run these commands from the repository root with Python 3. No install is required for the packages below. `ml/` and `frontend/` have no startup command yet.

| Directory | Owner | Responsibility | Startup |
| --- | --- | --- | --- |
| `contracts/` | Iain | Shared interfaces. Schemas are SG-01.2. | `python -m contracts` |
| `backend/` | Iain | Review-queue API. Routes are SG-02. | `python -m backend` |
| `evaluation/` | Iain | Metrics. Scoring is SG-03. | `python -m evaluation` |
| `ml/` | Khaleil | Data preparation and the collision-probability model (SG-04 to SG-06). | None until SG-05. |
| `frontend/` | Shanya | Operator dashboard (SG-07 to SG-09). | None until SG-07.1. |

Each startup command only confirms that package is importable. Predictions, metrics, and the dashboard arrive in later tasks.

Raw challenge data stays on the local machine in `Datasets/` or `data/`. That includes `data.zip`, `data(1).zip`, and any local `challenge1_event_labels.xlsx`. Do not commit those files. Secrets and large generated model artifacts are also excluded; see `.gitignore`.

Check this layout with:

```bash
python -m unittest tests.test_project_layout
```
