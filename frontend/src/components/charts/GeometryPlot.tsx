import { useState } from 'react'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import type { Geometry } from '../../api/types'
import { formatDistance, formatSpeed } from '../../lib/format'

/**
 * Relative position of the other object in the target's RTN frame at closest approach,
 * target at the origin (SG-08.3). Two orthogonal projections from the supplied fields.
 * Only radial sigmas are supplied, so the only uncertainty drawn is a radial 1σ bar.
 * The optional flyby (SG-08.4) is a straight-line schematic, not a propagated orbit.
 */
export function GeometryPlot({ geometry, missDistance }: { geometry: Geometry; missDistance: number | null }) {
  const { r_m, t_m, n_m, c_sigma_r_m, t_sigma_r_m, sigma_placeholder, relative_speed_m_s } = geometry
  const [run, setRun] = useState(0)

  if (r_m === null || t_m === null || n_m === null) {
    return <p className="px-5 py-10 text-center text-sm text-ink-3">Relative position not supplied for this observation. Geometry cannot be plotted.</p>
  }

  const norm = Math.hypot(r_m, t_m, n_m)
  const mismatch = missDistance !== null && missDistance > 0 ? Math.abs(norm - missDistance) / missDistance : null
  const radialSigma = c_sigma_r_m !== null && t_sigma_r_m !== null ? Math.hypot(c_sigma_r_m, t_sigma_r_m) : null

  return (
    <div>
      <div className="grid gap-4 px-5 pt-5 pb-3 md:grid-cols-2">
        <Projection title="Along-track vs radial" x={t_m} y={r_m} ySigma={radialSigma} xLabel="T (along-track)" yLabel="R (radial)" run={run} speed={relative_speed_m_s} />
        <Projection title="Along-track vs cross-track" x={t_m} y={n_m} ySigma={null} xLabel="T (along-track)" yLabel="N (cross-track)" run={run} speed={relative_speed_m_s} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-5 py-3 font-mono text-[10px] text-ink-3">
        <span>
          |r, t, n| = <span className="text-ink-2">{formatDistance(norm)}</span>
          {missDistance !== null && (
            <>
              {' '}
              · supplied miss <span className="text-ink-2">{formatDistance(missDistance)}</span>
              {mismatch !== null && (mismatch < 0.05 ? <span className="ml-1 text-safe">consistent</span> : <span className="ml-1 text-elevated">differs by {Math.round(mismatch * 100)}%</span>)}
            </>
          )}
        </span>
        <span>
          radial 1σ:{' '}
          {sigma_placeholder && radialSigma === null ? (
            <span className="text-elevated">placeholder, treated as missing</span>
          ) : radialSigma === null ? (
            'not supplied'
          ) : (
            <span className="text-ink-2">
              {formatDistance(radialSigma)} <span className="text-ink-3">(√(c² + t²), supplied covariance, not model confidence)</span>
            </span>
          )}
        </span>
        <span>relative speed <span className="text-ink-2">{formatSpeed(relative_speed_m_s)}</span></span>
        <button type="button" onClick={() => setRun((n) => n + 1)} className="btn btn-secondary ml-auto h-8 px-2.5 text-[12px]">
          <Play size={11} /> {run === 0 ? 'Play schematic flyby' : 'Replay'}
        </button>
      </div>
      {run > 0 && (
        <p className="border-t border-line bg-elevated/[0.05] px-5 py-2 text-[11px] leading-relaxed text-elevated/90">
          Schematic approximation. A straight-line pass through the closest-approach point, drawn perpendicular to the miss vector in each projection. The true direction in that plane is not supplied, and no orbit was propagated. Slowed far below the real relative speed.
        </p>
      )}
    </div>
  )
}

function niceStep(max: number) {
  const raw = max / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const m = raw / pow
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow
}

interface ProjectionProps {
  title: string
  x: number
  y: number
  ySigma: number | null
  xLabel: string
  yLabel: string
  run: number
  speed: number | null
}

function Projection({ title, x, y, ySigma, xLabel, yLabel, run, speed }: ProjectionProps) {
  const W = 320
  const H = 240
  const pad = 28
  const extent = Math.max(Math.abs(x), Math.abs(y) + (ySigma ?? 0), 100) * 1.25
  const step = niceStep(extent)
  const scale = (W / 2 - pad) / extent
  const toX = (v: number) => W / 2 + v * scale
  const toY = (v: number) => H / 2 - v * scale * (H / W)
  const ticks: number[] = []
  for (let v = -Math.floor(extent / step) * step; v <= extent; v += step) ticks.push(v)

  // Flyby schematic: perpendicular to the miss vector within this projection.
  const len = Math.hypot(x, y) || 1
  const ux = -y / len
  const uy = x / len
  const reach = extent * 1.6
  const from = { x: x - ux * reach, y: y - uy * reach }
  const to = { x: x + ux * reach, y: y + uy * reach }
  const realSeconds = speed ? (2 * reach) / speed : null

  return (
    <figure>
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-ink-2">{title}</span>
        <span className="font-mono text-[10px] text-ink-3">grid {formatDistance(step)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-line bg-base/50" role="img" aria-label={`${title}: ${xLabel} ${Math.round(x)} m, ${yLabel} ${Math.round(y)} m`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={toX(v)} x2={toX(v)} y1={0} y2={H} stroke="rgb(148 178 230 / 0.08)" />
            <line y1={toY(v)} y2={toY(v)} x1={0} x2={W} stroke="rgb(148 178 230 / 0.08)" />
          </g>
        ))}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(148 178 230 / 0.25)" />
        <line y1={0} y2={H} x1={W / 2} x2={W / 2} stroke="rgb(148 178 230 / 0.25)" />
        <text x={W - 6} y={H - 6} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
          {xLabel} →
        </text>
        <text x={6} y={12} fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
          {yLabel} ↑
        </text>

        {run > 0 && (
          <g key={run}>
            <line x1={toX(from.x)} y1={toY(from.y)} x2={toX(to.x)} y2={toY(to.y)} stroke="var(--color-signal)" strokeOpacity={0.25} strokeDasharray="2 4" />
            <motion.circle
              r={4}
              fill="var(--color-signal)"
              initial={{ cx: toX(from.x), cy: toY(from.y), opacity: 0 }}
              animate={{ cx: [toX(from.x), toX(x), toX(to.x)], cy: [toY(from.y), toY(y), toY(to.y)], opacity: [0, 1, 0] }}
              transition={{ duration: 2.6, ease: 'linear', times: [0, 0.5, 1] }}
            />
            <text x={6} y={H - 6} fontSize="8" fontFamily="var(--font-mono)" fill="var(--color-signal)" fillOpacity={0.8}>
              schematic flyby{realSeconds !== null ? ` · real ≈ ${realSeconds.toFixed(1)} s` : ''}
            </text>
          </g>
        )}

        {/* radial 1σ bar (supplied radial sigmas only) */}
        {ySigma !== null && (
          <g>
            <line x1={toX(x)} x2={toX(x)} y1={toY(y - ySigma)} y2={toY(y + ySigma)} stroke="var(--color-critical)" strokeOpacity={0.55} strokeDasharray="3 3" />
            <line x1={toX(x) - 4} x2={toX(x) + 4} y1={toY(y - ySigma)} y2={toY(y - ySigma)} stroke="var(--color-critical)" strokeOpacity={0.55} />
            <line x1={toX(x) - 4} x2={toX(x) + 4} y1={toY(y + ySigma)} y2={toY(y + ySigma)} stroke="var(--color-critical)" strokeOpacity={0.55} />
          </g>
        )}
        <line x1={W / 2} y1={H / 2} x2={toX(x)} y2={toY(y)} stroke="var(--color-signal)" strokeOpacity={0.5} />
        <circle cx={W / 2} cy={H / 2} r={4} fill="var(--color-ink)" />
        <circle cx={W / 2} cy={H / 2} r={9} fill="none" stroke="var(--color-ink)" strokeOpacity={0.4} />
        <circle cx={toX(x)} cy={toY(y)} r={4.5} fill="var(--color-critical)" stroke="var(--color-panel)" strokeWidth={2} />
        <text x={toX(x) + (x >= 0 ? -9 : 9)} y={toY(y) + (y >= 0 ? -9 : 15)} textAnchor={x >= 0 ? 'end' : 'start'} fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-2)">
          {Math.round(x)}, {Math.round(y)} m
        </text>
      </svg>
      <p className="mt-1.5 font-mono text-[10px] text-ink-3">{ySigma === null ? `no ${yLabel.split(' ')[0]} sigma supplied — no uncertainty drawn` : `dashed bar: radial 1σ ${formatDistance(ySigma)} (supplied)`}</p>
    </figure>
  )
}
