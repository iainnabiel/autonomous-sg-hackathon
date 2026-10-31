import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, Globe2, ListOrdered, LogOut, Menu, Radar, Search, X, type LucideIcon } from 'lucide-react'
import { apiUrl, dataSource } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { CommandPalette } from './CommandPalette'

/**
 * Primary navigation follows the operator's workflow: see the picture → decide what to review →
 * know when the work arrives → check the evidence. Each item carries a one-line purpose that
 * appears in the mobile menu and in the command palette.
 */
export const NAV_ITEMS: { to: string; label: string; purpose: string; icon: LucideIcon; end?: boolean; accent: string }[] = [
  { to: '/', label: 'Overview', purpose: 'Your assets, today’s picture, the globe', icon: Globe2, end: true, accent: 'var(--color-signal)' },
  { to: '/queue', label: 'Review queue', purpose: 'Which encounter needs a human next', icon: ListOrdered, accent: 'var(--color-signal)' },
  { to: '/radar', label: 'Radar', purpose: 'When the work arrives, by hours to closest approach', icon: Radar, accent: 'var(--color-violet)' },
  { to: '/evaluation', label: 'Evidence', purpose: 'What the model catches, what it misses', icon: BarChart3, accent: 'var(--color-ink-2)' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const { pathname } = useLocation()
  const { operator, signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-void/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center px-5 md:px-8">
        <NavLink to="/" className="flex items-center gap-3" aria-label="Orbit, overview">
          <Wordmark />
        </NavLink>

        <nav className="ml-10 hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.purpose}
              className={({ isActive }) =>
                `relative flex items-center gap-2 px-3.5 py-2 text-[13px] transition-colors ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={14} strokeWidth={1.8} style={{ color: isActive ? item.accent : undefined }} />
                  {item.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-x-3.5 -bottom-[17px] h-px"
                      style={{ background: item.accent }}
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="hidden h-8 items-center gap-2 rounded-md border border-line px-2.5 text-xs text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2 sm:inline-flex"
            aria-label="Search encounters, satellites and pages"
          >
            <Search size={13} />
            <span>Search</span>
            <kbd className="ml-1 rounded-sm border border-line px-1 font-mono text-[10px]">⌘K</kbd>
          </button>
          <SourceBadge />
          {operator && <OperatorMenu name={operator.name} initials={operator.initials} organisation={operator.organisation} onSignOut={() => (signOut(), navigate('/login'))} />}
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
            <div className="flex flex-col px-5 py-2">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex items-center gap-3 py-3 ${isActive ? 'text-signal' : 'text-ink-2'}`}>
                  <item.icon size={16} strokeWidth={1.8} />
                  <span>
                    <span className="block text-sm">{item.label}</span>
                    <span className="block text-xs text-ink-3">{item.purpose}</span>
                  </span>
                </NavLink>
              ))}
              <button type="button" onClick={() => setPalette(true)} className="flex items-center gap-3 py-3 text-ink-2">
                <Search size={16} /> <span className="text-sm">Search</span>
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </header>
  )
}

function OperatorMenu({ name, initials, organisation, onSignOut }: { name: string; initials: string; organisation: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-2 rounded-full border border-line pr-3 pl-1 text-xs text-ink-2 transition-colors hover:border-line-strong"
      >
        <span className="grid size-6 place-items-center rounded-full bg-signal font-mono text-[10px] text-void">{initials}</span>
        <span className="hidden lg:inline">{name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-line-strong bg-raised shadow-2xl"
          >
            <div className="border-b border-line px-4 py-3">
              <div className="text-sm text-ink">{name}</div>
              <div className="text-xs text-ink-3">{organisation}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-elevated/90">Demonstration account</div>
            </div>
            <button type="button" role="menuitem" onClick={onSignOut} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink-2 hover:bg-panel hover:text-ink">
              <LogOut size={14} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SourceBadge() {
  const live = dataSource === 'api'
  return (
    <span
      title={live ? apiUrl : 'No API URL configured — showing demonstration fixtures'}
      className="hidden items-center gap-2 rounded-full border border-line-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 sm:inline-flex"
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
