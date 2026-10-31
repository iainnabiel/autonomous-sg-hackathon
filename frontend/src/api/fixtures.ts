import type {
  DecisionReceipt,
  EncounterDetail,
  EncounterListItem,
  Forecast,
  HistoryEntry,
  Observation,
  ObservationChange,
  PriorityBand,
  QualityFlag,
  QueueResponse,
  ReasonCode,
  RelativeTimeSummary,
  ReviewState,
  ReviewStatus,
  Tier,
} from './types'
import {
  EARLY_CUTOFF_DAYS,
  HOURS_PER_DAY,
  POLICY_VERSION,
  PROTOTYPE_NOTICE,
  RISK_FLOOR,
  TIER_SEVERITY,
  TRIAGE_POLICY_VERSION,
  UPCOMING_URGENCY_DAYS,
  UPGRADE_THRESHOLD_P_CRITICAL,
  assignReview,
  currentRuleTier,
  isEarlyEligible,
  triggeredRules,
} from '../lib/policy'

// SYNTHETIC DEVELOPMENT FIXTURES — hand-written to exercise every queue band, forecast status and UI state.
// Shaped after the demo cases in ml/reports/model_card.md but not derived from the dataset or the model.
// IDs use the `fixture:` source, which `contracts.ids.SOURCES` allows, so they can never be mistaken for
// real encounters. Everything the backend would compute (rule tiers, forecasts, triage, receipts,
// comparisons, review renewal) is computed here with the mirrors in lib/policy.ts, so the UI exercises
// the contract shapes end to end.

export const FIXTURE_LABEL = 'synthetic development fixtures'
const MODEL_VERSION = 'synthetic-fixture-0'
const UNITS = 'miss distance and relative position in metres; relative speed in m/s; time_to_tca in days; hours are a display conversion; sigma units unconfirmed'

type Msg = [tcaH: number, log10Pc: number | null, missM: number | null, modelFlags?: string[]]

interface Def {
  event: number
  object: string | null
  case: string
  msgs: Msg[]
  dir: [r: number, t: number, n: number] | null
  speed: number | null
  sigma: [number | null, number | null]
  p: number | null
  model: 'scored' | 'unavailable'
  weather?: [f10: number | null, ap: number | null]
  review?: { status: ReviewStatus; at: number }
}

const DEFS: Def[] = [
  { event: 412, object: 'DEBRIS', case: 'forecast flagged Critical at 52 h, before the distance rule fired; later Critical by distance',
    msgs: [[118, -6.8, 4100], [94.5, -5.9, 2600], [70.2, -5.1, 1900], [52, -4.9, 1500], [22.1, -5.4, 810], [6.4, -5.2, 640]],
    dir: [-0.33, 0.9, 0.2], speed: 14210, sigma: [90, 41], p: 0.41, model: 'scored', weather: [112, 9], review: { status: 'acknowledged', at: 4 } },
  { event: 1187, object: 'ROCKET BODY', case: 'Critical by probability and distance; sigma placeholder',
    msgs: [[88, -5.6, 1700], [63.4, -5.2, 1200], [40, -4.9, 900, ['sigma_placeholder']], [18.2, -3.6, 820, ['sigma_placeholder']]],
    dir: [0.17, -0.93, 0.32], speed: 11840, sigma: [6.378136e7, 18], p: 0.77, model: 'scored', weather: [98, 15] },
  { event: 935, object: 'PAYLOAD', case: 'Critical by probability only',
    msgs: [[120, -4.3, 3900], [96, -4.1, 3200], [71.5, -3.95, 2600], [47, -3.9, 2300], [22.9, -3.87, 2100]],
    dir: [-0.23, 0.9, -0.36], speed: 7420, sigma: [160, 62], p: 0.63, model: 'scored', weather: [131, 7] },
  { event: 873, object: 'DEBRIS', case: 'limitation: looked Safe at the 2-day cutoff; a later message revealed Critical (after train:8732)',
    msgs: [[161, RISK_FLOOR, 42922], [153.5, RISK_FLOOR, 42863], [136, RISK_FLOOR, 42823], [130, RISK_FLOOR, 29069], [114, RISK_FLOOR, 28786], [98, RISK_FLOOR, 28736], [80, RISK_FLOOR, 28631], [65, -13.7, 28637, ['sigma_placeholder']], [56, RISK_FLOOR, 28737], [41.4, RISK_FLOOR, 834], [23.8, RISK_FLOOR, 820], [17, RISK_FLOOR, 828], [9.8, RISK_FLOOR, 833], [1.6, RISK_FLOOR, 829]],
    dir: [0.12, 0.97, -0.21], speed: 15030, sigma: [4.7, 1.9], p: 0.0, model: 'scored', weather: [74, 4] },
  { event: 2210, object: 'DEBRIS', case: 'forecast raised Elevated to Critical; only early messages',
    msgs: [[110, -5.6, 2200], [85, -5.3, 1700], [61, -5.1, 1400]],
    dir: [0.25, -0.92, 0.3], speed: 9870, sigma: [120, 54], p: 0.31, model: 'scored', weather: [104, 12], review: { status: 'escalated', at: 3 } },
  { event: 566, object: 'DEBRIS', case: 'weak upgrade: score just over the threshold',
    msgs: [[226, -6.5, 7600], [202, -6.3, 7300], [178, -6.1, 7100], [154, -6.0, 6900], [130.4, -5.93, 6800]],
    dir: [-0.22, 0.93, 0.29], speed: 12100, sigma: [300, 140], p: 0.14, model: 'scored', weather: [88, 22] },
  { event: 78, object: 'DEBRIS', case: 'Elevated within 1 day',
    msgs: [[150, -7.2, 6100], [126, -6.9, 5400], [100, -6.4, 4800], [76, -6.0, 4200], [52, -5.6, 3700], [29, -5.3, 3400], [11.5, -5.12, 3200]],
    dir: [-0.29, 0.9, 0.33], speed: 13350, sigma: [200, 95], p: 0.05, model: 'scored', weather: [119, 6] },
  { event: 1653, object: 'UNKNOWN', case: 'single early message',
    msgs: [[50, -5.84, 4700, ['single_early_message']], [20.1, -5.7, 4600, ['single_early_message']]],
    dir: [0.26, -0.91, 0.32], speed: 10420, sigma: [240, 110], p: 0.03, model: 'scored', weather: [93, 18] },
  { event: 301, object: 'PAYLOAD', case: 'Elevated, later',
    msgs: [[120, -6.0, 3300], [96, -5.7, 3000], [72, -5.5, 2800], [48.3, -5.37, 2600]],
    dir: [-0.25, 0.92, 0.29], speed: 8030, sigma: [150, 70], p: 0.02, model: 'scored', weather: [107, 11] },
  { event: 1920, object: 'DEBRIS', case: 'Elevated by distance only; log10 Pc at the reporting floor',
    msgs: [[144, RISK_FLOOR, 4500], [120, RISK_FLOOR, 4300], [96, RISK_FLOOR, 4100]],
    dir: [0.22, -0.93, 0.3], speed: 14780, sigma: [180, 86], p: 0.01, model: 'scored', weather: [126, 9] },
  { event: 244, object: 'PAYLOAD', case: 'space weather missing',
    msgs: [[170, -6.4, 5600], [140, -6.2, 5200, ['space_weather_missing']], [96, -5.9, 4900, ['space_weather_missing']]],
    dir: [-0.3, 0.9, 0.31], speed: 9120, sigma: [210, 99], p: 0.04, model: 'scored', weather: [null, null] },
  { event: 2044, object: 'PAYLOAD', case: 'Safe with a valid Safe forecast (carried forward)',
    msgs: [[54, -8.9, 12900], [30.2, -8.72, 12400]],
    dir: [0.21, -0.93, 0.3], speed: 7740, sigma: [350, 160], p: 0.01, model: 'scored', weather: [101, 13] },
  { event: 819, object: 'DEBRIS', case: 'Safe, floor',
    msgs: [[192, RISK_FLOOR, 27800], [168, RISK_FLOOR, 27100], [144, RISK_FLOOR, 26600], [120, RISK_FLOOR, 26300], [96, RISK_FLOOR, 26100], [72.7, RISK_FLOOR, 26000]],
    dir: [-0.21, 0.93, 0.3], speed: 13920, sigma: [500, 230], p: 0.0, model: 'scored', weather: [84, 5] },
  { event: 1371, object: 'ROCKET BODY', case: 'current Safe but inference unavailable → Incomplete, never Routine',
    msgs: [[208, -13.8, 19200], [184, -14.0, 18800], [160, -14.1, 18500]],
    dir: [0.23, -0.92, 0.32], speed: 11210, sigma: [420, 190], p: null, model: 'unavailable', weather: [95, 8] },
  { event: 1504, object: null, case: 'no message ≥ 2 days out: unable to assess; current Elevated keeps its band',
    msgs: [[40.5, -7.9, 3300]],
    dir: [-0.27, 0.91, 0.31], speed: 10650, sigma: [130, 61], p: null, model: 'scored', weather: [110, 14] },
  { event: 657, object: 'DEBRIS', case: 'missing required input on the latest message',
    msgs: [[38, -6.2, 3400], [14, -7.9, null]],
    dir: null, speed: 12480, sigma: [null, null], p: null, model: 'scored', weather: [102, 10], review: { status: 'acknowledged', at: 1 } },
]

const SIGMA_PLACEHOLDER = 6.378136e7

// --- Observations ------------------------------------------------------------------

interface Built {
  def: Def
  encounter_id: string
  observations: Observation[]
  modelFlags: Map<string, string[]>
}

const built: Built[] = (() => {
  let row = 0
  return DEFS.map((def) => {
    const encounter_id = `fixture:${def.event}`
    const modelFlags = new Map<string, string[]>()
    const observations = def.msgs.map(([tcaH, pc, miss, flags]) => {
      const observation_id = `fixture:${row++}`
      let r: number | null = null
      let t: number | null = null
      let n: number | null = null
      if (def.dir && miss !== null) {
        const norm = Math.hypot(...def.dir)
        r = Math.round((def.dir[0] / norm) * miss)
        t = Math.round((def.dir[1] / norm) * miss)
        n = Math.round((def.dir[2] / norm) * miss)
      }
      modelFlags.set(observation_id, flags ?? [])
      const [f10, ap] = def.weather ?? [null, null]
      return {
        observation_id,
        encounter_id,
        time_to_tca_days: tcaH / HOURS_PER_DAY,
        risk_log10_pc: pc,
        miss_distance_m: miss,
        relative_speed_m_s: def.speed,
        relative_position_r_m: r,
        relative_position_t_m: t,
        relative_position_n_m: n,
        c_sigma_r: def.sigma[0],
        t_sigma_r: def.sigma[1],
        c_object_type: def.object,
        f10,
        ap,
      } satisfies Observation
    })
    return { def, encounter_id, observations, modelFlags }
  })
})()

const byRow = (a: Observation, b: Observation) => Number(a.observation_id.split(':')[1]) - Number(b.observation_id.split(':')[1])

/** `contracts.observations.select_upcoming_observation`: smallest non-negative TCA, ties by row index. */
function selectUpcoming(obs: Observation[]): Observation | null {
  const pool = obs.filter((o) => o.time_to_tca_days >= 0)
  if (!pool.length) return null
  return pool.reduce((a, b) => (b.time_to_tca_days < a.time_to_tca_days || (b.time_to_tca_days === a.time_to_tca_days && byRow(b, a) < 0) ? b : a))
}

/** `contracts.observations.select_early_observation`: latest message still at least 2 days out. */
function selectEarly(obs: Observation[]): Observation | null {
  const pool = obs.filter((o) => isEarlyEligible(o.time_to_tca_days))
  if (!pool.length) return null
  return pool.reduce((a, b) => (b.time_to_tca_days < a.time_to_tca_days ? b : a))
}

// --- Forecast (what ml.inference.predict_encounters would return, in contract shape) ----

function forecastFor(b: Built, shownOn: Observation): Forecast {
  const nothing = { forecast_final_tier: null, p_critical: null, predicted_final_log10_pc: null, predicted_final_pc: null, source_observation_id: null, source_time_to_tca_days: null, model_version: null }
  if (b.def.model === 'unavailable') return { status: 'unavailable', ...nothing, reason_codes: ['model_unavailable'] }
  const source = selectEarly(b.observations)
  if (!source || b.def.p === null) return { status: 'unable_to_assess', ...nothing, reason_codes: ['no_eligible_observation'] }
  const persistence = currentRuleTier(source.risk_log10_pc, source.miss_distance_m)
  const upgraded = persistence !== null && persistence !== 'Critical' && b.def.p >= UPGRADE_THRESHOLD_P_CRITICAL
  const tier: Tier | null = upgraded ? 'Critical' : persistence
  const carried = shownOn.observation_id !== source.observation_id
  return {
    status: carried ? 'carried_forward' : 'available',
    forecast_final_tier: tier,
    p_critical: b.def.p,
    predicted_final_log10_pc: null,
    predicted_final_pc: null,
    source_observation_id: source.observation_id,
    source_time_to_tca_days: source.time_to_tca_days,
    model_version: MODEL_VERSION,
    reason_codes: carried ? ['forecast_carried_forward'] : [],
  }
}

function upgradeReasons(b: Built, forecast: Forecast): string[] {
  if (forecast.forecast_final_tier !== 'Critical' || forecast.p_critical === null || forecast.p_critical < UPGRADE_THRESHOLD_P_CRITICAL) return []
  const early = b.observations.filter((o) => isEarlyEligible(o.time_to_tca_days) && o.miss_distance_m !== null)
  const latest = early[early.length - 1]
  if (!latest || currentRuleTier(latest.risk_log10_pc, latest.miss_distance_m) === 'Critical') return []
  const reasons: string[] = []
  const minMiss = Math.min(...early.map((o) => o.miss_distance_m!))
  if (minMiss < 1000 && latest.miss_distance_m! >= 1000) reasons.push(`an earlier early message was ${minMiss} m apart (< 1000 m)`)
  if (latest.miss_distance_m! <= 2000) reasons.push(`latest early miss distance ${latest.miss_distance_m} m is within 2 km`)
  if (early.length >= 2) {
    const first = early[0]
    const slope = (first.miss_distance_m! - latest.miss_distance_m!) / (first.time_to_tca_days - latest.time_to_tca_days)
    if (slope > 0) reasons.push(`miss distance shrinking about ${Math.round(slope / 10) * 10} m per day closer to TCA`)
  }
  return reasons.length ? reasons : ['model score above threshold; no single dominant signal']
}

// --- Quality flags, triage, items -----------------------------------------------------

function qualityFlags(o: Observation, forecast: Forecast): QualityFlag[] {
  const flags: QualityFlag[] = []
  if (o.miss_distance_m === null || o.risk_log10_pc === null) flags.push('missing_required_input')
  if (forecast.status === 'unavailable') flags.push('inference_unavailable')
  if (forecast.status === 'carried_forward') flags.push('carried_forward')
  return flags
}

function modelFlagsFor(b: Built, o: Observation): string[] {
  const flags = [...(b.modelFlags.get(o.observation_id) ?? [])]
  if (b.def.sigma[0] === SIGMA_PLACEHOLDER && !flags.includes('sigma_placeholder')) flags.push('sigma_placeholder')
  return flags
}

function item(b: Built): EncounterListItem | null {
  const selected = selectUpcoming(b.observations)
  if (!selected) return null
  const forecast = forecastFor(b, selected)
  const current = currentRuleTier(selected.risk_log10_pc, selected.miss_distance_m)
  const triage = assignReview(current, selected.time_to_tca_days, forecast)
  return {
    encounter_id: b.encounter_id,
    observation_id: selected.observation_id,
    current_rule_tier: current,
    forecast,
    supplied_risk_log10_pc: selected.risk_log10_pc,
    miss_distance_m: selected.miss_distance_m,
    time_to_tca_days: selected.time_to_tca_days,
    priority: triage.priority,
    quality_flags: qualityFlags(selected, forecast),
    model_version: forecast.model_version,
    policy_version: POLICY_VERSION,
    triage,
    object_type: b.def.object,
    model_quality_flags: modelFlagsFor(b, selected),
    review: reviewState(b),
  }
}

function history(b: Built): HistoryEntry[] {
  return b.observations.map((o) => ({
    observation: o,
    current_rule_tier: currentRuleTier(o.risk_log10_pc, o.miss_distance_m),
    forecast: forecastFor(b, o),
  }))
}

function receipt(b: Built, it: EncounterListItem): DecisionReceipt {
  const selected = b.observations.find((o) => o.observation_id === it.observation_id)!
  const reason_codes: ReasonCode[] = [...it.forecast.reason_codes]
  if (it.current_rule_tier === 'Critical' && it.forecast.forecast_final_tier === null) reason_codes.push('current_critical_trigger')
  const invalid_inputs: string[] = []
  if (selected.risk_log10_pc === null) invalid_inputs.push('log10_pc')
  if (selected.miss_distance_m === null) invalid_inputs.push('miss_distance_m')
  return {
    encounter_id: it.encounter_id,
    observation_id: it.observation_id,
    supplied_risk_log10_pc: it.supplied_risk_log10_pc,
    current_rule_tier: it.current_rule_tier,
    forecast: it.forecast,
    miss_distance_m: it.miss_distance_m,
    time_to_tca_days: it.time_to_tca_days,
    quality_flags: it.quality_flags,
    reason_codes,
    model_version: it.model_version,
    policy_version: POLICY_VERSION,
    units: UNITS,
    triggered_rules: triggeredRules(selected.risk_log10_pc, selected.miss_distance_m),
    invalid_inputs,
    upgrade_reasons: upgradeReasons(b, it.forecast),
    model_quality_flags: it.model_quality_flags,
  }
}

// --- Comparisons (SG-02.7 extension) ---------------------------------------------------

function changes(b: Built): ObservationChange[] {
  const out: ObservationChange[] = []
  const obs = b.observations
  for (let i = 1; i < obs.length; i++) {
    const a = obs[i - 1]
    const c = obs[i]
    const ra = triggeredRules(a.risk_log10_pc, a.miss_distance_m)
    const rc = triggeredRules(c.risk_log10_pc, c.miss_distance_m)
    const crossings = [...new Set([...ra, ...rc])].filter((r) => ra.includes(r) !== rc.includes(r)).map((rule) => ({ rule, direction: rc.includes(rule) ? ('entered' as const) : ('left' as const) }))
    const flagsA = [...modelFlagsFor(b, a), ...(a.miss_distance_m === null || a.risk_log10_pc === null ? ['missing_required_input'] : [])]
    const flagsC = [...modelFlagsFor(b, c), ...(c.miss_distance_m === null || c.risk_log10_pc === null ? ['missing_required_input'] : [])]
    const new_flags = flagsC.filter((f) => !flagsA.includes(f))
    const cleared_flags = flagsA.filter((f) => !flagsC.includes(f))
    const tier_before = currentRuleTier(a.risk_log10_pc, a.miss_distance_m)
    const tier_after = currentRuleTier(c.risk_log10_pc, c.miss_distance_m)
    const entered_one_day_window = a.time_to_tca_days > UPCOMING_URGENCY_DAYS && c.time_to_tca_days <= UPCOMING_URGENCY_DAYS
    out.push({
      from_observation_id: a.observation_id,
      to_observation_id: c.observation_id,
      from_update_index: i,
      to_update_index: i + 1,
      tier_before,
      tier_after,
      crossings,
      delta_miss_m: a.miss_distance_m !== null && c.miss_distance_m !== null ? c.miss_distance_m - a.miss_distance_m : null,
      delta_log10_pc: a.risk_log10_pc !== null && c.risk_log10_pc !== null ? c.risk_log10_pc - a.risk_log10_pc : null,
      entered_one_day_window,
      crossed_early_cutoff: a.time_to_tca_days >= EARLY_CUTOFF_DAYS && c.time_to_tca_days < EARLY_CUTOFF_DAYS,
      new_flags,
      cleared_flags,
      significant: tier_before !== tier_after || crossings.length > 0 || entered_one_day_window || new_flags.length > 0,
    })
  }
  return out
}

// --- Review state (SG-02.8 extension), in memory ---------------------------------------

const STORAGE = 'fixture backend: in-memory, lost on reload'
const reviews = new Map<string, { status: ReviewStatus; observation_id: string | null }>()
for (const b of built) if (b.def.review) reviews.set(b.encounter_id, { status: b.def.review.status, observation_id: b.observations[b.def.review.at - 1].observation_id })

function reviewState(b: Built): ReviewState {
  const r = reviews.get(b.encounter_id)
  if (!r || r.status === 'unreviewed' || r.observation_id === null) return { status: 'unreviewed', observation_id: null, needs_renewal: false, renewal_reason: null, storage: STORAGE }
  const reviewedIndex = b.observations.findIndex((o) => o.observation_id === r.observation_id) + 1
  let reason: string | null = null
  for (const c of changes(b)) {
    if (c.to_update_index <= reviewedIndex) continue
    const before = c.tier_before === null ? -1 : TIER_SEVERITY[c.tier_before]
    const after = c.tier_after === null ? -1 : TIER_SEVERITY[c.tier_after]
    if (c.tier_after === null && c.tier_before !== null) reason = `Assessment could not be completed at update ${c.to_update_index}, after the review of update ${reviewedIndex}.`
    else if (after > before) reason = `Tier rose from ${c.tier_before} to ${c.tier_after} at update ${c.to_update_index}, after the review of update ${reviewedIndex}.`
    else if (c.entered_one_day_window) reason = `Closest approach moved inside 1 day at update ${c.to_update_index}, after the review of update ${reviewedIndex}.`
    if (reason) break
  }
  return { status: r.status, observation_id: r.observation_id, needs_renewal: reason !== null, renewal_reason: reason, storage: STORAGE }
}

export function fixtureSetReview(encounterId: string, status: ReviewStatus, observationId: string): ReviewState {
  const b = built.find((x) => x.encounter_id === encounterId)
  if (!b) throw new Error(`No encounter ${encounterId}`)
  if (!b.observations.some((o) => o.observation_id === observationId)) throw new Error(`Observation ${observationId} is not part of ${encounterId}`)
  reviews.set(encounterId, { status, observation_id: status === 'unreviewed' ? null : observationId })
  return reviewState(b)
}

// --- Public fixture API -----------------------------------------------------------------

const BAND_ORDER: PriorityBand[] = ['Immediate', 'High', 'Scheduled', 'Routine', 'Incomplete']

export function fixtureQueue(): QueueResponse {
  // `contracts.triage.sort_upcoming`: upcoming only; within a band by current TCA, then source, then event id.
  const items = built.map(item).filter((i): i is EncounterListItem => i !== null && i.priority !== null)
  items.sort((a, b) => BAND_ORDER.indexOf(a.priority!) - BAND_ORDER.indexOf(b.priority!) || a.time_to_tca_days - b.time_to_tca_days || a.encounter_id.localeCompare(b.encounter_id) || Number(a.encounter_id.split(':')[1]) - Number(b.encounter_id.split(':')[1]))
  return { items, model_version: MODEL_VERSION, policy_version: POLICY_VERSION, triage_policy_version: TRIAGE_POLICY_VERSION, prototype_notice: PROTOTYPE_NOTICE, cohort: FIXTURE_LABEL }
}

export function fixtureEncounter(encounterId: string): EncounterDetail | null {
  const b = built.find((x) => x.encounter_id === encounterId)
  if (!b) return null
  const it = item(b)
  if (!it) return null
  return { item: it, history: history(b), receipt: receipt(b, it), changes: changes(b) }
}

const BIN_EDGES_H: [number, number][] = [[0, 24], [24, 48], [48, 72], [72, 120], [120, 168], [168, 336]]

export function fixtureRadar(): RelativeTimeSummary {
  const view_label = `${FIXTURE_LABEL} · hours relative to each encounter’s own closest approach, not a shared clock`
  const bins = BIN_EDGES_H.map(([start, end]) => ({ start_hours_inclusive: start, end_hours_inclusive: end, encounter_ids: [] as string[], view_label }))
  for (const it of fixtureQueue().items) {
    const h = it.time_to_tca_days * HOURS_PER_DAY
    // Both ends are inclusive; an encounter on a shared boundary is counted once, in the earlier bin.
    const bin = bins.find((b) => h >= b.start_hours_inclusive && h <= b.end_hours_inclusive)
    if (bin) bin.encounter_ids.push(it.encounter_id)
  }
  return { bins, view_label, policy_version: POLICY_VERSION }
}
