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
import { ForecastStatusTag, PcScale, TierPill } from '../components/Indicators'
import { DemoTag, Page, Panel, PanelHeader } from '../components/layout/Page'
import { ErrorState, LoadingBlock } from '../components/StateViews'
import { formatDistance, formatLogPc, formatPc, formatScore, formatTca } from '../lib/format'
import { FORECAST_STATUS_META, PRIORITY_META, REASON_META } from '../lib/taxonomy'

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

const NO_REVIEW: ReviewState = { status: 'unreviewed', observation_id: null, needs_renewal: false, renewal_reason: null, storage: 'not provided by the backend' }

function Detail({ initial }: { initial: EncounterDetail }) {
  const [review, setReviewState] = useState<ReviewState>(initial.item.review ?? NO_REVIEW)
  useEffect(() => setReviewState(initial.item.review ?? NO_REVIEW), [initial])
  const { item, history, receipt, changes } = initial
  const f = item.forecast
  const triage = item.triage
  const selected = history.find((e) => e.observation.observation_id === item.observation_id)?.observation ?? null
  const nUpdates = history.length

  const headline = (() => {
    const tier = triage?.prioritisation_tier ?? item.current_rule_tier
    if (!triage?.priority) return 'Not in the upcoming queue.'
    const reasons = triage.reasons.map((r) => REASON_META[r]).join('; ')
    return `${triage.priority}: ${tier ?? 'no tier evidence'} — ${reasons}.`
  })()

  return (
    <>
      <header className="mt-5 mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <p className="eyebrow text-signal/80">
            {item.priority ? `${PRIORITY_META[item.priority].label} priority` : 'Outside the upcoming queue'}
            {review.needs_renewal && <span className="ml-3 text-elevated/90">· review needed again</span>}
          </p>
          <h1 className="mt-3 font-mono text-[32px] leading-none tracking-tight text-ink md:text-[40px]">{item.encounter_id}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{headline}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 font-mono text-[11px] text-ink-3 sm:grid-cols-4">
          <div>
            <dt className="eyebrow">Observation</dt>
            <dd className="mt-1 text-ink-2">{item.observation_id}</dd>
          </div>
          <div>
            <dt className="eyebrow">Object</dt>
            <dd className="mt-1 text-ink-2">{item.object_type ?? '—'}</dd>
          </div>
          <div>
            <dt className="eyebrow">Model</dt>
            <dd className="mt-1 text-ink-2">{item.model_version ?? 'none'}</dd>
          </div>
          <div>
            <dt className="eyebrow">Policy</dt>
            <dd className="mt-1 text-ink-2">{triage?.policy_version ?? item.policy_version}</dd>
          </div>
        </dl>
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Current rule tier" hint="organisers’ thresholds on this observation">
          <TierPill tier={item.current_rule_tier} />
        </Stat>
        <Stat label="Forecast final tier" hint={FORECAST_STATUS_META[f.status].label}>
          <div className="flex flex-wrap items-center gap-2">
            {f.forecast_final_tier ? <TierPill tier={f.forecast_final_tier} /> : <span className="text-elevated/90">{FORECAST_STATUS_META[f.status].label}</span>}
            <ForecastStatusTag status={f.status} />
          </div>
        </Stat>
        <Stat label="log₁₀ Pc · supplied" hint={formatPc(item.supplied_risk_log10_pc)}>
          <div className="flex items-center gap-3">
            <span>{formatLogPc(item.supplied_risk_log10_pc)}</span>
            <PcScale log10Pc={item.supplied_risk_log10_pc} tier={item.current_rule_tier} />
          </div>
        </Stat>
        <Stat label="Miss distance · supplied">{formatDistance(item.miss_distance_m)}</Stat>
        <Stat label="To closest approach" hint={`${item.time_to_tca_days.toFixed(3)} d supplied`}>
          {formatTca(item.time_to_tca_days)}
        </Stat>
        <Stat label="p critical · class score" hint={f.p_critical === null ? 'null: no forecast' : 'not a probability; not a queue input'}>
          <span className={f.p_critical === null ? 'text-ink-3' : ''}>{formatScore(f.p_critical)}</span>
        </Stat>
      </dl>

      <div className="mb-6">
        <ReviewControls encounterId={item.encounter_id} observationId={item.observation_id} review={review} onChange={setReviewState} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader title="Decision receipt" note="why this encounter is where it is" action={<DemoTag />} />
          <ReceiptView receipt={receipt} selected={selected} triage={triage} />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Assessment history" note={`${nUpdates} message${nUpdates === 1 ? '' : 's'} · x-axis is each message’s own days to closest approach, not a calendar`} action={<DemoTag />} />
            <HistoryChart history={history} />
          </Panel>
          <Panel>
            <PanelHeader title="What changed" note="each message compared with the one before it, latest first" action={<DemoTag />} />
            <ChangesList changes={changes} history={history} />
          </Panel>
          <Panel>
            <PanelHeader title="Encounter geometry" note="relative position at closest approach, target at origin · from supplied RTN fields, not a reconstructed orbit" action={<DemoTag />} />
            <GeometryPlot observation={selected} />
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
