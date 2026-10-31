import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { dataSource } from '../../api/client'
import { Wordmark } from './Nav'

/** Standard page frame: grid backdrop, max width, enter animation. */
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex-1"
    >
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <div className={`relative mx-auto px-5 py-10 md:px-8 md:py-14 ${wide ? 'max-w-[1600px]' : 'max-w-[1440px]'}`}>{children}</div>
    </motion.main>
  )
}

export function PageHeader({ eyebrow, title, lede, aside }: { eyebrow: string; title: ReactNode; lede?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-12">
      <div className="max-w-3xl">
        <p className="eyebrow text-signal/80">{eyebrow}</p>
        <h1 className="mt-3 text-[32px] leading-[1.05] font-medium tracking-[-0.02em] text-ink md:text-[44px]">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">{lede}</p>}
      </div>
      {aside && <div className="font-mono text-[11px] text-ink-3">{aside}</div>}
    </header>
  )
}

/** Panel with a hairline border. Use sparingly; most of the layout is rules and whitespace, not boxes. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`overflow-hidden rounded-xl border border-line bg-panel/70 backdrop-blur-sm ${className}`}>{children}</section>
}

export function PanelHeader({ title, note, action }: { title: ReactNode; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        {note && <span className="text-xs text-ink-3">{note}</span>}
      </div>
      {action}
    </div>
  )
}

/** Marks a figure or number as demonstration data when running on fixtures. */
export function DemoTag({ children = 'Demonstration data' }: { children?: ReactNode }) {
  if (dataSource !== 'fixture') return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-elevated/30 bg-elevated/[0.08] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-elevated/90">
      {children}
    </span>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6 px-5 py-8 text-xs text-ink-3 md:px-8">
        <div className="flex items-center gap-4">
          <Wordmark size={20} />
          <span>Conjunction triage for LEO operators · prototype</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/queue" className="hover:text-ink-2">Queue</Link>
          <Link to="/radar" className="hover:text-ink-2">Radar</Link>
          <Link to="/evaluation" className="hover:text-ink-2">Evaluation</Link>
          <a href="https://github.com/iainnabiel/autonomous-sg-hackathon" className="hover:text-ink-2" target="_blank" rel="noreferrer">
            Source
          </a>
        </div>
      </div>
    </footer>
  )
}
