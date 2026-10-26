import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'

/** Explicitly fetch and commit a list replacement without clearing its cached value. */
export function useListRefresh<T>(
  queryKey: QueryKey,
  identity: string | number,
  fetch: () => Promise<T>,
  commit: (data: T, isCurrent: () => boolean) => void | Promise<void>,
  onSuccess?: () => void,
) {
  const client = useQueryClient()
  const identityRef = useRef(identity)
  identityRef.current = identity
  const generation = useRef(0)
  const busyOwner = useRef<string | number | null>(null)
  const [state, setState] = useState<{ identity: string | number; busy: boolean; error: unknown }>(
    { identity, busy: false, error: null },
  )

  useEffect(() => {
    generation.current += 1
    busyOwner.current = null
    setState({ identity, busy: false, error: null })
    return () => {
      // Every cleanup invalidates requests, including unmount while refresh is in flight.
      generation.current += 1
      if (busyOwner.current === identity) busyOwner.current = null
    }
  }, [identity])

  const refresh = useCallback(async () => {
    if (busyOwner.current === identity) return
    busyOwner.current = identity
    const current = ++generation.current
    setState({ identity, busy: true, error: null })
    try {
      await client.cancelQueries({ queryKey })
      if (current !== generation.current || identity !== identityRef.current) return
      const data = await fetch()
      const isCurrent = () => current === generation.current && identity === identityRef.current
      if (!isCurrent()) return
      await commit(data, isCurrent)
      if (isCurrent()) onSuccess?.()
    } catch (error) {
      if (current === generation.current && identity === identityRef.current) {
        setState({ identity, busy: true, error })
      }
    } finally {
      if (current === generation.current && identity === identityRef.current) {
        busyOwner.current = null
        setState((previous) => ({ ...previous, busy: false }))
      }
    }
  }, [client, commit, fetch, identity, onSuccess, queryKey])

  const matches = state.identity === identity
  return {
    refresh,
    refreshing: matches && state.busy,
    error: matches ? state.error : null,
    isBusy: useCallback(() => busyOwner.current === identity, [identity]),
  }
}
