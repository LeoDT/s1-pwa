import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { Post, ThreadPage } from '@shared/types'
import { useSession } from '@/features/auth/useSession'
import { requestHistorySync } from '@/lib/progressEvents'
import { createProgressVersion, recordReadingPosition } from '@/lib/progress'
import type { ReadingPosition } from '@shared/types'

/** Position observations are persisted locally once per second. */
const PERSIST_INTERVAL_MS = 1000

type PositionSnapshot = ReadingPosition & { tid: number }

export function useReadingProgress(
  scrollRef: RefObject<HTMLDivElement | null>,
  data: ThreadPage | undefined,
  forumName: string | undefined,
): void {
  const accountId = useSession().data?.uid
  const signedIn = accountId != null
  const accountIdRef = useRef(accountId)
  accountIdRef.current = accountId
  const dataRef = useRef(data)
  const forumNameRef = useRef(forumName)
  const positionRef = useRef<PositionSnapshot | null>(null)
  const savedRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const currentVisitRef = useRef<{ tid: number; uid: number; generation: number } | null>(null)

  useEffect(() => {
    dataRef.current = data
    forumNameRef.current = forumName
  }, [data, forumName])

  useEffect(() => {
    if (!data) return
    if (accountId == null) {
      currentVisitRef.current = null
      positionRef.current = null
      savedRef.current = null
      return
    }
    const visit = { tid: data.tid, uid: accountId, generation: ++generationRef.current }
    currentVisitRef.current = visit
    positionRef.current = null
    savedRef.current = null
  }, [accountId, data?.tid])

  useEffect(() => {
    const root = scrollRef.current
    if (!root || !data) return
    const observedVisit = currentVisitRef.current
    let active = true
    const posts = data.posts
    const order = new Map(posts.map((post, index) => [post.pid, index]))
    const visible = new Set<number>()

    const saveVisiblePosition = () => {
      let best: Post | null = null
      let bestIndex = -1
      for (const pid of visible) {
        const index = order.get(pid) ?? -1
        if (index > bestIndex) {
          bestIndex = index
          best = posts[index] ?? null
        }
      }
      if (active && best && dataRef.current?.tid === data.tid && observedVisit &&
        currentVisitRef.current?.generation === observedVisit.generation && currentVisitRef.current.uid === observedVisit.uid) {
        updatePosition(positionRef, best, data)
      }
    }
    const observer = new IntersectionObserver((entries) => {
      if (!active || dataRef.current?.tid !== data.tid || !observedVisit ||
        currentVisitRef.current?.generation !== observedVisit.generation || currentVisitRef.current.uid !== observedVisit.uid) return
      for (const entry of entries) {
        const pid = Number(entry.target.id.slice(3))
        if (entry.isIntersecting) visible.add(pid)
        else visible.delete(pid)
      }
      saveVisiblePosition()
    }, { root, threshold: 0 })

    for (const element of Array.from(root.querySelectorAll<HTMLElement>('article[id^="pid"]'))) observer.observe(element)
    if (positionRef.current?.tid !== data.tid || positionRef.current.page !== data.page) {
      const first = posts[0]
      if (first) updatePosition(positionRef, first, data)
    }
    return () => {
      active = false
      observer.disconnect()
    }
  }, [accountId, data, scrollRef])

  const persist = useCallback(async () => {
    if (!signedIn) return false
    const current = dataRef.current
    const position = positionRef.current
    if (!current || !position || position.tid !== current.tid) return false
    const signature = `${position.at}:${position.id}`
    if (savedRef.current === signature) return false
    const visit = currentVisitRef.current
    if (!visit || visit.tid !== current.tid || visit.uid !== accountIdRef.current) return false
    try {
      const row = await recordReadingPosition(
        { tid: current.tid, fid: current.fid, forumName: forumNameRef.current ?? '', title: current.title },
        { pid: position.pid, floor: position.floor, page: position.page, totalPages: position.totalPages, at: position.at, id: position.id },
        visit.uid,
      )
      if (!row) return false
      if (currentVisitRef.current?.generation === visit.generation) savedRef.current = signature
      return true
    } catch {
      return false
    }
  }, [accountId, signedIn])

  const persistAndSync = useCallback(async () => {
    if (!signedIn || accountIdRef.current !== accountId || accountId == null) return
    await persist()
    if (accountIdRef.current !== accountId) return
    requestHistorySync({ accountId, keepalive: true })
  }, [accountId, persist, signedIn])

  useEffect(() => {
    const persistTimer = setInterval(() => void persist(), PERSIST_INTERVAL_MS)
    return () => clearInterval(persistTimer)
  }, [persist])

  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') void persistAndSync() }
    const onPageHide = () => void persistAndSync()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [persistAndSync])

  useEffect(() => () => { void persistAndSync() }, [persistAndSync])
}

function updatePosition(ref: { current: PositionSnapshot | null }, post: Post, data: ThreadPage): void {
  const current = ref.current
  if (current?.pid === post.pid && current.floor === post.floor && current.page === data.page && current.totalPages === data.totalPages) return
  ref.current = {
    tid: data.tid,
    pid: post.pid,
    floor: post.floor,
    page: data.page,
    totalPages: data.totalPages,
    ...createProgressVersion(),
  }
}
