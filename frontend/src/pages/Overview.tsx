import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUpRight, Crosshair, Layers, X } from 'lucide-react'
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
          <p className="eyebrow text-signal/80">Operations briefing</p>
          <h1 className="mt-2 text-[22px] leading-[1.15] font-medium tracking-[-0.02em] text-ink">
            {operator?.short_name}, {state.status === 'ready' ? (
              <>
                {needsHuman.length === 0 ? 'nothing on your assets needs a human right now.' : (
                  <>
                    <span className="accent text-signal">{needsHuman.length}</span> encounter{needsHuman.length === 1 ? '' : 's'} on your assets need{needsHuman.length === 1 ? 's' : ''} a human.
                  </>
                )}
              </>
            ) : (
              <span className="skeleton inline-block h-5 w-40 rounded align-middle" />
            )}
          </h1>
          <p className="mt-1 text-xs text-ink-3">{operator?.organisation} · {ownIds.size} assets in {operator?.constellations.join(' and ')}</p>

          <dl className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line">
            <Stat label="Assets" value={ownIds.size} />
            <Stat label="Immediate" value={state.status === 'ready' ? immediate.length : undefined} tone={immediate.length ? 'var(--color-critical)' : undefined} />
            <Stat label="≤ 24 h" value={state.status === 'ready' ? within24.length : undefined} />
            <Stat label="Incomplete" value={state.status === 'ready' ? incomplete.length : undefined} tone={incomplete.length ? 'var(--color-unknown)' : undefined} />
          </dl>

          {top.length > 0 && (
            <ol className="mt-4 divide-y divide-line border-t border-line">
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
          )}
          <div className="mt-3 flex items-center justify-between">
            <Link to="/queue" className="text-xs text-signal hover:underline">Open the full review queue</Link>
            <DemoTag />
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
          <Seg value={scope} onChange={setScope} options={[{ v: 'mine', l: 'My assets' }, { v: 'all', l: 'All tracked' }]} icon={<Layers size={12} />} />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <div className="flex items-center gap-1" role="group" aria-label="Category">
            {CATEGORIES.map((c) => {
              const on = cats.has(c)
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setCats((s) => { const n = new Set(s); on ? n.delete(c) : n.add(c); return n })} className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors ${on ? 'border-line-strong bg-raised text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'}`}>
                  {c}
                </button>
              )
            })}
          </div>
          <span className="hidden h-5 w-px bg-line sm:block" />
          <select value={region} onChange={(e) => setRegion(e.target.value as OrbitRegion | 'all')} aria-label="Orbit region" className="h-7 rounded-md border border-line bg-transparent px-2 text-[11px] text-ink-2 focus:border-signal/40 focus:outline-none">
            <option value="all">All regions</option>
            {(Object.keys(REGION_LABEL) as OrbitRegion[]).map((r) => (
              <option key={r} value={r}>{REGION_LABEL[r]}</option>
            ))}
          </select>
          <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${openOnly ? 'border-critical/40 bg-critical/10 text-critical' : 'border-transparent text-ink-3 hover:text-ink-2'}`}>
            <Crosshair size={11} /> With open encounters
          </button>
          <span className="ml-1 font-mono text-[10px] text-ink-3">{visible.length} shown</span>
        </div>
        <p className="mt-2 font-mono text-[10px] text-ink-3">Positions and orbits are illustrative — a demonstration constellation, not propagated elements. Drag to rotate, scroll to zoom, click a mark to focus.</p>
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
        How Orbit decides <ArrowDown size={11} />
      </a>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <div className="bg-panel/80 px-3 py-2">
      <dt className="eyebrow text-[10px]">{label}</dt>
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
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)} className={`rounded px-2.5 py-1 text-[11px] transition-colors ${value === o.v ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'}`}>
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
          <p className="eyebrow">{own ? 'Your asset' : s.operator_id ? 'Another operator’s asset' : 'Tracked object'}</p>
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
        <h3 className="eyebrow mb-2">Open encounters {encounters.length > 0 && <span className="tabular ml-1 text-ink-2">{encounters.length}</span>}</h3>
        {encounters.length === 0 ? (
          <p className="text-xs text-ink-3">Nothing queued against this object.</p>
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
      <p className="border-t border-line px-5 py-3 text-[10px] leading-relaxed text-ink-3">Asset details are demonstration data. Encounter rows come from the review queue.</p>
    </div>
  )
}
