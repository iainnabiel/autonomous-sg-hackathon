import { Check, Minus } from 'lucide-react'
import type { DecisionReceipt, Observation, ReviewDecision, RiskRule } from '../../api/types'
import { formatDays, formatDistance, formatScore, humanizeCode, shortId } from '../../lib/format'
import { CRITICAL_LOG10_PC, CRITICAL_MISS_DISTANCE_M, EARLY_CUTOFF_DAYS, ELEVATED_LOG10_PC, ELEVATED_MISS_DISTANCE_M, RISK_FLOOR, RULE_META, UPCOMING_URGENCY_DAYS, UPGRADE_THRESHOLD_P_CRITICAL } from '../../lib/policy'
import { FORECAST_STATUS_META, MODEL_FLAG_META, QUALITY_FLAG_META, REASON_CODE_META, REASON_META } from '../../lib/taxonomy'
import { TierPill } from '../Indicators'

const RULES: RiskRule[] = ['probability_critical', 'distance_critical', 'probability_elevated', 'distance_elevated']

/**
 * Decision receipt (SG-08.1) on the contract's `DecisionReceipt` plus the triage decision.
 * Three steps stay separate: the organiser rules on the selected observation (probability vs distance),
 * the model forecast (status, tier, class score, source observation), and the prototype review policy.
 * Thresholds are the shared policy constants; the backend's own evidence is quoted where it exists.
 */
export function ReceiptView({ receipt, selected, triage }: { receipt: DecisionReceipt; selected: Observation | null; triage: ReviewDecision | null }) {
  const f = receipt.forecast
  const pc = receipt.supplied_risk_log10_pc
  const d = receipt.miss_distance_m
  const fired = new Set(receipt.triggered_rules)
  const causes = receipt.triggered_rules.filter((r) => RULE_META[r].tier === receipt.current_rule_tier).map((r) => RULE_META[r].kind)
  const forecastValid = (f.status === 'available' || f.status === 'carried_forward') && f.forecast_final_tier !== null
  const upgraded = forecastValid && f.p_critical !== null && f.p_critical >= UPGRADE_THRESHOLD_P_CRITICAL && f.forecast_final_tier === 'Critical' && receipt.upgrade_reasons.length > 0

  return (
    <div className="divide-y divide-line">
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">How the band was set</h3>
        <ol className="space-y-3">
          <Step n="1" title="Organiser rules on the selected observation" result={<TierPill tier={receipt.current_rule_tier} />}>
            Observation <span className="font-mono text-ink-2">{receipt.observation_id}</span>, {formatDays(receipt.time_to_tca_days)} to closest approach. Critical first, on the supplied log₁₀ Pc and miss distance.
            {causes.length > 0 && (
              <span className="ml-1">
                Set by{' '}
                {[...new Set(causes)].map((c) => (
                  <span key={c} className={`mr-1 inline-block rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.1em] ${c === 'probability' ? 'border-critical/40 bg-critical/10 text-critical' : 'border-elevated/40 bg-elevated/10 text-elevated'}`}>
                    {c}
                  </span>
                ))}
              </span>
            )}
            {receipt.current_rule_tier === 'Safe' && <span className="ml-1">No probability or distance rule fired.</span>}
            {receipt.current_rule_tier === null && <span className="ml-1 text-elevated/90">The inputs cannot place this observation ({receipt.invalid_inputs.join(', ') || 'incomplete'}). Null is not Safe.</span>}
            {receipt.current_rule_tier === 'Critical' && receipt.invalid_inputs.length > 0 && <span className="ml-1 text-elevated/90">A Critical trigger stays Critical although {receipt.invalid_inputs.join(', ')} is missing.</span>}
          </Step>

          <Step
            n="2"
            title="Model forecast of the final tier"
            result={
              forecastValid ? (
                <span className="inline-flex items-center gap-2">
                  <TierPill tier={f.forecast_final_tier} />
                  {f.status === 'carried_forward' && <span className="rounded-sm border border-violet/40 px-1 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-violet">carried forward</span>}
                </span>
              ) : (
                <span className="font-mono text-[12px] text-elevated/90">{FORECAST_STATUS_META[f.status].label}</span>
              )
            }
          >
            {forecastValid ? (
              <>
                From observation <span className="font-mono text-ink-2">{shortId(f.source_observation_id)}</span> at {formatDays(f.source_time_to_tca_days)} to closest approach, the latest message at least {EARLY_CUTOFF_DAYS} days out
                {f.status === 'carried_forward' && <>; the model is not run inside {EARLY_CUTOFF_DAYS} days, so that forecast is reused here</>}. Class score p<sub>critical</sub> <span className="font-mono text-ink">{formatScore(f.p_critical)}</span>
                {f.p_critical !== null && <> against the shipped upgrade threshold {UPGRADE_THRESHOLD_P_CRITICAL}</>}: not calibrated, not a collision probability. The rule tier at the source can be raised to Critical by the score, never lowered.
                {upgraded && (
                  <ul className="mt-2 space-y-1 border-l border-violet/40 pl-3 text-ink-2">
                    {receipt.upgrade_reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {upgraded && <p className="mt-1.5 text-[11px] text-ink-3">Observable facts behind the upgrade, from the model package. Not feature attributions.</p>}
                {f.predicted_final_log10_pc === null && <p className="mt-1.5 text-[11px] text-ink-3">Predicted final Pc: null for this model. The supplied log₁₀ Pc above is not a forecast.</p>}
              </>
            ) : (
              <>{FORECAST_STATUS_META[f.status].hint}</>
            )}
          </Step>

          <Step n="3" title="Prototype review policy" result={triage?.priority ? <span className="font-mono text-[12px] text-signal">{triage.priority}</span> : <span className="font-mono text-[12px] text-ink-3">not in upcoming queue</span>}>
            {triage ? (
              <>
                Prioritisation tier <span className="text-ink-2">{triage.prioritisation_tier ?? 'none'}</span>: the more severe of steps 1 and 2; neither is overwritten, and the class score is not an input. Urgency uses the current observation ({formatDays(triage.current_time_to_tca_days)}; within {UPCOMING_URGENCY_DAYS} day moves the band up, boundaries included).
                <ul className="mt-2 space-y-1">
                  {triage.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="font-mono text-[10px] text-signal/80">{r}</span>
                      <span>{REASON_META[r]}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-ink-3">Policy {triage.policy_version}{triage.prototype ? ' · prototype, not a certified operational standard, not a manoeuvre instruction' : ''}.</p>
              </>
            ) : (
              <>The backend did not include the triage decision for this encounter.</>
            )}
          </Step>
        </ol>
      </div>

      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Rules evaluated</h3>
        <ul className="space-y-1">
          {RULES.map((r) => {
            const m = RULE_META[r]
            const on = fired.has(r)
            const evidence = m.kind === 'probability' ? (pc === null ? 'log₁₀ Pc not supplied' : `log₁₀ Pc = ${pc.toFixed(2)}${pc <= RISK_FLOOR ? ' (reporting floor)' : ''}`) : d === null ? 'miss distance not supplied' : `miss = ${d} m`
            return (
              <li key={r} className={`flex items-start gap-3 rounded-md px-2 py-1.5 text-sm ${on ? 'bg-raised/70' : ''}`}>
                <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm ${on ? 'bg-ink text-void' : 'border border-line-strong text-ink-3'}`}>{on ? <Check size={11} strokeWidth={3} /> : <Minus size={10} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`font-mono text-[12px] ${on ? 'text-ink' : 'text-ink-3'}`}>{r}</span>
                    <span className="eyebrow text-[10px]">{m.kind}</span>
                    <span className={`ml-auto font-mono text-[11px] ${on ? 'text-ink-2' : 'text-ink-3/80'}`}>{evidence}</span>
                  </div>
                  <div className={`text-xs ${on ? 'text-ink-2' : 'text-ink-3'}`}>{m.description}</div>
                </div>
              </li>
            )
          })}
        </ul>
        {receipt.reason_codes.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-2">
            {receipt.reason_codes.map((c) => (
              <li key={c}>
                <span className="font-mono text-[11px] text-ink-3">{c}</span> · {REASON_CODE_META[c]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Thresholds applied · contracts.policy</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px] sm:grid-cols-3">
          <Kv k="critical log₁₀ Pc" v={`≥ ${CRITICAL_LOG10_PC}`} />
          <Kv k="elevated log₁₀ Pc" v={`≥ ${ELEVATED_LOG10_PC}`} />
          <Kv k="urgent window" v={`≤ ${UPCOMING_URGENCY_DAYS} d, inclusive`} />
          <Kv k="critical distance" v={`< ${formatDistance(CRITICAL_MISS_DISTANCE_M)}`} />
          <Kv k="elevated distance" v={`≤ ${formatDistance(ELEVATED_MISS_DISTANCE_M)}`} />
          <Kv k="early cutoff" v={`≥ ${EARLY_CUTOFF_DAYS} d, 2.0 eligible`} />
          <Kv k="upgrade score (model card)" v={`≥ ${UPGRADE_THRESHOLD_P_CRITICAL}`} />
        </dl>
      </div>

      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Input telemetry · selected observation</h3>
        {selected ? (
          <table className="w-full font-mono text-[12px]">
            <tbody>
              <Row k="time_to_tca" v={selected.time_to_tca_days.toFixed(3)} unit="d" note="supplied in days; hours are display only" />
              <Row k="risk" v={pc === null ? null : pc.toFixed(2)} unit="log₁₀ Pc" note={pc !== null && pc <= RISK_FLOOR ? 'reporting floor: Pc too small to compute' : 'supplied with the message, not a forecast'} />
              <Row k="miss_distance" v={d === null ? null : String(d)} unit="m" note={d === null ? 'required input missing' : null} />
              <Row k="relative_speed" v={selected.relative_speed_m_s === null ? null : String(selected.relative_speed_m_s)} unit="m/s" />
              <Row k="relative_position_r" v={selected.relative_position_r_m === null ? null : String(selected.relative_position_r_m)} unit="m" />
              <Row k="relative_position_t" v={selected.relative_position_t_m === null ? null : String(selected.relative_position_t_m)} unit="m" />
              <Row k="relative_position_n" v={selected.relative_position_n_m === null ? null : String(selected.relative_position_n_m)} unit="m" />
              <Row k="c_sigma_r" v={selected.c_sigma_r == null ? null : selected.c_sigma_r >= 6.378136e7 ? '6.378136e7' : selected.c_sigma_r.toFixed(1)} unit="units unconfirmed" note={selected.c_sigma_r != null && selected.c_sigma_r >= 6.378136e7 ? 'placeholder, treated as missing by the model' : null} />
              <Row k="t_sigma_r" v={selected.t_sigma_r == null ? null : selected.t_sigma_r.toFixed(1)} unit="units unconfirmed" />
              <Row k="c_object_type" v={selected.c_object_type ?? null} />
              <Row k="F10" v={selected.f10 == null ? null : String(selected.f10)} unit="sfu" note={selected.f10 == null ? 'space weather missing' : null} />
              <Row k="AP" v={selected.ap == null ? null : String(selected.ap)} note={selected.ap == null ? 'space weather missing' : null} />
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-ink-3">The selected observation is not in the history payload.</p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">Units, from the backend: {receipt.units}. Sigma fields are supplied covariance, not model confidence.</p>
      </div>

      <div className="px-5 py-4">
        <h3 className="eyebrow mb-3">Quality handling</h3>
        {receipt.quality_flags.length === 0 && receipt.model_quality_flags.length === 0 ? (
          <p className="text-xs text-ink-3">No quality flags on this observation.</p>
        ) : (
          <ul className="space-y-2">
            {receipt.quality_flags.map((q) => (
              <li key={q} className="text-xs leading-relaxed text-ink-2">
                <span className="font-mono text-[11px] text-elevated/90">{humanizeCode(q)}</span>
                <span className="mx-1.5 text-ink-3">·</span>
                {QUALITY_FLAG_META[q]}
              </li>
            ))}
            {receipt.model_quality_flags.map((q) => (
              <li key={q} className="text-xs leading-relaxed text-ink-2">
                <span className="font-mono text-[11px] text-violet">{humanizeCode(q)}</span>
                <span className="mx-1.5 text-ink-3">· model ·</span>
                {MODEL_FLAG_META[q] ?? 'No handling note from the model package.'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3 font-mono text-[10px] text-ink-3">
        <span>
          model <span className="text-ink-2">{receipt.model_version ?? 'none'}</span>
        </span>
        <span>
          schema <span className="text-ink-2">{receipt.policy_version}</span>
        </span>
        {triage && (
          <span>
            triage <span className="text-ink-2">{triage.policy_version}</span>
          </span>
        )}
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

function Row({ k, v, unit, note }: { k: string; v: string | null; unit?: string; note?: string | null }) {
  return (
    <tr className="border-t border-line align-top first:border-0">
      <td className="py-1.5 pr-4 text-ink-3">
        {k}
        {note && <div className="text-[10px] leading-snug text-ink-3/80">{note}</div>}
      </td>
      <td className={`tabular py-1.5 text-right ${v === null ? 'text-elevated/90' : 'text-ink'}`}>
        {v ?? 'not supplied'}
        {unit && v !== null && <span className="ml-1 text-ink-3">{unit}</span>}
      </td>
    </tr>
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
