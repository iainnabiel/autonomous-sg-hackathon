import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Minus } from 'lucide-react'
import { fetchEncounter } from '../api/client'
import { useResource } from '../api/useResource'
import type { Receipt, ReceiptRule } from '../api/types'
import { GeometryPlot } from '../components/charts/GeometryPlot'
import { HistoryChart } from '../components/charts/HistoryChart'
import { PcScale, TierPill } from '../components/Indicators'
import { DemoTag, Page, Panel, PanelHeader } from '../components/layout/Page'
import { ErrorState, LoadingBlock } from '../components/StateViews'
import { formatDistance, formatPc, formatTca, humanizeCode } from '../lib/format'
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

      {state.status === 'ready' && (() => {
        const { summary: s, history, geometry, receipt } = state.data
        return (
          <>
            <header className="mt-5 mb-10 flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow text-signal/80">{PRIORITY_META[s.priority].label} priority</p>
                <h1 className="mt-3 font-mono text-[32px] leading-none tracking-tight text-ink md:text-[40px]">{s.encounter_id}</h1>
                <p className="mt-3 text-sm text-ink-2">{receipt.escalation_summary}</p>
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

            <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
              <Stat label="Risk tier">
                <TierPill tier={s.risk_tier} />
              </Stat>
              <Stat label="Est. Pc · model">
                <div className="flex items-center gap-3">
                  <span>{formatPc(s.predicted_log10_pc)}</span>
                  <PcScale log10Pc={s.predicted_log10_pc} tier={s.risk_tier} />
                </div>
              </Stat>
              <Stat label="Miss distance · supplied">{formatDistance(s.miss_distance_m)}</Stat>
              <Stat label="To closest approach">{formatTca(s.tca_hours)}</Stat>
            </dl>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <Panel>
                <PanelHeader title="Decision receipt" note="why this encounter is where it is" action={<DemoTag />} />
                <ReceiptView receipt={receipt} />
              </Panel>

              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader title="Assessment history" note={`${history.length} update${history.length === 1 ? '' : 's'} · x-axis is update order, not time`} action={<DemoTag />} />
                  <HistoryChart history={history} />
                </Panel>
                <Panel>
                  <PanelHeader title="Encounter geometry" note="relative position at closest approach, target at origin · from supplied RTN fields, not a reconstructed orbit" action={<DemoTag />} />
                  <GeometryPlot geometry={geometry} />
                </Panel>
              </div>
            </div>
          </>
        )
      })()}
    </Page>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel px-5 py-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tabular mt-2 font-mono text-[15px] text-ink">{children}</dd>
    </div>
  )
}

const KIND_LABEL: Record<ReceiptRule['kind'], string> = { probability: 'Probability', distance: 'Distance', urgency: 'Urgency', quality: 'Data quality' }

function ReceiptView({ receipt }: { receipt: Receipt }) {
  const kinds: ReceiptRule['kind'][] = ['probability', 'distance', 'urgency', 'quality']
  const t = receipt.thresholds
  return (
    <div className="divide-y divide-line">
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Rules evaluated</h3>
        <ul className="space-y-1">
          {kinds.map((kind) =>
            receipt.rules
              .filter((r) => r.kind === kind)
              .map((r) => (
                <li key={r.code} className={`flex items-start gap-3 rounded-md px-2 py-1.5 text-sm ${r.triggered ? 'bg-raised/70' : ''}`}>
                  <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm ${r.triggered ? 'bg-signal text-void' : 'border border-line-strong text-ink-3'}`}>
                    {r.triggered ? <Check size={11} strokeWidth={3} /> : <Minus size={10} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`font-mono text-[12px] ${r.triggered ? 'text-ink' : 'text-ink-3'}`}>{r.code}</span>
                      <span className="eyebrow text-[10px]">{KIND_LABEL[kind]}</span>
                    </div>
                    <div className={`text-xs ${r.triggered ? 'text-ink-2' : 'text-ink-3'}`}>{r.description}</div>
                  </div>
                </li>
              )),
          )}
        </ul>
      </div>

      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Thresholds applied</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px] sm:grid-cols-3">
          <Kv k="critical log₁₀ Pc" v={`≥ ${t.critical_log10_pc}`} />
          <Kv k="elevated log₁₀ Pc" v={`≥ ${t.elevated_log10_pc}`} />
          <Kv k="urgent window" v={`≤ ${t.urgent_tca_hours} h`} />
          <Kv k="critical distance" v={`< ${formatDistance(t.critical_distance_m)}`} />
          <Kv k="elevated distance" v={`≤ ${formatDistance(t.elevated_distance_m)}`} />
          <Kv k="estimated log₁₀ Pc" v={receipt.estimated_log10_pc === null ? 'unavailable' : receipt.estimated_log10_pc.toFixed(2)} />
        </dl>
      </div>

      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Input telemetry</h3>
        <table className="w-full font-mono text-[12px]">
          <tbody>
            {receipt.inputs.map((i) => (
              <tr key={i.field} className="border-t border-line first:border-0">
                <td className="py-1.5 pr-4 text-ink-3">{humanizeCode(i.field)}</td>
                <td className={`tabular py-1.5 text-right ${i.value === 'not supplied' ? 'text-elevated/90' : 'text-ink'}`}>
                  {i.value}
                  {i.unit && i.value !== 'not supplied' && <span className="ml-1 text-ink-3">{i.unit}</span>}
                </td>
                <td className="w-16 py-1.5 pl-3 text-right text-[10px] text-elevated/90">{i.imputed ? 'imputed' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">Units are labelled assumptions until the shared contract confirms them. Sigma fields are supplied covariance, not model confidence.</p>
      </div>
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  )
}
