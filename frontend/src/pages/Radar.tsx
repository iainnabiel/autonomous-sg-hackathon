import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { fetchQueue, fetchRadar } from '../api/client'
import { useResource } from '../api/useResource'
import { RadarChart, TIER_KEYS, type TierKey } from '../components/charts/RadarChart'
import { TierPill } from '../components/Indicators'
import { DemoTag, Page, PageHeader, Panel, PanelHeader } from '../components/layout/Page'
import { EmptyState, ErrorState, LoadingBlock, LoadingRows } from '../components/StateViews'
import { formatPc, formatTca } from '../lib/format'
import { TIER_META } from '../lib/taxonomy'

export function Radar() {
  const radar = useResource(fetchRadar, 'radar')
  const queue = useResource(fetchQueue, 'queue')
  const [visible, setVisible] = useState<Record<TierKey, boolean>>({ critical: true, elevated: true, safe: true, incomplete: true })

  const bins = radar.state.status === 'ready' ? radar.state.data.bins : null
  const total = bins?.reduce((s, b) => s + TIER_KEYS.filter((k) => visible[k]).reduce((t, k) => t + b[k], 0), 0)
  const upcoming = queue.state.status === 'ready' ? queue.state.data.items.filter((i) => i.tca_hours !== null && i.tca_hours >= 0 && i.tca_hours <= 24).sort((a, b) => a.tca_hours! - b.tca_hours!) : null

  return (
    <Page wide>
      <PageHeader
        eyebrow="Relative-time radar"
        title={<>What is coming up, and when the work piles up</>}
        lede="Each selected encounter is placed by hours to its own closest approach. Tall bars are periods of concentrated review work; red is what cannot wait."
        aside={radar.state.status === 'ready' && <>cohort <span className="text-ink-2">{radar.state.data.cohort}</span></>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <Panel>
          <PanelHeader
            title="Encounters by hours to closest approach"
            note={total !== undefined ? `${total} shown` : undefined}
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
                    {k === 'incomplete' ? 'Incomplete' : TIER_META[k].label}
                  </button>
                ))}
                <DemoTag />
              </div>
            }
          />
          {radar.state.status === 'loading' && <LoadingBlock className="h-72" />}
          {radar.state.status === 'error' && <ErrorState title="Radar unavailable" message={radar.state.message} onRetry={radar.retry} />}
          {bins && (bins.every((b) => b.critical + b.elevated + b.safe + b.incomplete === 0) ? <EmptyState what="upcoming encounters" /> : <RadarChart bins={bins} visible={visible} />)}
          {radar.state.status === 'ready' && <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">{radar.state.data.caveat} Bins include their lower bound; the 0–24 h window includes both boundaries.</p>}
        </Panel>

        <Panel>
          <PanelHeader title="Next 24 hours" note="soonest first" />
          {queue.state.status === 'loading' && <LoadingRows rows={5} />}
          {queue.state.status === 'error' && <ErrorState title="Queue unavailable" message={queue.state.message} onRetry={queue.retry} />}
          {upcoming && upcoming.length === 0 && <EmptyState what="encounters within 24 h" />}
          {upcoming && upcoming.length > 0 && (
            <ol className="divide-y divide-line">
              {upcoming.map((i) => (
                <li key={i.encounter_id}>
                  <Link to={`/encounter/${encodeURIComponent(i.encounter_id)}`} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-raised/60">
                    <span className="tabular w-14 font-mono text-[13px] text-ink">{formatTca(i.tca_hours)}</span>
                    <span className="font-mono text-[12px] text-ink-2">{i.encounter_id}</span>
                    <span className="ml-auto">
                      <TierPill tier={i.risk_tier} />
                    </span>
                    <span className="tabular hidden w-20 text-right font-mono text-[11px] text-ink-3 sm:inline">{formatPc(i.predicted_log10_pc)}</span>
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
