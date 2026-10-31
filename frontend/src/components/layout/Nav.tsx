import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { apiUrl, dataSource } from '../../api/client'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/queue', label: 'Queue' },
  { to: '/radar', label: 'Radar' },
  { to: '/evaluation', label: 'Evaluation' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-void/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center px-5 md:px-8">
        <NavLink to="/" className="flex items-center gap-3" aria-label="Orbit, overview">
          <Wordmark />
        </NavLink>

        <nav className="ml-12 hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative px-3.5 py-2 text-[13px] transition-colors ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-x-3.5 -bottom-[17px] h-px bg-signal"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <SourceBadge />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-raised md:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-line md:hidden"
            aria-label="Primary"
          >
            <div className="flex flex-col px-5 py-3">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `py-3 text-sm ${isActive ? 'text-signal' : 'text-ink-2'}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function SourceBadge() {
  const live = dataSource === 'api'
  return (
    <span
      title={live ? apiUrl : 'No API URL configured — showing demonstration fixtures'}
      className="inline-flex items-center gap-2 rounded-full border border-line-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3"
    >
      <span className={`size-1.5 rounded-full ${live ? 'bg-signal shadow-[0_0_8px_var(--color-signal)]' : 'bg-elevated'}`} />
      {live ? 'Live API' : 'Demo data'}
    </span>
  )
}

/** Wordmark: a target at the origin with an approaching object on an inclined path. */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
        <circle cx="14" cy="14" r="12.5" stroke="var(--color-line-strong)" />
        <ellipse cx="14" cy="14" rx="12.5" ry="5" transform="rotate(-28 14 14)" stroke="var(--color-signal)" strokeOpacity="0.6" />
        <circle cx="14" cy="14" r="2" fill="var(--color-ink)" />
        <circle cx="24.3" cy="8.6" r="1.6" fill="var(--color-signal)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[0.02em] text-ink">Orbit</span>
    </span>
  )
}
