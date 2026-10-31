import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { OPERATORS } from '../auth/operators'
import { Wordmark } from '../components/layout/Nav'

const ease = [0.22, 1, 0.36, 1] as const

/**
 * Layer 1: identity. Cinematic but spare. The sign-in is a demonstration: pick an operator,
 * any passphrase is accepted, nothing is checked server-side. The page says so.
 */
export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [operatorId, setOperatorId] = useState(OPERATORS[0].id)
  const [pass, setPass] = useState('')
  const [entering, setEntering] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setEntering(true)
    // Brief hold so the transition reads as deliberate rather than a page flash.
    setTimeout(() => {
      signIn(operatorId)
      navigate(from, { replace: true })
    }, 650)
  }

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-void lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <OrbitalBackdrop />

      <section className="relative z-10 flex flex-col justify-between px-6 py-8 md:px-12 md:py-10">
        <Wordmark size={28} />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }} className="my-16 max-w-2xl lg:my-0">
          <p className="eyebrow text-signal/80">Space situational awareness</p>
          <h1 className="mt-5 text-[36px] leading-[1.05] font-medium tracking-[-0.02em] text-ink sm:text-[48px] lg:text-[54px]">
            Conjunction risk assessment for satellite operators
          </h1>
          <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-ink-2">
            Review close-approach warnings for the satellites you operate. Each warning is ranked by risk and urgency, and the reasons are recorded.
          </p>
        </motion.div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={12} className="text-signal/70" /> Restricted system · authorised operators
          </span>
          <span>Prototype · demonstration accounts</span>
        </div>
      </section>

      <section className="relative z-10 flex items-center border-t border-line bg-base/60 px-6 py-10 backdrop-blur-md md:px-12 lg:border-t-0 lg:border-l">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: entering ? 0 : 1, y: entering ? -8 : 0 }}
          transition={{ duration: 0.5, ease, delay: entering ? 0 : 0.25 }}
          className="w-full max-w-sm"
        >
          <h2 className="text-lg font-medium text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink-3">Choose a demonstration account. No credentials are checked.</p>

          <fieldset className="mt-7">
            <legend className="eyebrow mb-3">Operator</legend>
            <div className="space-y-2">
              {OPERATORS.map((o) => {
                const on = o.id === operatorId
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors ${on ? 'border-signal/50 bg-signal-dim/60' : 'border-line hover:border-line-strong'}`}
                  >
                    <input type="radio" name="operator" value={o.id} checked={on} onChange={() => setOperatorId(o.id)} className="sr-only" />
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-[11px] ${on ? 'bg-signal text-void' : 'bg-raised text-ink-2'}`}>{o.initials}</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{o.name}</span>
                      <span className="block truncate text-xs text-ink-3">{o.organisation}</span>
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-ink-3">{o.handle}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <label className="mt-6 block">
            <span className="eyebrow">Passphrase</span>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="any value is accepted in the demo"
              autoComplete="off"
              className="mt-2 h-10 w-full rounded-md border border-line bg-void/60 px-3 font-mono text-sm text-ink placeholder:text-ink-3/70 focus:border-signal/50 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={entering}
            className="btn btn-primary group mt-7 h-10 w-full"
          >
            {entering ? 'Signing in…' : 'Sign in'}
            {!entering && <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />}
          </button>

          <p className="mt-6 text-[11px] leading-relaxed text-ink-3">
            Session is local to this browser tab. The accounts, satellites and encounters shown after sign-in are demonstration data; nothing here is production-grade security.
          </p>
        </motion.form>
      </section>
    </main>
  )
}

/** Slowly turning orbital rings behind the hero copy. Pure SVG + CSS; no WebGL on the login page. */
function OrbitalBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bg-grid absolute inset-0" />
      <svg className="absolute top-1/2 -left-[18%] h-[140vmin] w-[140vmin] -translate-y-1/2 opacity-70 lg:-left-[6%]" viewBox="0 0 1000 1000" fill="none">
        <circle cx="500" cy="500" r="300" stroke="rgb(148 178 230 / 0.12)" />
        <circle cx="500" cy="500" r="300" fill="url(#lg)" />
        <g className="origin-center animate-[spin_90s_linear_infinite]">
          <ellipse cx="500" cy="500" rx="420" ry="150" transform="rotate(-24 500 500)" stroke="#6fe3ff" strokeOpacity="0.28" />
          <circle cx="885" cy="330" r="4" fill="#6fe3ff" />
        </g>
        <g className="origin-center animate-[spin_140s_linear_infinite_reverse]">
          <ellipse cx="500" cy="500" rx="470" ry="200" transform="rotate(38 500 500)" stroke="#a99cff" strokeOpacity="0.22" />
          <circle cx="140" cy="300" r="3.5" fill="#a99cff" />
        </g>
        <g className="origin-center animate-[spin_200s_linear_infinite]">
          <ellipse cx="500" cy="500" rx="360" ry="340" transform="rotate(70 500 500)" stroke="rgb(148 178 230 / 0.18)" />
          <circle cx="840" cy="620" r="3" fill="#e9eef7" />
        </g>
        <defs>
          <radialGradient id="lg" cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#13223a" />
            <stop offset="1" stopColor="#04060b" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  )
}
