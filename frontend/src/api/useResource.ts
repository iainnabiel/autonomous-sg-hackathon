import { useCallback, useEffect, useState } from 'react'

export type ResourceState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }

/** Fetches once per `key`, with abort on unmount and a manual retry. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    load(ctrl.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      })
    return () => ctrl.abort()
    // `load` is expected to be stable for a given key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}
