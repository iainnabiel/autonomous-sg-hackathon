import type { ForecastStatus, PriorityBand, PriorityReason, QualityFlag, ReasonCode, ReviewStatus, Tier } from '../api/types'

export const PRIORITY_ORDER: PriorityBand[] = ['Immediate', 'High', 'Scheduled', 'Routine', 'Incomplete']

export const PRIORITY_META: Record<PriorityBand, { label: string; rule: string }> = {
  Immediate: { label: 'Immediate', rule: 'Critical, closest approach within 1 day' },
  High: { label: 'High', rule: 'Other Critical, or Elevated within 1 day' },
  Scheduled: { label: 'Scheduled', rule: 'Other Elevated' },
  Routine: { label: 'Routine', rule: 'Current Safe and a valid Safe forecast' },
  Incomplete: { label: 'Incomplete', rule: 'Missing evidence or forecast — never filed as Routine' },
}

export const TIER_ORDER: Tier[] = ['Critical', 'Elevated', 'Safe']

export const TIER_META: Record<Tier | 'unknown', { label: string; color: string }> = {
  Critical: { label: 'Critical', color: 'var(--color-critical)' },
  Elevated: { label: 'Elevated', color: 'var(--color-elevated)' },
  Safe: { label: 'Safe', color: 'var(--color-safe)' },
  unknown: { label: 'Unrated', color: 'var(--color-unknown)' },
}

export const FORECAST_STATUS_META: Record<ForecastStatus, { label: string; hint: string }> = {
  available: { label: 'available', hint: 'Forecast made from this observation, which is at least 2 days before closest approach.' },
  carried_forward: { label: 'carried forward', hint: 'Forecast made earlier from an eligible observation and reused here; the model is not run inside 2 days.' },
  unable_to_assess: { label: 'unable to assess', hint: 'No observation at least 2 days before closest approach, so the model had nothing to score. Not treated as Safe.' },
  unavailable: { label: 'unavailable', hint: 'Inference failed explicitly. Nothing was substituted. Not treated as Safe.' },
}

export const REASON_META: Record<PriorityReason, string> = {
  current_evidence: 'the current observation’s own rule tier set the band',
  forecast: 'the forecast final tier set the band',
  forecast_escalation: 'the forecast is more severe than the current rule tier',
  current_not_downgraded: 'the current rule tier is more severe than the forecast and was not downgraded',
  time_within_one_day: 'closest approach is within 1 day, so the band moved up',
  incomplete_review: 'routed to the incomplete band for review',
  forecast_not_treated_as_safe: 'the missing forecast was not treated as Safe',
  carried_forward: 'the forecast was carried forward from an earlier observation',
  excluded_negative_tca: 'closest approach has passed; excluded from the upcoming queue',
}

export const REASON_CODE_META: Record<ReasonCode, string> = {
  no_eligible_observation: 'no observation at least 2 days before closest approach',
  unsupported_tca: 'inference refused: the observation is inside the 2-day cutoff',
  model_unavailable: 'inference failed; no forecast substituted',
  forecast_carried_forward: 'forecast reused from its source observation',
  current_critical_trigger: 'a Critical trigger on the current observation stays visible even with a null forecast',
  test_final_outcome_absent: 'test messages have no final outcome',
}

export const QUALITY_FLAG_META: Record<QualityFlag, string> = {
  imputed_optional_input: 'An optional input was imputed; the receipt names it.',
  missing_required_input: 'A required input is missing. The rule could not complete; the assessment is never treated as Safe.',
  inference_unavailable: 'Inference failed. No score or tier was substituted.',
  carried_forward: 'The forecast shown was made from an earlier eligible observation.',
  sigma_units_unconfirmed: 'Sigma units are not stated in the organiser notes; drawn as supplied, labelled unconfirmed.',
}

/** ml.inference quality flags (EXTENSION). */
export const MODEL_FLAG_META: Record<string, string> = {
  sigma_placeholder: 'A radial sigma held the 6.378136e7 placeholder and was treated as missing by the model. Sigma is supplied covariance, not model confidence.',
  space_weather_missing: 'F10 and/or AP were not supplied. The model handles missing values natively; nothing was imputed.',
  single_early_message: 'Only one message at least 2 days out, so trend features are undefined; the forecast rests on one message.',
}

export const REVIEW_ORDER: ReviewStatus[] = ['unreviewed', 'acknowledged', 'escalated']

export const REVIEW_META: Record<ReviewStatus, { label: string; hint: string }> = {
  unreviewed: { label: 'Unreviewed', hint: 'No human has looked at this assessment yet.' },
  acknowledged: { label: 'Acknowledged', hint: 'A human has seen the assessment. Nothing is scheduled.' },
  escalated: { label: 'Escalated for planning', hint: 'Handed to manoeuvre planning for a decision. Does not plan or execute a manoeuvre.' },
}
