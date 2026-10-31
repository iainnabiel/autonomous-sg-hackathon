# Frontend — operator dashboard

React + TypeScript + Vite + Tailwind CSS v4, with Framer Motion and Lucide icons. Owner: Shanya (SG-07 – SG-09).

## Run

Requires Node.js 20+.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Other scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

## Data source

| `VITE_API_URL` | Behaviour |
| --- | --- |
| empty / unset | Uses **demonstration fixtures** (`src/api/fixtures.ts`). A banner and a `FIXTURES` badge stay visible. |
| set, e.g. `http://localhost:8000` | Calls the backend (`GET /queue`). If the request fails, the dashboard shows an error. It never falls back to fixtures. |

Copy `.env.example` to `.env.local` to set it.

When running on fixtures, append `?demo=loading`, `?demo=error` or `?demo=empty` to the URL to preview each UI state.

## Contracts

`src/api/types.ts` is a **provisional** frontend copy of the queue response. SG-01.2 owns the shared contract, and these types will be replaced once `contracts/` lands. Field names and units (metres, hours, log10 Pc) are assumptions until then.

## Layout

```
src/
  api/          client, provisional types, fixtures, useQueue hook
  components/   AppShell, BandSummary, QueueTable, EncounterPanel, Indicators, StateViews
  lib/          formatting and priority / tier labels
  index.css     design tokens (@theme) and utilities
```

Colour carries meaning: red, amber and green are reserved for risk tier, and cyan for interface focus. Incomplete assessments use a grey hatch so they can never look safe.
