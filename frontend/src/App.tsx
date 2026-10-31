import { useState } from 'react'
import { useQueue } from './api/useQueue'
import { AppShell } from './components/AppShell'
import { BandSummary } from './components/BandSummary'
import { EncounterPanel } from './components/EncounterPanel'
import { QueueTable } from './components/QueueTable'
import { EmptyState, ErrorState, LoadingRows } from './components/StateViews'

export default function App() {
  const { state, retry } = useQueue()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const data = state.status === 'ready' ? state.data : null
  const selected = data?.items.find((i) => i.encounter_id === selectedId) ?? null

  return (
    <AppShell versions={data ? { model: data.model_version, policy: data.policy_version } : undefined}>
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal/80">Review queue</p>
            <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink md:text-[28px]">Which encounter needs review next</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-3">
              Ranked by risk tier and time to closest approach. Risk, urgency and data quality are shown separately — an
              incomplete assessment is never presented as safe.
            </p>
          </div>
          {data && (
            <p className="font-mono text-[11px] text-ink-3">
              cohort <span className="text-ink-2">{data.cohort}</span> · <span className="tabular">{data.items.length}</span> encounters
            </p>
          )}
        </header>

        {data && data.items.length > 0 && (
          <div className="mb-6">
            <BandSummary items={data.items} />
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-xl border border-line bg-panel/70 backdrop-blur-sm">
            {state.status === 'loading' && <LoadingRows />}
            {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
            {data && data.items.length === 0 && <EmptyState />}
            {data && data.items.length > 0 && (
              <QueueTable items={data.items} selectedId={selectedId} onSelect={(i) => setSelectedId(i.encounter_id)} />
            )}
          </section>
          {data && data.items.length > 0 && (
            <div className="xl:sticky xl:top-8 xl:self-start">
              <EncounterPanel item={selected} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
