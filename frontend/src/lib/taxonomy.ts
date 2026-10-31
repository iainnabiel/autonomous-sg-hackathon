import type { Priority, RiskTier } from '../api/types'

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
