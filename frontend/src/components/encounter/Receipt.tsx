import { Check, Minus } from 'lucide-react'
import type { Receipt, ReceiptRule, RuleKind } from '../../api/types'
import { formatDistance, formatScore, humanizeCode } from '../../lib/format'
import { RULE_KIND_LABEL } from '../../lib/taxonomy'
import { TierPill } from '../Indicators'

const KINDS: RuleKind[] = ['probability', 'distance', 'model', 'urgency', 'quality']

const CAUSE_TONE: Record<Receipt['escalation_causes'][number], string> = {
  probability: 'border-critical/40 bg-critical/10 text-critical',
  distance: 'border-elevated/40 bg-elevated/10 text-elevated',
  model: 'border-violet/40 bg-violet/10 text-violet',
}

/**
 * Decision receipt (SG-08.1). Everything here is backend evidence: inputs, thresholds, the rules
 * that fired, how the model forecast was applied, how quality issues were handled, and versions.
 * Probability, distance, model and urgency are kept visibly separate.
 */
export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const t = receipt.thresholds
  const shortId = (id: string | null) => (id ? id.replace(/^.*#/, '#') : '—')
  return (
    <div className="divide-y divide-line">
      {/* 1. How the tier was set */}
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">How the tier was set</h3>
        <ol className="space-y-3">
          <Step n="1" title="Rules on the selected observation" result={<TierPill tier={receipt.rule_tier} />}>
            Observation <span className="font-mono text-ink-2">{receipt.observation_id}</span>. Organisers’ thresholds on the supplied log₁₀ Pc and miss distance, critical first.
            {receipt.escalation_causes.filter((c) => c !== 'model').length > 0 && (
              <span className="ml-1">
                Set by{' '}
                {receipt.escalation_causes
                  .filter((c) => c !== 'model')
                  .map((c) => (
                    <span key={c} className={`mr-1 inline-block rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.1em] ${CAUSE_TONE[c]}`}>
                      {c}
                    </span>
                  ))}
              </span>
            )}
            {receipt.rule_tier === 'safe' && <span className="ml-1">No probability or distance rule fired.</span>}
            {receipt.rule_tier === null && <span className="ml-1 text-elevated/90">Could not be completed.</span>}
          </Step>

          <Step
            n="2"
            title="Model forecast"
            result={
              receipt.model_status !== 'scored' ? (
                <span className="font-mono text-[12px] text-elevated/90">{receipt.model_status === 'unable_to_assess' ? 'no score' : 'unavailable'}</span>
              ) : receipt.upgraded ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-violet">↑ raised to critical</span>
              ) : (
                <span className="font-mono text-[12px] text-ink-3">no change</span>
              )
            }
          >
            {receipt.model_status === 'scored' ? (
              <>
                Score <span className="font-mono text-ink">{formatScore(receipt.p_critical)}</span> against threshold <span className="font-mono text-ink-2">{t.upgrade_p_critical}</span>, from{' '}
                {receipt.model_input_count} message{receipt.model_input_count === 1 ? '' : 's'} at least {t.model_input_cutoff_hours / 24} days out
                {receipt.model_input_observation_id && receipt.model_input_observation_id !== receipt.observation_id && (
                  <>
                    {' '}
                    (latest <span className="font-mono text-ink-2">{shortId(receipt.model_input_observation_id)}</span>)
                  </>
                )}
                . A ranking score, not a calibrated probability. It can raise a safe or elevated tier to critical; it never lowers one.
                {receipt.upgraded && receipt.upgrade_reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l border-violet/40 pl-3 text-ink-2">
                    {receipt.upgrade_reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {receipt.upgraded && <p className="mt-1.5 text-[11px] text-ink-3">Observable facts behind the upgrade, from the backend. Not feature attributions.</p>}
              </>
            ) : receipt.model_status === 'unable_to_assess' ? (
              <>No message at least {t.model_input_cutoff_hours / 24} days before closest approach, so the model had nothing to score. The tier comes from the rules alone.</>
            ) : (
              <>Inference failed. No score was substituted. The tier comes from the rules alone.</>
            )}
          </Step>

          <Step n="3" title="Urgency" result={<span className={`font-mono text-[12px] ${receipt.urgency_raised_band ? 'text-signal' : 'text-ink-3'}`}>{receipt.urgency_raised_band ? 'band raised' : 'band unchanged'}</span>}>
            Closest approach within {t.urgent_tca_hours} h moves an encounter up one review band. It never changes the risk tier.
          </Step>
        </ol>
      </div>

      {/* 2. Rules evaluated */}
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Rules evaluated</h3>
        <ul className="space-y-1">
          {KINDS.map((kind) =>
            receipt.rules
              .filter((r) => r.kind === kind)
              .map((r) => <RuleRow key={r.code} rule={r} />),
          )}
        </ul>
      </div>

      {/* 3. Thresholds */}
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Thresholds applied</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px] sm:grid-cols-3">
          <Kv k="critical log₁₀ Pc" v={`≥ ${t.critical_log10_pc}`} />
          <Kv k="elevated log₁₀ Pc" v={`≥ ${t.elevated_log10_pc}`} />
          <Kv k="urgent window" v={`≤ ${t.urgent_tca_hours} h`} />
          <Kv k="critical distance" v={`< ${formatDistance(t.critical_distance_m)}`} />
          <Kv k="elevated distance" v={`≤ ${formatDistance(t.elevated_distance_m)}`} />
          <Kv k="upgrade score" v={`≥ ${t.upgrade_p_critical}`} />
          <Kv k="model input cutoff" v={`≥ ${t.model_input_cutoff_hours / 24} d to TCA`} />
        </dl>
      </div>

      {/* 4. Inputs */}
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Input telemetry</h3>
        <table className="w-full font-mono text-[12px]">
          <thead>
            <tr className="text-[10px] text-ink-3">
              <th className="pb-1.5 text-left font-normal">field</th>
              <th className="pb-1.5 text-right font-normal">value</th>
              <th className="w-24 pb-1.5 pl-3 text-right font-normal">used by</th>
            </tr>
          </thead>
          <tbody>
            {receipt.inputs.map((i) => {
              const missing = i.value === 'not supplied'
              return (
                <tr key={i.field} className="border-t border-line align-top">
                  <td className="py-1.5 pr-4 text-ink-3">
                    {i.field}
                    {i.note && <div className="text-[10px] leading-snug text-ink-3/80">{i.note}</div>}
                  </td>
                  <td className={`tabular py-1.5 text-right ${missing ? 'text-elevated/90' : 'text-ink'}`}>
                    {i.value}
                    {i.unit && !missing && <span className="ml-1 text-ink-3">{i.unit}</span>}
                    {i.imputed && <span className="ml-2 text-[10px] text-elevated/90">imputed</span>}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-[10px]">
                    {i.used_by.length === 0 ? (
                      <span className="text-ink-3/60">—</span>
                    ) : (
                      i.used_by.map((u) => (
                        <span key={u} className={`ml-1 inline-block rounded-sm border px-1 py-px uppercase tracking-[0.08em] ${u === 'rule' ? 'border-line-strong text-ink-2' : 'border-violet/40 text-violet'}`}>
                          {u}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          Units are labelled assumptions until the shared contract confirms them. Miss distance and log₁₀ Pc are supplied with the message; neither is a model output. Sigma fields are supplied covariance, not model confidence.
        </p>
      </div>

      {/* 5. Quality handling */}
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Quality handling</h3>
        {receipt.quality_handling.length === 0 ? (
          <p className="text-xs text-ink-3">No quality flags on this observation.</p>
        ) : (
          <ul className="space-y-2">
            {receipt.quality_handling.map((q) => (
              <li key={q.flag} className="text-xs leading-relaxed text-ink-2">
                <span className="font-mono text-[11px] text-elevated/90">{humanizeCode(q.flag)}</span>
                <span className="mx-1.5 text-ink-3">·</span>
                {q.handling}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 6. Versions */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3 font-mono text-[10px] text-ink-3">
        <span>
          model <span className="text-ink-2">{receipt.model_version}</span>
          {receipt.model_sha256 && <span className="ml-1 text-ink-3/70">sha256 {receipt.model_sha256.slice(0, 12)}</span>}
        </span>
        <span>
          policy <span className="text-ink-2">{receipt.policy_version}</span>
        </span>
        <span>
          observation <span className="text-ink-2">{receipt.observation_id}</span>
        </span>
      </div>
    </div>
  )
}

function Step({ n, title, result, children }: { n: string; title: string; result: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3">
      <span className="mt-0.5 font-mono text-[11px] text-signal/80">{n}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="text-[13px] font-medium text-ink">{title}</span>
          <span>{result}</span>
        </div>
        <div className="mt-1 text-xs leading-relaxed text-ink-3">{children}</div>
      </div>
    </li>
  )
}

function RuleRow({ rule: r }: { rule: ReceiptRule }) {
  const tone = r.kind === 'model' ? 'bg-violet text-void' : r.kind === 'urgency' ? 'bg-signal text-void' : r.kind === 'quality' ? 'bg-elevated text-void' : 'bg-ink text-void'
  return (
    <li className={`flex items-start gap-3 rounded-md px-2 py-1.5 text-sm ${r.triggered ? 'bg-raised/70' : ''}`}>
      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm ${r.triggered ? tone : 'border border-line-strong text-ink-3'}`}>
        {r.triggered ? <Check size={11} strokeWidth={3} /> : <Minus size={10} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`font-mono text-[12px] ${r.triggered ? 'text-ink' : 'text-ink-3'}`}>{r.code}</span>
          <span className="eyebrow text-[10px]">{RULE_KIND_LABEL[r.kind]}</span>
          {r.evidence && <span className={`ml-auto font-mono text-[11px] ${r.triggered ? 'text-ink-2' : 'text-ink-3/80'}`}>{r.evidence}</span>}
        </div>
        <div className={`text-xs ${r.triggered ? 'text-ink-2' : 'text-ink-3'}`}>{r.description}</div>
      </div>
    </li>
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
