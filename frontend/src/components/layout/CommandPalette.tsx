import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CornerDownLeft, Satellite as SatelliteIcon, Search } from 'lucide-react'
import { fetchQueue } from '../../api/client'
import type { QueueItem } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { assetsOf, satelliteForEncounter } from '../../auth/operators'
import { formatTca } from '../../lib/format'
import { PRIORITY_META } from '../../lib/taxonomy'
import { NAV_ITEMS } from './Nav'

interface Item {
  id: string
  kind: 'page' | 'encounter' | 'asset'
  title: string
  detail: string
  to: string
  keywords: string
}

/** ⌘K search over pages, the operator's assets, and queue encounters. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { operator } = useAuth()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setCursor(0)
    const t = setTimeout(() => input.current?.focus(), 20)
    const ctrl = new AbortController()
    fetchQueue(ctrl.signal).then((r) => setQueue(r.items)).catch(() => setQueue(null))
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const pages: Item[] = NAV_ITEMS.map((n) => ({ id: `page:${n.to}`, kind: 'page', title: n.label, detail: n.purpose, to: n.to, keywords: `${n.label} ${n.purpose}`.toLowerCase() }))
    const assets: Item[] = operator
      ? assetsOf(operator.id).map((s) => ({ id: `asset:${s.id}`, kind: 'asset', title: s.name, detail: `${s.constellation} · ${s.orbit.altitude_km} km · ${s.orbit.inclination_deg}°`, to: `/?asset=${encodeURIComponent(s.id)}`, keywords: `${s.name} ${s.constellation ?? ''} ${s.id}`.toLowerCase() }))
      : []
    const encs: Item[] = (queue ?? []).map((e) => {
      const sat = satelliteForEncounter(e.encounter_id)
      return {
        id: `enc:${e.encounter_id}`,
        kind: 'encounter',
        title: e.encounter_id,
        detail: `${PRIORITY_META[e.priority].label} · ${e.risk_tier ?? 'unassessed'} · ${formatTca(e.tca_hours)} to closest approach${sat ? ` · ${sat.name}` : ''}`,
        to: `/encounter/${encodeURIComponent(e.encounter_id)}`,
        keywords: `${e.encounter_id} ${e.priority} ${e.risk_tier ?? ''} ${sat?.name ?? ''} ${e.object_type ?? ''}`.toLowerCase(),
      }
    })
    const all = [...pages, ...assets, ...encs]
    const needle = q.trim().toLowerCase()
    if (!needle) return all.slice(0, 12)
    return all.filter((i) => i.keywords.includes(needle)).slice(0, 12)
  }, [q, queue, operator])

  useEffect(() => setCursor(0), [q])

  const go = (item: Item) => {
    onClose()
    navigate(item.to)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-void/70 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label="Search"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-raised shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={15} className="text-ink-3" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose()
                  if (e.key === 'ArrowDown') (e.preventDefault(), setCursor((c) => Math.min(c + 1, items.length - 1)))
                  if (e.key === 'ArrowUp') (e.preventDefault(), setCursor((c) => Math.max(c - 1, 0)))
                  if (e.key === 'Enter' && items[cursor]) go(items[cursor])
                }}
                placeholder="Encounter ID, satellite, or page…"
                className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <kbd className="rounded-sm border border-line px-1.5 font-mono text-[10px] text-ink-3">esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto py-1.5" role="listbox">
              {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">Nothing matches.</li>}
              {items.map((item, i) => (
                <li key={item.id} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-panel' : ''}`}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-ink-3">
                      {item.kind === 'page' && <ArrowRight size={13} />}
                      {item.kind === 'asset' && <SatelliteIcon size={13} />}
                      {item.kind === 'encounter' && <span className="font-mono text-[10px]">#</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${item.kind === 'encounter' ? 'font-mono' : ''} text-ink`}>{item.title}</span>
                      <span className="block truncate text-xs text-ink-3">{item.detail}</span>
                    </span>
                    {i === cursor && <CornerDownLeft size={13} className="text-ink-3" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
