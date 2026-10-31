import type { Priority, ReviewStatus, RiskTier, RuleKind } from '../api/types'

export const PRIORITY_ORDER: Priority[] = ['immediate', 'high', 'scheduled', 'routine', 'incomplete']

export const PRIORITY_META: Record<Priority, { label: string; rule: string }> = {
  immediate: { label: 'Immediate', rule: 'Critical, closest approach within 24 h' },
  high: { label: 'High', rule: 'Other critical, or elevated within 24 h' },
  scheduled: { label: 'Scheduled', rule: 'Other elevated' },
  routine: { label: 'Routine', rule: 'Safe with adequate inputs' },
  incomplete: { label: 'Incomplete', rule: 'Assessment could not be completed — needs review' },
}

export const TIER_META: Record<RiskTier | 'unknown', { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'var(--color-critical)' },
  elevated: { label: 'Elevated', color: 'var(--color-elevated)' },
  safe: { label: 'Safe', color: 'var(--color-safe)' },
  unknown: { label: 'Unassessed', color: 'var(--color-unknown)' },
}

export const TIER_LEVEL: Record<RiskTier, number> = { safe: 0, elevated: 1, critical: 2 }

export const RULE_KIND_LABEL: Record<RuleKind, string> = {
  probability: 'Probability',
  distance: 'Distance',
  model: 'Model forecast',
  urgency: 'Urgency',
  quality: 'Data quality',
}

export const REVIEW_ORDER: ReviewStatus[] = ['unreviewed', 'acknowledged', 'escalated']

export const REVIEW_META: Record<ReviewStatus, { label: string; hint: string }> = {
  unreviewed: { label: 'Unreviewed', hint: 'No human has looked at this assessment yet.' },
  acknowledged: { label: 'Acknowledged', hint: 'A human has seen the assessment. Nothing is scheduled.' },
  escalated: { label: 'Escalated for planning', hint: 'Handed to manoeuvre planning for a decision. Does not plan or execute a manoeuvre.' },
}
