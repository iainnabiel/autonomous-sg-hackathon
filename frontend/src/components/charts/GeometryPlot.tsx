import type { Geometry } from '../../api/types'
import { formatDistance } from '../../lib/format'

/**
 * Relative position of the other object in the target's RTN frame at closest approach,
 * target at the origin. Two orthogonal projections (T–R and T–N) with 1σ bands.
 * This is encounter geometry from the supplied fields — not a reconstructed orbit.
 */
export function GeometryPlot({ geometry }: { geometry: Geometry }) {
  const { r_m, t_m, n_m, r_sigma_m, t_sigma_m, n_sigma_m } = geometry
  if (r_m === null || t_m === null || n_m === null) {
    return (
      <p className="px-5 py-10 text-center text-sm text-ink-3">
        Relative position not supplied for this observation. Geometry cannot be plotted.
      </p>
    )
  }
  return (
    <div className="grid gap-4 p-5 md:grid-cols-2">
      <Projection title="Along-track vs radial" x={t_m} y={r_m} sx={t_sigma_m} sy={r_sigma_m} xLabel="T (along-track)" yLabel="R (radial)" />
      <Projection title="Along-track vs cross-track" x={t_m} y={n_m} sx={t_sigma_m} sy={n_sigma_m} xLabel="T (along-track)" yLabel="N (cross-track)" />
    </div>
  )
}

function niceStep(max: number) {
  const raw = max / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const m = raw / pow
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow
}

function Projection({ title, x, y, sx, sy, xLabel, yLabel }: { title: string; x: number; y: number; sx: number | null; sy: number | null; xLabel: string; yLabel: string }) {
  const W = 320
  const H = 240
  const pad = 28
  const extent = Math.max(Math.abs(x) + (sx ?? 0), Math.abs(y) + (sy ?? 0), 100) * 1.25
  const step = niceStep(extent)
  const scale = (W / 2 - pad) / extent
  const toX = (v: number) => W / 2 + v * scale
  const toY = (v: number) => H / 2 - v * scale * (H / W) // keep aspect square-ish per axis; H<W so compress y
  const ticks: number[] = []
  for (let v = -Math.floor(extent / step) * step; v <= extent; v += step) ticks.push(v)

  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-ink-2">{title}</span>
        <span className="font-mono text-[10px] text-ink-3">grid {formatDistance(step)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-line bg-base/50" role="img" aria-label={`${title}: ${xLabel} ${Math.round(x)} m, ${yLabel} ${Math.round(y)} m`}>
        {/* grid */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={toX(v)} x2={toX(v)} y1={0} y2={H} stroke="rgb(148 178 230 / 0.08)" />
            <line y1={toY(v)} y2={toY(v)} x1={0} x2={W} stroke="rgb(148 178 230 / 0.08)" />
          </g>
        ))}
        {/* axes */}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(148 178 230 / 0.25)" />
        <line y1={0} y2={H} x1={W / 2} x2={W / 2} stroke="rgb(148 178 230 / 0.25)" />
        <text x={W - 6} y={H - 6} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
          {xLabel} →
        </text>
        <text x={6} y={12} fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
          {yLabel} ↑
        </text>
        {/* 1σ band (supplied sigma; not model confidence) */}
        {sx !== null && sy !== null && (
          <ellipse cx={toX(x)} cy={toY(y)} rx={sx * scale} ry={sy * scale * (H / W)} fill="rgb(255 95 109 / 0.08)" stroke="var(--color-critical)" strokeOpacity={0.45} strokeDasharray="3 3" />
        )}
        {/* line of approach from origin */}
        <line x1={W / 2} y1={H / 2} x2={toX(x)} y2={toY(y)} stroke="var(--color-signal)" strokeOpacity={0.5} />
        {/* target at origin */}
        <circle cx={W / 2} cy={H / 2} r={4} fill="var(--color-ink)" />
        <circle cx={W / 2} cy={H / 2} r={9} fill="none" stroke="var(--color-ink)" strokeOpacity={0.4} />
        {/* other object */}
        <circle cx={toX(x)} cy={toY(y)} r={4.5} fill="var(--color-critical)" stroke="var(--color-panel)" strokeWidth={2} />
        <text x={toX(x) + (x >= 0 ? -9 : 9)} y={toY(y) + (y >= 0 ? -9 : 15)} textAnchor={x >= 0 ? 'end' : 'start'} fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-2)">
          {Math.round(x)}, {Math.round(y)} m
        </text>
      </svg>
      <p className="mt-1.5 font-mono text-[10px] text-ink-3">
        {sx === null || sy === null ? 'σ not supplied — no uncertainty band drawn' : `dashed: supplied 1σ (${formatDistance(sx)} × ${formatDistance(sy)})`}
      </p>
    </figure>
  )
}
