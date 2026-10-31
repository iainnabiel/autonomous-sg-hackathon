const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}

/** log10(Pc) → "6.2 × 10⁻⁴" so very small probabilities stay readable. */
export function formatPc(log10Pc: number | null): string {
  if (log10Pc === null) return '—'
  let exp = Math.floor(log10Pc)
  let mantissa = 10 ** (log10Pc - exp)
  if (mantissa >= 9.95) {
    mantissa = 1
    exp += 1
  }
  const sup = String(exp).replace(/./g, (c) => SUPERSCRIPT[c] ?? c)
  return `${mantissa.toFixed(1)} × 10${sup}`
}

export function formatDistance(m: number | null): string {
  if (m === null) return '—'
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`
}

export function formatTca(h: number | null): string {
  if (h === null) return '—'
  if (h < 48) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

/** Reason/flag codes → sentence case for display, e.g. MISSING_COVARIANCE → "Missing covariance". */
export function humanizeCode(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
