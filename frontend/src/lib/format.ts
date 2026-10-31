import { HOURS_PER_DAY, RISK_FLOOR } from './policy'

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}

/** log10(Pc) → "6.2 × 10⁻⁴" so very small probabilities stay readable. The floor is named, not shown as a number. */
export function formatPc(log10Pc: number | null): string {
  if (log10Pc === null) return '—'
  if (log10Pc <= RISK_FLOOR) return '≈ 0 (floor)'
  let exp = Math.floor(log10Pc)
  let mantissa = 10 ** (log10Pc - exp)
  if (mantissa >= 9.95) {
    mantissa = 1
    exp += 1
  }
  const sup = String(exp).replace(/./g, (c) => SUPERSCRIPT[c] ?? c)
  return `${mantissa.toFixed(1)} × 10${sup}`
}

export function formatLogPc(log10Pc: number | null): string {
  if (log10Pc === null) return '—'
  if (log10Pc <= RISK_FLOOR) return `${log10Pc.toFixed(0)} (floor)`
  return log10Pc.toFixed(2)
}

export function formatDistance(m: number | null): string {
  if (m === null) return '—'
  return Math.abs(m) < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(Math.abs(m) < 10_000 ? 2 : 1)} km`
}

/** Signed difference, e.g. "−170 m" or "+0.59". */
export function formatDelta(v: number | null, unit: 'm' | 'log'): string {
  if (v === null) return '—'
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±'
  return unit === 'm' ? `${sign}${formatDistance(Math.abs(v))}` : `${sign}${Math.abs(v).toFixed(2)}`
}

/** Time to closest approach from supplied days. Hours are a display conversion; under 2 days shows hours. */
export function formatTca(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return `${(days * HOURS_PER_DAY).toFixed(1)} h (passed)`
  if (days < 2) return `${(days * HOURS_PER_DAY).toFixed(1)} h`
  return `${days.toFixed(1)} d`
}

export function formatDays(days: number | null): string {
  if (days === null) return '—'
  return `${days.toFixed(days < 1 ? 2 : 1)} d`
}

export function formatSpeed(mps: number | null): string {
  if (mps === null) return '—'
  return `${(mps / 1000).toFixed(2)} km/s`
}

/** Model class score, two decimals. Never shown as a percentage: it is not a calibrated probability. */
export function formatScore(p: number | null): string {
  return p === null ? '—' : p.toFixed(2)
}

/** Codes → sentence case for display, e.g. missing_required_input → "Missing required input". */
export function humanizeCode(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `source:index` → `#index` for compact display next to the full ID. */
export function shortId(id: string | null): string {
  return id ? `#${id.replace(/^.*:/, '')}` : '—'
}
