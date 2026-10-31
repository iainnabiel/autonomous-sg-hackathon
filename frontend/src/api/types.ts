// Frontend copy of the shared contracts in `contracts/` (Iain, SG-01.2 / SG-01.3 / SG-01.4, PRs #18 and #19)
// and of `backend/risk_classification.py` (SG-02.2, PR #20). Field names, enum values and units follow
// those modules exactly. Anything the contract does not define yet is marked EXTENSION with the task
// that owns it; those fields are optional for the backend and the UI copes when they are absent.

/** Title-case, as in `contracts.tiers.Tier`. */
export type Tier = 'Safe' | 'Elevated' | 'Critical'

/** `contracts.schemas.PriorityBand`. Assigned by the prototype policy in `contracts.triage`. */
export type PriorityBand = 'Immediate' | 'High' | 'Scheduled' | 'Routine' | 'Incomplete'

/** `contracts.forecast.ForecastStatus`. */
export type ForecastStatus = 'available' | 'unable_to_assess' | 'unavailable' | 'carried_forward'

/** `contracts.forecast.ReasonCode`. */
export type ReasonCode = 'no_eligible_observation' | 'unsupported_tca' | 'model_unavailable' | 'forecast_carried_forward' | 'current_critical_trigger' | 'test_final_outcome_absent'

/** `contracts.schemas.QualityFlag`. */
export type QualityFlag = 'imputed_optional_input' | 'missing_required_input' | 'inference_unavailable' | 'carried_forward' | 'sigma_units_unconfirmed'

/** `contracts.triage.PriorityReason`. */
export type PriorityReason =
  | 'current_evidence'
  | 'forecast'
  | 'time_within_one_day'
  | 'current_not_downgraded'
  | 'forecast_escalation'
  | 'incomplete_review'
  | 'forecast_not_treated_as_safe'
  | 'carried_forward'
  | 'excluded_negative_tca'

/** `backend.risk_classification.RiskRule`: which threshold an input met. */
export type RiskRule = 'probability_critical' | 'probability_elevated' | 'distance_critical' | 'distance_elevated'

/** `contracts.schemas.MetricState`. */
export type MetricState = 'reported' | 'not_evaluated' | 'unavailable'

/**
 * `contracts.forecast.Forecast`. One encounter-level forecast of the final tier.
 * `p_critical` is the upgrade classifier's class score: not calibrated, not a collision probability,
 * never a percentage. The current model leaves both predicted-Pc fields null.
 */
export interface Forecast {
  status: ForecastStatus
  forecast_final_tier: Tier | null
  p_critical: number | null
  predicted_final_log10_pc: number | null
  predicted_final_pc: number | null
  /** The eligible early observation the forecast was made from (time_to_tca ≥ 2 days). */
  source_observation_id: string | null
  source_time_to_tca_days: number | null
  model_version: string | null
  reason_codes: ReasonCode[]
}

/** `contracts.observations.Observation`. IDs are `source:row_index`; encounter IDs are `source:event_id`. */
export interface Observation {
  observation_id: string
  encounter_id: string
  /** Days, as supplied. Hours are a display conversion only. */
  time_to_tca_days: number
  /** Supplied log10(Pc) on this message. −30 is the organisers' floor for Pc ≈ 0. */
  risk_log10_pc: number | null
  miss_distance_m: number | null
  relative_speed_m_s: number | null
  relative_position_r_m: number | null
  relative_position_t_m: number | null
  relative_position_n_m: number | null
  /** EXTENSION (dataset columns, sigma units unconfirmed): supplied radial sigmas and object type. */
  c_sigma_r?: number | null
  t_sigma_r?: number | null
  c_object_type?: string | null
  f10?: number | null
  ap?: number | null
}

/** `contracts.triage.ReviewDecision`, minus the fields already on the list item. */
export interface ReviewDecision {
  prioritisation_tier: Tier | null
  priority: PriorityBand | null
  in_upcoming_queue: boolean
  reasons: PriorityReason[]
  current_time_to_tca_days: number
  source_observation_id: string | null
  source_time_to_tca_days: number | null
  forecast_status: ForecastStatus
  /** `triage-prototype-sg-01.4`; separate from the schema policy version. */
  policy_version: string
  prototype: boolean
}

export type ReviewStatus = 'unreviewed' | 'acknowledged' | 'escalated'

/** EXTENSION (SG-02.8, not yet in contracts). Human review state; never changes a tier or band. */
export interface ReviewState {
  status: ReviewStatus
  observation_id: string | null
  needs_renewal: boolean
  renewal_reason: string | null
  storage: string
}

/** `contracts.schemas.EncounterListItem` plus marked extensions. */
export interface EncounterListItem {
  encounter_id: string
  /** Selected observation: smallest non-negative time_to_tca (SG-01.3). */
  observation_id: string
  /** Organiser rules on the selected observation. Null means the inputs cannot place it; null is not Safe. */
  current_rule_tier: Tier | null
  forecast: Forecast
  supplied_risk_log10_pc: number | null
  miss_distance_m: number | null
  time_to_tca_days: number
  /** Null when the observation is excluded from the upcoming queue (negative TCA). */
  priority: PriorityBand | null
  quality_flags: QualityFlag[]
  model_version: string | null
  /** Schema policy version, `sg-01.2-sg-01.3`. */
  policy_version: string
  /** EXTENSION (SG-01.4 decision record): the triage decision behind `priority`. */
  triage: ReviewDecision | null
  /** EXTENSION (dataset `c_object_type`). */
  object_type: string | null
  /** EXTENSION (ml.inference quality flags: sigma_placeholder, space_weather_missing, single_early_message). */
  model_quality_flags: string[]
  /** EXTENSION (SG-02.8). */
  review: ReviewState | null
}

export interface QueueResponse {
  /** Upcoming queue in backend order: band (`contracts.triage.sort_upcoming`), then current TCA, source, event id. */
  items: EncounterListItem[]
  model_version: string | null
  policy_version: string
  triage_policy_version: string
  prototype_notice: string
  /** Which cohort the queue is drawn from, e.g. "validation (held-out)" or "synthetic development fixtures". */
  cohort: string
}

/** `contracts.schemas.HistoryEntry`. */
export interface HistoryEntry {
  observation: Observation
  current_rule_tier: Tier | null
  forecast: Forecast | null
}

/** `contracts.schemas.DecisionReceipt` plus marked extensions. */
export interface DecisionReceipt {
  encounter_id: string
  observation_id: string
  supplied_risk_log10_pc: number | null
  current_rule_tier: Tier | null
  forecast: Forecast
  miss_distance_m: number | null
  time_to_tca_days: number
  quality_flags: QualityFlag[]
  reason_codes: ReasonCode[]
  model_version: string | null
  policy_version: string
  /** Unit statement from the backend. */
  units: string
  /** EXTENSION (SG-02.2 `RiskClassification.triggered_rules`): which thresholds the supplied inputs met. */
  triggered_rules: RiskRule[]
  /** EXTENSION (SG-02.2 `RiskClassification.invalid_inputs`). */
  invalid_inputs: string[]
  /** EXTENSION (ml.inference `upgrade_reasons`): observable facts behind a model upgrade, not attributions. */
  upgrade_reasons: string[]
  /** EXTENSION (ml.inference `quality_flags`). */
  model_quality_flags: string[]
}

/** EXTENSION (SG-02.7, not yet in contracts). Comparison of one observation with the previous one. */
export interface ObservationChange {
  from_observation_id: string
  to_observation_id: string
  from_update_index: number
  to_update_index: number
  tier_before: Tier | null
  tier_after: Tier | null
  crossings: { rule: RiskRule; direction: 'entered' | 'left' }[]
  delta_miss_m: number | null
  delta_log10_pc: number | null
  entered_one_day_window: boolean
  crossed_early_cutoff: boolean
  new_flags: string[]
  cleared_flags: string[]
  significant: boolean
}

/** `contracts.schemas.EncounterDetail` plus marked extensions. */
export interface EncounterDetail {
  item: EncounterListItem
  /** Update order: farther from closest approach first (`history_in_update_order`). */
  history: HistoryEntry[]
  receipt: DecisionReceipt
  /** EXTENSION (SG-02.7). Null when the backend does not provide comparisons. */
  changes: ObservationChange[] | null
}

/** `contracts.schemas.RelativeTimeBin`. Hours are a display conversion of days; both ends inclusive. */
export interface RelativeTimeBin {
  start_hours_inclusive: number
  end_hours_inclusive: number
  encounter_ids: string[]
  view_label: string
}

/** `contracts.schemas.RelativeTimeSummary`. */
export interface RelativeTimeSummary {
  bins: RelativeTimeBin[]
  view_label: string
  policy_version: string
}

/** `contracts.schemas.MetricResult`. Undefined metrics carry a state and a reason, never a zero. */
export interface MetricResult {
  name: string
  value: number | null
  state: MetricState
  reason: string
}

/** `contracts.schemas.EvaluationLabel`. Never an inference payload. */
export interface EvaluationLabel {
  encounter_id: string
  final_tier: Tier
  partition: string
  final_is_early: boolean
}

/** `contracts.schemas.MetricsReport`. */
export interface MetricsReport {
  cohort_label: string
  sample_count: number | null
  model_version: string | null
  policy_version: string
  metrics: MetricResult[]
  labels: EvaluationLabel[]
}

/** `/metrics` (SG-03.4): the contract report, plus the EXTENSION evidence bundle the evaluation page renders. */
export interface MetricsResponse extends MetricsReport {
  evidence: EvidenceBundle | null
}

export type DataSource = 'api' | 'fixture'

// --- EXTENSION: evidence bundle (SG-09.1 proposal for the rich part of /metrics) -------------------

export type TierLabel = Tier

export interface CohortResult {
  n: number
  confusion_matrix: { labels: TierLabel[]; rows_actual_cols_predicted: number[][] }
  per_tier: Record<TierLabel, { precision: number; recall: number; support: number; predicted: number }>
  critical_recall_95ci: [number, number]
  critical_predicted_safe: number
  false_critical_alarms: number
  accuracy_not_headline: number
}

export interface ModelResult {
  key: string
  label: string
  role: 'baseline' | 'shipped' | 'comparison'
  model_version: string
  threshold: number | null
  upgrades: number | null
  cohorts: { primary: CohortResult; all_usable: CohortResult }
  ranking: { roc_auc: number; pr_auc: number } | null
}

export interface RankingCoverage {
  cohort: string
  urgent_subset_n: number
  imminent_critical_n: number
  all_critical_n: number
  rankings: {
    key: string
    label: string
    imminent: [number, number][]
    all: [number, number][]
    top_10_20_30_imminent: [number | null, number | null, number | null]
    top_10_20_30_all: [number | null, number | null, number | null]
  }[]
}

export interface EvidenceBundle {
  status: 'evaluated' | 'not_evaluated'
  provenance: { source: string; commit: string | null; branch: string | null; bundled_on: string | null; generated_by: string; note: string }
  dataset: { train_sha256: string; split: string; cohort: string; cohort_definition: string }
  model_version: string
  model_sha256: string | null
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
