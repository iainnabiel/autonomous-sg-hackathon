import { motion } from 'framer-motion'
import type { Priority, QueueItem } from '../api/types'
import { PRIORITY_META, PRIORITY_ORDER } from '../lib/taxonomy'

const ACCENT: Record<Priority, string> = {
  immediate: 'var(--color-critical)',
  high: 'var(--color-elevated)',
  scheduled: 'var(--color-signal)',
  routine: 'var(--color-ink-3)',
  incomplete: 'var(--color-unknown)',
}

/** Count per review band. Each tile is a filter toggle. */
export function BandSummary({ items, active, onToggle }: { items: QueueItem[]; active: Set<Priority>; onToggle: (p: Priority) => void }) {
  const counts = Object.fromEntries(PRIORITY_ORDER.map((p) => [p, items.filter((i) => i.priority === p).length])) as Record<Priority, number>

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Filter by review band">
      {PRIORITY_ORDER.map((p, i) => {
        const on = active.has(p)
        const dim = active.size > 0 && !on
        return (
          <motion.button
            type="button"
            key={p}
            aria-pressed={on}
            onClick={() => onToggle(p)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={`relative px-5 py-4 text-left transition-colors last:col-span-2 sm:last:col-span-1 ${on ? 'bg-raised' : 'bg-panel hover:bg-raised/60'} ${dim ? 'opacity-50' : ''}`}
          >
            {on && <span className="absolute inset-x-0 top-0 h-px" style={{ background: ACCENT[p] }} />}
            <div className="eyebrow flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${p === 'incomplete' ? 'hatch ring-1 ring-unknown/60' : ''}`} style={p === 'incomplete' ? undefined : { background: ACCENT[p] }} />
              {PRIORITY_META[p].label}
            </div>
            <div className="tabular mt-2 text-3xl font-light tracking-tight text-ink">{counts[p]}</div>
            <div className="mt-1 text-xs leading-snug text-ink-3">{PRIORITY_META[p].rule}</div>
          </motion.button>
        )
      })}
    </div>
  )
}
