# Orbit — operator dashboard

React + TypeScript + Vite + Tailwind CSS v4. Framer Motion for motion, Lucide for icons, Recharts for charts, React Three Fiber for the schematic globe. Owner: Shanya (SG-07 – SG-09).

## Run

Requires Node.js 20+.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Other scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

## Pages

| Route | What it shows | Task |
| --- | --- | --- |
| `/` | Overview: the problem, the triage policy as an interactive matrix, the six-step flow, evidence and limits. Schematic globe in the hero. | SG-09 narrative |
| `/queue` | Prioritised review queue with band and tier filters and search. Rows open the encounter. | SG-07.2 |
| `/encounter/:id` | Decision receipt (rule tier, model forecast, urgency kept separate), human review controls with renewal indicator, assessment history against days to closest approach, “what changed” comparisons, RTN encounter geometry with an optional schematic flyby. | SG-08.1 – 08.6 |
| `/radar` | Encounters by hours to their own closest approach, stacked by tier; next-24-hours list. | SG-07.3 |
| `/evaluation` | Validation evidence with denominators: forecast vs rule critical recall with 95% intervals, model comparison, confusion matrices (raw / row %, per model and cohort), probability-critical subset, detection failures and limitations, 5-fold cross-validation, quality sensitivity. Prioritisation benefit (SG-03.3) shows “not evaluated” until it exists. | SG-09.1 – 09.2 |

## Data source

| `VITE_API_URL` | Behaviour |
| --- | --- |
| empty / unset | Uses **demonstration fixtures** (`src/api/fixtures.ts`). A `DEMO DATA` badge stays in the nav and every figure carries a tag. |
| set, e.g. `http://localhost:8000` | Calls the backend (`GET /queue`, `GET /encounters/:id`, `GET /radar`, `GET /metrics`, `POST /encounters/:id/review`). If a request fails, the page shows an error. It never falls back to fixtures. A 404 on `/metrics` is shown as “not evaluated”. |

Copy `.env.example` to `.env.local` to set it.

On fixtures, append `?demo=loading`, `?demo=error` or `?demo=empty` to any URL to preview each UI state.

## Contracts

`src/api/types.ts` is a **provisional** frontend copy of the response shapes. SG-01.2 owns the shared contract and these types will be replaced once `contracts/` lands. Field names, endpoints and units (metres, hours, log10 Pc) are assumptions until then.

The shapes follow the shipped model ([docs/ML_DECISIONS.md](../docs/ML_DECISIONS.md), `ml/inference.py`): the organisers' thresholds on the selected observation's supplied log10 Pc and miss distance give a **rule tier**; a classifier scores, from messages at least two days before closest approach, whether the encounter ends critical, and may raise the tier to critical (never lower it). The score is a ranking score, not a calibrated probability, and the UI never shows it as a percentage. Messages inside the two-day cutoff are drawn hollow in the history because the model never saw them.

Review state (`POST /encounters/:id/review`, SG-02.8) is kept beside the assessment: it never changes the tier or band. In fixture mode it lives in memory and is lost on reload.

## Evaluation evidence

`src/evidence/validation.json` is a bundled copy of the ML team's committed reports (`ml/reports/*.json` and the tables in `failure_analysis.md`, `sensitivity.md`, `model_card.md`). It is real validation data, not a fixture, and it carries the commit it was taken from. The evaluation page shows it when no API is configured; against an API it fetches `/metrics` (SG-03.4) instead. Regenerate after the reports change:

```bash
python3 frontend/scripts/bundle_evidence.py ml/reports <commit> <branch>
```

The script copies numbers; it computes nothing.

## Globe

`src/components/globe/Globe.tsx` is an illustration: a dark Earth, a graticule, six inclined circular orbits with objects moving along them, and one pair on crossing orbits approaching a marked point. It is labelled "schematic, not propagated orbits" on screen. The fixture encounters are not plotted on it. If WebGL is unavailable, a static SVG version is shown instead.

## Layout

```
src/
  api/          client, provisional types, fixtures, useResource hook
  components/
    layout/     Nav, Page frame, Panel, DemoTag, Footer
    charts/     HistoryChart, GeometryPlot, RadarChart, CoverageChart
    encounter/  Receipt, Changes ("what changed"), ReviewControls
    evaluation/ ConfusionMatrix, RecallChart
  evidence/     validation.json, bundled from ml/reports by scripts/bundle_evidence.py
    globe/      Globe (R3F) and GlobeFallback (SVG + error boundary)
    ...         BandSummary, QueueTable, Indicators, StateViews
  pages/        Home, Queue, Encounter, Radar, Evaluation
  lib/          formatting and priority / tier labels
  index.css     design tokens (@theme) and utilities
```

Colour carries meaning: red, amber and green are reserved for risk tier; cyan marks interaction and the product's voice. Incomplete assessments use a grey hatch so they can never look safe.
