import { Fragment, Suspense, lazy, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { fetchQueue } from '../api/client'
import { useResource } from '../api/useResource'
import type { Priority, RiskTier } from '../api/types'
import { GlobeFallback } from '../components/globe/GlobeFallback'
import { DemoTag, Footer } from '../components/layout/Page'
import { PRIORITY_META, TIER_META } from '../lib/taxonomy'

// three.js is only needed here; keep it out of the other pages' bundle.
const Globe = lazy(() => import('../components/globe/Globe').then((m) => ({ default: m.Globe })))

const ease = [0.22, 1, 0.36, 1] as const
const rise = (delay = 0) => ({ initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6, delay, ease } })

export function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <Triage />
      <Flow />
      <Evidence />
      <Footer />
    </>
  )
}

function Hero() {
  const { state } = useResource(fetchQueue, 'queue')
  const items = state.status === 'ready' ? state.data.items : null
  const within24 = items?.filter((i) => i.tca_hours !== null && i.tca_hours <= 24).length
  const immediate = items?.filter((i) => i.priority === 'immediate').length
  const incomplete = items?.filter((i) => i.priority === 'incomplete').length

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-10 px-5 pt-16 pb-10 md:px-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] lg:pt-20 lg:pb-16">
        <div className="relative z-10">
          <motion.p {...rise(0)} className="eyebrow text-signal/80">
            Conjunction triage · low Earth orbit
          </motion.p>
          <motion.h1 {...rise(0.05)} className="mt-5 text-[40px] leading-[0.98] font-medium tracking-[-0.03em] text-ink sm:text-[56px] lg:text-[68px]">
            Thousands of warnings a day.
            <br />
            <span className="accent text-signal">Which one first?</span>
          </motion.h1>
          <motion.p {...rise(0.1)} className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-2">
            Orbit reads conjunction messages, estimates collision probability, and ranks every encounter by how dangerous it is <em className="accent not-italic text-ink">and</em> how soon it needs a human. Every decision comes with a receipt.
          </motion.p>
          <motion.div {...rise(0.15)} className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/queue" className="group inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-void transition-colors hover:bg-signal">
              Open the review queue
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2.5 text-sm text-ink-2 transition-colors hover:border-signal/40 hover:text-ink">
              How it works
            </a>
          </motion.div>

          <motion.dl {...rise(0.25)} className="mt-14 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            <Stat label="Immediate" value={immediate} tone="var(--color-critical)" />
            <Stat label="Within 24 h" value={within24} />
            <Stat label="Incomplete" value={incomplete} tone="var(--color-unknown)" />
          </motion.dl>
          <p className="mt-2 flex items-center gap-2 font-mono text-[10px] text-ink-3">
            Counts from the current queue. <DemoTag />
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease }}
          className="relative -mx-5 h-[420px] sm:h-[520px] md:-mx-8 lg:mx-0 lg:h-[640px]"
        >
          <Suspense fallback={<GlobeFallback className="absolute inset-0 lg:-right-24" />}>
            <Globe className="absolute inset-0 lg:-right-24" />
          </Suspense>
          <div className="pointer-events-none absolute bottom-3 left-5 flex items-center gap-2 font-mono text-[10px] text-ink-3 md:left-8 lg:left-0">
            <span className="size-1.5 rounded-full bg-critical" />
            tracked pair approaching · schematic, not propagated orbits
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone?: string }) {
  return (
    <div className="bg-panel/80 px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-light text-ink" style={{ color: tone }}>
        {value === undefined ? <span className="skeleton inline-block h-6 w-8 rounded align-middle" /> : value}
      </dd>
    </div>
  )
}

function Section({ n, title, children, id }: { n: string; title: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-b border-line">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-5 py-20 md:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:py-28">
        <motion.div {...rise(0)}>
          <p className="eyebrow">{n}</p>
          <h2 className="mt-4 text-[28px] leading-[1.08] font-medium tracking-[-0.02em] text-ink md:text-[36px]">{title}</h2>
        </motion.div>
        <motion.div {...rise(0.1)} className="min-w-0">{children}</motion.div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <Section n="01 — The problem" title={<>Every close approach gets a message. Almost none of them need a manoeuvre.</>}>
      <div className="grid gap-8 md:grid-cols-2">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Low Earth orbit is crowded with satellites and debris. Operators receive thousands of conjunction messages a day, each warning that two objects might pass close. Screening every one by hand takes hours, and the dangerous few are easy to miss among the routine many.
        </p>
        <ul className="space-y-4 text-[15px] leading-relaxed text-ink-2">
          <li className="hairline-t pt-4">
            <span className="text-ink">Volume.</span> The same encounter is re-reported as the estimate updates, so the queue is always moving.
          </li>
          <li className="hairline-t pt-4">
            <span className="text-ink">Scale.</span> Collision probabilities range over ten orders of magnitude. A 10⁻⁴ and a 10⁻⁹ look alike in a spreadsheet.
          </li>
          <li className="hairline-t pt-4">
            <span className="text-ink">Timing.</span> A critical encounter in six hours and one in six days are both “critical”. Only one can wait until tomorrow.
          </li>
        </ul>
      </div>
    </Section>
  )
}

/** Interactive triage matrix: risk tier × urgency → queue band. This is the policy itself, drawn. */
function Triage() {
  const tiers: (RiskTier | 'incomplete')[] = ['critical', 'elevated', 'safe', 'incomplete']
  const cols = [
    { key: 'soon', label: '≤ 24 h to closest approach' },
    { key: 'later', label: '> 24 h' },
  ] as const
  const band = (tier: RiskTier | 'incomplete', col: 'soon' | 'later'): Priority => {
    if (tier === 'incomplete') return 'incomplete'
    if (tier === 'critical') return col === 'soon' ? 'immediate' : 'high'
    if (tier === 'elevated') return col === 'soon' ? 'high' : 'scheduled'
    return 'routine'
  }
  const tone: Record<Priority, string> = {
    immediate: 'bg-critical/15 text-critical border-critical/40',
    high: 'bg-elevated/12 text-elevated border-elevated/40',
    scheduled: 'bg-signal/10 text-signal border-signal/35',
    routine: 'bg-raised text-ink-2 border-line-strong',
    incomplete: 'hatch text-ink-2 border-unknown/40',
  }
  const [hover, setHover] = useState<Priority | null>(null)

  return (
    <Section n="02 — What Orbit adds" title={<>Risk says how dangerous. <span className="accent text-signal">Urgency</span> says how soon.</>} id="how">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
        A conventional model estimates collision probability. Orbit keeps that, then combines the risk tier with time to closest approach to place each encounter in one of four review bands. Data quality is tracked separately: an assessment that could not be completed is never allowed to look safe.
      </p>

      <div className="mt-10 min-w-0 overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[150px_1fr_1fr] gap-2">
          <div />
          {cols.map((c) => (
            <div key={c.key} className="eyebrow px-1 pb-1 text-ink-2">
              {c.label}
            </div>
          ))}
          {tiers.map((tier) => (
            <Fragment key={tier}>
              <div className="flex items-center gap-2 pr-3 text-sm">
                <span className={`size-2 rounded-full ${tier === 'incomplete' ? 'hatch ring-1 ring-unknown/60' : ''}`} style={tier === 'incomplete' ? undefined : { background: TIER_META[tier].color }} />
                <span className="text-ink-2">{tier === 'incomplete' ? 'Incomplete' : TIER_META[tier].label}</span>
              </div>
              {cols.map((c) => {
                const b = band(tier, c.key)
                const dim = hover !== null && hover !== b
                return (
                  <button
                    key={`${tier}-${c.key}`}
                    type="button"
                    onMouseEnter={() => setHover(b)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(b)}
                    onBlur={() => setHover(null)}
                    className={`rounded-md border px-4 py-4 text-left transition-all duration-300 ${tone[b]} ${dim ? 'opacity-30' : ''}`}
                  >
                    <div className="text-sm font-medium">{PRIORITY_META[b].label}</div>
                    <div className="mt-0.5 text-[11px] opacity-80">{PRIORITY_META[b].rule}</div>
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="mt-4 font-mono text-[11px] text-ink-3">
        Tier thresholds: critical if log₁₀ Pc ≥ −4 or miss &lt; 1 km · elevated if log₁₀ Pc ≥ −6 or miss ≤ 5 km · policy triage-policy-0.1, a prototype.
      </p>
    </Section>
  )
}

const STEPS = [
  { n: '01', title: 'Message arrives', body: 'A conjunction data message with relative position, miss distance, time to closest approach, and covariance.' },
  { n: '02', title: 'Validate', body: 'Units are checked and converted centrally. Missing required fields are flagged, not guessed. Negative TCA is excluded from upcoming views.' },
  { n: '03', title: 'Estimate Pc', body: 'A versioned tree-based model estimates log₁₀ collision probability from the telemetry. Not calibrated confidence — a point estimate.' },
  { n: '04', title: 'Classify', body: 'Probability and distance thresholds give a risk tier: critical, elevated, or safe. A missing input gives “incomplete”, never “safe”.' },
  { n: '05', title: 'Triage', body: 'Tier × time to closest approach places the encounter in a band. Within a band, soonest first.' },
  { n: '06', title: 'Receipt', body: 'Inputs, thresholds, rules that fired, model and policy versions — a compact record of why this encounter is where it is.' },
]

function Flow() {
  return (
    <Section n="03 — From message to decision" title={<>Six steps, each one <span className="accent text-signal">inspectable.</span></>}>
      <ol className="relative grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        <motion.span
          aria-hidden
          className="absolute -top-4 left-0 h-px w-full origin-left bg-gradient-to-r from-signal/60 via-signal/20 to-transparent"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease }}
        />
        {STEPS.map((s, i) => (
          <motion.li key={s.n} {...rise(0.08 * i)} className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] text-signal/80">{s.n}</span>
              <h3 className="text-[15px] font-medium text-ink">{s.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
          </motion.li>
        ))}
      </ol>
    </Section>
  )
}

function Evidence() {
  return (
    <Section n="04 — Evidence and limits" title={<>Judged on what it finds, and on what it misses.</>}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="text-[15px] leading-relaxed text-ink-2">
            The evaluation separates three claims: how well the model estimates probability, how well the thresholds classify, and whether the queue surfaces imminent critical encounters earlier than ranking by risk, distance, or time alone. Each is reported with its denominators.
          </p>
          <Link to="/evaluation" className="group mt-6 inline-flex items-center gap-2 text-sm text-signal">
            See the evaluation <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <ul className="space-y-4 text-sm leading-relaxed text-ink-2">
          <li className="hairline-t pt-4">
            <span className="text-ink">Not a manoeuvre planner.</span> Orbit decides what to look at first. It does not recommend burns.
          </li>
          <li className="hairline-t pt-4">
            <span className="text-ink">Not calibrated confidence.</span> The supplied covariance is telemetry, not a percentage the model is sure of.
          </li>
          <li className="hairline-t pt-4">
            <span className="text-ink">Not a live clock.</span> Hours are relative to each encounter’s own closest approach in the held-out data.
          </li>
        </ul>
      </div>
    </Section>
  )
}
