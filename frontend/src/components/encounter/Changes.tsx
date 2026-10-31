import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { ObservationChange, Observation } from '../../api/types'
import { formatDelta, humanizeCode, ruleLabel } from '../../lib/format'
import { TIER_LEVEL, TIER_META } from '../../lib/taxonomy'

/**
 * "What changed" (SG-08.5): backend comparisons of each observation with the one before it.
 * Significant entries (tier change, threshold crossing, urgent-window entry, new flag) are shown in full;
 * the rest are listed compactly so no fluctuation is dressed up as a signal.
 */
export function ChangesList({ changes, history }: { changes: ObservationChange[] | null; history: Observation[] }) {
  const [showAll, setShowAll] = useState(false)
  if (changes === null) return <Note>The backend did not provide comparisons for this encounter. Nothing is inferred client-side.</Note>
  if (history.length <= 1 || changes.length === 0) return <Note>Only one observation so far. There is no previous state to compare with, and none is invented.</Note>

  const latestFirst = [...changes].sort((a, b) => b.to_update_index - a.to_update_index)
  const significant = latestFirst.filter((c) => c.significant)
  const quiet = latestFirst.filter((c) => !c.significant)
  const shown = showAll ? latestFirst : significant

  return (
    <div>
      <ol className="divide-y divide-line">
        {shown.map((c) => (
          <ChangeRow key={c.to_observation_id} c={c} />
        ))}
        {significant.length === 0 && !showAll && <Note>No tier change, threshold crossing, urgent-window entry or new quality flag across {changes.length} updates.</Note>}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <p className="text-[11px] leading-relaxed text-ink-3">
          {significant.length} of {changes.length} update{changes.length === 1 ? '' : 's'} marked significant by the backend. Every update’s deltas are reported; only tier changes, threshold crossings, urgent-window entry and new flags count as significant.
        </p>
        {quiet.length > 0 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] text-signal hover:underline">
            {showAll ? 'Hide' : 'Show'} {quiet.length} quiet update{quiet.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  )
}

function ChangeRow({ c }: { c: ObservationChange }) {
  const tierChanged = c.tier_before !== c.tier_after
  const escalated = c.tier_before !== null && c.tier_after !== null && TIER_LEVEL[c.tier_after] > TIER_LEVEL[c.tier_before]
  const failed = c.tier_before !== null && c.tier_after === null
  return (
    <li className={`px-5 py-3 ${c.significant ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[12px] text-ink">
          #{c.from_update_index} <ArrowRight size={11} className="inline text-ink-3" /> #{c.to_update_index}
        </span>
        <span className="font-mono text-[10px] text-ink-3">
          {c.from_observation_id} vs {c.to_observation_id}
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          miss {formatDelta(c.delta_miss_m, 'm')} · log₁₀ Pc {formatDelta(c.delta_log10_pc, 'log')}
        </span>
      </div>
      {c.significant && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tierChanged && (
            <Chip tone={failed ? 'warn' : escalated ? 'up' : 'down'}>
              <TierDot tier={c.tier_before} /> {c.tier_before ?? 'incomplete'} <ArrowRight size={10} /> <TierDot tier={c.tier_after} /> {c.tier_after ?? 'incomplete'}
            </Chip>
          )}
          {c.crossings.map((x) => (
            <Chip key={`${x.code}-${x.direction}`} tone={x.direction === 'entered' ? 'up' : 'down'}>
              {x.direction} {ruleLabel(x.code)}
            </Chip>
          ))}
          {c.entered_urgent_window && <Chip tone="signal">entered 24 h window</Chip>}
          {c.new_flags.map((f) => (
            <Chip key={f} tone="warn">
              new flag · {humanizeCode(f)}
            </Chip>
          ))}
          {c.cleared_flags.map((f) => (
            <Chip key={f} tone="muted">
              cleared · {humanizeCode(f)}
            </Chip>
          ))}
          {c.crossed_model_cutoff && <Chip tone="muted">first update inside the 2-day model cutoff · not a model input</Chip>}
        </div>
      )}
      {!c.significant && c.crossed_model_cutoff && (
        <div className="mt-1.5">
          <Chip tone="muted">first update inside the 2-day model cutoff · not a model input</Chip>
        </div>
      )}
    </li>
  )
}

const CHIP: Record<'up' | 'down' | 'warn' | 'signal' | 'muted', string> = {
  up: 'border-critical/40 bg-critical/10 text-critical',
  down: 'border-safe/40 bg-safe/10 text-safe',
  warn: 'border-elevated/40 bg-elevated/10 text-elevated',
  signal: 'border-signal/40 bg-signal/10 text-signal',
  muted: 'border-line-strong text-ink-3',
}

function Chip({ tone, children }: { tone: keyof typeof CHIP; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${CHIP[tone]}`}>{children}</span>
}

function TierDot({ tier }: { tier: Observation['rule_tier'] }) {
  return tier ? <span className="inline-block size-1.5 rounded-full" style={{ background: TIER_META[tier].color }} /> : <span className="hatch inline-block size-1.5 rounded-[1px] ring-1 ring-unknown/60" />
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-ink-3">{children}</p>
}
