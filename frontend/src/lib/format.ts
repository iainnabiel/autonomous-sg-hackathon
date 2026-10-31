const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}

/** The dataset reports log10 Pc = −30 when the probability is too small to compute. */
export const PC_FLOOR = -30

/** log10(Pc) → "6.2 × 10⁻⁴" so very small probabilities stay readable. The floor is named, not shown as a number. */
export function formatPc(log10Pc: number | null): string {
  if (log10Pc === null) return '—'
  if (log10Pc <= PC_FLOOR) return '≈ 0 (floor)'
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
  if (log10Pc <= PC_FLOOR) return `${log10Pc.toFixed(0)} (floor)`
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

export function formatTca(h: number | null): string {
  if (h === null) return '—'
  if (h < 48) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

export function formatDays(h: number | null): string {
  if (h === null) return '—'
  return `${(h / 24).toFixed(h / 24 < 1 ? 2 : 1)} d`
}

export function formatSpeed(mps: number | null): string {
  if (mps === null) return '—'
  return `${(mps / 1000).toFixed(2)} km/s`
}

/** Model ranking score, two decimals. Never shown as a percentage: it is not a calibrated probability. */
export function formatScore(p: number | null): string {
  return p === null ? '—' : p.toFixed(2)
}

/** Reason/flag codes → sentence case for display, e.g. MISSING_COVARIANCE → "Missing covariance". */
export function humanizeCode(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Threshold rule codes → short human labels for crossings and chips. */
export const RULE_LABEL: Record<string, string> = {
  'PC_GE_1E-4': 'Pc ≥ 10⁻⁴',
  'PC_GE_1E-6': 'Pc ≥ 10⁻⁶',
  MISS_LT_1KM: 'miss < 1 km',
  MISS_LE_5KM: 'miss ≤ 5 km',
  MODEL_UPGRADE: 'model upgrade',
  TCA_LE_24H: 'within 24 h',
  ASSESSMENT_INCOMPLETE: 'incomplete',
}

export function ruleLabel(code: string): string {
  return RULE_LABEL[code] ?? humanizeCode(code)
}
