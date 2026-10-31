import type { DataSource, QueueResponse } from './types'
import { fixtureQueue } from './fixtures'

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
function fixtureState() {
  return new URLSearchParams(window.location.search).get('demo')
}

export async function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  if (dataSource === 'api') return getJson<QueueResponse>('/queue', signal)

  const demo = fixtureState()
  await new Promise((r) => setTimeout(r, demo === 'loading' ? 1e9 : 450))
  if (demo === 'error') throw new ApiError('Simulated error (fixture mode)')
  if (demo === 'empty') return { ...fixtureQueue, items: [] }
  return fixtureQueue
}
