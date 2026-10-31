import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const AXIS = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-ink-3)' }
const GRID = 'rgb(148 178 230 / 0.08)'

export interface CoverageSeries {
  key: string
  label: string
  color: string
  /** [reviewed proportion 0..1, covered proportion 0..1] pairs, monotone in x. */
  points: [number, number][]
}

/** Coverage of imminent-critical encounters versus the proportion of the queue reviewed, one line per ranking. */
export function CoverageChart({ series }: { series: CoverageSeries[] }) {
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p[0])))).sort((a, b) => a - b)
  const data = xs.map((x) => {
    const row: Record<string, number> = { x }
    for (const s of series) {
      const p = s.points.find((q) => q[0] === x)
      if (p) row[s.key] = p[1]
    }
    return row
  })
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div>
      <div className="h-64 px-2 pt-4">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" type="number" domain={[0, 1]} ticks={[0, 0.1, 0.2, 0.3, 0.5, 1]} tickFormatter={pct} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: 'proportion of queue reviewed', position: 'insideBottom', offset: -4, ...AXIS }} />
            <YAxis domain={[0, 1]} tickFormatter={pct} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ stroke: 'var(--color-line-strong)' }}
              contentStyle={{ background: 'var(--color-raised)', border: '1px solid var(--color-line-strong)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              labelFormatter={(v) => `${pct(Number(v))} reviewed`}
              formatter={(v, name) => [pct(Number(v)), series.find((s) => s.key === name)?.label ?? String(name)]}
            />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={s.key === 'orbit' ? 2.5 : 1.5} strokeDasharray={s.key === 'orbit' ? undefined : '4 3'} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 px-5 pt-1 pb-4 text-xs text-ink-2" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="h-0.5 w-5" style={{ background: s.color, opacity: s.key === 'orbit' ? 1 : 0.8 }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
