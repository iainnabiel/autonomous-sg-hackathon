import type { ReactNode } from 'react'
import { BarChart3, ListOrdered, Radar } from 'lucide-react'
import { apiUrl, dataSource } from '../api/client'

const NAV = [
  { id: 'queue', label: 'Review queue', icon: ListOrdered, ready: true },
  { id: 'radar', label: 'Radar (SG-07.3)', icon: Radar, ready: false },
  { id: 'evaluation', label: 'Evaluation (SG-09.1)', icon: BarChart3, ready: false },
] as const

export function AppShell({ children, versions }: { children: ReactNode; versions?: { model: string; policy: string } }) {
  return (
    <div className="relative flex min-h-dvh bg-void">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgb(111_227_255/0.07),transparent)]"
      />

      <nav className="relative z-10 hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-line bg-base/70 py-5 md:flex">
        <Mark />
        <div className="mt-6 flex flex-col gap-1.5">
          {NAV.map(({ id, label, icon: Icon, ready }) => (
            <button
              key={id}
              type="button"
              title={ready ? label : `${label} — not built yet`}
              aria-label={label}
              aria-current={id === 'queue' ? 'page' : undefined}
              disabled={!ready}
              className="group relative grid size-10 place-items-center rounded-lg text-ink-3 transition-colors enabled:hover:bg-raised enabled:hover:text-ink aria-[current=page]:bg-signal-dim aria-[current=page]:text-signal disabled:opacity-35"
            >
              <Icon size={18} strokeWidth={1.6} />
            </button>
          ))}
        </div>
      </nav>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-line bg-base/60 px-5 backdrop-blur-md md:px-8">
          <div className="md:hidden">
            <Mark />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-[13px] font-semibold tracking-[0.18em] text-ink">CONJUNCTION TRIAGE</span>
            <span className="hidden text-xs text-ink-3 sm:inline">Collision-risk review for LEO operators</span>
          </div>
          <div className="ml-auto flex items-center gap-4 font-mono text-[11px] text-ink-3">
            {versions && (
              <span className="hidden lg:inline">
                model <span className="text-ink-2">{versions.model}</span>
                <span className="mx-2 text-line-strong">/</span>
                policy <span className="text-ink-2">{versions.policy}</span>
              </span>
            )}
            <SourceBadge />
          </div>
        </header>

        {dataSource === 'fixture' && (
          <div className="border-b border-elevated/20 bg-elevated/[0.06] px-5 py-1.5 text-center text-xs text-elevated/90 md:px-8">
            Demonstration data — hand-written fixtures, not model output. Set <code className="font-mono">VITE_API_URL</code> to use the backend.
          </div>
        )}

        <main className="flex-1 px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  )
}

function SourceBadge() {
  const live = dataSource === 'api'
  return (
    <span
      title={live ? apiUrl : 'No API URL configured'}
      className="inline-flex items-center gap-2 rounded-full border border-line-strong px-2.5 py-1 uppercase tracking-wider"
    >
      <span className={`size-1.5 rounded-full ${live ? 'bg-signal shadow-[0_0_8px_var(--color-signal)]' : 'bg-elevated'}`} />
      {live ? 'API' : 'Fixtures'}
    </span>
  )
}

/** Wordmark: a target at the origin with an approaching object on an inclined path. */
function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="12.5" stroke="var(--color-line-strong)" />
      <ellipse cx="14" cy="14" rx="12.5" ry="5" transform="rotate(-28 14 14)" stroke="var(--color-signal)" strokeOpacity="0.55" />
      <circle cx="14" cy="14" r="2" fill="var(--color-ink)" />
      <circle cx="24.3" cy="8.6" r="1.6" fill="var(--color-signal)" />
    </svg>
  )
}
