import { useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { setReview } from '../../api/client'
import type { ReviewState, ReviewStatus } from '../../api/types'
import { REVIEW_META, REVIEW_ORDER } from '../../lib/taxonomy'

interface Props {
  encounterId: string
  /** The selected observation; a new review is recorded against it. */
  observationId: string
  review: ReviewState
  onChange: (next: ReviewState) => void
}

/**
 * Human review controls (SG-08.6). Status lives beside the assessment, never inside it:
 * acknowledging or escalating changes nothing about risk tier or queue band, and escalating
 * does not plan or execute a manoeuvre. The backend decides when a review must be renewed.
 */
export function ReviewControls({ encounterId, observationId, review, onChange }: Props) {
  const [pending, setPending] = useState<ReviewStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(status: ReviewStatus) {
    if (pending || status === review.status) return
    setPending(status)
    setError(null)
    try {
      onChange(await setReview(encounterId, status, observationId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record review')
    } finally {
      setPending(null)
    }
  }

  const stale = review.needs_renewal
  const reviewedShort = review.observation_id?.replace(/^.*#/, '#')

  return (
    <div className={`rounded-xl border ${stale ? 'border-elevated/40' : 'border-line'} bg-panel/70 backdrop-blur-sm`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <div className="min-w-0">
          <p className="eyebrow">Human review</p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {review.status === 'unreviewed' ? 'Not yet reviewed.' : <>Recorded against observation <span className="font-mono text-ink-2">{reviewedShort}</span>.</>}{' '}
            Separate from the risk tier and queue band; neither changes with this.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-line bg-base/60 p-0.5 md:ml-auto" role="group" aria-label="Review status">
          {REVIEW_ORDER.map((s) => {
            const active = review.status === s
            const busy = pending === s
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                disabled={pending !== null}
                title={REVIEW_META[s].hint}
                onClick={() => choose(s)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] transition-colors disabled:cursor-wait ${active ? (s === 'escalated' ? 'bg-critical text-void' : s === 'acknowledged' ? 'bg-safe text-void' : 'bg-raised text-ink') : 'text-ink-2 hover:bg-raised hover:text-ink'}`}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : active ? <Check size={12} strokeWidth={3} /> : null}
                {REVIEW_META[s].label}
              </button>
            )
          })}
        </div>
      </div>

      {stale && (
        <div className="flex items-start gap-2.5 border-t border-elevated/30 bg-elevated/[0.06] px-5 py-2.5 text-xs text-elevated/90">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <p>
            <span className="font-medium">Review needed again.</span> {review.renewal_reason} Re-recording a status links it to the current observation <span className="font-mono">{observationId.replace(/^.*#/, '#')}</span>.
          </p>
        </div>
      )}
      {error && (
        <div className="border-t border-critical/30 bg-critical/[0.06] px-5 py-2.5 text-xs text-critical">
          {error}. The status shown is the last one the backend confirmed.
        </div>
      )}
      <p className="border-t border-line px-5 py-2 font-mono text-[10px] text-ink-3">
        {REVIEW_META[review.status].hint} Escalation hands the encounter to planning; it does not record or execute a manoeuvre. Storage: {review.storage}.
      </p>
    </div>
  )
}
