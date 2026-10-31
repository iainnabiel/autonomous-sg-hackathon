import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Observation } from '../../api/types'
import { formatDistance, formatPc } from '../../lib/format'

const AXIS = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-ink-3)' }
const GRID = 'rgb(148 178 230 / 0.08)'

/**
 * Assessment history across updates. Two measures of different scale → two charts on one x-axis,
 * never a dual axis. The x-axis is update order, not time, and not a trajectory.
 */
export function HistoryChart({ history }: { history: Observation[] }) {
  const data = history.map((o) => ({
    update: o.update_index,
    log10Pc: o.predicted_log10_pc,
    miss: o.miss_distance_m,
    tca: o.tca_hours,
    id: o.observation_id,
    flags: o.quality_flags,
  }))
  if (data.length === 0) return <p className="px-5 py-10 text-center text-sm text-ink-3">No history for this encounter.</p>

  return (
    <div className="grid gap-6 px-2 pt-4 pb-3 lg:grid-cols-2">
      <figure>
        <figcaption className="mb-2 flex items-baseline justify-between px-3">
          <span className="text-xs text-ink-2">Estimated log₁₀ Pc · model</span>
          <span className="font-mono text-[10px] text-ink-3">thresholds −4 / −6</span>
        </figcaption>
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 14, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="update" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: 'update', position: 'bottom', offset: 0, ...AXIS }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[(min: number) => Math.floor(min - 0.5), (max: number) => Math.ceil(max + 0.5)]} allowDecimals={false} tickFormatter={(v: number) => v.toFixed(0)} />
              <ReferenceLine y={-4} stroke="var(--color-critical)" strokeOpacity={0.5} strokeDasharray="3 3" />
              <ReferenceLine y={-6} stroke="var(--color-elevated)" strokeOpacity={0.5} strokeDasharray="3 3" />
              <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'var(--color-line-strong)' }} />
              <Line
                type="monotone"
                dataKey="log10Pc"
                stroke="var(--color-signal)"
                strokeWidth={2}
                dot={{ r: 3.5, fill: 'var(--color-panel)', stroke: 'var(--color-signal)', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure>
        <figcaption className="mb-2 flex items-baseline justify-between px-3">
          <span className="text-xs text-ink-2">Miss distance · supplied</span>
          <span className="font-mono text-[10px] text-ink-3">thresholds 1 km / 5 km</span>
        </figcaption>
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 14, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="update" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: 'update', position: 'bottom', offset: 0, ...AXIS }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
              <ReferenceLine y={1000} stroke="var(--color-critical)" strokeOpacity={0.5} strokeDasharray="3 3" />
              <ReferenceLine y={5000} stroke="var(--color-elevated)" strokeOpacity={0.5} strokeDasharray="3 3" />
              <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'var(--color-line-strong)' }} />
              <Line
                type="monotone"
                dataKey="miss"
                stroke="var(--color-ink-2)"
                strokeWidth={2}
                dot={{ r: 3.5, fill: 'var(--color-panel)', stroke: 'var(--color-ink-2)', strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  )
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: { update: number; log10Pc: number | null; miss: number | null; tca: number | null; id: string; flags: string[] } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-line-strong bg-raised px-3 py-2 font-mono text-[11px] text-ink-2 shadow-xl">
      <div className="text-ink">update {d.update}</div>
      <div className="mt-1">Pc {formatPc(d.log10Pc)}</div>
      <div>miss {formatDistance(d.miss)}</div>
      <div>to TCA {d.tca === null ? '—' : `${d.tca.toFixed(1)} h`}</div>
      {d.flags.length > 0 && <div className="mt-1 text-elevated">{d.flags.join(', ')}</div>}
    </div>
  )
}
