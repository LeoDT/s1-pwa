/**
 * 阅读位置记录：IntersectionObserver 取「最靠下的可见楼层」。
 * 本地（progress 镜像 + outbox）每 1s 落盘一次，远端 PUT 每 5s 一次；
 * 两者都在切后台/关页/离开路由时立即执行。见 docs/data-model.md §6.2。
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Post, ProgressRow, ThreadPage } from '@shared/types'
import { useSession } from '@/features/auth/useSession'
import { flushProgress, queueProgress } from '@/lib/outbox'

/** 本地落盘节拍：只受 IDB 制约，用来把崩溃丢失窗口压到 1s 级 */
const PERSIST_INTERVAL_MS = 1000
/** 远端 PUT 节拍：与本地解耦，避免请求风暴 */
const FLUSH_INTERVAL_MS = 5000

interface ReadingPosition {
  pid: number
  floor: number | null
  page: number
}

export function useReadingProgress(
  scrollRef: RefObject<HTMLDivElement | null>,
  data: ThreadPage | undefined,
  forumName: string | undefined,
): void {
  const queryClient = useQueryClient()
  const session = useSession()
  const signedIn = Boolean(session.data)
  const dataRef = useRef<ThreadPage | undefined>(data)
  const forumNameRef = useRef(forumName)
  const positionRef = useRef<ReadingPosition | null>(null)
  /** 进入帖子时的回复数快照，本次阅读内不随刷新变化（data-model §7） */
  const entryRepliesRef = useRef<{ tid: number; replies: number } | null>(null)
  /** 已落盘的签名，楼层/页码没变就不重复写 */
  const savedRef = useRef<string | null>(null)

  useEffect(() => {
    dataRef.current = data
    forumNameRef.current = forumName
  }, [data, forumName])

  useEffect(() => {
    if (!data) return
    if (entryRepliesRef.current?.tid !== data.tid) {
      entryRepliesRef.current = { tid: data.tid, replies: data.replies }
    }
  }, [data])

  // 观察当前页的楼层；视口内最靠下的一楼记为已读位置
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !data) return

    const posts = data.posts
    const order = new Map(posts.map((post, index) => [post.pid, index]))
    const visible = new Set<number>()

    const update = () => {
      let best: Post | null = null
      let bestIndex = -1
      for (const pid of visible) {
        const index = order.get(pid) ?? -1
        if (index > bestIndex) {
          bestIndex = index
          best = posts[index] ?? null
        }
      }
      if (best) positionRef.current = { pid: best.pid, floor: best.floor, page: data.page }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pid = Number(entry.target.id.slice(3))
          if (entry.isIntersecting) visible.add(pid)
          else visible.delete(pid)
        }
        update()
      },
      { root, threshold: 0 },
    )

    const elements = Array.from(root.querySelectorAll<HTMLElement>('article[id^="pid"]'))
    for (const element of elements) observer.observe(element)

    // 翻到新页时先以首楼为锚点，避免把上一页的位置写到新页上
    if (positionRef.current?.page !== data.page) {
      const first = posts[0]
      positionRef.current = first ? { pid: first.pid, floor: first.floor, page: data.page } : null
    }

    return () => observer.disconnect()
  }, [data, scrollRef])

  /** 把当前位置写进本地（镜像 + outbox）；返回是否真的写了 */
  const persist = useCallback(async (): Promise<boolean> => {
    if (!signedIn) return false

    const current = dataRef.current
    const position = positionRef.current
    const snapshot = entryRepliesRef.current
    if (!current || !position || !snapshot) return false

    const row: ProgressRow = {
      tid: current.tid,
      fid: current.fid,
      forumName: forumNameRef.current ?? '',
      title: current.title,
      lastPid: position.pid,
      lastFloor: position.floor,
      lastPage: position.page,
      totalPages: current.totalPages,
      replies: snapshot.replies,
      updatedAt: Date.now(),
    }

    const signature = `${row.lastPid}|${row.lastPage}|${row.replies}|${row.totalPages}|${row.title}`
    if (savedRef.current === signature) return false

    try {
      await queueProgress(row)
    } catch {
      return false // IDB 不可用：下个节拍再试
    }
    savedRef.current = signature
    return true
  }, [signedIn])

  /** 先补一次本地落盘，再把 outbox 推给服务端（空队列只是一次 IDB 读，无请求） */
  const flush = useCallback(
    async (keepalive = false) => {
      if (!signedIn) return
      const changed = await persist()

      let sent = 0
      try {
        sent = await flushProgress({ keepalive })
      } catch {
        // 离线：队列已留在 outbox，等联网/下次启动重放
      }
      if (changed || sent > 0) {
        void queryClient.invalidateQueries({ queryKey: ['progress-index'] })
      }
    },
    [persist, queryClient, signedIn],
  )

  useEffect(() => {
    const persistTimer = setInterval(() => void persist(), PERSIST_INTERVAL_MS)
    const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS)
    return () => {
      clearInterval(persistTimer)
      clearInterval(flushTimer)
    }
  }, [persist, flush])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flush(true)
    }
    const onPageHide = () => void flush(true)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [flush])

  // 路由离开时兜底写一次（keepalive 保证卸载中的请求也能发出）
  useEffect(() => {
    return () => {
      void flush(true)
    }
  }, [flush])
}
