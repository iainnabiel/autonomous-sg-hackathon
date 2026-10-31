import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import type { QueueItem } from '../api/types'
import { formatDistance, formatPc, formatTca, humanizeCode } from '../lib/format'
import { PRIORITY_META, PRIORITY_ORDER } from '../lib/taxonomy'
import { PcScale, TierPill } from './Indicators'

interface Props {
  items: QueueItem[]
  selectedId: string | null
  onSelect: (item: QueueItem) => void
}

const TH = 'whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3 first:pl-5 last:pr-5'
const TD = 'px-4 py-3.5 first:pl-5 last:pr-5'

/** Groups by priority band while preserving the backend's order within each band. */
export function QueueTable({ items, selectedId, onSelect }: Props) {
  let rowIndex = 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead className="border-b border-line">
          <tr>
            <th className={TH}>Encounter</th>
            <th className={TH}>Risk tier</th>
            <th className={TH}>
              Est. P<sub className="normal-case">c</sub> <span className="normal-case tracking-normal text-ink-3/70">· model</span>
            </th>
            <th className={TH}>
              Miss distance <span className="normal-case tracking-normal text-ink-3/70">· supplied</span>
            </th>
            <th className={`${TH} text-right`}>To TCA</th>
            <th className={TH}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {PRIORITY_ORDER.map((band) => {
            const rows = items.filter((i) => i.priority === band)
            if (rows.length === 0) return null
            return (
              <Fragment key={band}>
                <tr>
                  <th colSpan={6} scope="colgroup" className="border-t border-line bg-base/60 px-5 py-2 text-left">
                    <span className="text-xs font-medium text-ink-2">{PRIORITY_META[band].label}</span>
                    <span className="tabular ml-2 font-mono text-[11px] text-ink-3">{rows.length}</span>
                  </th>
                </tr>
                {rows.map((item) => {
                  const selected = item.encounter_id === selectedId
                  return (
                    <motion.tr
                      key={item.encounter_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 + rowIndex++ * 0.025, duration: 0.3 }}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => onSelect(item)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(item))}
                      className={`cursor-pointer border-t border-line text-sm transition-colors outline-none hover:bg-raised/60 focus-visible:bg-raised/60 ${
                        selected ? 'bg-signal-dim/60 shadow-[inset_2px_0_0_var(--color-signal)]' : ''
                      }`}
                    >
                      <td className={`${TD} font-mono text-[13px] text-ink`}>{item.encounter_id}</td>
                      <td className={TD}>
                        <TierPill tier={item.risk_tier} />
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-3">
                          <span className="tabular w-[84px] font-mono text-[13px] text-ink">{formatPc(item.predicted_log10_pc)}</span>
                          <PcScale log10Pc={item.predicted_log10_pc} tier={item.risk_tier} />
                        </div>
                      </td>
                      <td className={`${TD} tabular font-mono text-[13px] text-ink-2`}>{formatDistance(item.miss_distance_m)}</td>
                      <td className={`${TD} tabular text-right font-mono text-[13px] text-ink-2`}>{formatTca(item.tca_hours)}</td>
                      <td className={TD}>
                        {item.quality_flags.length > 0 ? (
                          <span
                            title={item.quality_flags.map(humanizeCode).join('\n')}
                            className="inline-flex items-center gap-1.5 text-xs text-elevated/90"
                          >
                            <TriangleAlert size={13} strokeWidth={1.8} />
                            {item.quality_flags.length}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">—</span>
                        )}
                      </td>
                    </motion.tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
