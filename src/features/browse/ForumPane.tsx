import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { ThreadSummary } from '@shared/types'
import { useBoards, useForumPages } from './queries'
import { ThreadRow } from './ThreadRow'
import { BoardTabs } from './BoardTabs'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { getListState, markFromList, rememberListState } from '@/lib/navigation'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
import { rememberFid } from './lastForum'
import { useMediaQuery } from '@/lib/useMediaQuery'

interface ForumPaneProps {
  fid: number
  /** 大屏时当前打开的帖子，用于列表激活态 */
  activeTid?: number
}

export function ForumPane({ fid, activeTid }: ForumPaneProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boards = useBoards()
  const forum = useForumPages(fid)

  const wide = useMediaQuery('(min-width: 1024px)')
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const restoredRef = useRef(false)

  const refresh = async () => {
    const element = scrollRef.current
    scrollTopRef.current = 0
    // 刷新 = 回到第一页（丢弃已追加的页）
    await queryClient.resetQueries({ queryKey: ['forum', fid] })
    if (element) element.scrollTop = 0
  }
  const { pull, refreshing } = usePullToRefresh(scrollRef, refresh)

  if (forum.data) rememberFid(fid)

  // 同一帖子可能同时出现在置顶/下一页，按 tid 去重
  const threads = useMemo(() => {
    const seen = new Set<number>()
    const rows: ThreadSummary[] = []
    for (const page of forum.data?.pages ?? []) {
      for (const thread of page.threads) {
        if (seen.has(thread.tid)) continue
        seen.add(thread.tid)
        rows.push(thread)
      }
    }
    return rows
  }, [forum.data])

  // 恢复上次离开时的滚动位置（已加载的页仍在 query 缓存里）
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !forum.data || restoredRef.current) return
    const saved = getListState(fid)
    if (saved && saved.scrollTop > 0) element.scrollTop = saved.scrollTop
    restoredRef.current = true
  }, [fid, forum.data])

  useEffect(() => {
    return () => {
      rememberListState(fid, scrollTopRef.current)
    }
  }, [fid])

  // 滚到底部前 600px 自动追加下一页
  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target || !forum.hasNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (forum.isFetchingNextPage) return
        void forum.fetchNextPage()
      },
      { root, rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [forum.hasNextPage, forum.isFetchingNextPage, forum.fetchNextPage])

  const openThread = (tid: number) => {
    rememberListState(fid, scrollTopRef.current)
    markFromList()
    // 大屏列表一直在左边，不需要堆历史；小屏 push 一次，保证系统返回能回列表
    void navigate({ to: '/t/$tid', params: { tid: String(tid) }, replace: wide })
  }

  const total = forum.data?.pages[0]?.totalPages ?? 1
  const loaded = forum.data?.pages.length ?? 0

  return (
    <div className="relative h-full min-h-0 bg-canvas">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          scrollTopRef.current = event.currentTarget.scrollTop
        }}
        className="h-full overflow-y-auto overscroll-contain pb-[calc(var(--bar-h)+env(safe-area-inset-bottom))]"
      >
        <div
          className="flex items-center justify-center overflow-hidden text-meta text-muted"
          style={{ height: pull }}
        >
          {pull > 0 || refreshing
            ? refreshing
              ? '刷新中…'
              : pull >= PULL_THRESHOLD
                ? '松开刷新'
                : '下拉刷新'
            : null}
        </div>

        {forum.isPending ? <ListSkeleton /> : null}

        {forum.isError ? (
          <ErrorState message={errorMessage(forum.error)} onRetry={() => void forum.refetch()} />
        ) : null}

        {forum.data && threads.length === 0 ? (
          <EmptyState text="这个板块暂时没有可显示的帖子" />
        ) : null}

        {threads.length > 0 ? (
          <>
            <div className="divide-y divide-line">
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.tid}
                  thread={thread}
                  active={thread.tid === activeTid}
                  onOpen={() => openThread(thread.tid)}
                />
              ))}
            </div>

            <div ref={sentinelRef} className="py-4 text-center text-meta text-muted">
              {forum.isFetchNextPageError ? (
                <button
                  type="button"
                  onClick={() => void forum.fetchNextPage()}
                  className="text-ui text-link underline decoration-line underline-offset-2"
                >
                  第 {loaded + 1} 页加载失败，点击重试
                </button>
              ) : forum.isFetchingNextPage ? (
                '加载中…'
              ) : forum.hasNextPage ? (
                <button
                  type="button"
                  onClick={() => void forum.fetchNextPage()}
                  className="text-ui text-link"
                >
                  加载更多（{loaded} / {total} 页）
                </button>
              ) : (
                `已全部加载（${loaded} 页）`
              )}
            </div>
          </>
        ) : null}
      </div>

      <BoardTabs
        boards={boards.data ?? []}
        activeFid={fid}
        onSelect={(next) =>
          void navigate({ to: '/f/$fid', params: { fid: String(next) }, replace: true })
        }
      />
    </div>
  )
}
