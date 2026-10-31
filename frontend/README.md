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
| `/encounter/:id` | Decision receipt, assessment history, encounter geometry. | SG-08.1 – 08.3 |
| `/radar` | Encounters by hours to their own closest approach, stacked by tier; next-24-hours list. | SG-07.3 |
| `/evaluation` | Layout for the SG-03 artifacts. Shows "not evaluated" against a live API; labelled placeholders on fixtures. | SG-09.1 – 09.2 |

## Data source

| `VITE_API_URL` | Behaviour |
| --- | --- |
| empty / unset | Uses **demonstration fixtures** (`src/api/fixtures.ts`). A `DEMO DATA` badge stays in the nav and every figure carries a tag. |
| set, e.g. `http://localhost:8000` | Calls the backend (`GET /queue`, `GET /encounters/:id`, `GET /radar`). If a request fails, the page shows an error. It never falls back to fixtures. |

Copy `.env.example` to `.env.local` to set it.

On fixtures, append `?demo=loading`, `?demo=error` or `?demo=empty` to any URL to preview each UI state.

## Contracts

`src/api/types.ts` is a **provisional** frontend copy of the response shapes. SG-01.2 owns the shared contract and these types will be replaced once `contracts/` lands. Field names, endpoints and units (metres, hours, log10 Pc) are assumptions until then.

## Globe

`src/components/globe/Globe.tsx` is an illustration: a dark Earth, a graticule, six inclined circular orbits with objects moving along them, and one pair on crossing orbits approaching a marked point. It is labelled "schematic, not propagated orbits" on screen. The fixture encounters are not plotted on it. If WebGL is unavailable, a static SVG version is shown instead.

## Layout

```
src/
  api/          client, provisional types, fixtures, useResource hook
  components/
    layout/     Nav, Page frame, Panel, DemoTag, Footer
    charts/     HistoryChart, GeometryPlot, RadarChart, CoverageChart
    globe/      Globe (R3F) and GlobeFallback (SVG + error boundary)
    ...         BandSummary, QueueTable, Indicators, StateViews
  pages/        Home, Queue, Encounter, Radar, Evaluation
  lib/          formatting and priority / tier labels
  index.css     design tokens (@theme) and utilities
```

Colour carries meaning: red, amber and green are reserved for risk tier; cyan marks interaction and the product's voice. Incomplete assessments use a grey hatch so they can never look safe.
