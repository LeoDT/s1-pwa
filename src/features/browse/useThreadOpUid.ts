import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThreadPage } from '@shared/types'
import { fetchThreadPage } from './queries'
import { loadThreadOpUid, saveThreadOpUid } from '@/lib/threadOp'

/**
 * 第 1 页解析 opUid 并持久化；从第 N 页进入时只在本地无缓存时补拉第 1 页。
 * 失败静默降级为不显示楼主标签。
 */
export function useThreadOpUid(
  tid: number,
  page: number,
  data: ThreadPage | undefined,
): number | null {
  const [resolved, setResolved] = useState<number | null>(null)
  const resolvedRef = useRef<number | null>(null)

  const publish = useCallback((uid: number | null) => {
    if (uid == null || resolvedRef.current === uid) return
    resolvedRef.current = uid
    setResolved(uid)
  }, [])

  useEffect(() => {
    const direct = page === 1 ? data?.opUid ?? null : null
    if (direct == null || resolvedRef.current === direct) return
    publish(direct)
    void saveThreadOpUid(tid, direct).catch(() => undefined)
  }, [data, page, publish, tid])

  useEffect(() => {
    if (page <= 1 || !data || resolvedRef.current != null) return
    let alive = true

    void (async () => {
      try {
        const stored = await loadThreadOpUid(tid)
        if (!alive) return
        if (stored != null) {
          publish(stored)
          return
        }
      } catch {
        // 本地缓存不可用时仍尝试补拉第 1 页。
      }

      try {
        const firstPage = await fetchThreadPage(tid, 1)
        if (!alive || firstPage.opUid == null) return
        publish(firstPage.opUid)
        void saveThreadOpUid(tid, firstPage.opUid).catch(() => undefined)
      } catch {
        // 标签是增强信息：补拉失败不影响正文。
      }
    })()

    return () => {
      alive = false
    }
  }, [data, page, publish, tid])

  return resolved
}
