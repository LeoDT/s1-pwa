import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { BottomBar } from '@/components/BottomBar'
import { Pager } from '@/components/Pager'
import { ToolbarButton } from '@/components/ToolbarButton'
import { ErrorState, PostSkeleton } from '@/components/states'
import { useBoards, useThreadPage } from './queries'
import { useReadingProgress } from './useReadingProgress'
import { DEFAULT_BOARDS } from '@/lib/boards'
import { downloadAttachment } from '@/lib/attachments'
import { errorMessage } from '@/lib/errors'
import { locatePid } from '@/lib/locate'
import { consumeFromList } from '@/lib/navigation'
import { useCollapsingHeader } from '@/lib/useCollapsingHeader'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { usePrefs } from '@/lib/usePrefs'
import { useSwipeBack } from '@/lib/useSwipeBack'
import { PostCard } from './PostCard'
import { getLastFid } from './lastForum'
import { cn } from '@/lib/utils'

interface ThreadPaneProps {
  tid: number
  page: number
  /** 从浏览历史进入：返回与跨帖跳转都留在历史列表旁 */
  fromHistory?: boolean
}

export function ThreadPane({ tid, page, fromHistory = false }: ThreadPaneProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const query = useThreadPage(tid, page)
  const showPending = useDeferredLoading(query.isPending)
  const showRefreshing = useDeferredLoading(query.isFetching)
  const boards = useBoards()
  const hash = useRouterState({ select: (state) => state.location.hash })
  const [highlighted, setHighlighted] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const { edgeSwipe } = usePrefs()
  const narrow = useMediaQuery('(max-width: 1023px)')
  // 只有小屏详情页的顶栏是浮层，需要给内容留出高度
  useCollapsingHeader(scrollRef, narrow)

  const listFid =
    query.data?.fid ||
    getLastFid() ||
    boards.data?.[0]?.fid ||
    DEFAULT_BOARDS[0]?.fid ||
    4

  /** 滑动/返回：总是回到该帖所属板块（或浏览历史）的列表 */
  const backToList = useCallback(() => {
    if (consumeFromList()) {
      router.history.back()
      return
    }
    if (fromHistory) {
      void navigate({ to: '/history', replace: true })
      return
    }
    void navigate({
      to: '/f/$fid',
      params: { fid: String(listFid) },
      replace: true,
    })
  }, [fromHistory, listFid, navigate, router])

  useSwipeBack(backToList, edgeSwipe)

  const targetPid = /^#?pid(\d+)$/.exec(hash ?? '')?.[1]
  const highlightPid = targetPid ? Number.parseInt(targetPid, 10) : null

  const goPage = useCallback(
    (next: number, targetHash?: string) => {
      if (fromHistory) {
        if (next === 1) {
          void navigate({
            to: '/history/t/$tid',
            params: { tid: String(tid) },
            hash: targetHash,
            replace: true,
          })
          return
        }
        void navigate({
          to: '/history/t/$tid/$page',
          params: { tid: String(tid), page: String(next) },
          hash: targetHash,
          replace: true,
        })
        return
      }

      // 第 1 页用干净 URL（/t/<tid>），避免 /1 与 / 两份地址
      if (next === 1) {
        void navigate({ to: '/t/$tid', params: { tid: String(tid) }, hash: targetHash, replace: true })
        return
      }
      void navigate({
        to: '/t/$tid/$page',
        params: { tid: String(tid), page: String(next) },
        hash: targetHash,
        replace: true,
      })
    },
    [fromHistory, navigate, tid],
  )

  /** 打开另一个帖子：保持当前列表来源（板块或历史） */
  const openThreadAt = useCallback(
    (targetTid: number, targetPage: number, targetHash: string) => {
      if (fromHistory) {
        if (targetPage === 1) {
          void navigate({
            to: '/history/t/$tid',
            params: { tid: String(targetTid) },
            hash: targetHash,
            replace: true,
          })
          return
        }
        void navigate({
          to: '/history/t/$tid/$page',
          params: { tid: String(targetTid), page: String(targetPage) },
          hash: targetHash,
          replace: true,
        })
        return
      }

      if (targetPage === 1) {
        void navigate({
          to: '/t/$tid',
          params: { tid: String(targetTid) },
          hash: targetHash,
          replace: true,
        })
        return
      }
      void navigate({
        to: '/t/$tid/$page',
        params: { tid: String(targetTid), page: String(targetPage) },
        hash: targetHash,
        replace: true,
      })
    },
    [fromHistory, navigate],
  )

  /** 跨页/跨帖定位：先问上游 pid 在哪一页，再带着 #pid 跳过去 */
  const goToPost = useCallback(
    async (targetTid: number, pid: number) => {
      let located: Awaited<ReturnType<typeof locatePid>> = null
      try {
        located = await locatePid(targetTid, pid)
      } catch {
        // 定位失败：退回第 1 页 + hash
      }
      const targetPage = located?.page ?? 1
      const targetHash = `pid${located?.pid ?? pid}`

      if (targetTid === tid) {
        goPage(targetPage, targetHash)
        return
      }
      openThreadAt(targetTid, targetPage, targetHash)
    },
    [goPage, openThreadAt, tid],
  )

  useEffect(() => {
    if (!query.data || highlightPid === null) return

    if (query.data.posts.some((post) => post.pid === highlightPid)) {
      const element = document.getElementById(`pid${highlightPid}`)
      if (!element) return

      element.scrollIntoView({ block: 'start', behavior: 'smooth' })
      setHighlighted(highlightPid)
      const timer = setTimeout(() => setHighlighted(null), 1200)
      return () => clearTimeout(timer)
    }

    // 目标楼层不在当前页：定位到所在页（定位结果有缓存，不会反复请求）
    let cancelled = false
    void locatePid(tid, highlightPid)
      .then((located) => {
        if (cancelled || !located || located.page === page) return
        goPage(located.page, `pid${located.pid}`)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [query.data, highlightPid, page, tid, goPage])

  const openPost = (targetTid: number, pid: number) => {
    const onThisPage = targetTid === tid && query.data?.posts.some((post) => post.pid === pid)
    if (onThisPage) {
      goPage(page, `pid${pid}`)
      return
    }
    void goToPost(targetTid, pid)
  }

  const openAttachment = (url: string, name: string) => {
    if (!window.confirm(`下载附件「${name}」？`)) return
    void downloadAttachment(url, name).catch((error) => window.alert(errorMessage(error)))
  }

  const data = query.data
  const boardName = boards.data?.find((board) => board.fid === data?.fid)?.name
  useReadingProgress(scrollRef, data, boardName)

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={
          narrow ? { paddingTop: 'calc(var(--header-h) + env(safe-area-inset-top))' } : undefined
        }
      >
        {showPending ? <PostSkeleton /> : null}

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
        <div className="z-20 shrink-0">
          <BottomBar>
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onChange={goPage}
              className="min-w-0 flex-1"
            />
            <ToolbarButton
              type="button"
              aria-label="刷新"
              title="刷新"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="hidden px-1 text-text lg:inline-flex"
            >
              <RefreshCw size={16} className={cn(showRefreshing && 'animate-spin')} />
            </ToolbarButton>
          </BottomBar>
        </div>
      ) : null}
    </div>
  )
}
