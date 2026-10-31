import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, TriangleAlert } from 'lucide-react'
import type { QueueItem } from '../api/types'
import { formatDistance, formatPc, formatTca, humanizeCode } from '../lib/format'
import { PRIORITY_META, PRIORITY_ORDER } from '../lib/taxonomy'
import { PcScale, TierPill } from './Indicators'

interface Props {
  items: QueueItem[]
  onOpen: (item: QueueItem) => void
}

const TH = 'whitespace-nowrap px-4 py-2.5 text-left eyebrow first:pl-5 last:pr-5'
const TD = 'px-4 py-3.5 first:pl-5 last:pr-5'

/** Groups by priority band while preserving the backend's order within each band. */
export function QueueTable({ items, onOpen }: Props) {
  let rowIndex = 0
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
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
            <th className={TH}>Object</th>
            <th className={TH}>Flags</th>
            <th className={TH}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {PRIORITY_ORDER.map((band) => {
            const rows = items.filter((i) => i.priority === band)
            if (rows.length === 0) return null
            return (
              <Fragment key={band}>
                <tr>
                  <th colSpan={8} scope="colgroup" className="border-t border-line bg-base/60 px-5 py-2 text-left">
                    <span className="text-xs font-medium text-ink-2">{PRIORITY_META[band].label}</span>
                    <span className="tabular ml-2 font-mono text-[11px] text-ink-3">{rows.length}</span>
                    <span className="ml-3 hidden text-[11px] text-ink-3 sm:inline">{PRIORITY_META[band].rule}</span>
                  </th>
                </tr>
                {rows.map((item) => (
                  <motion.tr
                    key={item.encounter_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 + rowIndex++ * 0.02, duration: 0.3 }}
                    tabIndex={0}
                    onClick={() => onOpen(item)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(item))}
                    className="group cursor-pointer border-t border-line text-sm outline-none transition-colors hover:bg-raised/60 focus-visible:bg-raised/60"
                  >
                    <td className={`${TD} font-mono text-[13px] text-ink`}>{item.encounter_id}</td>
                    <td className={TD}>
                      <TierPill tier={item.risk_tier} />
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-3">
                        <span className="tabular w-[84px] whitespace-nowrap font-mono text-[13px] text-ink">{formatPc(item.predicted_log10_pc)}</span>
                        <PcScale log10Pc={item.predicted_log10_pc} tier={item.risk_tier} />
                      </div>
                    </td>
                    <td className={`${TD} tabular font-mono text-[13px] text-ink-2`}>{formatDistance(item.miss_distance_m)}</td>
                    <td className={`${TD} tabular text-right font-mono text-[13px] text-ink-2`}>{formatTca(item.tca_hours)}</td>
                    <td className={`${TD} text-xs text-ink-3`}>{item.object_type ?? '—'}</td>
                    <td className={TD}>
                      {item.quality_flags.length > 0 ? (
                        <span title={item.quality_flags.map(humanizeCode).join('\n')} className="inline-flex items-center gap-1.5 text-xs text-elevated/90">
                          <TriangleAlert size={13} strokeWidth={1.8} />
                          {item.quality_flags.length}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-3">—</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <ArrowUpRight size={14} className="inline text-ink-3 transition-colors group-hover:text-signal" />
                    </td>
                  </motion.tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
