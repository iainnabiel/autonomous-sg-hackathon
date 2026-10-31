import type { QueueItem, QueueResponse } from './types'

// DEMONSTRATION DATA — hand-written to exercise every queue band and state.
// Not derived from the dataset or the model. IDs use the `fixture:` source prefix
// so they can never be mistaken for real encounters.

type Row = [
  id: string,
  obs: number,
  priority: QueueItem['priority'],
  tier: QueueItem['risk_tier'],
  log10Pc: number | null,
  missM: number | null,
  tcaH: number | null,
  flags: string[],
  reasons: string[],
]

const rows: Row[] = [
  ['0412', 6, 'immediate', 'critical', -3.21, 640, 6.4, [], ['PC_GE_1E-4', 'MISS_LT_1KM', 'TCA_LE_24H']],
  ['1187', 4, 'immediate', 'critical', -4.62, 820, 18.2, ['IMPUTED_T_SIGMA'], ['MISS_LT_1KM', 'TCA_LE_24H']],
  ['0935', 5, 'immediate', 'critical', -3.87, 2100, 22.9, [], ['PC_GE_1E-4', 'TCA_LE_24H']],
  ['2210', 3, 'high', 'critical', -3.48, 1400, 61.0, [], ['PC_GE_1E-4']],
  ['0078', 7, 'high', 'elevated', -5.12, 3200, 11.5, [], ['PC_GE_1E-6', 'MISS_LE_5KM', 'TCA_LE_24H']],
  ['1653', 2, 'high', 'elevated', -5.84, 4700, 20.1, [], ['PC_GE_1E-6', 'MISS_LE_5KM', 'TCA_LE_24H']],
  ['0301', 4, 'scheduled', 'elevated', -5.37, 2600, 48.3, [], ['PC_GE_1E-6', 'MISS_LE_5KM']],
  ['1920', 3, 'scheduled', 'elevated', -6.41, 4100, 96.0, [], ['MISS_LE_5KM']],
  ['0566', 5, 'scheduled', 'elevated', -5.93, 6800, 130.4, [], ['PC_GE_1E-6']],
  ['2044', 2, 'routine', 'safe', -8.72, 12400, 30.2, [], []],
  ['0819', 6, 'routine', 'safe', -11.2, 26000, 72.7, [], []],
  ['1371', 3, 'routine', 'safe', -14.1, 18500, 160.0, [], []],
  ['0657', 2, 'incomplete', null, null, 2900, 14.0, ['MISSING_COVARIANCE', 'INFERENCE_UNAVAILABLE'], ['ASSESSMENT_INCOMPLETE']],
  ['1504', 1, 'incomplete', null, -7.9, null, 40.5, ['MISSING_MISS_DISTANCE'], ['ASSESSMENT_INCOMPLETE']],
]

export const fixtureQueue: QueueResponse = {
  model_version: 'fixture-model-0',
  policy_version: 'triage-policy-0.1 (prototype)',
  cohort: 'demonstration fixtures',
  items: rows.map(([id, obs, priority, risk_tier, predicted_log10_pc, miss_distance_m, tca_hours, quality_flags, reason_codes]) => ({
    encounter_id: `fixture:${id}`,
    observation_id: `fixture:${id}#${obs}`,
    priority,
    risk_tier,
    predicted_log10_pc,
    miss_distance_m,
    tca_hours,
    quality_flags,
    reason_codes,
  })),
}
