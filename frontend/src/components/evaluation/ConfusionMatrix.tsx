import { Fragment, useState } from 'react'
import type { CohortResult, TierLabel } from '../../api/types'
import { TIER_META } from '../../lib/taxonomy'

const TONE: Record<TierLabel, string> = { Critical: 'var(--color-critical)', Elevated: 'var(--color-elevated)', Safe: 'var(--color-safe)' }

/** Raw and row-normalised confusion matrix with supports. Undefined cells are marked, not zeroed. */
export function ConfusionMatrix({ result }: { result: CohortResult }) {
  const [mode, setMode] = useState<'raw' | 'normalised'>('raw')
  const { labels, rows_actual_cols_predicted: m } = result.confusion_matrix
  const rowTotals = m.map((r) => r.reduce((a, b) => a + b, 0))
  const max = Math.max(...m.flat())

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-3">
          rows: true final tier · columns: predicted · n = <span className="tabular text-ink-2">{result.n.toLocaleString()}</span>
        </p>
        <div className="flex rounded-md border border-line bg-base/60 p-0.5" role="group" aria-label="Matrix values">
          {(['raw', 'normalised'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded px-2.5 py-1 text-[11px] ${mode === k ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink'}`}>
              {k === 'raw' ? 'counts' : 'row %'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[88px_repeat(3,1fr)_64px] gap-1 font-mono text-[11px]">
        <div />
        {labels.map((l) => (
          <div key={l} className="eyebrow pb-1 text-center text-[10px]">
            pred. {l.toLowerCase()}
          </div>
        ))}
        <div className="eyebrow pb-1 text-right text-[10px]">support</div>
        {labels.map((row, i) => (
          <Fragment key={row}>
            <div className="flex items-center gap-1.5 text-[10px] text-ink-3">
              <span className="size-1.5 rounded-full" style={{ background: TONE[row] }} />
              true {row.toLowerCase()}
            </div>
            {labels.map((col, j) => {
              const v = m[i][j]
              const share = rowTotals[i] ? v / rowTotals[i] : null
              const diagonal = i === j
              const intensity = max ? Math.min(0.85, 0.08 + (v / max) * 0.6) : 0
              return (
                <div
                  key={`${row}-${col}`}
                  title={`${v} of ${rowTotals[i]} true ${row} predicted ${col}`}
                  className={`tabular grid h-12 place-items-center rounded-sm border ${diagonal ? 'border-line-strong text-ink' : 'border-line text-ink-2'}`}
                  style={{ background: diagonal ? `rgb(111 227 255 / ${intensity * 0.25})` : v > 0 ? `rgb(255 95 109 / ${intensity * 0.25})` : undefined }}
                >
                  {mode === 'raw' ? v.toLocaleString() : share === null ? 'n/a' : `${(share * 100).toFixed(1)}%`}
                </div>
              )
            })}
            <div className="tabular flex items-center justify-end text-ink-3">{rowTotals[i].toLocaleString()}</div>
          </Fragment>
        ))}
      </div>
      <table className="mt-4 w-full font-mono text-[11px]">
        <thead>
          <tr className="text-[10px] text-ink-3">
            <th className="pb-1 text-left font-normal">tier</th>
            <th className="pb-1 text-right font-normal">precision</th>
            <th className="pb-1 text-right font-normal">recall</th>
            <th className="pb-1 text-right font-normal">support</th>
            <th className="pb-1 text-right font-normal">predicted</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((t) => {
            const r = result.per_tier[t]
            return (
              <tr key={t} className="border-t border-line text-ink-2">
                <td className="py-1" style={{ color: TIER_META[t].color }}>{t}</td>
                <td className="tabular py-1 text-right">{r.precision.toFixed(3)}</td>
                <td className="tabular py-1 text-right">{r.recall.toFixed(3)}</td>
                <td className="tabular py-1 text-right">{r.support.toLocaleString()}</td>
                <td className="tabular py-1 text-right">{r.predicted.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Critical → Safe misses: <span className="tabular text-ink-2">{result.critical_predicted_safe}</span> · false critical alarms: <span className="tabular text-ink-2">{result.false_critical_alarms}</span> · accuracy{' '}
        <span className="tabular">{result.accuracy_not_headline.toFixed(3)}</span> (not a headline: predicting everything safe scores about 0.73).
      </p>
    </div>
  )
}
