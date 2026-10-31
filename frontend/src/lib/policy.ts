// Frontend mirror of `contracts/policy.py`, `contracts/tiers.py`, `contracts/triage.py` (Iain, PRs #18, #19)
// and `backend/risk_classification.py` (PR #20). The backend is the source of truth; these mirrors exist
// so fixtures behave like the contract and so the receipt can show the thresholds it was judged against.
import type { Forecast, PriorityBand, PriorityReason, ReviewDecision, RiskRule, Tier } from '../api/types'

export const EARLY_CUTOFF_DAYS = 2.0
export const HOURS_PER_DAY = 24
export const UPCOMING_URGENCY_DAYS = 1.0

export const CRITICAL_LOG10_PC = -4.0
export const ELEVATED_LOG10_PC = -6.0
export const CRITICAL_MISS_DISTANCE_M = 1000.0
export const ELEVATED_MISS_DISTANCE_M = 5000.0

/** The organisers' floor for a probability too small to compute; a valid input, Safe on probability. */
export const RISK_FLOOR = -30

export const POLICY_VERSION = 'sg-01.2-sg-01.3'
export const TRIAGE_POLICY_VERSION = 'triage-prototype-sg-01.4'
export const PROTOTYPE_NOTICE = 'Prototype review policy for ordering operator attention. It is not a certified operational standard and it is not an instruction to execute a manoeuvre.'

/** Shipped upgrade threshold on p_critical (ml/reports/model_card.md). Not a queue input. */
export const UPGRADE_THRESHOLD_P_CRITICAL = 0.12

export const TIER_SEVERITY: Record<Tier, number> = { Safe: 0, Elevated: 1, Critical: 2 }

export const tcaHours = (days: number | null): number | null => (days === null ? null : days * HOURS_PER_DAY)
export const isEarlyEligible = (days: number) => days >= EARLY_CUTOFF_DAYS

/** `contracts.tiers.current_rule_tier`: critical first; a known trigger survives a missing other input; null is not Safe. */
export function currentRuleTier(log10Pc: number | null, missM: number | null): Tier | null {
  const criticalByProbability = log10Pc !== null && log10Pc >= CRITICAL_LOG10_PC
  const criticalByDistance = missM !== null && missM < CRITICAL_MISS_DISTANCE_M
  if (criticalByProbability || criticalByDistance) return 'Critical'
  const elevatedByProbability = log10Pc !== null && log10Pc >= ELEVATED_LOG10_PC && log10Pc < CRITICAL_LOG10_PC
  const elevatedByDistance = missM !== null && missM >= CRITICAL_MISS_DISTANCE_M && missM <= ELEVATED_MISS_DISTANCE_M
  if (elevatedByProbability || elevatedByDistance) return 'Elevated'
  if (log10Pc !== null && missM !== null && log10Pc < ELEVATED_LOG10_PC && missM > ELEVATED_MISS_DISTANCE_M) return 'Safe'
  return null
}

/** `backend.risk_classification.classify_risk().triggered_rules`: every threshold a valid input met. */
export function triggeredRules(log10Pc: number | null, missM: number | null): RiskRule[] {
  const rules: RiskRule[] = []
  if (log10Pc !== null && Number.isFinite(log10Pc) && log10Pc <= 0) {
    if (log10Pc >= CRITICAL_LOG10_PC) rules.push('probability_critical')
    else if (log10Pc >= ELEVATED_LOG10_PC) rules.push('probability_elevated')
  }
  if (missM !== null && Number.isFinite(missM) && missM >= 0) {
    if (missM < CRITICAL_MISS_DISTANCE_M) rules.push('distance_critical')
    else if (missM <= ELEVATED_MISS_DISTANCE_M) rules.push('distance_elevated')
  }
  return rules
}

export const RULE_META: Record<RiskRule, { kind: 'probability' | 'distance'; tier: Tier; label: string; description: string }> = {
  probability_critical: { kind: 'probability', tier: 'Critical', label: 'Pc ≥ 10⁻⁴', description: `Supplied log₁₀ Pc ≥ ${CRITICAL_LOG10_PC} → Critical` },
  distance_critical: { kind: 'distance', tier: 'Critical', label: 'miss < 1 km', description: `Supplied miss distance < ${CRITICAL_MISS_DISTANCE_M} m → Critical` },
  probability_elevated: { kind: 'probability', tier: 'Elevated', label: 'Pc ≥ 10⁻⁶', description: `Supplied log₁₀ Pc ≥ ${ELEVATED_LOG10_PC} → Elevated` },
  distance_elevated: { kind: 'distance', tier: 'Elevated', label: 'miss ≤ 5 km', description: `Supplied miss distance ≤ ${ELEVATED_MISS_DISTANCE_M} m → Elevated` },
}

function moreSevere(a: Tier | null, b: Tier | null): Tier | null {
  const present = [a, b].filter((t): t is Tier => t !== null)
  if (present.length === 0) return null
  return present.reduce((x, y) => (TIER_SEVERITY[y] > TIER_SEVERITY[x] ? y : x))
}

/** `contracts.triage.assign_review`. Reads tiers, never overwrites them; ignores p_critical. */
export function assignReview(currentRuleTier: Tier | null, currentTcaDays: number, forecast: Forecast): ReviewDecision {
  const forecastTier = forecast.forecast_final_tier
  const prioritisation = moreSevere(currentRuleTier, forecastTier)
  const base = {
    prioritisation_tier: prioritisation,
    current_time_to_tca_days: currentTcaDays,
    source_observation_id: forecast.source_observation_id,
    source_time_to_tca_days: forecast.source_time_to_tca_days,
    forecast_status: forecast.status,
    policy_version: TRIAGE_POLICY_VERSION,
    prototype: true,
  }
  if (currentTcaDays < 0) return { ...base, priority: null, in_upcoming_queue: false, reasons: ['excluded_negative_tca'] }

  const withinOneDay = currentTcaDays <= UPCOMING_URGENCY_DAYS
  const forecastValid = (forecast.status === 'available' || forecast.status === 'carried_forward') && forecastTier !== null
  const routine = prioritisation === 'Safe' && currentRuleTier === 'Safe' && forecastTier === 'Safe' && forecastValid
  let priority: PriorityBand
  if (prioritisation === 'Critical') priority = withinOneDay ? 'Immediate' : 'High'
  else if (prioritisation === 'Elevated') priority = withinOneDay ? 'High' : 'Scheduled'
  else if (routine) priority = 'Routine'
  else priority = 'Incomplete'

  const reasons: PriorityReason[] = []
  if (forecast.status === 'carried_forward') reasons.push('carried_forward')
  if (forecast.status === 'unavailable' || forecast.status === 'unable_to_assess') reasons.push('forecast_not_treated_as_safe')
  if (currentRuleTier !== null && forecastTier !== null && TIER_SEVERITY[currentRuleTier] > TIER_SEVERITY[forecastTier]) reasons.push('current_not_downgraded')
  if (forecastTier !== null && (currentRuleTier === null || TIER_SEVERITY[forecastTier] > TIER_SEVERITY[currentRuleTier])) reasons.push('forecast', 'forecast_escalation')
  else if (currentRuleTier !== null && currentRuleTier === prioritisation) reasons.push('current_evidence')
  if (withinOneDay && (priority === 'Immediate' || priority === 'High')) reasons.push('time_within_one_day')
  if (priority === 'Incomplete') reasons.push('incomplete_review')

  return { ...base, priority, in_upcoming_queue: true, reasons }
}
