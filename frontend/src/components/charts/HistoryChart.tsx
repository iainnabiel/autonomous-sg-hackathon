import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Observation } from '../../api/types'
import { PC_FLOOR, formatDays, formatDistance, formatLogPc, formatPc } from '../../lib/format'
import { TIER_META } from '../../lib/taxonomy'

const AXIS = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-ink-3)' }
const GRID = 'rgb(148 178 230 / 0.08)'

/** Values at the reporting floor are drawn on a shelf below the real axis, with a distinct mark, so they do not crush the scale. */
const FLOOR_SHELF = -13

interface Point {
  days: number
  update: number
  id: string
  pc: number | null
  pcPlot: number | null
  floor: boolean
  miss: number | null
  tier: Observation['rule_tier']
  input: boolean
  flags: string[]
}

/**
 * Assessment history across updates (SG-08.2): supplied log10 Pc and supplied miss distance,
 * each on its own axis, against days to closest approach. Points inside the 2-day model cutoff
 * are hollow: the model never saw them. Lines join successive messages; they are not motion.
 */
export function HistoryChart({ history, cutoffHours, urgentHours }: { history: Observation[]; cutoffHours: number; urgentHours: number }) {
  const data: Point[] = history
    .filter((o) => o.tca_hours !== null)
    .map((o) => ({
      days: o.tca_hours! / 24,
      update: o.update_index,
      id: o.observation_id,
      pc: o.log10_pc,
      pcPlot: o.log10_pc === null ? null : o.log10_pc <= PC_FLOOR ? FLOOR_SHELF : Math.max(o.log10_pc, FLOOR_SHELF + 0.5),
      floor: o.log10_pc !== null && o.log10_pc <= PC_FLOOR,
      miss: o.miss_distance_m,
      tier: o.rule_tier,
      input: o.model_input,
      flags: o.quality_flags,
    }))
  if (data.length === 0) return <p className="px-5 py-10 text-center text-sm text-ink-3">No history for this encounter.</p>

  const maxDays = Math.max(...data.map((d) => d.days), cutoffHours / 24) + 0.4
  const xDomain: [number, number] = [0, Math.ceil(maxDays)]
  const cutoffDays = cutoffHours / 24
  const urgentDays = urgentHours / 24

  const pcValues = data.map((d) => d.pcPlot).filter((v): v is number => v !== null && v > FLOOR_SHELF)
  const pcMin = pcValues.length ? Math.min(...pcValues) : -8
  const pcDomain: [number, number] = [Math.min(Math.floor(pcMin - 0.5), -7), -2]
  const anyFloor = data.some((d) => d.floor)
  const yDomainPc: [number, number] = anyFloor ? [FLOOR_SHELF, pcDomain[1]] : pcDomain
  const pcStep = pcDomain[1] - pcDomain[0] > 7 ? 2 : 1
  const pcTicks = anyFloor ? [FLOOR_SHELF, ...range(pcDomain[0], pcDomain[1], pcStep)] : range(pcDomain[0], pcDomain[1], pcStep)

  const missValues = data.map((d) => d.miss).filter((v): v is number => v !== null && v > 0)
  const missLo = missValues.length ? 10 ** Math.floor(Math.log10(Math.min(...missValues, 1000))) : 100
  const missHi = missValues.length ? 10 ** Math.ceil(Math.log10(Math.max(...missValues, 5000))) : 10_000
  const missTicks = range(Math.log10(missLo), Math.log10(missHi), 1).map((e) => 10 ** e)

  const xAxis = (
    <XAxis
      type="number"
      dataKey="days"
      reversed
      domain={xDomain}
      tick={AXIS}
      tickLine={false}
      axisLine={{ stroke: GRID }}
      tickFormatter={(v: number) => `${v}d`}
      label={{ value: 'days to closest approach →', position: 'bottom', offset: 0, ...AXIS }}
    />
  )
  const cutoff = <ReferenceLine x={cutoffDays} stroke="var(--color-violet)" strokeOpacity={0.6} strokeDasharray="2 4" label={{ value: 'model cutoff', position: 'insideTopLeft', ...AXIS, fill: 'var(--color-violet)', fontSize: 9 }} />
  const urgent = <ReferenceLine x={urgentDays} stroke="var(--color-signal)" strokeOpacity={0.35} strokeDasharray="2 4" label={{ value: `${urgentHours} h`, position: 'insideBottomRight', ...AXIS, fill: 'var(--color-signal)', fontSize: 9 }} />

  return (
    <div>
      <div className="grid gap-6 px-2 pt-4 pb-1 lg:grid-cols-2">
        <figure>
          <figcaption className="mb-2 flex items-baseline justify-between px-3">
            <span className="text-xs text-ink-2">log₁₀ Pc · supplied</span>
            <span className="font-mono text-[10px] text-ink-3">thresholds −4 / −6{anyFloor ? ' · ▽ reporting floor' : ''}</span>
          </figcaption>
          <div className="h-52">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                {xAxis}
                <YAxis type="number" domain={yDomainPc} ticks={pcTicks} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v === FLOOR_SHELF ? '▽' : v.toFixed(0))} />
                <ReferenceLine y={-4} stroke="var(--color-critical)" strokeOpacity={0.5} strokeDasharray="3 3" />
                <ReferenceLine y={-6} stroke="var(--color-elevated)" strokeOpacity={0.5} strokeDasharray="3 3" />
                {cutoff}
                {urgent}
                <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'var(--color-line-strong)' }} />
                <Line type="linear" dataKey="pcPlot" stroke="var(--color-ink-2)" strokeWidth={1.5} dot={(p) => <Dot {...p} kind="pc" />} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>

        <figure>
          <figcaption className="mb-2 flex items-baseline justify-between px-3">
            <span className="text-xs text-ink-2">Miss distance · supplied</span>
            <span className="font-mono text-[10px] text-ink-3">thresholds 1 km / 5 km · log scale</span>
          </figcaption>
          <div className="h-52">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                {xAxis}
                <YAxis type="number" scale="log" domain={[missLo, missHi]} ticks={missTicks} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                <ReferenceLine y={1000} stroke="var(--color-critical)" strokeOpacity={0.5} strokeDasharray="3 3" />
                <ReferenceLine y={5000} stroke="var(--color-elevated)" strokeOpacity={0.5} strokeDasharray="3 3" />
                {cutoff}
                {urgent}
                <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'var(--color-line-strong)' }} />
                <Line type="linear" dataKey="miss" stroke="var(--color-ink-2)" strokeWidth={1.5} dot={(p) => <Dot {...p} kind="miss" />} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 pb-3 font-mono text-[10px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full border-2 border-ink-2 bg-ink-2" /> model input (≥ {cutoffHours / 24} d out)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full border-2 border-ink-2 bg-panel" /> after cutoff · not seen by the model
        </span>
        <span>point colour = rule tier of that message</span>
        <span className="ml-auto">each point is one message · lines join updates, not motion</span>
      </div>
    </div>
  )
}

function range(a: number, b: number, step: number) {
  const out: number[] = []
  for (let v = a; v <= b + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

function Dot(props: { cx?: number; cy?: number; payload?: Point; kind: 'pc' | 'miss'; index?: number }) {
  const { cx, cy, payload, kind } = props
  if (cx === undefined || cy === undefined || !payload) return <g key={props.index} />
  if (kind === 'pc' && payload.pcPlot === null) return <g key={props.index} />
  if (kind === 'miss' && payload.miss === null) return <g key={props.index} />
  const color = payload.tier ? TIER_META[payload.tier].color : 'var(--color-unknown)'
  if (kind === 'pc' && payload.floor) {
    return <polygon key={props.index} points={`${cx - 4},${cy - 3} ${cx + 4},${cy - 3} ${cx},${cy + 4}`} fill={payload.input ? color : 'var(--color-panel)'} stroke={color} strokeWidth={1.5} />
  }
  return <circle key={props.index} cx={cx} cy={cy} r={3.5} fill={payload.input ? color : 'var(--color-panel)'} stroke={color} strokeWidth={2} />
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-line-strong bg-raised px-3 py-2 font-mono text-[11px] text-ink-2 shadow-xl">
      <div className="text-ink">
        update {d.update} · {formatDays(d.days * 24)} to TCA
      </div>
      <div className="text-[10px] text-ink-3">{d.id}</div>
      <div className="mt-1">
        log₁₀ Pc {formatLogPc(d.pc)} <span className="text-ink-3">({formatPc(d.pc)})</span>
      </div>
      <div>miss {formatDistance(d.miss)}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {d.tier ? <span className="size-1.5 rounded-full" style={{ background: TIER_META[d.tier].color }} /> : <span className="hatch size-1.5 ring-1 ring-unknown/60" />}
        rule tier {d.tier ?? 'incomplete'} · {d.input ? 'model input' : 'after cutoff'}
      </div>
      {d.flags.length > 0 && <div className="mt-1 text-elevated">{d.flags.join(', ')}</div>}
    </div>
  )
}
