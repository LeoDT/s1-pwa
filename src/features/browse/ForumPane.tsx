import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { ThreadSummary } from '@shared/types'
import { fetchForumPage, useBoards, useForumPages, useProgressIndex, type ObservedForumPage } from './queries'
import { ThreadRow } from './ThreadRow'
import { BoardTabs } from './BoardTabs'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { getListState, markFromList, rememberListState } from '@/lib/navigation'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { getNewReplies, getProgress, recordThreadOpened } from '@/lib/progress'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { useSession } from '@/features/auth/useSession'
import { useListRefresh } from '@/lib/useListRefresh'

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
  const progress = useProgressIndex()
  const session = useSession()
  const identity = `${fid}:${session.data?.uid ?? 'unknown'}`
  const accountRef = useRef(session.data?.uid)
  accountRef.current = session.data?.uid
  const openGenerationRef = useRef(0)

  const wide = useMediaQuery('(min-width: 1024px)')
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const restoredRef = useRef(false)

  const fetchFirstPage = useCallback(() => fetchForumPage(fid, 1), [fid])
  const commitFirstPage = useCallback((firstPage: Awaited<ReturnType<typeof fetchForumPage>>) => {
    queryClient.setQueryData(['forum', fid], { pages: [firstPage], pageParams: [1] })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    scrollTopRef.current = 0
  }, [fid, queryClient])
  const { refresh, refreshing, error: refreshError, isBusy } = useListRefresh(
    ['forum', fid], identity, fetchFirstPage, commitFirstPage,
  )
  const pullState = usePullToRefresh(scrollRef, refresh)
  const pull = pullState.pull
  const deferredRefreshing = useDeferredLoading(refreshing || pullState.refreshing)
  const deferredPending = useDeferredLoading(forum.isPending)
  const deferredNextPage = useDeferredLoading(forum.isFetchingNextPage)

  // 同一帖子可能同时出现在置顶/下一页，按 tid 去重
  const threads = useMemo(() => {
    const seen = new Set<number>()
    const rows: Array<ThreadSummary & { observation: ObservedForumPage['observation']; fid: number; forumName: string }> = []
    for (const page of forum.data?.pages ?? []) {
      for (const thread of page.threads) {
        if (seen.has(thread.tid)) continue
        seen.add(thread.tid)
        rows.push({ ...thread, observation: page.observation, fid: page.fid, forumName: page.name })
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
        if (isBusy() || forum.isFetchingNextPage) return
        void forum.fetchNextPage()
      },
      { root, rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [forum.hasNextPage, forum.isFetchingNextPage, forum.fetchNextPage, isBusy, refreshing])

  const openThread = (thread: typeof threads[number]) => {
    rememberListState(fid, scrollTopRef.current)
    markFromList()
    // 大屏列表一直在左边，不需要堆历史；小屏 push 一次，保证系统返回能回列表
    void openAtProgress(thread, wide)
  }

  /** Entering records the list's observation (including an unknown count) before navigation. */
  const openAtProgress = async (thread: typeof threads[number], replace: boolean) => {
    const generation = ++openGenerationRef.current
    const accountId = session.data?.uid
    if (session.data) {
      await recordThreadOpened(
        { tid: thread.tid, fid: thread.fid, forumName: thread.forumName, title: thread.title },
        { ...thread.observation, replies: thread.replies },
        session.data.uid,
      ).catch(() => undefined)
    }
    if (generation !== openGenerationRef.current || accountRef.current !== accountId) return
    const tid = thread.tid
    const local = await getProgress(tid).catch(() => undefined)
    if (generation !== openGenerationRef.current || accountRef.current !== accountId) return
    const page = local?.position?.page ?? 1
    const hash = local?.position?.pid ? `pid${local.position.pid}` : undefined

    if (page > 1) {
      void navigate({
        to: '/t/$tid/$page',
        params: { tid: String(tid), page: String(page) },
        hash,
        replace,
      })
      return
    }
    void navigate({ to: '/t/$tid', params: { tid: String(tid) }, hash, replace })
  }

  const progressMap = useMemo(
    () => new Map((progress.data ?? []).map((row) => [row.tid, row])),
    [progress.data],
  )

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
          {pull > 0 || deferredRefreshing
            ? deferredRefreshing
              ? '刷新中…'
              : pull >= PULL_THRESHOLD
                ? '松开刷新'
                : '下拉刷新'
            : null}
        </div>

        {deferredPending ? <ListSkeleton /> : null}

        {refreshError ? (
          <p className="px-4 py-2 text-meta text-danger">刷新失败：{errorMessage(refreshError)}</p>
        ) : null}

        {forum.isError ? (
          <ErrorState message={errorMessage(forum.error)} onRetry={() => void forum.refetch()} />
        ) : null}

        {forum.data && threads.length === 0 ? (
          <EmptyState text="这个板块暂时没有可显示的帖子" />
        ) : null}

        {threads.length > 0 ? (
          <>
            <div className="divide-y divide-line">
              {threads.map((thread) => {
                const entry = progressMap.get(thread.tid)
                return (
                  <ThreadRow
                    key={thread.tid}
                    thread={thread}
                    active={thread.tid === activeTid}
                    read={Boolean(entry && entry.openedAt > 0)}
                    newReplies={getNewReplies(thread.replies, entry?.read?.replies) ?? 0}
                    onOpen={() => openThread(thread)}
                  />
                )
              })}
            </div>

            <div ref={sentinelRef} className="py-4 text-center text-meta text-muted">
              {forum.isFetchNextPageError ? (
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => {
                    if (!isBusy()) void forum.fetchNextPage()
                  }}
                  className="text-ui text-link underline decoration-line underline-offset-2"
                >
                  第 {loaded + 1} 页加载失败，点击重试
                </button>
              ) : deferredNextPage ? (
                '加载中…'
              ) : forum.hasNextPage ? (
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => {
                    if (!isBusy()) void forum.fetchNextPage()
                  }}
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
        onRefresh={refresh}
        refreshing={refreshing || pullState.refreshing}
        onSelect={(next) =>
          void navigate({ to: '/f/$fid', params: { fid: String(next) }, replace: true })
        }
      />
    </div>
  )
}
