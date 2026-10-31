import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RadarBin } from '../../api/types'
import { TIER_META } from '../../lib/taxonomy'

const AXIS = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-ink-3)' }
const GRID = 'rgb(148 178 230 / 0.08)'

export type TierKey = 'critical' | 'elevated' | 'safe' | 'incomplete'
export const TIER_KEYS: TierKey[] = ['critical', 'elevated', 'safe', 'incomplete']

function binLabel(b: RadarBin) {
  return b.to_hours === null ? `${b.from_hours}h+` : `${b.from_hours}–${b.to_hours}h`
}

/** Encounters by hours to their own closest approach, stacked by risk tier. Status colours, plus a legend and labels. */
export function RadarChart({ bins, visible }: { bins: RadarBin[]; visible: Record<TierKey, boolean> }) {
  const data = bins.map((b) => ({ ...b, label: binLabel(b), total: TIER_KEYS.filter((k) => visible[k]).reduce((s, k) => s + b[k], 0) }))
  return (
    <div className="h-72 px-2 pt-6 pb-2">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: -12 }} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: 'hours to closest approach', position: 'insideBottom', offset: -4, ...AXIS }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<RadarTooltip />} cursor={{ fill: 'rgb(148 178 230 / 0.05)' }} />
          {TIER_KEYS.filter((k) => visible[k]).map((k, i, arr) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="tier"
              fill={k === 'incomplete' ? 'url(#hatch)' : TIER_META[k].color}
              stroke="var(--color-panel)"
              strokeWidth={2}
              radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
              label={i === arr.length - 1 ? { dataKey: 'total', position: 'top', ...AXIS, fill: 'var(--color-ink-2)', formatter: (v: unknown) => (Number(v) > 0 ? String(v) : '') } : undefined}
            />
          ))}
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgb(139 151 171 / 0.12)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-unknown)" strokeWidth="2" />
            </pattern>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function RadarTooltip({ active, payload }: { active?: boolean; payload?: { payload: RadarBin & { label: string } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-line-strong bg-raised px-3 py-2 font-mono text-[11px] text-ink-2 shadow-xl">
      <div className="text-ink">{d.label} to closest approach</div>
      {TIER_KEYS.map((k) => (
        <div key={k} className="mt-0.5 flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${k === 'incomplete' ? 'hatch ring-1 ring-unknown/60' : ''}`} style={k === 'incomplete' ? undefined : { background: TIER_META[k].color }} />
          <span className="w-20">{k === 'incomplete' ? 'incomplete' : TIER_META[k].label.toLowerCase()}</span>
          <span className="tabular text-ink">{d[k]}</span>
        </div>
      ))}
    </div>
  )
}
