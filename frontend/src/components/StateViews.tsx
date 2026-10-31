import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RotateCw } from 'lucide-react'
import { dataSource } from '../api/client'

export function LoadingRows({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading queue" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 px-5 py-4">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton ml-auto h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Centered>
      <AlertTriangle className="text-critical" size={22} strokeWidth={1.6} />
      <p className="mt-4 text-sm font-medium text-ink">Queue unavailable</p>
      <p className="mt-1 max-w-sm text-sm text-ink-3">
        {message}. No substitute data is shown — an unavailable assessment is never treated as safe.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-signal/40 hover:text-ink"
      >
        <RotateCw size={13} /> Retry
      </button>
    </Centered>
  )
}

export function EmptyState() {
  return (
    <Centered>
      <Inbox className="text-ink-3" size={22} strokeWidth={1.6} />
      <p className="mt-4 text-sm font-medium text-ink">No encounters in this view</p>
      <p className="mt-1 max-w-sm text-sm text-ink-3">
        {dataSource === 'api'
          ? 'The backend returned an empty queue for the selected cohort.'
          : 'The fixture queue is empty (?demo=empty).'}
      </p>
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center px-6 py-20 text-center">{children}</div>
}
