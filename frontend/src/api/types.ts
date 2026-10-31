// Provisional frontend view of the shared contracts.
// SG-01.2 owns the real definitions; replace these once `contracts/` lands.
//
// Shapes follow the shipped model (docs/ML_DECISIONS.md, ml/inference.py):
//   - the organisers' tier rules are applied to the selected observation (rule tier);
//   - a classifier scores whether the encounter will end critical from messages sent
//     at least 2 days before closest approach, and may raise the tier, never lower it;
//   - log10 Pc is a supplied field of each message, not a model output.

export type RiskTier = 'critical' | 'elevated' | 'safe'

/** Queue band from the triage policy (SG-01.4). `incomplete` is the separate review route. */
export type Priority = 'immediate' | 'high' | 'scheduled' | 'routine' | 'incomplete'

/** Whether the rule assessment of the selected observation could be completed. */
export type AssessmentStatus = 'assessed' | 'incomplete'

/**
 * Whether the forecast model produced a score. `unable_to_assess`: no message at least
 * 2 days before closest approach. `unavailable`: inference failed; never a silent default.
 */
export type ModelStatus = 'scored' | 'unable_to_assess' | 'unavailable'

export type ReviewStatus = 'unreviewed' | 'acknowledged' | 'escalated'

/** Human review state (SG-02.8). Never changes risk tier or queue band. */
export interface ReviewState {
  status: ReviewStatus
  /** Observation the review was recorded against; null when unreviewed. */
  observation_id: string | null
  /** Set by the backend when a tier escalation, urgent-window entry, or assessment failure happened after the review. */
  needs_renewal: boolean
  renewal_reason: string | null
  /** Where the backend keeps review state, e.g. "in-memory, lost on restart". */
  storage: string
}

export interface QueueItem {
  /** Source-qualified encounter ID, e.g. `train:1234`. */
  encounter_id: string
  /** Stable ID of the selected observation: smallest non-negative time to closest approach (SG-01.3). */
  observation_id: string
  priority: Priority
  status: AssessmentStatus
  model_status: ModelStatus
  /** Operational tier: rule tier, raised to critical when the model upgraded it. Null when incomplete. */
  risk_tier: RiskTier | null
  /** Organisers' thresholds applied to the selected observation's supplied log10 Pc and miss distance. */
  rule_tier: RiskTier | null
  /** True when the model raised the rule tier to critical. */
  upgraded: boolean
  /** Model score that the encounter ends critical. A ranking score from class-weighted training, not a calibrated probability. */
  p_critical: number | null
  /** Supplied log10(Pc) of the selected observation. −30 is a reporting floor (Pc effectively zero). */
  log10_pc: number | null
  /** Supplied telemetry, not a model output. Metres. */
  miss_distance_m: number | null
  /** Hours until time of closest approach (the dataset supplies days; converted centrally). */
  tca_hours: number | null
  quality_flags: string[]
  reason_codes: string[]
  object_type: string | null
  review: ReviewState
}

export interface QueueResponse {
  items: QueueItem[]
  model_version: string
  policy_version: string
  /** Describes which cohort the queue is drawn from, e.g. "validation (held-out)". */
  cohort: string
}

/** One observation (conjunction message) of an encounter, in update order. */
export interface Observation {
  observation_id: string
  /** 1-based position in message order (decreasing time to closest approach). */
  update_index: number
  tca_hours: number | null
  /** Supplied log10(Pc). −30 is a reporting floor. */
  log10_pc: number | null
  miss_distance_m: number | null
  relative_speed_m_s: number | null
  /** Organisers' rules applied to this message alone. Null if a required input is missing. */
  rule_tier: RiskTier | null
  /** True when the message was sent at least 2 days before closest approach and so could be a model input. */
  model_input: boolean
  quality_flags: string[]
}

/** Relative position of the chaser in the target's RTN frame at closest approach. Metres. */
export interface Geometry {
  r_m: number | null
  t_m: number | null
  n_m: number | null
  relative_speed_m_s: number | null
  /** Supplied radial position sigma of the chaser (c_sigma_r). Only radial sigmas are supplied. */
  c_sigma_r_m: number | null
  /** Supplied radial position sigma of the target (t_sigma_r). */
  t_sigma_r_m: number | null
  /** True when a sigma field held the 6.378136e7 placeholder and was treated as missing. */
  sigma_placeholder: boolean
}

export type RuleKind = 'probability' | 'distance' | 'model' | 'urgency' | 'quality'

export interface ReceiptRule {
  code: string
  kind: RuleKind
  description: string
  triggered: boolean
  /** The value the rule looked at, formatted by the backend, e.g. "640 m". */
  evidence: string | null
}

export interface ReceiptInput {
  field: string
  value: string
  unit: string | null
  /** Which parts of the assessment read this field. */
  used_by: ('rule' | 'model')[]
  imputed: boolean
  /** Backend note, e.g. "placeholder 6.378e7 treated as missing". */
  note: string | null
}

export interface Receipt {
  observation_id: string
  /** Latest observation the model could use (time to closest approach ≥ cutoff). Null when the model had none. */
  model_input_observation_id: string | null
  model_input_count: number
  inputs: ReceiptInput[]
  thresholds: {
    critical_log10_pc: number
    elevated_log10_pc: number
    critical_distance_m: number
    elevated_distance_m: number
    urgent_tca_hours: number
    upgrade_p_critical: number
    model_input_cutoff_hours: number
  }
  rules: ReceiptRule[]
  rule_tier: RiskTier | null
  risk_tier: RiskTier | null
  upgraded: boolean
  p_critical: number | null
  model_status: ModelStatus
  /** Observable facts behind an upgrade, from the backend. Not feature attributions. */
  upgrade_reasons: string[]
  /** Which parts of the policy caused the escalation, so they can be distinguished. */
  escalation_causes: ('probability' | 'distance' | 'model')[]
  urgency_raised_band: boolean
  escalation_summary: string
  /** How each quality flag was handled, keyed by flag code. */
  quality_handling: { flag: string; handling: string }[]
  model_version: string
  model_sha256: string | null
  policy_version: string
}

/** Comparison of one observation with the previous one (SG-02.7). The first observation has no entry. */
export interface ObservationChange {
  from_observation_id: string
  to_observation_id: string
  from_update_index: number
  to_update_index: number
  tier_before: RiskTier | null
  tier_after: RiskTier | null
  /** Threshold rules that started or stopped firing between the two observations. */
  crossings: { code: string; direction: 'entered' | 'left' }[]
  delta_miss_m: number | null
  delta_log10_pc: number | null
  entered_urgent_window: boolean
  /** True when this update is the first one inside the model's 2-day cutoff. */
  crossed_model_cutoff: boolean
  new_flags: string[]
  cleared_flags: string[]
  /** Backend's call: a tier change, threshold crossing, urgent-window entry, or new quality flag. Other deltas are reported but not marked significant. */
  significant: boolean
}

export interface EncounterDetail {
  summary: QueueItem
  history: Observation[]
  /** Null when the backend does not provide comparisons. */
  changes: ObservationChange[] | null
  geometry: Geometry
  receipt: Receipt
}

export interface RadarBin {
  /** Inclusive lower bound in hours to closest approach. */
  from_hours: number
  /** Exclusive upper bound; null for the open-ended last bin. */
  to_hours: number | null
  critical: number
  elevated: number
  safe: number
  incomplete: number
}

export interface RadarResponse {
  bins: RadarBin[]
  cohort: string
  /** Text the backend wants shown with the view, e.g. "historical test window; hours are relative to each encounter's own TCA". */
  caveat: string
}

export type DataSource = 'api' | 'fixture'

// --- Evaluation evidence (SG-03.4 `/metrics`, provisional) -------------------

export type TierLabel = 'Critical' | 'Elevated' | 'Safe'

export interface CohortResult {
  n: number
  confusion_matrix: { labels: TierLabel[]; rows_actual_cols_predicted: number[][] }
  per_tier: Record<TierLabel, { precision: number; recall: number; support: number; predicted: number }>
  critical_recall_95ci: [number, number]
  critical_predicted_safe: number
  false_critical_alarms: number
  /** Reported for completeness; never the headline (predicting everything Safe scores about 0.73). */
  accuracy_not_headline: number
}

export interface ModelResult {
  key: string
  label: string
  role: 'baseline' | 'shipped' | 'comparison'
  model_version: string
  /** Upgrade threshold on p_critical; null for the rule-only baseline. */
  threshold: number | null
  /** Encounters whose tier the model raised to critical (primary cohort); null when not applicable. */
  upgrades: number | null
  cohorts: { primary: CohortResult; all_usable: CohortResult }
  ranking: { roc_auc: number; pr_auc: number } | null
}

export interface RankingCoverage {
  cohort: string
  /** Number of encounters in the imminent (urgent-window) subset; the denominator of the imminent curve. */
  urgent_subset_n: number
  imminent_critical_n: number
  all_critical_n: number
  rankings: {
    key: string
    label: string
    /** [proportion of queue reviewed, proportion of imminent critical encounters covered] pairs. */
    imminent: [number, number][]
    all: [number, number][]
    /** Null when the subset has no positives (marked not applicable, never zero). */
    top_10_20_30_imminent: [number | null, number | null, number | null]
    top_10_20_30_all: [number | null, number | null, number | null]
  }[]
}

export interface MetricsResponse {
  status: 'evaluated' | 'not_evaluated'
  provenance: { source: string; commit: string | null; branch: string | null; bundled_on: string | null; generated_by: string; note: string }
  dataset: { train_sha256: string; split: string; cohort: string; cohort_definition: string }
  model_version: string
  model_sha256: string | null
  policy_version: string
  thresholds: { upgrade_p_critical: number; min_upgrade_precision: number; selection: string }
  models: ModelResult[]
  detection: { model: string; support: number; detected: number; missed: number; missed_as_safe: number; false_alarms: number }[]
  probability_critical: { support: number; rows: { model: string; detected: number; missed: number; false_alarms: number }[]; note: string } | null
  cross_validation: {
    folds: number
    n: number
    support: Record<TierLabel, number>
    thresholds: number[]
    pooled: Record<string, { critical_precision: number; critical_recall: number; critical_f1: number; critical_f2: number; macro_f1: number; false_critical: number; critical_missed_as_safe: number }>
    per_fold: Record<string, { critical_recall: number[] }>
  } | null
  /** SG-03.3 queue-usefulness comparison. Null until evaluated. */
  ranking_coverage: RankingCoverage | null
  sensitivity: {
    model_version: string
    tca_bands: { condition: string; encounters: number; critical: number; rule_recall: number | null; model_recall: number | null; model_precision: number | null; false_critical: number }[]
    masked_inputs: { condition: string; encounters: number; critical: number; rule_recall: number | null; model_recall: number | null; model_precision: number | null; false_critical: number; tiers_changed: number }[]
    importance: { feature: string; mean_drop_pr_auc: number | null; std: number | null }[]
  } | null
  test: { state: 'unavailable' | 'reported'; reason: string }
  limitations: string[]
}
