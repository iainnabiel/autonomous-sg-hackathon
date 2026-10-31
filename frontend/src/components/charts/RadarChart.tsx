import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RadarBin } from '../../api/types'
import { TIER_META } from '../../lib/taxonomy'

const AXIS = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-ink-3)' }
const GRID = 'rgb(148 178 230 / 0.08)'

export type TierKey = 'critical' | 'elevated' | 'safe' | 'incomplete'
export const TIER_KEYS: TierKey[] = ['critical', 'elevated', 'safe', 'incomplete']

function hours(h: number) {
  return h >= 48 && h % 24 === 0 ? `${h / 24} d` : `${h} h`
}
function binLabel(b: RadarBin) {
  return b.to_hours === null ? `${hours(b.from_hours)}+` : `${b.from_hours}–${hours(b.to_hours)}`
}

/** Encounters by hours to their own closest approach, stacked by risk tier. Status colours, plus a legend and labels. */
export function RadarChart({ bins, visible }: { bins: RadarBin[]; visible: Record<TierKey, boolean> }) {
  const data = bins.map((b) => ({ ...b, label: binLabel(b), total: TIER_KEYS.filter((k) => visible[k]).reduce((s, k) => s + b[k], 0) }))
  return (
    <div className="h-80 px-3 pt-6 pb-3">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 16, bottom: 20, left: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={GRID} strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" tick={{ ...AXIS, fill: 'var(--color-ink-2)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line-strong)' }} tickMargin={8} label={{ value: 'Time to closest approach', position: 'insideBottom', offset: -14, ...AXIS }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} label={{ value: 'Encounters', angle: -90, position: 'insideLeft', offset: 12, ...AXIS, style: { textAnchor: 'middle' } }} />
          <Tooltip content={<RadarTooltip />} cursor={{ fill: 'rgb(111 227 255 / 0.06)', radius: 6 }} />
          {TIER_KEYS.filter((k) => visible[k]).map((k, i, arr) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="tier"
              fill={k === 'incomplete' ? 'url(#hatch)' : `url(#grad-${k})`}
              maxBarSize={64}
              radius={i === arr.length - 1 ? [6, 6, 0, 0] : 0}
              animationDuration={500}
              label={i === arr.length - 1 ? { dataKey: 'total', position: 'top', ...AXIS, fontSize: 12, fill: 'var(--color-ink)', formatter: (v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : '') } : undefined}
            />
          ))}
          <defs>
            {(['critical', 'elevated', 'safe'] as const).map((k) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={TIER_META[k].color} stopOpacity={1} />
                <stop offset="1" stopColor={TIER_META[k].color} stopOpacity={0.7} />
              </linearGradient>
            ))}
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
