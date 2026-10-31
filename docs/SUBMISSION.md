# Submission and backup (SG-09.4)

Checklist for the submission form and for a demo that survives a dead laptop. Fill the blanks before submitting; items marked **frozen** must match the model card in `ml/reports/model_card.md` on `main` at submission time.

## Links

| Item | Value |
| --- | --- |
| Repository | https://github.com/iainnabiel/autonomous-sg-hackathon |
| Submitted commit on `main` | _fill in `git rev-parse --short origin/main`_ |
| Recording (≤ 3 min screen capture) | _Drive link_ |
| Screenshots | `docs/screenshots/` (see below) |
| Model bundle on Drive | _link_ · SHA-256 must equal the **frozen** value in the model card |
| Datasets | Organisers' Drive folder; never committed |

## Frozen versions

| Field | Value at submission |
| --- | --- |
| Model version | _e.g. `upgrade_base-202610310654`_ (**frozen**) |
| Bundle SHA-256 | **frozen** |
| Training data SHA-256 | `ba47ce80580d5d6ff523ddc1d724901dbdfb3a5afdc5e755f0ca2bcefe6e4eb6` |
| Upgrade threshold | 0.12 |
| Triage policy | `triage-policy-0.1 (prototype)` / contracts `TRIAGE_POLICY_VERSION` once merged |
| Evidence bundle in the dashboard | `frontend/src/evidence/validation.json` · `provenance.commit` must point at the merged reports |

If the ML reports are regenerated after the evidence bundle was made, re-run `python3 frontend/scripts/bundle_evidence.py ml/reports <commit> main` and commit the result, so the evaluation page and `ml/reports` agree.

## Startup check (do this on a second machine)

```bash
git clone https://github.com/iainnabiel/autonomous-sg-hackathon && cd autonomous-sg-hackathon
# ML (optional for the demo; needs Datasets/ from Drive)
python3 -m venv .venv && .venv/bin/pip install -r ml/requirements.txt && .venv/bin/python -m ml.data
# Dashboard
cd frontend && npm install && npm run build && npm run dev   # http://localhost:5173
```

Expected: the queue loads with the **Demo data** badge (or **Live API** when `VITE_API_URL` is set and the backend is up), `/evaluation` shows the bundled validation results with their source commit, and `/encounter/fixture:0873` opens. Tick each:

- [ ] `npm run build` passes on the clean clone
- [ ] All four demo tabs open (see `docs/DEMO_SCRIPT.md`)
- [ ] Badge state matches what the script says
- [ ] Evaluation page model version equals the model card's frozen version

## Screenshots

Captured from the fixture build for the backup deck. Re-capture after any UI change and after the final merge; note the commit in the filename list below.

| File | Shows | Captured from |
| --- | --- | --- |
| `queue.png` | Review queue, bands and columns | fixture build, branch `feature/sg-09-evidence-demo`, 2026-10-31 |
| `encounter-0412.png` | Receipt, review renewal, what changed | same |
| `encounter-0873.png` | Limitation case: safe at the cutoff, critical later | same |
| `evaluation.png` | Validation evidence with denominators | same; evidence bundled from `ml/reports` at `475d4e2` |
| `overview.png` | Overview and policy matrix | same; the hero will change with the overview refinement branch |

Capture command used (headless Chrome, software WebGL):

```bash
node /tmp/cdp.mjs "http://localhost:5173/queue" 1600 1000 "shot:docs/screenshots/queue.png"
```

## Timeline

| When | What |
| --- | --- |
| T − 90 min | Freeze model and policy; merge open PRs that are approved; re-bundle evidence |
| T − 60 min | Clean-clone startup check on a second machine; capture screenshots; record the run |
| T − 30 min | Submit the form with the commit hash and links; keep 30 min buffer |
| T − 15 min | Full rehearsal with the stopwatch; log the time in `docs/DEMO_SCRIPT.md` |

Submission time is scored (5%), but an earlier submission does not replace a working build. Submit when the startup check passes, not before.

## Backup order if something fails on stage

1. Fixture mode: unset `VITE_API_URL`, restart `npm run dev`. Everything in the script works without the backend.
2. `npm run preview` of the committed `dist/` build if the dev server misbehaves.
3. Screenshots from `docs/screenshots/` in the deck.
4. The recording.
