import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Building2, KeyRound, ShieldCheck } from 'lucide-react'
import { Wordmark } from '../components/layout/Nav'
import { OrbitalBackdrop } from './Login'

const ease = [0.22, 1, 0.36, 1] as const

/**
 * Sign-up. New accounts are created only through the organisation's single sign-on (SSO);
 * there is no password sign-up. The prototype has no identity provider connected, so the
 * flow stops after the work email is checked and says so.
 */
export function Signup() {
  const [email, setEmail] = useState('')
  const [org, setOrg] = useState('')
  const [step, setStep] = useState<'form' | 'redirecting' | 'unavailable'>('form')
  const domain = email.includes('@') ? email.split('@')[1] : ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setStep('redirecting')
    setTimeout(() => setStep('unavailable'), 1200)
  }

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-void lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <OrbitalBackdrop />

      <section className="relative z-10 flex flex-col justify-between px-6 py-8 md:px-12 md:py-10">
        <Wordmark size={28} />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }} className="my-16 max-w-2xl lg:my-0">
          <p className="eyebrow text-signal/80">Operator access</p>
          <h1 className="mt-5 text-[36px] leading-[1.05] font-medium tracking-[-0.02em] text-ink sm:text-[48px] lg:text-[54px]">
            Create an account through your organisation
          </h1>
          <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-ink-2">
            Accounts are issued through your organisation's single sign-on (SSO). Your identity provider confirms who you are, and your administrator approves access to your satellites.
          </p>
        </motion.div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={12} className="text-signal/70" /> SSO required · no password accounts
          </span>
          <span>Prototype · SSO not connected</span>
        </div>
      </section>

      <section className="relative z-10 flex items-center border-t border-line bg-base/60 px-6 py-10 backdrop-blur-md md:px-12 lg:border-t-0 lg:border-l">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.25 }} className="w-full max-w-sm">
          {step === 'unavailable' ? (
            <div role="status">
              <span className="grid size-10 place-items-center rounded-full bg-elevated/15 text-elevated">
                <KeyRound size={18} />
              </span>
              <h2 className="mt-5 text-lg font-medium text-ink">SSO is not connected in this prototype</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                In production, you would now sign in with <span className="text-ink">{domain}</span>'s identity provider and your account would be created once your administrator approves it.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-3">To explore the dashboard, use one of the demonstration accounts.</p>
              <Link to="/login" className="btn btn-primary mt-7 h-10 w-full">
                Go to sign in <ArrowRight size={15} />
              </Link>
              <button type="button" onClick={() => setStep('form')} className="mt-3 w-full text-center text-sm text-ink-3 hover:text-ink-2">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 className="text-lg font-medium text-ink">Create an account</h2>
              <p className="mt-1 text-sm text-ink-3">Sign up with your work email. You'll continue to your organisation's SSO.</p>

              <label className="mt-7 block">
                <span className="eyebrow">Work email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@organisation.com"
                  autoComplete="email"
                  className="mt-2 h-10 w-full rounded-md border border-line bg-void/60 px-3 text-sm text-ink placeholder:text-ink-3/70 focus:border-signal/50 focus:outline-none"
                />
              </label>

              <label className="mt-5 block">
                <span className="eyebrow">Organisation</span>
                <div className="relative mt-2">
                  <Building2 size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                  <input
                    type="text"
                    required
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="e.g. NUS"
                    autoComplete="organization"
                    className="h-10 w-full rounded-md border border-line bg-void/60 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3/70 focus:border-signal/50 focus:outline-none"
                  />
                </div>
              </label>

              <button type="submit" disabled={step === 'redirecting'} className="btn btn-primary mt-7 h-10 w-full">
                <KeyRound size={15} />
                {step === 'redirecting' ? 'Contacting your identity provider…' : 'Continue with SSO'}
              </button>

              <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
                Single sign-on is required. Accounts can't be created with a password.
              </p>

              <p className="mt-6 text-center text-sm text-ink-3">
                Already have an account?{' '}
                <Link to="/login" className="inline-flex items-center gap-1 text-signal underline-offset-4 hover:underline">
                  <ArrowLeft size={13} /> Sign in
                </Link>
              </p>
            </form>
          )}
        </motion.div>
      </section>
    </main>
  )
}
