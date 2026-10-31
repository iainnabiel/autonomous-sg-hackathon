import type { DataSource, EncounterDetail, QueueResponse, RadarResponse } from './types'
import { fixtureEncounter, fixtureQueue, fixtureRadar } from './fixtures'

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

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(`Could not reach ${API_URL}`)
  }
  if (!res.ok) throw new ApiError(`${path} returned ${res.status}`, res.status)
  return (await res.json()) as T
}

// `?demo=loading|error|empty` previews UI states while on fixtures.
function demoState() {
  return new URLSearchParams(window.location.search).get('demo')
}

async function fixture<T>(produce: () => T): Promise<T> {
  const demo = demoState()
  await new Promise((r) => setTimeout(r, demo === 'loading' ? 1e9 : 350))
  if (demo === 'error') throw new ApiError('Simulated error (fixture mode)')
  return produce()
}

export function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  if (dataSource === 'api') return getJson<QueueResponse>('/queue', signal)
  return fixture(() => (demoState() === 'empty' ? { ...fixtureQueue, items: [] } : fixtureQueue))
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
