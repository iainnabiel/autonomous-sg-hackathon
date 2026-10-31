// Provisional frontend view of the shared contracts.
// SG-01.2 owns the real definitions; replace these once `contracts/` lands.

export type RiskTier = 'critical' | 'elevated' | 'safe'

/** Queue band from the triage policy (SG-01.4). `incomplete` is the separate review route. */
export type Priority = 'immediate' | 'high' | 'scheduled' | 'routine' | 'incomplete'

export interface QueueItem {
  /** Source-qualified encounter ID, e.g. `train:1234`. */
  encounter_id: string
  /** Stable ID of the selected observation for this encounter. */
  observation_id: string
  priority: Priority
  /** Null when the assessment could not be completed. */
  risk_tier: RiskTier | null
  /** Model estimate of log10(Pc). Null when inference is unavailable. */
  predicted_log10_pc: number | null
  /** Supplied telemetry, not a model output. Metres. */
  miss_distance_m: number | null
  /** Hours until time of closest approach. */
  tca_hours: number | null
  quality_flags: string[]
  reason_codes: string[]
  object_type: string | null
}

export interface QueueResponse {
  items: QueueItem[]
  model_version: string
  policy_version: string
  /** Describes which cohort the queue is drawn from, e.g. "validation (held-out)". */
  cohort: string
}

/** One observation (update) of an encounter, in update order. */
export interface Observation {
  observation_id: string
  update_index: number
  tca_hours: number | null
  predicted_log10_pc: number | null
  miss_distance_m: number | null
  quality_flags: string[]
}

/** Relative position of the chaser in the target's RTN frame at closest approach. Metres. */
export interface Geometry {
  r_m: number | null
  t_m: number | null
  n_m: number | null
  r_sigma_m: number | null
  t_sigma_m: number | null
  n_sigma_m: number | null
}

export interface ReceiptRule {
  code: string
  /** Which part of the policy fired: probability, distance, urgency, or quality. */
  kind: 'probability' | 'distance' | 'urgency' | 'quality'
  description: string
  triggered: boolean
}

export interface Receipt {
  observation_id: string
  inputs: { field: string; value: string; unit: string | null; imputed: boolean }[]
  estimated_log10_pc: number | null
  thresholds: { critical_log10_pc: number; elevated_log10_pc: number; critical_distance_m: number; elevated_distance_m: number; urgent_tca_hours: number }
  rules: ReceiptRule[]
  escalation_summary: string
  model_version: string
  policy_version: string
}

export interface EncounterDetail {
  summary: QueueItem
  history: Observation[]
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
