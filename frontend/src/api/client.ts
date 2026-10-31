import type { DataSource, EncounterDetail, MetricsResponse, QueueResponse, RelativeTimeSummary, ReviewState, ReviewStatus } from './types'
import bundledEvidence from '../evidence/validation.json'
import { fixtureEncounter, fixtureQueue, fixtureRadar, fixtureSetReview } from './fixtures'

const API_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')

/** Fixtures are used only when no API URL is configured — never as a fallback for a failing API. */
export const dataSource: DataSource = API_URL ? 'api' : 'fixture'
export const apiUrl = API_URL

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, signal, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(`Could not reach ${API_URL}`)
  }
  if (!res.ok) throw new ApiError(`${path} returned ${res.status}`, res.status)
  return (await res.json()) as T
}

const getJson = <T,>(path: string, signal?: AbortSignal) => request<T>(path, {}, signal)

// `?demo=loading|error|empty` previews UI states while on fixtures.
function demoState() {
  return new URLSearchParams(window.location.search).get('demo')
}

async function fixture<T>(produce: () => T, delay = 350): Promise<T> {
  const demo = demoState()
  await new Promise((r) => setTimeout(r, demo === 'loading' ? 1e9 : delay))
  if (demo === 'error') throw new ApiError('Simulated error (fixture mode)')
  return produce()
}

/** `GET /queue` → upcoming encounters in band order (SG-02.4). */
export function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  if (dataSource === 'api') return getJson<QueueResponse>('/queue', signal)
  return fixture(() => (demoState() === 'empty' ? { ...fixtureQueue(), items: [] } : fixtureQueue()))
}

/** `GET /encounters/:id` → item, history in update order, receipt, and comparisons when the backend has them. */
export function fetchEncounter(id: string, signal?: AbortSignal): Promise<EncounterDetail> {
  if (dataSource === 'api') return getJson<EncounterDetail>(`/encounters/${encodeURIComponent(id)}`, signal)
  return fixture(() => {
    const d = fixtureEncounter(id)
    if (!d) throw new ApiError(`No encounter ${id}`, 404)
    return d
  })
}

/** `GET /radar` → `RelativeTimeSummary` (SG-02.5): inclusive hour bins holding encounter IDs. */
export function fetchRadar(signal?: AbortSignal): Promise<RelativeTimeSummary> {
  if (dataSource === 'api') return getJson<RelativeTimeSummary>('/radar', signal)
  return fixture(fixtureRadar)
}

/**
 * `GET /metrics` → `MetricsReport` plus the evidence bundle (SG-03.4). A 404 is "not evaluated".
 * Without an API, the committed ml/reports are served as a bundled artifact (scripts/bundle_evidence.py):
 * real validation numbers labelled with their source commit, never demonstration data.
 */
export async function fetchMetrics(signal?: AbortSignal): Promise<MetricsResponse> {
  if (dataSource === 'api') {
    try {
      return await getJson<MetricsResponse>('/metrics', signal)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return notEvaluated('The backend has no /metrics endpoint yet (SG-03.4).')
      throw err
    }
  }
  return fixture(() => bundledEvidence as unknown as MetricsResponse)
}

function notEvaluated(reason: string): MetricsResponse {
  return { cohort_label: 'not evaluated', sample_count: null, model_version: null, policy_version: '', metrics: [{ name: 'evaluation', value: null, state: 'not_evaluated', reason }], labels: [], evidence: null }
}

/**
 * `POST /encounters/:id/review` (SG-02.8, EXTENSION: not yet in contracts). Records a human review status
 * against an observation; the backend decides renewal. Status never changes a tier or a band.
 */
export function setReview(encounterId: string, status: ReviewStatus, observationId: string): Promise<ReviewState> {
  if (dataSource === 'api') {
    return request<ReviewState>(`/encounters/${encodeURIComponent(encounterId)}/review`, { method: 'POST', body: JSON.stringify({ status, observation_id: observationId }) })
  }
  return fixture(() => fixtureSetReview(encounterId, status, observationId), 250)
}
