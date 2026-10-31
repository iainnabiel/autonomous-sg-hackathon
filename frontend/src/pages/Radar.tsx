import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { fetchQueue, fetchRadar } from '../api/client'
import { useResource } from '../api/useResource'
import { RadarChart, TIER_KEYS, type RadarRow, type TierKey } from '../components/charts/RadarChart'
import { TierPill } from '../components/Indicators'
import { DemoTag, Page, PageHeader, Panel, PanelHeader } from '../components/layout/Page'
import { EmptyState, ErrorState, LoadingBlock, LoadingRows } from '../components/StateViews'
import { formatLogPc, formatTca } from '../lib/format'
import { UPCOMING_URGENCY_DAYS } from '../lib/policy'
import { TIER_META } from '../lib/taxonomy'

export function Radar() {
  const radar = useResource(fetchRadar, 'radar')
  const queue = useResource(fetchQueue, 'queue')
  const [visible, setVisible] = useState<Record<TierKey, boolean>>({ Critical: true, Elevated: true, Safe: true, incomplete: true })

  const items = queue.state.status === 'ready' ? queue.state.data.items : null
  const summary = radar.state.status === 'ready' ? radar.state.data : null

  // The contract's bins carry encounter IDs; tiers come from the queue items, so counts always match the queue.
  const rows = useMemo<RadarRow[] | null>(() => {
    if (!summary || !items) return null
    const byId = new Map(items.map((i) => [i.encounter_id, i]))
    return summary.bins.map((b) => {
      const row: RadarRow = { label: `${b.start_hours_inclusive}–${b.end_hours_inclusive}h`, start: b.start_hours_inclusive, end: b.end_hours_inclusive, Critical: 0, Elevated: 0, Safe: 0, incomplete: 0 }
      for (const id of new Set(b.encounter_ids)) {
        const it = byId.get(id)
        const tier = it?.triage?.prioritisation_tier ?? it?.current_rule_tier ?? null
        if (tier) row[tier]++
        else row.incomplete++
      }
      return row
    })
  }, [summary, items])
  const total = rows?.reduce((s, b) => s + TIER_KEYS.filter((k) => visible[k]).reduce((t, k) => t + b[k], 0), 0)
  const upcoming = items ? items.filter((i) => i.time_to_tca_days >= 0 && i.time_to_tca_days <= UPCOMING_URGENCY_DAYS).sort((a, b) => a.time_to_tca_days - b.time_to_tca_days) : null

  return (
    <Page wide>
      <PageHeader
        eyebrow="Relative-time radar"
        title={<>What is coming up, and when the work piles up</>}
        lede="Each selected encounter is placed by hours to its own closest approach. Tall bars are periods of concentrated review work; red is what cannot wait."
        aside={summary && <>view <span className="text-ink-2">{summary.view_label}</span></>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <Panel>
          <PanelHeader
            title="Encounters by hours to closest approach"
            note={total !== undefined ? `${total} shown · prioritisation tier` : undefined}
            action={
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show tiers">
                {TIER_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={visible[k]}
                    onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${visible[k] ? 'border-line-strong bg-raised text-ink' : 'border-transparent text-ink-3 line-through'}`}
                  >
                    <span className={`size-1.5 rounded-full ${k === 'incomplete' ? 'hatch ring-1 ring-unknown/60' : ''}`} style={k === 'incomplete' ? undefined : { background: TIER_META[k].color }} />
                    {k === 'incomplete' ? 'Unrated' : TIER_META[k].label}
                  </button>
                ))}
                <DemoTag />
              </div>
            }
          />
          {(radar.state.status === 'loading' || (summary && !items && queue.state.status === 'loading')) && <LoadingBlock className="h-72" />}
          {radar.state.status === 'error' && <ErrorState title="Radar unavailable" message={radar.state.message} onRetry={radar.retry} />}
          {rows && (rows.every((b) => b.Critical + b.Elevated + b.Safe + b.incomplete === 0) ? <EmptyState what="upcoming encounters" /> : <RadarChart rows={rows} visible={visible} />)}
          {summary && <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">{summary.view_label}. Bins include both ends; an encounter on a shared boundary is counted once. Hours are a display conversion of supplied days. Policy {summary.policy_version}.</p>}
        </Panel>

        <Panel>
          <PanelHeader title="Next 24 hours" note="soonest first · exactly 24 h is inside" />
          {queue.state.status === 'loading' && <LoadingRows rows={5} />}
          {queue.state.status === 'error' && <ErrorState title="Queue unavailable" message={queue.state.message} onRetry={queue.retry} />}
          {upcoming && upcoming.length === 0 && <EmptyState what="encounters within 24 h" />}
          {upcoming && upcoming.length > 0 && (
            <ol className="divide-y divide-line">
              {upcoming.map((i) => (
                <li key={i.encounter_id}>
                  <Link to={`/encounter/${encodeURIComponent(i.encounter_id)}`} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-raised/60">
                    <span className="tabular w-14 font-mono text-[13px] text-ink">{formatTca(i.time_to_tca_days)}</span>
                    <span className="font-mono text-[12px] text-ink-2">{i.encounter_id}</span>
                    <span className="ml-auto">
                      <TierPill tier={i.triage?.prioritisation_tier ?? i.current_rule_tier} />
                    </span>
                    <span className="tabular hidden w-20 text-right font-mono text-[11px] text-ink-3 sm:inline">{formatLogPc(i.supplied_risk_log10_pc)}</span>
                    <ArrowUpRight size={13} className="text-ink-3 group-hover:text-signal" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </Page>
  )
}
