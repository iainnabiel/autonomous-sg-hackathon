import type { EncounterDetail, Geometry, Observation, QueueItem, RadarBin, RadarResponse, Receipt, RiskTier } from './types'

// DEMONSTRATION DATA — hand-written to exercise every queue band and state.
// Not derived from the dataset or the model. IDs use the `fixture:` source prefix
// so they can never be mistaken for real encounters.

const MODEL_VERSION = 'fixture-model-0'
const POLICY_VERSION = 'triage-policy-0.1 (prototype)'

type Row = [
  id: string,
  obs: number,
  priority: QueueItem['priority'],
  tier: RiskTier | null,
  log10Pc: number | null,
  missM: number | null,
  tcaH: number | null,
  flags: string[],
  reasons: string[],
  objectType: string | null,
]

const rows: Row[] = [
  ['0412', 6, 'immediate', 'critical', -3.21, 640, 6.4, [], ['PC_GE_1E-4', 'MISS_LT_1KM', 'TCA_LE_24H'], 'DEBRIS'],
  ['1187', 4, 'immediate', 'critical', -4.62, 820, 18.2, ['IMPUTED_T_SIGMA'], ['MISS_LT_1KM', 'TCA_LE_24H'], 'ROCKET BODY'],
  ['0935', 5, 'immediate', 'critical', -3.87, 2100, 22.9, [], ['PC_GE_1E-4', 'TCA_LE_24H'], 'PAYLOAD'],
  ['2210', 3, 'high', 'critical', -3.48, 1400, 61.0, [], ['PC_GE_1E-4'], 'DEBRIS'],
  ['0078', 7, 'high', 'elevated', -5.12, 3200, 11.5, [], ['PC_GE_1E-6', 'MISS_LE_5KM', 'TCA_LE_24H'], 'DEBRIS'],
  ['1653', 2, 'high', 'elevated', -5.84, 4700, 20.1, [], ['PC_GE_1E-6', 'MISS_LE_5KM', 'TCA_LE_24H'], 'UNKNOWN'],
  ['0301', 4, 'scheduled', 'elevated', -5.37, 2600, 48.3, [], ['PC_GE_1E-6', 'MISS_LE_5KM'], 'PAYLOAD'],
  ['1920', 3, 'scheduled', 'elevated', -6.41, 4100, 96.0, [], ['MISS_LE_5KM'], 'DEBRIS'],
  ['0566', 5, 'scheduled', 'elevated', -5.93, 6800, 130.4, [], ['PC_GE_1E-6'], 'DEBRIS'],
  ['2044', 2, 'routine', 'safe', -8.72, 12400, 30.2, [], [], 'PAYLOAD'],
  ['0819', 6, 'routine', 'safe', -11.2, 26000, 72.7, [], [], 'DEBRIS'],
  ['1371', 3, 'routine', 'safe', -14.1, 18500, 160.0, [], [], 'ROCKET BODY'],
  ['0657', 2, 'incomplete', null, null, 2900, 14.0, ['MISSING_COVARIANCE', 'INFERENCE_UNAVAILABLE'], ['ASSESSMENT_INCOMPLETE'], 'DEBRIS'],
  ['1504', 1, 'incomplete', null, -7.9, null, 40.5, ['MISSING_MISS_DISTANCE'], ['ASSESSMENT_INCOMPLETE'], null],
]

export const fixtureItems: QueueItem[] = rows.map(
  ([id, obs, priority, risk_tier, predicted_log10_pc, miss_distance_m, tca_hours, quality_flags, reason_codes, object_type]) => ({
    encounter_id: `fixture:${id}`,
    observation_id: `fixture:${id}#${obs}`,
    priority,
    risk_tier,
    predicted_log10_pc,
    miss_distance_m,
    tca_hours,
    quality_flags,
    reason_codes,
    object_type,
  }),
)

export const fixtureQueue = {
  model_version: MODEL_VERSION,
  policy_version: POLICY_VERSION,
  cohort: 'demonstration fixtures',
  items: fixtureItems,
}

// --- Encounter histories -------------------------------------------------
// Each history ends at the selected observation above. Earlier updates are
// invented to show how an assessment can drift between messages.

const HISTORY: Record<string, [log10Pc: number | null, missM: number | null, tcaH: number | null, flags?: string[]][]> = {
  '0412': [[-6.8, 4100, 118.0], [-5.9, 2600, 94.5], [-5.1, 1900, 70.2], [-4.4, 1200, 46.0], [-3.8, 810, 22.1], [-3.21, 640, 6.4]],
  '1187': [[-5.6, 1700, 88.0], [-5.2, 1200, 63.4], [-4.9, 900, 40.0, ['IMPUTED_T_SIGMA']], [-4.62, 820, 18.2, ['IMPUTED_T_SIGMA']]],
  '0935': [[-4.3, 3900, 120.0], [-4.1, 3200, 96.0], [-3.95, 2600, 71.5], [-3.9, 2300, 47.0], [-3.87, 2100, 22.9]],
  '2210': [[-4.0, 2200, 110.0], [-3.7, 1700, 85.0], [-3.48, 1400, 61.0]],
  '0078': [[-7.2, 6100, 150.0], [-6.9, 5400, 126.0], [-6.4, 4800, 100.0], [-6.0, 4200, 76.0], [-5.6, 3700, 52.0], [-5.3, 3400, 29.0], [-5.12, 3200, 11.5]],
  '1653': [[-6.1, 5100, 44.0], [-5.84, 4700, 20.1]],
  '0301': [[-6.0, 3300, 120.0], [-5.7, 3000, 96.0], [-5.5, 2800, 72.0], [-5.37, 2600, 48.3]],
  '1920': [[-6.9, 4500, 144.0], [-6.6, 4300, 120.0], [-6.41, 4100, 96.0]],
  '0566': [[-6.5, 7600, 226.0], [-6.3, 7300, 202.0], [-6.1, 7100, 178.0], [-6.0, 6900, 154.0], [-5.93, 6800, 130.4]],
  '2044': [[-8.9, 12900, 54.0], [-8.72, 12400, 30.2]],
  '0819': [[-10.6, 27800, 192.0], [-10.9, 27100, 168.0], [-11.0, 26600, 144.0], [-11.1, 26300, 120.0], [-11.15, 26100, 96.0], [-11.2, 26000, 72.7]],
  '1371': [[-13.8, 19200, 208.0], [-14.0, 18800, 184.0], [-14.1, 18500, 160.0]],
  '0657': [[-6.2, 3400, 38.0], [null, 2900, 14.0, ['MISSING_COVARIANCE', 'INFERENCE_UNAVAILABLE']]],
  '1504': [[-7.9, null, 40.5, ['MISSING_MISS_DISTANCE']]],
}

const GEOMETRY: Record<string, Geometry> = {
  '0412': { r_m: -210, t_m: 580, n_m: 130, r_sigma_m: 90, t_sigma_m: 410, n_sigma_m: 120 },
  '1187': { r_m: 140, t_m: -760, n_m: 260, r_sigma_m: 110, t_sigma_m: null, n_sigma_m: 150 },
  '0935': { r_m: -480, t_m: 1900, n_m: -720, r_sigma_m: 160, t_sigma_m: 620, n_sigma_m: 210 },
  '2210': { r_m: 320, t_m: -1300, n_m: 410, r_sigma_m: 120, t_sigma_m: 540, n_sigma_m: 170 },
  '0078': { r_m: -900, t_m: 2900, n_m: 1100, r_sigma_m: 200, t_sigma_m: 880, n_sigma_m: 260 },
  '1653': { r_m: 1200, t_m: -4300, n_m: 1500, r_sigma_m: 240, t_sigma_m: 1100, n_sigma_m: 300 },
  '0301': { r_m: -640, t_m: 2400, n_m: 760, r_sigma_m: 150, t_sigma_m: 700, n_sigma_m: 200 },
  '1920': { r_m: 880, t_m: -3800, n_m: 1200, r_sigma_m: 180, t_sigma_m: 900, n_sigma_m: 230 },
  '0566': { r_m: -1500, t_m: 6300, n_m: 2000, r_sigma_m: 300, t_sigma_m: 1500, n_sigma_m: 400 },
  '2044': { r_m: 2600, t_m: -11500, n_m: 3700, r_sigma_m: 350, t_sigma_m: 1800, n_sigma_m: 450 },
  '0819': { r_m: -5200, t_m: 24300, n_m: 7600, r_sigma_m: 500, t_sigma_m: 2600, n_sigma_m: 700 },
  '1371': { r_m: 3900, t_m: -17200, n_m: 5500, r_sigma_m: 420, t_sigma_m: 2100, n_sigma_m: 600 },
  '0657': { r_m: -600, t_m: 2700, n_m: 850, r_sigma_m: null, t_sigma_m: null, n_sigma_m: null },
  '1504': { r_m: null, t_m: null, n_m: null, r_sigma_m: null, t_sigma_m: null, n_sigma_m: null },
}

const THRESHOLDS = { critical_log10_pc: -4, elevated_log10_pc: -6, critical_distance_m: 1000, elevated_distance_m: 5000, urgent_tca_hours: 24 }

function buildReceipt(item: QueueItem, geometry: Geometry): Receipt {
  const pc = item.predicted_log10_pc
  const d = item.miss_distance_m
  const t = item.tca_hours
  const rules = [
    { code: 'PC_GE_1E-4', kind: 'probability', description: 'Estimated log10 Pc ≥ −4 → critical', triggered: pc !== null && pc >= -4 },
    { code: 'MISS_LT_1KM', kind: 'distance', description: 'Supplied miss distance < 1 km → critical', triggered: d !== null && d < 1000 },
    { code: 'PC_GE_1E-6', kind: 'probability', description: 'Estimated log10 Pc ≥ −6 → at least elevated', triggered: pc !== null && pc >= -6 && pc < -4 },
    { code: 'MISS_LE_5KM', kind: 'distance', description: 'Supplied miss distance ≤ 5 km → at least elevated', triggered: d !== null && d <= 5000 && d >= 1000 },
    { code: 'TCA_LE_24H', kind: 'urgency', description: 'Closest approach within 24 h → raises queue band', triggered: t !== null && t <= 24 },
    { code: 'ASSESSMENT_INCOMPLETE', kind: 'quality', description: 'A required input is missing → routed to incomplete review', triggered: item.priority === 'incomplete' },
  ] as const

  const fired = rules.filter((r) => r.triggered)
  const probability = fired.some((r) => r.kind === 'probability')
  const distance = fired.some((r) => r.kind === 'distance')
  const urgency = fired.some((r) => r.kind === 'urgency')

  let escalation_summary: string
  if (item.priority === 'incomplete') escalation_summary = 'Not escalated by risk: the assessment could not be completed, so it is routed for manual review instead of being treated as safe.'
  else if (item.risk_tier === 'safe') escalation_summary = 'No probability or distance rule fired. Kept in routine monitoring.'
  else {
    const causes = [probability && 'estimated probability', distance && 'supplied miss distance'].filter(Boolean).join(' and ')
    escalation_summary = `${item.risk_tier === 'critical' ? 'Critical' : 'Elevated'} because of ${causes}. ${urgency ? 'Closest approach inside 24 h moved it up a band.' : 'Not inside the 24 h window, so urgency did not change the band.'}`
  }

  const num = (v: number | null, digits = 0) => (v === null ? 'not supplied' : v.toFixed(digits))
  return {
    observation_id: item.observation_id,
    inputs: [
      { field: 'miss_distance', value: num(d), unit: 'm', imputed: false },
      { field: 'time_to_tca', value: num(t, 1), unit: 'h', imputed: false },
      { field: 'relative_position_r', value: num(geometry.r_m), unit: 'm', imputed: false },
      { field: 'relative_position_t', value: num(geometry.t_m), unit: 'm', imputed: false },
      { field: 'relative_position_n', value: num(geometry.n_m), unit: 'm', imputed: false },
      { field: 'r_sigma', value: num(geometry.r_sigma_m), unit: 'm', imputed: false },
      { field: 't_sigma', value: num(geometry.t_sigma_m), unit: 'm', imputed: item.quality_flags.includes('IMPUTED_T_SIGMA') },
      { field: 'n_sigma', value: num(geometry.n_sigma_m), unit: 'm', imputed: false },
      { field: 'object_type', value: item.object_type ?? 'not supplied', unit: null, imputed: false },
    ],
    estimated_log10_pc: pc,
    thresholds: THRESHOLDS,
    rules: rules.map((r) => ({ ...r })),
    escalation_summary,
    model_version: MODEL_VERSION,
    policy_version: POLICY_VERSION,
  }
}

export function fixtureEncounter(encounterId: string): EncounterDetail | null {
  const summary = fixtureItems.find((i) => i.encounter_id === encounterId)
  if (!summary) return null
  const key = encounterId.replace('fixture:', '')
  const history: Observation[] = (HISTORY[key] ?? []).map(([predicted_log10_pc, miss_distance_m, tca_hours, flags], i) => ({
    observation_id: `${encounterId}#${i + 1}`,
    update_index: i + 1,
    predicted_log10_pc,
    miss_distance_m,
    tca_hours,
    quality_flags: flags ?? [],
  }))
  const geometry = GEOMETRY[key] ?? { r_m: null, t_m: null, n_m: null, r_sigma_m: null, t_sigma_m: null, n_sigma_m: null }
  return { summary, history, geometry, receipt: buildReceipt(summary, geometry) }
}

// --- Radar -----------------------------------------------------------------

const BIN_EDGES = [0, 6, 12, 24, 48, 72, 120, 168]

export function fixtureRadar(): RadarResponse {
  const bins: RadarBin[] = BIN_EDGES.map((from, i) => ({
    from_hours: from,
    to_hours: i + 1 < BIN_EDGES.length ? BIN_EDGES[i + 1] : null,
    critical: 0,
    elevated: 0,
    safe: 0,
    incomplete: 0,
  }))
  for (const item of fixtureItems) {
    const t = item.tca_hours
    if (t === null || t < 0) continue
    const bin = bins.find((b) => t >= b.from_hours && (b.to_hours === null || t < b.to_hours))
    if (!bin) continue
    if (item.risk_tier === null) bin.incomplete++
    else bin[item.risk_tier]++
  }
  return {
    bins,
    cohort: 'demonstration fixtures',
    caveat: 'Hours are relative to each encounter’s own closest approach. This is not a shared live clock.',
  }
}
