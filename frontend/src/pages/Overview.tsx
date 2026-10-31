import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUpRight, Crosshair, ListOrdered, Radar as RadarIcon, RotateCcw, X } from 'lucide-react'
import { fetchQueue } from '../api/client'
import { useResource } from '../api/useResource'
import type { QueueItem } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { CHASERS, REGION_LABEL, SATELLITES, regionOf, type AssetCategory, type OrbitRegion, type Satellite } from '../auth/operators'
import { GlobeFallback } from '../components/globe/GlobeFallback'
import type { MarkerLevel } from '../components/globe/Globe'
import { TierPill } from '../components/Indicators'
import { DemoTag } from '../components/layout/Page'
import { formatTca } from '../lib/format'
import { PRIORITY_META } from '../lib/taxonomy'

// three.js is only needed here; keep it out of the other pages' bundle.
const Globe = lazy(() => import('../components/globe/Globe').then((m) => ({ default: m.Globe })))

const ease = [0.22, 1, 0.36, 1] as const
const CATEGORIES: AssetCategory[] = ['payload', 'rocket body', 'debris']
const CATEGORY_LABEL: Record<AssetCategory, string> = { payload: 'Satellites', 'rocket body': 'Rocket bodies', debris: 'Debris' }
const BAND_RANK = { immediate: 0, high: 1, incomplete: 2, scheduled: 3, routine: 4 } as const

/**
 * Layer 2: orbital intelligence. A full-bleed globe with the operator's briefing laid over it.
 * The globe is the index: pick a satellite to see what is queued against it.
 */
export function OrbitalOverview() {
  const { operator } = useAuth()
  const { state } = useResource(fetchQueue, 'queue')
  const items = state.status === 'ready' ? state.data.items : []
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('asset')
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('asset', id)
    else next.delete('asset')
    setParams(next, { replace: true })
  }

  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [cats, setCats] = useState<Set<AssetCategory>>(new Set())
  const [region, setRegion] = useState<OrbitRegion | 'all'>('all')
  const [openOnly, setOpenOnly] = useState(false)

  const ownIds = useMemo(() => new Set(SATELLITES.filter((s) => s.operator_id === operator?.id).map((s) => s.id)), [operator])
  const byEncounter = useMemo(() => new Map(items.map((i) => [i.encounter_id, i])), [items])

  /** Open encounters per satellite, most urgent first. */
  const encountersOf = useMemo(() => {
    const m = new Map<string, QueueItem[]>()
    for (const s of SATELLITES) {
      const list = s.encounter_ids.map((id) => byEncounter.get(id)).filter((x): x is QueueItem => !!x)
      list.sort((a, b) => BAND_RANK[a.priority] - BAND_RANK[b.priority] || (a.tca_hours ?? 1e9) - (b.tca_hours ?? 1e9))
      m.set(s.id, list)
    }
    return m
  }, [byEncounter])

  const markers = useMemo(() => {
    const m = new Map<string, MarkerLevel>()
    for (const s of SATELLITES) {
      const list = encountersOf.get(s.id) ?? []
      if (list.some((e) => e.priority === 'immediate')) m.set(s.id, 'immediate')
      else if (list.some((e) => e.priority === 'high' || e.priority === 'incomplete')) m.set(s.id, 'attention')
    }
    return m
  }, [encountersOf])

  const visible = useMemo(() => {
    const base = SATELLITES.filter((s) => {
      if (scope === 'mine' && !ownIds.has(s.id)) return false
      if (cats.size && !cats.has(s.category)) return false
      if (region !== 'all' && regionOf(s.orbit) !== region) return false
      if (openOnly && (encountersOf.get(s.id)?.length ?? 0) === 0) return false
      return true
    })
    // Keep the other half of every visible encounter on screen so links have somewhere to go.
    const ids = new Set(base.map((s) => s.id))
    for (const s of base) for (const eid of s.encounter_ids) {
      const other = CHASERS[eid]
      if (other && !ids.has(other)) {
        const obj = SATELLITES.find((x) => x.id === other)
        if (obj) (ids.add(other), base.push(obj))
      }
    }
    return base
  }, [scope, cats, region, openOnly, ownIds, encountersOf])

  const selected = useMemo(() => SATELLITES.find((s) => s.id === selectedId) ?? null, [selectedId])
  useEffect(() => {
    if (selectedId && !visible.some((s) => s.id === selectedId)) setSelected(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedId])

  const links = useMemo<[string, string][]>(() => {
    if (!selected) return []
    return selected.encounter_ids.map((eid) => [selected.id, CHASERS[eid]] as [string, string]).filter(([, b]) => !!b && visible.some((s) => s.id === b))
  }, [selected, visible])

  // Briefing numbers: only the operator's own assets.
  const mine = useMemo(() => items.filter((i) => [...ownIds].some((id) => (encountersOf.get(id) ?? []).includes(i))), [items, ownIds, encountersOf])
  const immediate = mine.filter((i) => i.priority === 'immediate')
  const within24 = mine.filter((i) => i.tca_hours !== null && i.tca_hours <= 24)
  const incomplete = mine.filter((i) => i.priority === 'incomplete')
  const needsHuman = mine.filter((i) => i.priority === 'immediate' || i.priority === 'high' || i.priority === 'incomplete')
  const top = [...needsHuman].sort((a, b) => BAND_RANK[a.priority] - BAND_RANK[b.priority] || (a.tca_hours ?? 1e9) - (b.tca_hours ?? 1e9)).slice(0, 4)
  const satOf = (e: QueueItem) => SATELLITES.find((s) => s.encounter_ids.includes(e.encounter_id))

  return (
    <section className="relative overflow-hidden border-b border-line bg-void lg:h-[calc(100dvh-64px)] lg:min-h-[680px]">
      <div className="relative h-[58vh] min-h-[380px] lg:absolute lg:inset-0 lg:h-auto lg:min-h-0">
        <Suspense fallback={<GlobeFallback className="absolute inset-0" />}>
          <Globe
            className="absolute inset-0"
            satellites={visible}
            ownIds={ownIds}
            markers={markers}
            links={links}
            selectedId={selectedId}
            onSelect={setSelected}
          />
        </Suspense>
      </div>

      {/* Briefing — top left. Pointer events only on the card so the globe stays draggable. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.1 }}
        className="pointer-events-none relative z-10 -mt-24 px-5 lg:absolute lg:top-8 lg:left-8 lg:mt-0 lg:w-[min(420px,calc(100%-64px))] lg:px-0"
      >
        <div className="pointer-events-auto rounded-xl border border-line bg-void/70 p-5 backdrop-blur-xl">
          <p className="eyebrow text-signal/80">Today’s summary</p>
          <h1 className="mt-2 text-[22px] leading-[1.15] font-medium tracking-[-0.02em] text-ink">
            {operator?.short_name}, {state.status === 'ready' ? (
              <>
                {needsHuman.length === 0 ? 'no alerts on your satellites need review.' : (
                  <>
                    <span className="text-signal">{needsHuman.length}</span> alert{needsHuman.length === 1 ? '' : 's'} on your satellites need{needsHuman.length === 1 ? 's' : ''} review.
                  </>
                )}
              </>
            ) : (
              <span className="skeleton inline-block h-5 w-40 rounded align-middle" />
            )}
          </h1>
          <p className="mt-1 text-xs text-ink-3">{operator?.organisation} · {ownIds.size} satellites in {operator?.constellations.join(' and ')}</p>

          <dl className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line">
            <Stat label="My satellites" hint="Satellites you operate" value={ownIds.size} />
            <Stat label="Act now" hint="Critical and closest approach within 24 hours" value={state.status === 'ready' ? immediate.length : undefined} tone={immediate.length ? 'var(--color-critical)' : undefined} />
            <Stat label="Within 24 h" hint="Closest approach within the next 24 hours" value={state.status === 'ready' ? within24.length : undefined} />
            <Stat label="Missing data" hint="Assessment incomplete: a required input is missing" value={state.status === 'ready' ? incomplete.length : undefined} tone={incomplete.length ? 'var(--color-unknown)' : undefined} />
          </dl>

          {top.length > 0 && (
            <>
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              <span className="w-16">Priority</span>
              <span>Satellite</span>
              <span>Encounter</span>
              <span className="ml-auto pr-5">Time to approach</span>
            </div>
            <ol className="divide-y divide-line">
              {top.map((e) => {
                const s = satOf(e)
                return (
                  <li key={e.encounter_id}>
                    <Link to={`/encounter/${encodeURIComponent(e.encounter_id)}`} className="group flex items-center gap-3 py-2 text-xs">
                      <span className={`w-16 font-mono text-[10px] uppercase tracking-wider ${e.priority === 'immediate' ? 'text-critical' : e.priority === 'incomplete' ? 'text-unknown' : 'text-elevated'}`}>{PRIORITY_META[e.priority].label}</span>
                      <span className="text-ink">{s?.name ?? '—'}</span>
                      <span className="font-mono text-ink-3">{e.encounter_id}</span>
                      <span className="tabular ml-auto font-mono text-ink-2">{formatTca(e.tca_hours)}</span>
                      <ArrowUpRight size={12} className="text-ink-3 group-hover:text-signal" />
                    </Link>
                  </li>
                )
              })}
            </ol>
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link to="/queue" className="btn btn-primary h-8 text-[12px]"><ListOrdered size={14} /> Review all alerts</Link>
            <Link to="/radar" className="btn btn-secondary h-8 text-[12px]"><RadarIcon size={14} /> Upcoming by time</Link>
            <span className="ml-auto"><DemoTag /></span>
          </div>
        </div>
      </motion.div>

      {/* Filters — bottom left. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.25 }}
        className="pointer-events-none relative z-10 mt-4 px-5 pb-6 lg:absolute lg:bottom-8 lg:left-8 lg:mt-0 lg:max-w-[calc(100%-64px)] lg:px-0 lg:pb-0"
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-line bg-void/70 p-2 backdrop-blur-xl">
          <FilterLabel>Show</FilterLabel>
          <Seg value={scope} onChange={setScope} options={[{ v: 'mine', l: 'My satellites' }, { v: 'all', l: 'All objects' }]} />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <FilterLabel>Type</FilterLabel>
          <div className="flex items-center gap-1" role="group" aria-label="Object type">
            {CATEGORIES.map((c) => {
              const on = cats.has(c)
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setCats((s) => { const n = new Set(s); on ? n.delete(c) : n.add(c); return n })} className={`chip ${on ? 'chip-on' : ''}`}>
                  {CATEGORY_LABEL[c]}
                </button>
              )
            })}
          </div>
          <span className="hidden h-5 w-px bg-line sm:block" />
          <FilterLabel>Orbit</FilterLabel>
          <select value={region} onChange={(e) => setRegion(e.target.value as OrbitRegion | 'all')} aria-label="Orbit" className={`h-8 rounded-md border bg-void px-2 text-[12px] focus:outline-none ${region === 'all' ? 'border-line-strong text-ink-2' : 'border-signal/60 text-signal'}`}>
            <option value="all">All orbits</option>
            {(Object.keys(REGION_LABEL) as OrbitRegion[]).map((r) => (
              <option key={r} value={r}>{REGION_LABEL[r]}</option>
            ))}
          </select>
          <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly((v) => !v)} className={`chip ${openOnly ? 'border-critical/60 bg-critical/15 text-critical hover:text-critical' : ''}`}>
            <Crosshair size={12} /> Only with alerts
          </button>
          {(scope !== 'mine' || cats.size > 0 || region !== 'all' || openOnly) && (
            <button type="button" onClick={() => (setScope('mine'), setCats(new Set()), setRegion('all'), setOpenOnly(false))} className="btn btn-secondary h-8 px-2.5 text-[12px]">
              <RotateCcw size={12} /> Reset filters
            </button>
          )}
          <span className="ml-1 font-mono text-[11px] text-ink-3">{visible.length} shown</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-ink-3">Satellite positions are illustrative, not real orbits. Drag to rotate, scroll to zoom, select a satellite to see its alerts.</p>
      </motion.div>

      {/* Contextual sidebar — right. */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            key={selected.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="fixed inset-x-4 bottom-4 z-30 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-void/90 backdrop-blur-xl lg:absolute lg:inset-x-auto lg:top-8 lg:right-8 lg:bottom-auto lg:z-10 lg:w-[min(380px,calc(100%-64px))] lg:bg-void/75"
          >
            <AssetPanel s={selected} own={ownIds.has(selected.id)} encounters={encountersOf.get(selected.id) ?? []} onClose={() => setSelected(null)} />
          </motion.aside>
        )}
      </AnimatePresence>

      <a href="#how" className="absolute right-5 bottom-8 z-10 hidden items-center gap-2 md:right-8 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 transition-colors hover:text-ink-2 lg:inline-flex">
        How alerts are ranked <ArrowDown size={11} />
      </a>
    </section>
  )
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <span className="pl-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">{children}</span>
}

function Stat({ label, hint, value, tone }: { label: string; hint?: string; value: number | undefined; tone?: string }) {
  return (
    <div className="bg-panel/80 px-3 py-2" title={hint}>
      <dt className="text-[11px] font-medium text-ink-2">{label}</dt>
      <dd className="tabular mt-0.5 text-xl font-light text-ink" style={{ color: tone }}>
        {value === undefined ? <span className="skeleton inline-block h-5 w-6 rounded align-middle" /> : value}
      </dd>
    </div>
  )
}

function Seg<T extends string>({ value, onChange, options, icon }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[]; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5" role="radiogroup">
      {icon && <span className="px-1.5 text-ink-3">{icon}</span>}
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${value === o.v ? 'bg-signal text-void' : 'text-ink-2 hover:bg-raised hover:text-ink'}`}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

const STATUS_TONE: Record<string, string> = { nominal: 'text-safe', 'manoeuvre planned': 'text-elevated', 'safe mode': 'text-critical', decommissioning: 'text-ink-3' }

function AssetPanel({ s, own, encounters, onClose }: { s: Satellite; own: boolean; encounters: QueueItem[]; onClose: () => void }) {
  return (
    <div>
      <div className="flex items-start justify-between border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">{own ? 'Your satellite' : s.operator_id ? 'Another operator’s satellite' : 'Tracked object'}</p>
          <h2 className="mt-1 font-mono text-lg text-ink">{s.name}</h2>
          <p className="text-xs text-ink-3">{s.constellation ? `${s.constellation} constellation · ` : ''}{s.role ?? s.category}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-3 hover:bg-raised hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-px bg-line font-mono text-[12px]">
        <div className="bg-void/40 px-4 py-3"><dt className="eyebrow text-[10px]">Altitude</dt><dd className="mt-1 text-ink">{s.orbit.altitude_km} km</dd></div>
        <div className="bg-void/40 px-4 py-3"><dt className="eyebrow text-[10px]">Inclination</dt><dd className="mt-1 text-ink">{s.orbit.inclination_deg}°</dd></div>
        <div className="bg-void/40 px-4 py-3"><dt className="eyebrow text-[10px]">Status</dt><dd className={`mt-1 ${s.status ? STATUS_TONE[s.status] : 'text-ink-3'}`}>{s.status ?? 'untracked by you'}</dd></div>
      </dl>
      <div className="px-5 py-4">
        <h3 className="eyebrow mb-2">Active alerts {encounters.length > 0 && <span className="tabular ml-1 text-ink-2">{encounters.length}</span>}</h3>
        {encounters.length === 0 ? (
          <p className="text-xs text-ink-3">No alerts for this object.</p>
        ) : (
          <ol className="divide-y divide-line">
            {encounters.map((e) => (
              <li key={e.encounter_id}>
                <Link to={`/encounter/${encodeURIComponent(e.encounter_id)}`} className="group flex items-center gap-3 py-2.5 text-xs">
                  <span className={`w-16 font-mono text-[10px] uppercase tracking-wider ${e.priority === 'immediate' ? 'text-critical' : e.priority === 'high' ? 'text-elevated' : e.priority === 'incomplete' ? 'text-unknown' : 'text-ink-3'}`}>{PRIORITY_META[e.priority].label}</span>
                  <TierPill tier={e.risk_tier} />
                  <span className="tabular ml-auto font-mono text-ink-2">{formatTca(e.tca_hours)}</span>
                  <ArrowUpRight size={12} className="text-ink-3 group-hover:text-signal" />
                </Link>
                {CHASERS[e.encounter_id] && <p className="pb-2 font-mono text-[10px] text-ink-3">with {SATELLITES.find((x) => x.id === CHASERS[e.encounter_id])?.name ?? CHASERS[e.encounter_id]} · {e.object_type?.toLowerCase() ?? 'object'}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="border-t border-line px-5 py-3 text-[10px] leading-relaxed text-ink-3">Satellite details are illustrative. Alerts come from the review queue.</p>
    </div>
  )
}
