import type { ForecastStatus, Tier } from '../api/types'
import { FORECAST_STATUS_META, TIER_META } from '../lib/taxonomy'

export function TierPill({ tier, muted = false }: { tier: Tier | null; muted?: boolean }) {
  const meta = TIER_META[tier ?? 'unknown']
  return (
    <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: tier && !muted ? meta.color : undefined }}>
      {tier ? (
        <span className="size-2 rounded-full" style={{ background: meta.color, boxShadow: muted ? undefined : `0 0 10px ${meta.color}` }} />
      ) : (
        <span className="hatch size-2.5 rounded-[2px] ring-1 ring-unknown/50" />
      )}
      <span className={tier ? (muted ? 'text-ink-2' : '') : 'text-ink-3'}>{meta.label}</span>
    </span>
  )
}

/** Forecast status chip. Only `available` is silent; everything else is said out loud. */
export function ForecastStatusTag({ status }: { status: ForecastStatus }) {
  if (status === 'available') return null
  const tone = status === 'carried_forward' ? 'border-violet/40 text-violet' : 'border-elevated/40 text-elevated/90'
  return (
    <span title={FORECAST_STATUS_META[status].hint} className={`rounded-sm border px-1 py-px font-mono text-[9px] uppercase tracking-[0.1em] ${tone}`}>
      {FORECAST_STATUS_META[status].label}
    </span>
  )
}

const SCALE_MIN = -12
const SCALE_MAX = -2

/** Position of log10(Pc) on a fixed log scale with the Elevated (1e-6) and Critical (1e-4) thresholds marked. */
export function PcScale({ log10Pc, tier }: { log10Pc: number | null; tier: Tier | null }) {
  const pos = (v: number) => `${((Math.min(Math.max(v, SCALE_MIN), SCALE_MAX) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%`
  const color = TIER_META[tier ?? 'unknown'].color
  return (
    <div className="relative h-1 w-20 rounded-full bg-line" aria-hidden>
      <span className="absolute -top-0.5 h-2 w-px bg-elevated/50" style={{ left: pos(-6) }} />
      <span className="absolute -top-0.5 h-2 w-px bg-critical/60" style={{ left: pos(-4) }} />
      {log10Pc !== null && (
        <>
          <span className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: pos(log10Pc), background: color }} />
          <span className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pos(log10Pc), background: color }} />
        </>
      )}
    </div>
  )
}
