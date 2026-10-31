import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { fetchQueue } from '../api/client'
import { useResource } from '../api/useResource'
import type { PriorityBand, Tier } from '../api/types'
import { BandSummary } from '../components/BandSummary'
import { Page, PageHeader, Panel, PanelHeader } from '../components/layout/Page'
import { QueueTable } from '../components/QueueTable'
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews'
import { PRIORITY_META, PRIORITY_ORDER, TIER_META, TIER_ORDER } from '../lib/taxonomy'

type TierFilter = Tier | 'unrated'
const TIERS: TierFilter[] = [...TIER_ORDER, 'unrated']

export function Queue() {
  const { state, retry } = useResource(fetchQueue, 'queue')
  const navigate = useNavigate()
  const [bands, setBands] = useState<Set<PriorityBand>>(new Set())
  const [tiers, setTiers] = useState<Set<TierFilter>>(new Set())
  const [q, setQ] = useState('')

  const data = state.status === 'ready' ? state.data : null
  const filtered = useMemo(() => {
    if (!data) return []
    return data.items.filter((i) => {
      if (bands.size && (!i.priority || !bands.has(i.priority))) return false
      // Tier filter uses the prioritisation tier: the more severe of current rule tier and forecast.
      const tier = i.triage?.prioritisation_tier ?? i.current_rule_tier ?? 'unrated'
      if (tiers.size && !tiers.has(tier)) return false
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
        title={<>Which encounter needs a human next</>}
        lede="Ordered by review band, then by time to closest approach. The current rule tier, the forecast final tier, urgency and data quality are separate columns so none of them hides another."
        aside={
          data && (
            <>
              cohort <span className="text-ink-2">{data.cohort}</span> · model <span className="text-ink-2">{data.model_version ?? '—'}</span> · schema <span className="text-ink-2">{data.policy_version}</span> · triage <span className="text-ink-2">{data.triage_policy_version}</span>
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
              <div className="flex items-center gap-1" role="group" aria-label="Filter by prioritisation tier">
                {TIERS.map((t) => {
                  const on = tiers.has(t)
                  const meta = t === 'unrated' ? TIER_META.unknown : TIER_META[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(tiers, t, setTiers)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${on ? 'border-line-strong bg-raised text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                    >
                      <span className={`size-1.5 rounded-full ${t === 'unrated' ? 'hatch ring-1 ring-unknown/60' : ''}`} style={t === 'unrated' ? undefined : { background: meta.color }} />
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
            <button type="button" className="text-signal" onClick={() => (setBands(new Set()), setTiers(new Set()), setQ(''))}>
              Clear filters
            </button>
          </p>
        )}
        {filtered.length > 0 && <QueueTable items={filtered} onOpen={(i) => navigate(`/encounter/${encodeURIComponent(i.encounter_id)}`)} />}
      </Panel>

      <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-3">
        Bands: {PRIORITY_ORDER.map((p) => `${PRIORITY_META[p].label} — ${PRIORITY_META[p].rule}`).join(' · ')}. Band uses the more severe of the current rule tier and the forecast; neither is overwritten; the class score is not a queue input.
        {data && <> {data.prototype_notice}</>}
      </p>
    </Page>
  )
}
