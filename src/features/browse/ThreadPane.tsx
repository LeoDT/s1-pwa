import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { Pager } from '@/components/Pager'
import { ErrorState, PostSkeleton } from '@/components/states'
import { useBoards, useThreadPage } from './queries'
import { DEFAULT_BOARDS } from '@/lib/boards'
import { errorMessage } from '@/lib/errors'
import { consumeFromList } from '@/lib/navigation'
import { useCollapsingHeader } from '@/lib/useCollapsingHeader'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useSwipeBack } from '@/lib/useSwipeBack'
import { PostCard } from './PostCard'
import { getLastFid } from './lastForum'
import { cn } from '@/lib/utils'

interface ThreadPaneProps {
  tid: number
  page: number
}

export function ThreadPane({ tid, page }: ThreadPaneProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const query = useThreadPage(tid, page)
  const boards = useBoards()
  const hash = useRouterState({ select: (state) => state.location.hash })
  const [highlighted, setHighlighted] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const narrow = useMediaQuery('(max-width: 1023px)')
  // 只有小屏详情页的顶栏是浮层，需要给内容留出高度
  useCollapsingHeader(scrollRef, narrow)

  const listFid =
    query.data?.fid ||
    getLastFid() ||
    boards.data?.[0]?.fid ||
    DEFAULT_BOARDS[0]?.fid ||
    4

  /** 滑动/返回：总是回到该帖所属板块的列表 */
  const backToList = useCallback(() => {
    if (consumeFromList()) {
      router.history.back()
      return
    }
    void navigate({
      to: '/f/$fid',
      params: { fid: String(listFid) },
      replace: true,
    })
  }, [listFid, navigate, router])

  useSwipeBack(backToList)

  const targetPid = /^#?pid(\d+)$/.exec(hash ?? '')?.[1]
  const highlightPid = targetPid ? Number.parseInt(targetPid, 10) : null

  useEffect(() => {
    if (!query.data || highlightPid === null) return
    if (!query.data.posts.some((post) => post.pid === highlightPid)) return

    const element = document.getElementById(`pid${highlightPid}`)
    if (!element) return

    element.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setHighlighted(highlightPid)
    const timer = setTimeout(() => setHighlighted(null), 1200)
    return () => clearTimeout(timer)
  }, [query.data, highlightPid])

  const goPage = (next: number) => {
    void navigate({
      to: '/t/$tid/$page',
      params: { tid: String(tid), page: String(next) },
      replace: true,
    })
  }

  const openPost = (targetTid: number, pid: number) => {
    void navigate({
      to: targetTid === tid ? '/t/$tid/$page' : '/t/$tid',
      params:
        targetTid === tid
          ? { tid: String(tid), page: String(page) }
          : { tid: String(targetTid) },
      hash: `pid${pid}`,
      replace: true,
    })
  }

  const openAttachment = (url: string, name: string) => {
    // M4 会改成经 /api/file 取 blob 下载；当前先打开原地址
    if (window.confirm(`下载附件「${name}」？`)) window.open(url, '_blank', 'noopener')
  }

  const data = query.data
  const boardName = boards.data?.find((board) => board.fid === data?.fid)?.name

  return (
    <div className="relative h-full min-h-0 bg-canvas">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overscroll-contain pb-[calc(var(--bar-h)+env(safe-area-inset-bottom))]"
        style={
          narrow ? { paddingTop: 'calc(var(--header-h) + env(safe-area-inset-top))' } : undefined
        }
      >
        {query.isPending ? <PostSkeleton /> : null}

        {query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : null}

        {data ? (
          <div className="mx-auto max-w-[900px]">
            <header className="border-b border-line px-4 pb-3 pt-3 lg:px-6">
              <h1 className="text-title font-semibold leading-[1.45] text-heading">
                {data.title}
              </h1>
              <p className="mt-1 text-meta text-muted">
                {boardName ? `${boardName} · ` : ''}
                {data.page} / {data.totalPages} 页 · {data.posts.length} 楼
              </p>
            </header>
            {data.posts.map((post) => (
              <PostCard
                key={post.pid}
                post={post}
                tid={tid}
                highlighted={highlighted === post.pid}
                onOpenPost={openPost}
                onOpenAttachment={openAttachment}
              />
            ))}
          </div>
        ) : null}
      </div>

      {data ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex h-[calc(var(--bar-h)+env(safe-area-inset-bottom))] items-center border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
          <Pager
            page={data.page}
            totalPages={data.totalPages}
            onChange={goPage}
            className="w-full"
          />
          <button
            type="button"
            aria-label="刷新"
            title="刷新"
            onClick={() => void query.refetch()}
            className="absolute right-1 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-md text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light lg:inline-flex"
          >
            <RefreshCw size={16} className={cn(query.isFetching && 'animate-spin')} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
