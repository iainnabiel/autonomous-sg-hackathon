import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import type { Priority, RiskTier } from '../api/types'
import { Footer } from '../components/layout/Page'
import { OrbitalOverview } from './Overview'
import { PRIORITY_META, TIER_META } from '../lib/taxonomy'

const ease = [0.22, 1, 0.36, 1] as const
const rise = (delay = 0) => ({ initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6, delay, ease } })

export function Home() {
  return (
    <>
      <OrbitalOverview />
      <Problem />
      <Triage />
      <Flow />
      <Evidence />
      <Footer />
    </>
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
    <Section n="01 — The problem" title={<>Thousands of warnings a day. Very few need action.</>}>
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
    { key: 'soon', label: 'Within 24 hours' },
    { key: 'later', label: 'More than 24 hours' },
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
    <Section n="02 — How alerts are ranked" title={<>Priority combines risk level and time to closest approach.</>} id="how">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
        Each alert gets a risk level from the collision probability and miss distance. A forecast model can raise the level to Critical when early warnings resemble past critical encounters; it never lowers it. Risk level and time to closest approach then set the review priority. If required data is missing, the alert is marked incomplete and is never shown as safe.
      </p>

      <div className="mt-10 min-w-0 overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[150px_1fr_1fr] gap-2">
          <div className="flex items-end px-1 pb-1 text-[12px] font-medium text-ink">Risk level</div>
          <div className="col-span-2 border-b border-line px-1 pb-1 text-[12px] font-medium text-ink">Time to closest approach</div>
          <div />
          {cols.map((c) => (
            <div key={c.key} className="px-1 pb-1 text-[12px] text-ink-2">
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
        Critical: collision probability ≥ 1 in 10,000 or miss distance under 1 km. Elevated: probability ≥ 1 in 1,000,000 or miss distance up to 5 km. Prototype policy triage-policy-0.1.
      </p>
    </Section>
  )
}

const STEPS = [
  { n: '01', title: 'Message arrives', body: 'A conjunction data message with relative position, miss distance, time to closest approach, and covariance.' },
  { n: '02', title: 'Validate', body: 'Units are checked and converted centrally. Missing required fields are flagged, not guessed. Negative TCA is excluded from upcoming views.' },
  { n: '03', title: 'Classify by rule', body: 'The organisers’ probability and distance thresholds on the latest message give a rule tier: critical, elevated, or safe. A missing input gives “incomplete”, never “safe”.' },
  { n: '04', title: 'Forecast', body: 'A versioned classifier scores, from messages at least two days out, whether the encounter will end critical. Above a fixed threshold it raises the tier; it never lowers one. A ranking score, not a calibrated probability.' },
  { n: '05', title: 'Triage', body: 'Tier × time to closest approach places the encounter in a band. Within a band, soonest first.' },
  { n: '06', title: 'Receipt', body: 'Inputs, thresholds, rules that fired, model and policy versions — a compact record of why this encounter is where it is.' },
]

function Flow() {
  return (
    <Section n="03 — From warning to decision" title={<>Six steps, each one recorded.</>}>
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
    <Section n="04 — Results and limitations" title={<>What the system catches, and what it misses.</>}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="text-[15px] leading-relaxed text-ink-2">
            The evaluation separates three claims: how many critical endings the forecast catches beyond the persistence rule and at what false-alarm cost, how the thresholds classify, and whether the queue surfaces imminent critical encounters earlier than ranking by risk, distance, or time alone. Each is reported with its denominators.
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
            <span className="text-ink">Not calibrated confidence.</span> The forecast score ranks encounters; it is not a probability. The supplied covariance is telemetry, not a percentage the model is sure of.
          </li>
          <li className="hairline-t pt-4">
            <span className="text-ink">Blind inside two days.</span> The forecast only sees messages at least two days out. A late geometry change is caught by re-assessing each new message, not by the model.
          </li>
        </ul>
      </div>
    </Section>
  )
}
