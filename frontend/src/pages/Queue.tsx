import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { fetchQueue } from '../api/client'
import { useResource } from '../api/useResource'
import type { Priority, RiskTier } from '../api/types'
import { BandSummary } from '../components/BandSummary'
import { Page, PageHeader, Panel, PanelHeader } from '../components/layout/Page'
import { QueueTable } from '../components/QueueTable'
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews'
import { PRIORITY_META, PRIORITY_ORDER, TIER_META } from '../lib/taxonomy'

const TIERS: (RiskTier | 'unassessed')[] = ['critical', 'elevated', 'safe', 'unassessed']

export function Queue() {
  const { state, retry } = useResource(fetchQueue, 'queue')
  const navigate = useNavigate()
  const [bands, setBands] = useState<Set<Priority>>(new Set())
  const [tiers, setTiers] = useState<Set<RiskTier | 'unassessed'>>(new Set())
  const [q, setQ] = useState('')

  const data = state.status === 'ready' ? state.data : null
  const filtered = useMemo(() => {
    if (!data) return []
    return data.items.filter((i) => {
      if (bands.size && !bands.has(i.priority)) return false
      if (tiers.size && !tiers.has(i.risk_tier ?? 'unassessed')) return false
      if (q && !i.encounter_id.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [data, bands, tiers, q])

  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setter(next)
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Review queue"
        title={<>Alerts to review</>}
        lede="Sorted by priority, then by time to closest approach. Risk level, urgency and data quality are shown separately."
        aside={
          data && (
            <>
              cohort <span className="text-ink-2">{data.cohort}</span> · model <span className="text-ink-2">{data.model_version}</span> · policy <span className="text-ink-2">{data.policy_version}</span>
            </>
          )
        }
      />

      {data && data.items.length > 0 && (
        <div className="mb-8">
          <BandSummary items={data.items} active={bands} onToggle={(p) => toggle(bands, p, setBands)} />
        </div>
      )}

      <Panel>
        <PanelHeader
          title="Encounters"
          note={data ? `${filtered.length} of ${data.items.length}` : undefined}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1" role="group" aria-label="Filter by risk tier">
                {TIERS.map((t) => {
                  const on = tiers.has(t)
                  const meta = t === 'unassessed' ? TIER_META.unknown : TIER_META[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(tiers, t, setTiers)}
                      className={`chip ${on ? 'chip-on' : ''}`}
                    >
                      <span className={`size-1.5 rounded-full ${t === 'unassessed' ? 'hatch ring-1 ring-unknown/60' : ''}`} style={t === 'unassessed' ? undefined : { background: meta.color }} />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
              <label className="relative">
                <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find encounter"
                  aria-label="Find encounter by ID"
                  className="h-8 w-44 rounded-md border border-line bg-base/60 pr-3 pl-8 font-mono text-[12px] text-ink placeholder:text-ink-3 focus:border-signal/40 focus:outline-none"
                />
              </label>
            </div>
          }
        />
        {state.status === 'loading' && <LoadingRows />}
        {state.status === 'error' && <ErrorState title="Queue unavailable" message={state.message} onRetry={retry} />}
        {data && data.items.length === 0 && <EmptyState />}
        {data && data.items.length > 0 && filtered.length === 0 && (
          <p className="px-5 py-14 text-center text-sm text-ink-3">
            No encounters match these filters.{' '}
            <button type="button" className="btn btn-secondary ml-2 h-8 px-2.5 text-[12px]" onClick={() => (setBands(new Set()), setTiers(new Set()), setQ(''))}>
              Clear filters
            </button>
          </p>
        )}
        {filtered.length > 0 && <QueueTable items={filtered} onOpen={(i) => navigate(`/encounter/${encodeURIComponent(i.encounter_id)}`)} />}
      </Panel>

      <p className="mt-4 font-mono text-[11px] text-ink-3">
        Bands: {PRIORITY_ORDER.map((p) => `${PRIORITY_META[p].label} — ${PRIORITY_META[p].rule}`).join(' · ')}
      </p>
    </Page>
  )
}
