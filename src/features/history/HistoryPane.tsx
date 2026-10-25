import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import type { ProgressRow } from '@shared/types'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { BoardTabs } from '@/features/browse/BoardTabs'
import { ListRow } from '@/features/browse/ListRow'
import { useBoards } from '@/features/browse/queries'
import { ApiError } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { markFromList } from '@/lib/navigation'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { PULL_THRESHOLD, usePullToRefresh } from '@/lib/usePullToRefresh'
import { cn } from '@/lib/utils'
import {
  clearProgress,
  clearServerHistory,
  deleteServerProgress,
  loadProgress,
  removeProgress,
  syncHistoryMirror,
} from '@/lib/progress'
import { clearPendingProgress, removePendingProgress } from '@/lib/outbox'

const AUTH_CODES = new Set(['auth_required', 'token_required', 'token_invalid'])

/** 离线时退回本地镜像；登录失效仍以错误提示引导重新登录 */
async function loadHistory(): Promise<ProgressRow[]> {
  try {
    return await syncHistoryMirror(50)
  } catch (error) {
    if (error instanceof ApiError && AUTH_CODES.has(error.code)) throw error
    return loadProgress()
  }
}

interface HistoryPaneProps {
  /** 大屏：当前从历史里打开的帖子，用于激活态 */
  activeTid?: number
}

/**
 * 浏览历史列表：复用板块列表的左栏/整屏位置与底部板块条，
 * 点击条目直接回到上次楼层（docs/navigation.md §4.1）。
 */
export function HistoryPane({ activeTid }: HistoryPaneProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boards = useBoards()
  const wide = useMediaQuery('(min-width: 1024px)')

  const scrollRef = useRef<HTMLDivElement>(null)
  const [refreshing, setRefreshing] = useState(false)

  const history = useQuery<ProgressRow[]>({
    queryKey: ['history'],
    queryFn: loadHistory,
    staleTime: 60 * 1000,
  })

  const refresh = useCallback(async () => {
    const element = scrollRef.current
    setRefreshing(true)
    try {
      await queryClient.resetQueries({ queryKey: ['history'] })
      if (element) element.scrollTop = 0
    } finally {
      setRefreshing(false)
    }
  }, [queryClient])

  const pullState = usePullToRefresh(scrollRef, refresh)
  const pull = pullState.pull

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['history'] })
    void queryClient.invalidateQueries({ queryKey: ['progress-index'] })
  }

  const remove = useMutation({
    mutationFn: async (tid: number) => {
      await deleteServerProgress(tid)
      await removeProgress(tid)
      await removePendingProgress(tid)
    },
    onSuccess: invalidate,
  })

  const clear = useMutation({
    mutationFn: async () => {
      await clearServerHistory()
      await clearProgress()
      await clearPendingProgress()
    },
    onSuccess: invalidate,
  })

  const items = history.data ?? []
  const error = remove.error ?? clear.error

  const open = (row: ProgressRow) => {
    markFromList()
    const page = row.lastPage ?? 1
    const hash = row.lastPid ? `pid${row.lastPid}` : undefined

    if (page > 1) {
      void navigate({
        to: '/history/t/$tid/$page',
        params: { tid: String(row.tid), page: String(page) },
        hash,
        replace: wide,
      })
      return
    }
    void navigate({ to: '/history/t/$tid', params: { tid: String(row.tid) }, hash, replace: wide })
  }

  return (
    <div className="relative h-full min-h-0 bg-canvas">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain pb-[calc(var(--bar-h)+env(safe-area-inset-bottom))]"
      >
        <div
          className="flex items-center justify-center overflow-hidden text-meta text-muted"
          style={{ height: pull }}
        >
          {pull > 0 || refreshing || pullState.refreshing
            ? refreshing || pullState.refreshing
              ? '刷新中…'
              : pull >= PULL_THRESHOLD
                ? '松开刷新'
                : '下拉刷新'
            : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="text-ui font-medium text-accent-strong">浏览历史</span>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={clear.isPending}
              onClick={() => {
                if (window.confirm('清空全部阅读历史？此操作不可撤销。')) clear.mutate()
              }}
              className="rounded-md px-2 py-1 text-meta text-danger transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light disabled:opacity-50"
            >
              清空
            </button>
          ) : null}
        </div>

        {error ? <p className="px-4 py-2 text-meta text-danger">{errorMessage(error)}</p> : null}

        {history.isPending ? <ListSkeleton rows={6} /> : null}

        {history.isError ? (
          <ErrorState message={errorMessage(history.error)} onRetry={() => void history.refetch()} />
        ) : null}

        {history.isSuccess && items.length === 0 ? (
          <EmptyState text="还没有阅读记录，去板块列表打开一个帖子吧" />
        ) : null}

        {items.length > 0 ? (
          <div className="divide-y divide-line">
            {items.map((row) => {
              const active = row.tid === activeTid
              return (
                <ListRow
                  key={row.tid}
                  active={active}
                  badgeAccent={active}
                  badgeLabel={row.lastFloor ? `读到第 ${row.lastFloor} 楼` : '未记录楼层'}
                  badge={
                    <span
                      className={cn(
                        'text-meta font-medium tnum',
                        active ? 'text-accent-strong' : 'text-text',
                      )}
                    >
                      {row.lastFloor ?? '—'}
                    </span>
                  }
                  title={row.title || '（无标题）'}
                  meta={[row.forumName, formatWhen(row.updatedAt)].filter(Boolean).join(' · ')}
                  onOpen={() => open(row)}
                  action={
                    <button
                      type="button"
                      aria-label="删除这条记录"
                      title="删除"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(row.tid)}
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors duration-[var(--motion-press)] hover:bg-panel hover:text-danger active:bg-panel"
                    >
                      <Trash2 size={15} />
                    </button>
                  }
                />
              )
            })}
          </div>
        ) : null}
      </div>

      <BoardTabs
        boards={boards.data ?? []}
        onRefresh={refresh}
        refreshing={refreshing || pullState.refreshing}
        onSelect={(fid) =>
          void navigate({ to: '/f/$fid', params: { fid: String(fid) }, replace: true })
        }
      />
    </div>
  )
}

function formatWhen(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
