import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { QueueItem } from '../api/types'
import { formatDistance, formatPc, formatTca, humanizeCode } from '../lib/format'
import { PRIORITY_META } from '../lib/taxonomy'
import { PcScale, TierPill } from './Indicators'

/** Summary of the selected queue item. The full decision receipt arrives with SG-08.1. */
export function EncounterPanel({ item, onClose }: { item: QueueItem | null; onClose: () => void }) {
  return (
    <AnimatePresence mode="wait">
      {item ? (
        <motion.aside
          key={item.encounter_id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-xl border border-line bg-panel/80 backdrop-blur-sm"
        >
          <div className="flex items-start justify-between border-b border-line px-5 py-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-3">{PRIORITY_META[item.priority].label} priority</div>
              <div className="mt-1 font-mono text-base text-ink">{item.encounter_id}</div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-3">obs {item.observation_id}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-3 hover:bg-raised hover:text-ink">
              <X size={16} />
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-px bg-line">
            <Stat label="Risk tier">
              <TierPill tier={item.risk_tier} />
            </Stat>
            <Stat label="To closest approach">{formatTca(item.tca_hours)}</Stat>
            <Stat label="Est. Pc · model">
              <div className="space-y-2">
                <div>{formatPc(item.predicted_log10_pc)}</div>
                <PcScale log10Pc={item.predicted_log10_pc} tier={item.risk_tier} />
              </div>
            </Stat>
            <Stat label="Miss distance · supplied">{formatDistance(item.miss_distance_m)}</Stat>
          </dl>

          <Section title="Why it is here">
            {item.reason_codes.length ? (
              <ul className="space-y-1.5">
                {item.reason_codes.map((c) => (
                  <li key={c} className="flex items-center gap-2 font-mono text-xs text-ink-2">
                    <span className="size-1 rounded-full bg-signal" />
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-3">No escalation rule triggered.</p>
            )}
          </Section>

          <Section title="Data quality">
            {item.quality_flags.length ? (
              <ul className="space-y-1.5">
                {item.quality_flags.map((f) => (
                  <li key={f} className="text-xs text-elevated/90">
                    {humanizeCode(f)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-3">No quality issues reported.</p>
            )}
          </Section>

          <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">
            Full decision receipt, history and encounter geometry will appear here once the receipt API (SG-02.6) is available.
          </p>
        </motion.aside>
      ) : (
        <motion.aside
          key="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="hidden rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-3 xl:block"
        >
          Select an encounter to see why it was queued.
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-panel px-5 py-4">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{label}</dt>
      <dd className="tabular mt-1.5 font-mono text-sm text-ink">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-4">
      <h3 className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-ink-3">{title}</h3>
      {children}
    </div>
  )
}
