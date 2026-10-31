import type { RiskTier } from '../api/types'
import { TIER_META } from '../lib/taxonomy'

export function TierPill({ tier }: { tier: RiskTier | null }) {
  const meta = TIER_META[tier ?? 'unknown']
  return (
    <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: tier ? meta.color : undefined }}>
      {tier ? (
        <span className="size-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} />
      ) : (
        <span className="hatch size-2.5 rounded-[2px] ring-1 ring-unknown/50" />
      )}
      <span className={tier ? '' : 'text-ink-3'}>{meta.label}</span>
    </span>
  )
}

const SCALE_MIN = -12
const SCALE_MAX = -2

/** Position of log10(Pc) on a fixed log scale with the elevated (1e-6) and critical (1e-4) thresholds marked. */
export function PcScale({ log10Pc, tier }: { log10Pc: number | null; tier: RiskTier | null }) {
  const pos = (v: number) => `${((Math.min(Math.max(v, SCALE_MIN), SCALE_MAX) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%`
  const color = TIER_META[tier ?? 'unknown'].color
  return (
    <div className="relative h-1 w-20 rounded-full bg-line" aria-hidden>
      <span className="absolute -top-0.5 h-2 w-px bg-elevated/50" style={{ left: pos(-6) }} />
      <span className="absolute -top-0.5 h-2 w-px bg-critical/60" style={{ left: pos(-4) }} />
      {log10Pc !== null && (
        <>
          <span className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: pos(log10Pc), background: color }} />
          <span
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: pos(log10Pc), background: color }}
          />
        </>
      )}
    </div>
  )
}
