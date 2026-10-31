import type { DataSource, EncounterDetail, MetricsResponse, QueueResponse, RadarResponse, ReviewState, ReviewStatus } from './types'
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

export function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  if (dataSource === 'api') return getJson<QueueResponse>('/queue', signal)
  return fixture(() => (demoState() === 'empty' ? { ...fixtureQueue(), items: [] } : fixtureQueue()))
}

export function fetchEncounter(id: string, signal?: AbortSignal): Promise<EncounterDetail> {
  if (dataSource === 'api') return getJson<EncounterDetail>(`/encounters/${encodeURIComponent(id)}`, signal)
  return fixture(() => {
    const d = fixtureEncounter(id)
    if (!d) throw new ApiError(`No encounter ${id}`, 404)
    return d
  })
}

export function fetchRadar(signal?: AbortSignal): Promise<RadarResponse> {
  if (dataSource === 'api') return getJson<RadarResponse>('/radar', signal)
  return fixture(fixtureRadar)
}

/**
 * Record a human review status against an observation (SG-02.8). The backend decides
 * renewal; the response is the stored state. Status never changes risk tier or band.
 */
export function setReview(encounterId: string, status: ReviewStatus, observationId: string): Promise<ReviewState> {
  if (dataSource === 'api') {
    return request<ReviewState>(`/encounters/${encodeURIComponent(encounterId)}/review`, { method: 'POST', body: JSON.stringify({ status, observation_id: observationId }) })
  }
  return fixture(() => fixtureSetReview(encounterId, status, observationId), 250)
}

/**
 * Evaluation evidence (SG-03.4). Against an API, a 404 means "not evaluated" and is shown as such.
 * Without an API, the committed ml/reports are served as a bundled artifact (see scripts/bundle_evidence.py):
 * real validation numbers, labelled with their source commit, never demonstration data.
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
  return {
    status: 'not_evaluated',
    provenance: { source: 'none', commit: null, branch: null, bundled_on: null, generated_by: 'none', note: reason },
    dataset: { train_sha256: '', split: '', cohort: '', cohort_definition: '' },
    model_version: '',
    model_sha256: null,
    policy_version: '',
    thresholds: { upgrade_p_critical: NaN, min_upgrade_precision: NaN, selection: '' },
    models: [],
    detection: [],
    probability_critical: null,
    cross_validation: null,
    ranking_coverage: null,
    sensitivity: null,
    test: { state: 'unavailable', reason },
    limitations: [],
  }
}
