import { useCallback, useEffect, useState } from 'react'
import { fetchQueue } from './client'
import type { QueueResponse } from './types'

export type QueueState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: QueueResponse }

export function useQueue() {
  const [state, setState] = useState<QueueState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    fetchQueue(ctrl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      })
    return () => ctrl.abort()
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}
