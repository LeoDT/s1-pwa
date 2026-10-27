import { useEffect } from 'react'
import { useSession } from '@/features/auth/useSession'
import { flushProgress } from '@/lib/outbox'
import { syncHistoryMirror } from '@/lib/progress'
import { subscribeHistorySync, type HistorySyncRequest } from '@/lib/progressEvents'

const UPLOAD_INTERVAL_MS = 5000
const PULL_INTERVAL_MS = 30_000
const HISTORY_STALE_MS = 10_000
const ACTIVATION_DEDUP_MS = 1000

export function HistorySync() {
  const uid = useSession().data?.uid

  useEffect(() => {
    if (uid == null) return

    let active = true
    let running = false
    let uploadRequested = false
    let pullRequested = false
    let keepaliveRequested = false
    let lastPullAt: number | null = null
    let lastActivationAt = -Infinity
    let uploadTimer: ReturnType<typeof setInterval> | undefined
    let pullTimer: ReturnType<typeof setInterval> | undefined
    const visible = () => document.visibilityState === 'visible'

    const drain = async () => {
      running = true
      try {
        while (active && (uploadRequested || pullRequested)) {
          const keepalive = keepaliveRequested
          keepaliveRequested = false
          uploadRequested = false
          if (!visible() && !keepalive) {
            pullRequested = false
            continue
          }
          try {
            await flushProgress({ keepalive, shouldContinue: () => active })
          } catch {
            // Keep the outbox for the next attempt; reads can still succeed.
          }
          if (!active) return
          if (pullRequested) {
            pullRequested = false
            if (!visible()) continue
            try {
              await syncHistoryMirror(100, () => active)
              if (active) lastPullAt = Date.now()
            } catch {
              // Leave the local mirror available until the next successful pull.
            }
          }
        }
      } finally {
        running = false
      }
    }

    const request = (options: HistorySyncRequest) => {
      if (!active || options.accountId !== uid || (!visible() && !options.keepalive)) return
      if (options.ifStale && lastPullAt !== null && Date.now() - lastPullAt < HISTORY_STALE_MS) return
      uploadRequested = true
      if (options.pull) pullRequested = true
      if (options.keepalive) keepaliveRequested = true
      if (!running) void drain()
    }

    const stopTimers = () => {
      clearInterval(uploadTimer)
      clearInterval(pullTimer)
      uploadTimer = undefined
      pullTimer = undefined
    }
    const activate = () => {
      if (!visible()) return
      if (uploadTimer === undefined) {
        uploadTimer = setInterval(() => request({ accountId: uid }), UPLOAD_INTERVAL_MS)
        pullTimer = setInterval(() => request({ accountId: uid, pull: true }), PULL_INTERVAL_MS)
      }
      if (Date.now() - lastActivationAt < ACTIVATION_DEDUP_MS) return
      lastActivationAt = Date.now()
      request({ accountId: uid, pull: true })
    }
    const onVisibilityChange = () => {
      if (visible()) activate()
      else {
        lastActivationAt = -Infinity
        stopTimers()
      }
    }
    const onOnline = () => request({ accountId: uid, pull: true })
    const unsubscribe = subscribeHistorySync(request)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', activate)
    window.addEventListener('online', onOnline)
    activate()

    return () => {
      active = false
      stopTimers()
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', activate)
      window.removeEventListener('online', onOnline)
    }
  }, [uid])

  return null
}
