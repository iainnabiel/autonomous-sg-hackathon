import type { ModelResult } from '../../api/types'

const ROLE_TONE: Record<ModelResult['role'], string> = { baseline: 'var(--color-ink-2)', shipped: 'var(--color-signal)', comparison: 'var(--color-violet)' }

/**
 * Critical recall per model with its 95% interval, primary cohort. Intervals overlap, which the chart makes visible.
 * x is the share of true critical encounters caught; the denominator is printed on each row.
 */
export function RecallChart({ models, cohort }: { models: ModelResult[]; cohort: 'primary' | 'all_usable' }) {
  const W = 560
  const left = 230
  const right = 24
  const rowH = 34
  const top = 36
  const H = top + rowH * models.length + 26
  const x = (v: number) => left + v * (W - left - right)
  const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 640 }} role="img" aria-label="Critical recall per model with 95% confidence intervals">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={18} y2={H - 22} stroke="rgb(148 178 230 / 0.1)" />
          <text x={x(t)} y={H - 8} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {models.map((m, i) => {
        const c = m.cohorts[cohort]
        const r = c.per_tier.Critical
        const [lo, hi] = c.critical_recall_95ci
        const y = top + i * rowH
        const tone = ROLE_TONE[m.role]
        return (
          <g key={m.key}>
            <text x={0} y={y + 4} fontSize="11" fontFamily="var(--font-sans)" fill={m.role === 'shipped' ? 'var(--color-ink)' : 'var(--color-ink-2)'}>
              {m.label.replace(/ \(SG-[^)]*\)/, '')}
              {m.role === 'shipped' ? ' · shipped' : ''}
            </text>
            <line x1={x(lo)} x2={x(hi)} y1={y} y2={y} stroke={tone} strokeOpacity={0.5} strokeWidth={2} />
            <line x1={x(lo)} x2={x(lo)} y1={y - 4} y2={y + 4} stroke={tone} strokeOpacity={0.5} />
            <line x1={x(hi)} x2={x(hi)} y1={y - 4} y2={y + 4} stroke={tone} strokeOpacity={0.5} />
            <circle cx={x(r.recall)} cy={y} r={4.5} fill={tone} stroke="var(--color-panel)" strokeWidth={1.5} />
            <text x={x(r.recall)} y={y - 9} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-2)">
              {r.recall.toFixed(3)} · {Math.round(r.recall * r.support)}/{r.support}
            </text>
          </g>
        )
      })}
      <text x={W - right} y={8} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
        critical recall, 95% CI →
      </text>
    </svg>
  )
}
