import type {
  EncounterDetail,
  Geometry,
  ModelStatus,
  Observation,
  ObservationChange,
  Priority,
  QueueItem,
  RadarBin,
  RadarResponse,
  Receipt,
  ReceiptInput,
  ReceiptRule,
  ReviewState,
  ReviewStatus,
  RiskTier,
} from './types'

// DEMONSTRATION DATA — hand-written to exercise every queue band, model outcome and state.
// Shaped after the demo cases in ml/reports/model_card.md but not derived from the dataset
// or the model. IDs use the `fixture:` source prefix so they can never be mistaken for real
// encounters. Everything the backend would compute (rule tiers, receipts, comparisons,
// review renewal) is computed here the way SG-02 specifies it, so the UI exercises the contract.

const MODEL_VERSION = 'fixture-upgrade-0'
const MODEL_SHA = null
const POLICY_VERSION = 'triage-policy-0.1 (prototype)'

export const THRESHOLDS = {
  critical_log10_pc: -4,
  elevated_log10_pc: -6,
  critical_distance_m: 1000,
  elevated_distance_m: 5000,
  urgent_tca_hours: 24,
  upgrade_p_critical: 0.12,
  model_input_cutoff_hours: 48,
}

const PC_FLOOR = -30

type Msg = [tcaH: number, log10Pc: number | null, missM: number | null, flags?: string[]]

interface Def {
  id: string
  object: string | null
  /** Case label, shown nowhere in the UI; documents what the fixture is for. */
  case: string
  msgs: Msg[]
  /** Unit direction of the chaser in RTN at closest approach; scaled to the latest miss distance. */
  dir: [r: number, t: number, n: number] | null
  speed: number | null
  /** [c_sigma_r, t_sigma_r] in metres; `placeholder` marks the 6.378136e7 sentinel. */
  sigma: [number | null, number | null]
  placeholder?: boolean
  /** Forecast score; null with a reason when the model could not score. */
  p: number | null
  model: ModelStatus
  weather?: [f10: number | null, ap: number | null]
  review?: { status: ReviewStatus; at: number }
}

const DEFS: Def[] = [
  {
    id: '0412', object: 'DEBRIS', case: 'forecast flagged it at 52 h, before the distance rule fired',
    msgs: [[118, -6.8, 4100], [94.5, -5.9, 2600], [70.2, -5.1, 1900], [52, -4.9, 1500], [22.1, -5.4, 810], [6.4, -5.2, 640]],
    dir: [-0.33, 0.9, 0.2], speed: 14210, sigma: [90, 41], p: 0.41, model: 'scored', weather: [112, 9],
    review: { status: 'acknowledged', at: 4 },
  },
  {
    id: '1187', object: 'ROCKET BODY', case: 'critical by probability and distance; sigma placeholder',
    msgs: [[88, -5.6, 1700], [63.4, -5.2, 1200], [40, -4.9, 900, ['SIGMA_PLACEHOLDER']], [18.2, -3.6, 820, ['SIGMA_PLACEHOLDER']]],
    dir: [0.17, -0.93, 0.32], speed: 11840, sigma: [null, 18], placeholder: true, p: 0.77, model: 'scored', weather: [98, 15],
  },
  {
    id: '0935', object: 'PAYLOAD', case: 'critical by probability only',
    msgs: [[120, -4.3, 3900], [96, -4.1, 3200], [71.5, -3.95, 2600], [47, -3.9, 2300], [22.9, -3.87, 2100]],
    dir: [-0.23, 0.9, -0.36], speed: 7420, sigma: [160, 62], p: 0.63, model: 'scored', weather: [131, 7],
  },
  {
    id: '0873', object: 'DEBRIS', case: 'limitation: looked safe at the 2-day cutoff; a later message revealed critical (after train:8732)',
    msgs: [[161, PC_FLOOR, 42922], [153.5, PC_FLOOR, 42863], [136, PC_FLOOR, 42823], [130, PC_FLOOR, 29069], [114, PC_FLOOR, 28786], [98, PC_FLOOR, 28736], [80, PC_FLOOR, 28631], [65, -13.7, 28637, ['SIGMA_PLACEHOLDER']], [56, PC_FLOOR, 28737], [41.4, PC_FLOOR, 834], [23.8, PC_FLOOR, 820], [17, PC_FLOOR, 828], [9.8, PC_FLOOR, 833], [1.6, PC_FLOOR, 829]],
    dir: [0.12, 0.97, -0.21], speed: 15030, sigma: [4.7, 1.9], p: 0.0, model: 'scored', weather: [74, 4],
  },
  {
    id: '2210', object: 'DEBRIS', case: 'forecast raised the rule tier from elevated to critical; only early messages',
    msgs: [[110, -5.6, 2200], [85, -5.3, 1700], [61, -5.1, 1400]],
    dir: [0.25, -0.92, 0.3], speed: 9870, sigma: [120, 54], p: 0.31, model: 'scored', weather: [104, 12],
    review: { status: 'escalated', at: 3 },
  },
  {
    id: '0566', object: 'DEBRIS', case: 'weak upgrade: score just over the threshold, no dominant signal',
    msgs: [[226, -6.5, 7600], [202, -6.3, 7300], [178, -6.1, 7100], [154, -6.0, 6900], [130.4, -5.93, 6800]],
    dir: [-0.22, 0.93, 0.29], speed: 12100, sigma: [300, 140], p: 0.14, model: 'scored', weather: [88, 22],
  },
  {
    id: '0078', object: 'DEBRIS', case: 'elevated within 24 h',
    msgs: [[150, -7.2, 6100], [126, -6.9, 5400], [100, -6.4, 4800], [76, -6.0, 4200], [52, -5.6, 3700], [29, -5.3, 3400], [11.5, -5.12, 3200]],
    dir: [-0.29, 0.9, 0.33], speed: 13350, sigma: [200, 95], p: 0.05, model: 'scored', weather: [119, 6],
  },
  {
    id: '1653', object: 'UNKNOWN', case: 'single early message',
    msgs: [[50, -5.84, 4700, ['SINGLE_EARLY_MESSAGE']], [20.1, -5.7, 4600, ['SINGLE_EARLY_MESSAGE']]],
    dir: [0.26, -0.91, 0.32], speed: 10420, sigma: [240, 110], p: 0.03, model: 'scored', weather: [93, 18],
  },
  {
    id: '0301', object: 'PAYLOAD', case: 'elevated, later',
    msgs: [[120, -6.0, 3300], [96, -5.7, 3000], [72, -5.5, 2800], [48.3, -5.37, 2600]],
    dir: [-0.25, 0.92, 0.29], speed: 8030, sigma: [150, 70], p: 0.02, model: 'scored', weather: [107, 11],
  },
  {
    id: '1920', object: 'DEBRIS', case: 'elevated by distance only; log10 Pc at the reporting floor',
    msgs: [[144, PC_FLOOR, 4500], [120, PC_FLOOR, 4300], [96, PC_FLOOR, 4100]],
    dir: [0.22, -0.93, 0.3], speed: 14780, sigma: [180, 86], p: 0.01, model: 'scored', weather: [126, 9],
  },
  {
    id: '0244', object: 'PAYLOAD', case: 'space weather missing',
    msgs: [[170, -6.4, 5600], [140, -6.2, 5200, ['SPACE_WEATHER_MISSING']], [96, -5.9, 4900, ['SPACE_WEATHER_MISSING']]],
    dir: [-0.3, 0.9, 0.31], speed: 9120, sigma: [210, 99], p: 0.04, model: 'scored', weather: [null, null],
  },
  {
    id: '2044', object: 'PAYLOAD', case: 'safe',
    msgs: [[54, -8.9, 12900], [30.2, -8.72, 12400]],
    dir: [0.21, -0.93, 0.3], speed: 7740, sigma: [350, 160], p: 0.01, model: 'scored', weather: [101, 13],
  },
  {
    id: '0819', object: 'DEBRIS', case: 'safe, floor',
    msgs: [[192, PC_FLOOR, 27800], [168, PC_FLOOR, 27100], [144, PC_FLOOR, 26600], [120, PC_FLOOR, 26300], [96, PC_FLOOR, 26100], [72.7, PC_FLOOR, 26000]],
    dir: [-0.21, 0.93, 0.3], speed: 13920, sigma: [500, 230], p: 0.0, model: 'scored', weather: [84, 5],
  },
  {
    id: '1371', object: 'ROCKET BODY', case: 'safe',
    msgs: [[208, -13.8, 19200], [184, -14.0, 18800], [160, -14.1, 18500]],
    dir: [0.23, -0.92, 0.32], speed: 11210, sigma: [420, 190], p: 0.0, model: 'scored', weather: [95, 8],
  },
  {
    id: '1504', object: null, case: 'no message ≥ 2 days out: model could not score; rule still applies',
    msgs: [[40.5, -7.9, 3300, ['NO_EARLY_MESSAGE']]],
    dir: [-0.27, 0.91, 0.31], speed: 10650, sigma: [130, 61], p: null, model: 'unable_to_assess', weather: [110, 14],
  },
  {
    id: '0657', object: 'DEBRIS', case: 'incomplete: miss distance not supplied on the latest message',
    msgs: [[38, -6.2, 3400], [14, -7.9, null, ['MISSING_MISS_DISTANCE', 'NO_EARLY_MESSAGE']]],
    dir: null, speed: 12480, sigma: [null, null], p: null, model: 'unable_to_assess', weather: [102, 10],
    review: { status: 'acknowledged', at: 1 },
  },
]

// --- Rules (mirror of SG-02.2; the backend is the source of truth) -----------

const T = THRESHOLDS
const LEVEL: Record<RiskTier, number> = { safe: 0, elevated: 1, critical: 2 }

function ruleTier(pc: number | null, d: number | null): RiskTier | null {
  if (pc === null || d === null) return null
  if (pc >= T.critical_log10_pc || d < T.critical_distance_m) return 'critical'
  if (pc >= T.elevated_log10_pc || d <= T.elevated_distance_m) return 'elevated'
  return 'safe'
}

function thresholdRules(pc: number | null, d: number | null) {
  return {
    'PC_GE_1E-4': pc !== null && pc >= T.critical_log10_pc,
    'MISS_LT_1KM': d !== null && d < T.critical_distance_m,
    'PC_GE_1E-6': pc !== null && pc >= T.elevated_log10_pc && pc < T.critical_log10_pc,
    'MISS_LE_5KM': d !== null && d <= T.elevated_distance_m && d >= T.critical_distance_m,
  }
}

function priorityFor(tier: RiskTier | null, tca: number | null): Priority {
  if (tier === null) return 'incomplete'
  const soon = tca !== null && tca <= T.urgent_tca_hours
  if (tier === 'critical') return soon ? 'immediate' : 'high'
  if (tier === 'elevated') return soon ? 'high' : 'scheduled'
  return 'routine'
}

// --- Derived per-encounter data ----------------------------------------------

function history(def: Def): Observation[] {
  const id = `fixture:${def.id}`
  return def.msgs.map(([tca, pc, miss, flags], i) => ({
    observation_id: `${id}#${i + 1}`,
    update_index: i + 1,
    tca_hours: tca,
    log10_pc: pc,
    miss_distance_m: miss,
    relative_speed_m_s: def.speed,
    rule_tier: ruleTier(pc, miss),
    model_input: tca >= T.model_input_cutoff_hours,
    quality_flags: flags ?? [],
  }))
}

function geometry(def: Def, latest: Observation): Geometry {
  const miss = latest.miss_distance_m
  if (!def.dir || miss === null) {
    return { r_m: null, t_m: null, n_m: null, relative_speed_m_s: def.speed, c_sigma_r_m: def.sigma[0], t_sigma_r_m: def.sigma[1], sigma_placeholder: !!def.placeholder }
  }
  const [r, t, n] = def.dir
  const norm = Math.hypot(r, t, n)
  return {
    r_m: Math.round((r / norm) * miss),
    t_m: Math.round((t / norm) * miss),
    n_m: Math.round((n / norm) * miss),
    relative_speed_m_s: def.speed,
    c_sigma_r_m: def.sigma[0],
    t_sigma_r_m: def.sigma[1],
    sigma_placeholder: !!def.placeholder,
  }
}

function changes(hist: Observation[]): ObservationChange[] {
  const out: ObservationChange[] = []
  for (let i = 1; i < hist.length; i++) {
    const a = hist[i - 1]
    const b = hist[i]
    const ra = thresholdRules(a.log10_pc, a.miss_distance_m)
    const rb = thresholdRules(b.log10_pc, b.miss_distance_m)
    const crossings = (Object.keys(rb) as (keyof typeof rb)[])
      .filter((k) => ra[k] !== rb[k])
      .map((k) => ({ code: k, direction: rb[k] ? ('entered' as const) : ('left' as const) }))
    const new_flags = b.quality_flags.filter((f) => !a.quality_flags.includes(f))
    const cleared_flags = a.quality_flags.filter((f) => !b.quality_flags.includes(f))
    const entered_urgent_window = a.tca_hours !== null && b.tca_hours !== null && a.tca_hours > T.urgent_tca_hours && b.tca_hours <= T.urgent_tca_hours
    out.push({
      from_observation_id: a.observation_id,
      to_observation_id: b.observation_id,
      from_update_index: a.update_index,
      to_update_index: b.update_index,
      tier_before: a.rule_tier,
      tier_after: b.rule_tier,
      crossings,
      delta_miss_m: a.miss_distance_m !== null && b.miss_distance_m !== null ? b.miss_distance_m - a.miss_distance_m : null,
      delta_log10_pc: a.log10_pc !== null && b.log10_pc !== null ? b.log10_pc - a.log10_pc : null,
      entered_urgent_window,
      crossed_model_cutoff: a.model_input && !b.model_input,
      new_flags,
      cleared_flags,
      significant: a.rule_tier !== b.rule_tier || crossings.length > 0 || entered_urgent_window || new_flags.length > 0,
    })
  }
  return out
}

interface Assessment {
  latest: Observation
  rule_tier: RiskTier | null
  risk_tier: RiskTier | null
  upgraded: boolean
  modelInput: Observation | null
  modelInputCount: number
}

function assess(def: Def, hist: Observation[]): Assessment {
  // Selected observation: smallest non-negative time to closest approach (SG-01.3).
  const latest = hist.filter((o) => o.tca_hours !== null && o.tca_hours >= 0).reduce((a, b) => (b.tca_hours! < a.tca_hours! ? b : a))
  const early = hist.filter((o) => o.model_input)
  const rule_tier = latest.rule_tier
  const upgraded = def.model === 'scored' && def.p !== null && def.p >= T.upgrade_p_critical && rule_tier !== null && rule_tier !== 'critical'
  return {
    latest,
    rule_tier,
    risk_tier: rule_tier === null ? null : upgraded ? 'critical' : rule_tier,
    upgraded,
    modelInput: early.length ? early[early.length - 1] : null,
    modelInputCount: early.length,
  }
}

// --- Review state (SG-02.8), kept in memory for the fixture backend -----------

const STORAGE = 'fixture backend: in-memory, lost on reload'
const reviews = new Map<string, { status: ReviewStatus; observation_id: string | null }>()
for (const d of DEFS) if (d.review) reviews.set(`fixture:${d.id}`, { status: d.review.status, observation_id: `fixture:${d.id}#${d.review.at}` })

function reviewState(id: string, hist: Observation[], diffs: ObservationChange[]): ReviewState {
  const r = reviews.get(id)
  if (!r || r.status === 'unreviewed' || r.observation_id === null) return { status: 'unreviewed', observation_id: null, needs_renewal: false, renewal_reason: null, storage: STORAGE }
  const reviewed = hist.find((o) => o.observation_id === r.observation_id)
  let reason: string | null = null
  if (reviewed) {
    for (const c of diffs) {
      if (c.to_update_index <= reviewed.update_index) continue
      const before = c.tier_before === null ? -1 : LEVEL[c.tier_before]
      const after = c.tier_after === null ? -1 : LEVEL[c.tier_after]
      if (c.tier_after === null && c.tier_before !== null) reason = `Assessment could not be completed at update ${c.to_update_index}, after the review of update ${reviewed.update_index}.`
      else if (after > before) reason = `Tier rose from ${c.tier_before} to ${c.tier_after} at update ${c.to_update_index}, after the review of update ${reviewed.update_index}.`
      else if (c.entered_urgent_window) reason = `Closest approach moved inside ${T.urgent_tca_hours} h at update ${c.to_update_index}, after the review of update ${reviewed.update_index}.`
      if (reason) break
    }
  }
  return { status: r.status, observation_id: r.observation_id, needs_renewal: reason !== null, renewal_reason: reason, storage: STORAGE }
}

export function fixtureSetReview(encounterId: string, status: ReviewStatus, observationId: string): ReviewState {
  const def = DEFS.find((d) => `fixture:${d.id}` === encounterId)
  if (!def) throw new Error(`No encounter ${encounterId}`)
  const hist = history(def)
  if (!hist.some((o) => o.observation_id === observationId)) throw new Error(`Observation ${observationId} is not part of ${encounterId}`)
  reviews.set(encounterId, { status, observation_id: status === 'unreviewed' ? null : observationId })
  return reviewState(encounterId, hist, changes(hist))
}

// --- Queue items and receipts -------------------------------------------------

function queueItem(def: Def): QueueItem {
  const id = `fixture:${def.id}`
  const hist = history(def)
  const a = assess(def, hist)
  const fired = thresholdRules(a.latest.log10_pc, a.latest.miss_distance_m)
  const reason_codes = (Object.keys(fired) as (keyof typeof fired)[]).filter((k) => fired[k]) as string[]
  if (a.upgraded) reason_codes.push('MODEL_UPGRADE')
  if (a.latest.tca_hours !== null && a.latest.tca_hours <= T.urgent_tca_hours) reason_codes.push('TCA_LE_24H')
  if (a.rule_tier === null) reason_codes.push('ASSESSMENT_INCOMPLETE')
  return {
    encounter_id: id,
    observation_id: a.latest.observation_id,
    priority: priorityFor(a.risk_tier, a.latest.tca_hours),
    status: a.rule_tier === null ? 'incomplete' : 'assessed',
    model_status: def.model,
    risk_tier: a.risk_tier,
    rule_tier: a.rule_tier,
    upgraded: a.upgraded,
    p_critical: def.model === 'scored' ? def.p : null,
    log10_pc: a.latest.log10_pc,
    miss_distance_m: a.latest.miss_distance_m,
    tca_hours: a.latest.tca_hours,
    quality_flags: a.latest.quality_flags,
    reason_codes,
    object_type: def.object,
    review: reviewState(id, hist, changes(hist)),
  }
}

const HANDLING: Record<string, string> = {
  SIGMA_PLACEHOLDER: 'A radial sigma held the 6.378136e7 placeholder and was treated as missing. No uncertainty band is drawn. Sigma is supplied covariance, not model confidence.',
  SPACE_WEATHER_MISSING: 'F10 and/or AP were not supplied. The model handles missing values natively; nothing was imputed.',
  SINGLE_EARLY_MESSAGE: 'Only one message at least 2 days out, so trend features are undefined. The forecast rests on a single message.',
  NO_EARLY_MESSAGE: 'No message at least 2 days before closest approach, so the model could not score this encounter. The tier comes from the rules alone.',
  MISSING_MISS_DISTANCE: 'Miss distance is a required input. The distance rule could not run, so the assessment is incomplete and routed for review. It is never treated as safe.',
}

function upgradeReasons(hist: Observation[], a: Assessment): string[] {
  if (!a.upgraded) return []
  const early = hist.filter((o) => o.model_input && o.miss_distance_m !== null)
  const latest = early[early.length - 1]
  const reasons: string[] = []
  const minMiss = Math.min(...early.map((o) => o.miss_distance_m!))
  if (latest && minMiss < T.critical_distance_m && latest.miss_distance_m! >= T.critical_distance_m) reasons.push(`an earlier early message was ${minMiss} m apart (< ${T.critical_distance_m} m)`)
  if (latest && latest.miss_distance_m! <= 2 * T.critical_distance_m) reasons.push(`latest early miss distance ${latest.miss_distance_m} m is within 2 km`)
  if (early.length >= 2) {
    const first = early[0]
    const slope = (first.miss_distance_m! - latest.miss_distance_m!) / ((first.tca_hours! - latest.tca_hours!) / 24)
    if (slope > 0) reasons.push(`miss distance shrinking about ${Math.round(slope / 10) * 10} m per day closer to TCA`)
  }
  const pcs = early.map((o) => o.log10_pc).filter((v): v is number => v !== null)
  if (pcs.length >= 2 && pcs[pcs.length - 1] - pcs[0] > 1) reasons.push(`log10 Pc rose by ${(pcs[pcs.length - 1] - pcs[0]).toFixed(1)} across early messages`)
  return reasons.length ? reasons : ['model score above threshold; no single dominant signal']
}

const fmt = (v: number | null, digits = 0) => (v === null ? 'not supplied' : v.toFixed(digits))

function receipt(def: Def, hist: Observation[], a: Assessment, geo: Geometry): Receipt {
  const { latest } = a
  const pc = latest.log10_pc
  const d = latest.miss_distance_m
  const tca = latest.tca_hours
  const fired = thresholdRules(pc, d)
  const scored = def.model === 'scored' && def.p !== null
  const p = scored ? def.p! : null

  let modelEvidence: string
  if (!scored) modelEvidence = def.model === 'unable_to_assess' ? 'no score: no message ≥ 2 d before closest approach' : 'no score: inference unavailable'
  else if (a.upgraded) modelEvidence = `score ${p!.toFixed(2)} ≥ ${T.upgrade_p_critical} · rule tier ${a.rule_tier} raised to critical`
  else if (a.rule_tier === 'critical') modelEvidence = `score ${p!.toFixed(2)} · rule tier already critical, nothing to raise`
  else if (a.rule_tier === null) modelEvidence = `score ${p!.toFixed(2)} · no rule tier to raise`
  else modelEvidence = `score ${p!.toFixed(2)} < ${T.upgrade_p_critical}`

  const rules: ReceiptRule[] = [
    { code: 'PC_GE_1E-4', kind: 'probability', description: `Supplied log₁₀ Pc ≥ ${T.critical_log10_pc} → critical`, triggered: fired['PC_GE_1E-4'], evidence: pc === null ? 'log₁₀ Pc not supplied' : `log₁₀ Pc = ${pc.toFixed(2)}${pc === PC_FLOOR ? ' (reporting floor)' : ''}` },
    { code: 'MISS_LT_1KM', kind: 'distance', description: `Supplied miss distance < ${T.critical_distance_m / 1000} km → critical`, triggered: fired['MISS_LT_1KM'], evidence: d === null ? 'miss distance not supplied' : `miss = ${d} m` },
    { code: 'PC_GE_1E-6', kind: 'probability', description: `Supplied log₁₀ Pc ≥ ${T.elevated_log10_pc} → at least elevated`, triggered: fired['PC_GE_1E-6'], evidence: pc === null ? 'log₁₀ Pc not supplied' : `log₁₀ Pc = ${pc.toFixed(2)}` },
    { code: 'MISS_LE_5KM', kind: 'distance', description: `Supplied miss distance ≤ ${T.elevated_distance_m / 1000} km → at least elevated`, triggered: fired['MISS_LE_5KM'], evidence: d === null ? 'miss distance not supplied' : `miss = ${d} m` },
    { code: 'MODEL_UPGRADE', kind: 'model', description: `Forecast score ≥ ${T.upgrade_p_critical} raises a safe or elevated rule tier to critical. It never lowers a tier.`, triggered: a.upgraded, evidence: modelEvidence },
    { code: 'TCA_LE_24H', kind: 'urgency', description: `Closest approach within ${T.urgent_tca_hours} h → raises the queue band, not the tier`, triggered: tca !== null && tca <= T.urgent_tca_hours, evidence: tca === null ? 'time to closest approach not supplied' : `${tca.toFixed(1)} h to closest approach` },
    { code: 'ASSESSMENT_INCOMPLETE', kind: 'quality', description: 'A required input is missing → routed to incomplete review, never safe', triggered: a.rule_tier === null, evidence: a.rule_tier === null ? 'miss distance not supplied' : 'all required inputs present' },
  ]

  const causes: Receipt['escalation_causes'] = []
  if (a.risk_tier === 'critical') {
    if (fired['PC_GE_1E-4']) causes.push('probability')
    if (fired['MISS_LT_1KM']) causes.push('distance')
    if (a.upgraded) causes.push('model')
  } else if (a.risk_tier === 'elevated') {
    if (fired['PC_GE_1E-6']) causes.push('probability')
    if (fired['MISS_LE_5KM']) causes.push('distance')
  }
  const urgent = tca !== null && tca <= T.urgent_tca_hours && a.risk_tier !== null && a.risk_tier !== 'safe'

  const causeText = causes.map((c) => (c === 'probability' ? `supplied probability (log₁₀ Pc ${pc!.toFixed(2)})` : c === 'distance' ? `supplied miss distance (${d} m)` : `the model forecast (score ${p!.toFixed(2)})`)).join(' and ')
  let modelText: string
  if (!scored) modelText = def.model === 'unable_to_assess' ? 'No forecast: there is no message at least 2 days before closest approach.' : 'No forecast: inference was unavailable.'
  else if (a.upgraded) modelText = `The forecast raised the rule tier from ${a.rule_tier} to critical.`
  else if (a.rule_tier === 'critical' && p! >= T.upgrade_p_critical) modelText = `The forecast score (${p!.toFixed(2)}) also exceeds the upgrade threshold.`
  else if (a.rule_tier === 'critical' && !latest.model_input) modelText = `The forecast score was ${p!.toFixed(2)} at the 2-day cutoff: the early messages carried no warning. The critical tier comes from the latest message alone.`
  else modelText = `The forecast score (${p!.toFixed(2)}) is below the upgrade threshold, so the tier comes from the rules alone.`

  let summary: string
  if (a.rule_tier === null) summary = 'Assessment incomplete: miss distance was not supplied, so the distance rule could not run. Routed for manual review rather than treated as safe.'
  else if (a.risk_tier === 'safe') summary = `No probability or distance rule fired on the latest message. ${modelText} Kept in routine monitoring.`
  else summary = `${a.risk_tier === 'critical' ? 'Critical' : 'Elevated'} because of ${causeText}. ${modelText} ${urgent ? `Closest approach inside ${T.urgent_tca_hours} h moved it up a band.` : `Not inside the ${T.urgent_tca_hours} h window, so urgency did not change the band.`}`

  const used = (rule: boolean, model: boolean): ReceiptInput['used_by'] => [...(rule ? (['rule'] as const) : []), ...(model && scored ? (['model'] as const) : [])]
  const [f10, ap] = def.weather ?? [null, null]
  const inputs: ReceiptInput[] = [
    { field: 'time_to_tca', value: fmt(tca, 1), unit: 'h', used_by: used(true, true), imputed: false, note: 'supplied in days; converted to hours' },
    { field: 'risk', value: fmt(pc, 2), unit: 'log₁₀ Pc', used_by: used(true, true), imputed: false, note: pc === PC_FLOOR ? 'reporting floor: Pc too small to compute' : 'supplied with the message, not a model output' },
    { field: 'miss_distance', value: fmt(d), unit: 'm', used_by: used(true, true), imputed: false, note: d === null ? 'required input missing' : null },
    { field: 'relative_speed', value: fmt(geo.relative_speed_m_s), unit: 'm/s', used_by: used(false, true), imputed: false, note: null },
    { field: 'relative_position_r', value: fmt(geo.r_m), unit: 'm', used_by: used(false, true), imputed: false, note: null },
    { field: 'relative_position_t', value: fmt(geo.t_m), unit: 'm', used_by: used(false, true), imputed: false, note: null },
    { field: 'relative_position_n', value: fmt(geo.n_m), unit: 'm', used_by: used(false, true), imputed: false, note: null },
    { field: 'c_sigma_r', value: geo.sigma_placeholder && geo.c_sigma_r_m === null ? '6.378136e7' : fmt(geo.c_sigma_r_m, 1), unit: 'm', used_by: used(false, true), imputed: false, note: geo.sigma_placeholder && geo.c_sigma_r_m === null ? 'placeholder treated as missing' : null },
    { field: 't_sigma_r', value: fmt(geo.t_sigma_r_m, 1), unit: 'm', used_by: used(false, true), imputed: false, note: null },
    { field: 'c_object_type', value: def.object ?? 'not supplied', unit: null, used_by: used(false, true), imputed: false, note: null },
    { field: 'F10', value: fmt(f10), unit: 'sfu', used_by: used(false, true), imputed: false, note: f10 === null ? 'space weather missing' : null },
    { field: 'AP', value: fmt(ap), unit: null, used_by: used(false, true), imputed: false, note: ap === null ? 'space weather missing' : null },
  ]

  const flags = new Set<string>(latest.quality_flags)
  if (!scored && def.model === 'unable_to_assess') flags.add('NO_EARLY_MESSAGE')

  return {
    observation_id: latest.observation_id,
    model_input_observation_id: a.modelInput?.observation_id ?? null,
    model_input_count: a.modelInputCount,
    inputs,
    thresholds: THRESHOLDS,
    rules,
    rule_tier: a.rule_tier,
    risk_tier: a.risk_tier,
    upgraded: a.upgraded,
    p_critical: p,
    model_status: def.model,
    upgrade_reasons: upgradeReasons(hist, a),
    escalation_causes: causes,
    urgency_raised_band: urgent,
    escalation_summary: summary,
    quality_handling: [...flags].map((flag) => ({ flag, handling: HANDLING[flag] ?? 'No handling note from the backend.' })),
    model_version: MODEL_VERSION,
    model_sha256: MODEL_SHA,
    policy_version: POLICY_VERSION,
  }
}

// --- Public fixture API ---------------------------------------------------------

export function fixtureQueue() {
  const items = DEFS.map(queueItem)
  // Backend ordering: band, then soonest closest approach, then encounter ID for determinism.
  const order: Priority[] = ['immediate', 'high', 'scheduled', 'routine', 'incomplete']
  items.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority) || (a.tca_hours ?? Infinity) - (b.tca_hours ?? Infinity) || a.encounter_id.localeCompare(b.encounter_id))
  return { model_version: MODEL_VERSION, policy_version: POLICY_VERSION, cohort: 'demonstration fixtures', items }
}

export function fixtureEncounter(encounterId: string): EncounterDetail | null {
  const def = DEFS.find((d) => `fixture:${d.id}` === encounterId)
  if (!def) return null
  const hist = history(def)
  const a = assess(def, hist)
  const geo = geometry(def, a.latest)
  return { summary: queueItem(def), history: hist, changes: changes(hist), geometry: geo, receipt: receipt(def, hist, a, geo) }
}

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
  for (const item of fixtureQueue().items) {
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
