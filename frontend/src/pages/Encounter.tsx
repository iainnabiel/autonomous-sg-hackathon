import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { fetchEncounter } from '../api/client'
import { useResource } from '../api/useResource'
import type { EncounterDetail, ReviewState } from '../api/types'
import { GeometryPlot } from '../components/charts/GeometryPlot'
import { HistoryChart } from '../components/charts/HistoryChart'
import { ChangesList } from '../components/encounter/Changes'
import { ReceiptView } from '../components/encounter/Receipt'
import { ReviewControls } from '../components/encounter/ReviewControls'
import { PcScale, TierPill } from '../components/Indicators'
import { DemoTag, Page, Panel, PanelHeader } from '../components/layout/Page'
import { ErrorState, LoadingBlock } from '../components/StateViews'
import { formatDistance, formatLogPc, formatPc, formatScore, formatTca } from '../lib/format'
import { PRIORITY_META } from '../lib/taxonomy'

export function Encounter() {
  const { id = '' } = useParams()
  const load = useCallback((signal: AbortSignal) => fetchEncounter(id, signal), [id])
  const { state, retry } = useResource(load, id)

  return (
    <Page wide>
      <Link to="/queue" className="inline-flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-ink-2">
        <ArrowLeft size={13} /> Review queue
      </Link>

      {state.status === 'loading' && (
        <div className="mt-6">
          <div className="skeleton h-10 w-72 rounded" />
          <LoadingBlock className="mx-0 mt-8 h-40" />
        </div>
      )}
      {state.status === 'error' && (
        <Panel className="mt-6">
          <ErrorState title="Encounter unavailable" message={state.message} onRetry={retry} />
        </Panel>
      )}
      {state.status === 'ready' && <Detail key={id} initial={state.data} />}
    </Page>
  )
}

function Detail({ initial }: { initial: EncounterDetail }) {
  const [review, setReviewState] = useState<ReviewState>(initial.summary.review)
  useEffect(() => setReviewState(initial.summary.review), [initial])
  const { summary: s, history, changes, geometry, receipt } = initial
  const t = receipt.thresholds
  const nUpdates = history.length

  return (
    <>
      <header className="mt-5 mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <p className="eyebrow text-signal/80">
            {PRIORITY_META[s.priority].label} priority
            {review.needs_renewal && <span className="ml-3 text-elevated/90">· review needed again</span>}
          </p>
          <h1 className="mt-3 font-mono text-[32px] leading-none tracking-tight text-ink md:text-[40px]">{s.encounter_id}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{receipt.escalation_summary}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 font-mono text-[11px] text-ink-3 sm:grid-cols-4">
          <div>
            <dt className="eyebrow">Observation</dt>
            <dd className="mt-1 text-ink-2">{s.observation_id}</dd>
          </div>
          <div>
            <dt className="eyebrow">Object</dt>
            <dd className="mt-1 text-ink-2">{s.object_type ?? '—'}</dd>
          </div>
          <div>
            <dt className="eyebrow">Model</dt>
            <dd className="mt-1 text-ink-2">{receipt.model_version}</dd>
          </div>
          <div>
            <dt className="eyebrow">Policy</dt>
            <dd className="mt-1 text-ink-2">{receipt.policy_version}</dd>
          </div>
        </dl>
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Risk tier">
          <div className="flex flex-wrap items-center gap-2">
            <TierPill tier={s.risk_tier} />
            {s.upgraded && <span className="rounded-sm border border-violet/40 bg-violet/10 px-1.5 py-px font-mono text-[10px] text-violet">↑ model</span>}
          </div>
        </Stat>
        <Stat label="Rule tier" hint="organisers’ thresholds">
          <TierPill tier={s.rule_tier} />
        </Stat>
        <Stat label="log₁₀ Pc · supplied" hint={formatPc(s.log10_pc)}>
          <div className="flex items-center gap-3">
            <span>{formatLogPc(s.log10_pc)}</span>
            <PcScale log10Pc={s.log10_pc} tier={s.rule_tier} />
          </div>
        </Stat>
        <Stat label="Miss distance · supplied">{formatDistance(s.miss_distance_m)}</Stat>
        <Stat label="To closest approach">{formatTca(s.tca_hours)}</Stat>
        <Stat label="Forecast score" hint={s.model_status === 'scored' ? `ranking score · threshold ${t.upgrade_p_critical}` : s.model_status === 'unable_to_assess' ? 'no message ≥ 2 d out' : 'inference unavailable'}>
          <span className={s.model_status === 'scored' ? '' : 'text-elevated/90'}>{s.model_status === 'scored' ? formatScore(s.p_critical) : s.model_status === 'unable_to_assess' ? 'unable to assess' : 'unavailable'}</span>
        </Stat>
      </dl>

      <div className="mb-6">
        <ReviewControls encounterId={s.encounter_id} observationId={s.observation_id} review={review} onChange={setReviewState} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader title="Decision receipt" note="why this encounter is where it is" action={<DemoTag />} />
          <ReceiptView receipt={receipt} />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Assessment history" note={`${nUpdates} message${nUpdates === 1 ? '' : 's'} · x-axis is each message’s own days to closest approach, not a calendar`} action={<DemoTag />} />
            <HistoryChart history={history} cutoffHours={t.model_input_cutoff_hours} urgentHours={t.urgent_tca_hours} />
          </Panel>
          <Panel>
            <PanelHeader title="What changed" note="each message compared with the one before it, latest first" action={<DemoTag />} />
            <ChangesList changes={changes} history={history} />
          </Panel>
          <Panel>
            <PanelHeader title="Encounter geometry" note="relative position at closest approach, target at origin · from supplied RTN fields, not a reconstructed orbit" action={<DemoTag />} />
            <GeometryPlot geometry={geometry} missDistance={s.miss_distance_m} />
          </Panel>
        </div>
      </div>
    </>
  )
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel px-5 py-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tabular mt-2 font-mono text-[15px] text-ink">{children}</dd>
      {hint && <dd className="mt-1 font-mono text-[10px] text-ink-3">{hint}</dd>}
    </div>
  )
}
