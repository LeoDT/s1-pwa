/**
 * 阅读位置记录：IntersectionObserver 取「最靠下的可见楼层」，
 * 每 5 秒节流写一次；离开/切后台时立刻落盘。见 docs/data-model.md §6.2。
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Post, ProgressRow, ThreadPage } from '@shared/types'
import { useSession } from '@/features/auth/useSession'
import { flushProgress, queueProgress } from '@/lib/outbox'

const WRITE_INTERVAL_MS = 5000

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
  const writtenRef = useRef<string | null>(null)

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

  const write = useCallback(
    async (keepalive = false) => {
      if (!signedIn) return

      const current = dataRef.current
      const position = positionRef.current
      const snapshot = entryRepliesRef.current
      if (!current || !position || !snapshot) return

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
      if (writtenRef.current === signature) return
      writtenRef.current = signature

      try {
        await queueProgress(row)
        void queryClient.invalidateQueries({ queryKey: ['progress-index'] })
        await flushProgress({ keepalive })
      } catch {
        // 离线：队列已留在 outbox，等联网/下次启动重放
      }
    },
    [queryClient, signedIn],
  )

  useEffect(() => {
    const timer = setInterval(() => void write(), WRITE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [write])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void write(true)
    }
    const onPageHide = () => void write(true)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [write])

  // 路由离开时兜底写一次（keepalive 保证卸载中的请求也能发出）
  useEffect(() => {
    return () => {
      void write(true)
    }
  }, [write])
}
