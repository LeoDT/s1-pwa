import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useBoards, useForumPage } from './queries'
import { ThreadRow } from './ThreadRow'
import { BoardTabs } from './BoardTabs'
import { Pager } from '@/components/Pager'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { useSetPageTitle } from '@/app/chrome'
import { errorMessage } from '@/lib/errors'
import { getListState, markFromList, rememberListState } from '@/lib/navigation'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
import { rememberFid } from './lastForum'
import { useMediaQuery } from '@/lib/useMediaQuery'

interface ForumPaneProps {
  fid: number
  page: number
  /** 作为大屏左栏时不覆盖顶栏标题 */
  setTitle?: boolean
}

export function ForumPane({ fid, page, setTitle = true }: ForumPaneProps) {
  const navigate = useNavigate()
  const boards = useBoards()
  const forum = useForumPage(fid, page)

  const wide = useMediaQuery('(min-width: 1024px)')
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const restoredRef = useRef(false)

  const { pull, refreshing } = usePullToRefresh(scrollRef, () => forum.refetch())

  const boardName = boards.data?.find((board) => board.fid === fid)?.name
  useSetPageTitle(setTitle ? (forum.data?.name ?? boardName) : undefined)
  if (forum.data) rememberFid(fid)

  // 恢复上次离开时的滚动位置
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !forum.data || restoredRef.current) return
    const saved = getListState(fid)
    if (saved && saved.page === forum.data.page && saved.scrollTop > 0) {
      element.scrollTop = saved.scrollTop
    }
    restoredRef.current = true
  }, [fid, forum.data])

  useEffect(() => {
    return () => {
      rememberListState(fid, page, scrollTopRef.current)
    }
  }, [fid, page])

  const openThread = (tid: number) => {
    rememberListState(fid, page, scrollTopRef.current)
    markFromList()
    // 大屏列表一直在左边，不需要堆历史；小屏 push 一次，保证系统返回能回列表
    void navigate({ to: '/t/$tid', params: { tid: String(tid) }, replace: wide })
  }

  const changePage = (next: number) => {
    void navigate({
      to: '/f/$fid/$page',
      params: { fid: String(fid), page: String(next) },
      replace: true,
    })
  }

  const current = forum.data

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
          className="flex items-center justify-center overflow-hidden text-[12.5px] text-muted"
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

        {current && current.threads.length === 0 ? (
          <EmptyState text="这个板块暂时没有可显示的帖子" />
        ) : null}

        {current && current.threads.length > 0 ? (
          <>
            <div className="divide-y divide-line">
              {current.threads.map((thread) => (
                <ThreadRow
                  key={thread.tid}
                  thread={thread}
                  onOpen={() => openThread(thread.tid)}
                />
              ))}
            </div>
            <Pager
              page={current.page}
              totalPages={current.totalPages}
              onChange={changePage}
              className="py-3"
            />
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
