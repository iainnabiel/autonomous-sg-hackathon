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
}

export interface QueueResponse {
  items: QueueItem[]
  model_version: string
  policy_version: string
  /** Describes which cohort the queue is drawn from, e.g. "validation (held-out)". */
  cohort: string
}

export type DataSource = 'api' | 'fixture'
