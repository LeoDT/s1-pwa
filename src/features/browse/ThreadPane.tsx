import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import type { ThreadPage } from '@shared/types'
import { BottomBar } from '@/components/BottomBar'
import { Pager } from '@/components/Pager'
import { ErrorState, PostSkeleton } from '@/components/states'
import { useBoards, type ThreadPageQuery } from './queries'
import { useBrowseKeyboard } from './BrowseKeyboard'
import { isShortcutBlocked, scrollStep } from './keyboard'
import { useReadingProgress } from './useReadingProgress'
import { useThreadOpUid } from './useThreadOpUid'
import { useThreadReadState } from './useThreadReadState'
import { downloadAttachment } from '@/lib/attachments'
import { errorMessage } from '@/lib/errors'
import type { ImageDimensions } from '@/lib/imageDimensions'
import { locatePid } from '@/lib/locate'
import { consumeFromList, consumeThreadFocus, peekThreadFocus, setThreadFocus } from '@/lib/navigation'
import { getProgress } from '@/lib/progress'
import { useCollapsingHeader } from '@/lib/useCollapsingHeader'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { useEdgePull } from '@/lib/useEdgePull'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { usePrefs } from '@/lib/usePrefs'
import {
  EMPTY_IMAGE_DIMENSIONS,
  ImageDimensionsContext,
  usePreparedImageDimensions,
} from '@/lib/useImageDimensions'
import { useSwipeBack } from '@/lib/useSwipeBack'
import { cn } from '@/lib/utils'
import { PostCard } from './PostCard'

interface ThreadPaneProps {
  tid: number
  page: number
  query: ThreadPageQuery
  forumId: number | null
  /** 从浏览历史进入：返回与跨帖跳转都留在历史列表旁 */
  fromHistory?: boolean
}

interface RenderedThread {
  data: ThreadPage
  dimensions: ReadonlyMap<string, ImageDimensions>
}

export function ThreadPane({ tid, page, query, forumId, fromHistory = false }: ThreadPaneProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const data = query.data
  const imageSources = useMemo(() => data?.posts.flatMap((post) => post.images) ?? [], [data])
  const dimensions = usePreparedImageDimensions(imageSources)

  // 刷新时新图片集合的尺寸尚未就绪：继续显示上一份正文，避免整段卸载和滚动归零。
  const lastRenderedRef = useRef<RenderedThread | null>(null)
  if (data && dimensions !== undefined) {
    lastRenderedRef.current = { data, dimensions }
  }
  const previous = lastRenderedRef.current
  const canReusePrevious = !!data && !!previous &&
    previous.data.tid === data.tid && previous.data.page === data.page
  const rendered = data && dimensions !== undefined
    ? { data, dimensions }
    : canReusePrevious ? previous : undefined
  const displayedData = rendered?.data
  const displayedDimensions = rendered?.dimensions ?? EMPTY_IMAGE_DIMENSIONS
  const showPending = useDeferredLoading(query.isPending || (!!data && !displayedData))
  const boards = useBoards()
  const opUid = useThreadOpUid(tid, page, data)
  const hash = useRouterState({ select: (state) => state.location.hash })
  const [highlighted, setHighlighted] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const highlightTimerRef = useRef<number | null>(null)
  const entryHandledRef = useRef<string | null>(null)
  const { enabled: keyboardEnabled, region, boardCandidate } = useBrowseKeyboard()
  const { edgeSwipe } = usePrefs()
  const narrow = useMediaQuery('(max-width: 1023px)')
  // 只有小屏详情页的顶栏是浮层，需要给内容留出高度
  useCollapsingHeader(scrollRef, narrow)

  /** 浏览中返回原列表；深链进入时返回帖子所属板块。 */
  const backToList = useCallback(() => {
    if (consumeFromList() && narrow) {
      router.history.back()
      return
    }
    if (fromHistory) {
      void navigate({ to: '/history', replace: true })
      return
    }
    if (forumId === null) return
    void navigate({
      to: '/f/$fid',
      params: { fid: String(forumId) },
      replace: true,
    })
  }, [fromHistory, forumId, navigate, router, narrow])

  useSwipeBack(backToList, edgeSwipe)

  const legacyFocusPid = /^#?pid(\d+)$/.exec(hash ?? '')?.[1]
  const legacyPid = legacyFocusPid ? Number.parseInt(legacyFocusPid, 10) : null

  const focusPid = useCallback((pid: number): boolean => {
    const element = document.getElementById(`pid${pid}`)
    if (!element) return false

    element.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setHighlighted(pid)
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlighted(null)
      highlightTimerRef.current = null
    }, 1200)
    return true
  }, [])

  useEffect(() => () => {
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
  }, [])

  const goPage = useCallback(
    (next: number) => {
      if (fromHistory) {
        if (next === 1) {
          void navigate({
            to: '/history/t/$tid',
            params: { tid: String(tid) },
            replace: true,
          })
          return
        }
        void navigate({
          to: '/history/t/$tid/$page',
          params: { tid: String(tid), page: String(next) },
          replace: true,
        })
        return
      }

      // 第 1 页用干净 URL（/t/<tid>），避免 /1 与 / 两份地址
      if (next === 1) {
        void navigate({ to: '/t/$tid', params: { tid: String(tid) }, replace: true })
        return
      }
      void navigate({
        to: '/t/$tid/$page',
        params: { tid: String(tid), page: String(next) },
        replace: true,
      })
    },
    [fromHistory, navigate, tid],
  )

  // 正文区获得键盘焦点时：w/s 按 60% 高度滚动，a/d 翻页（末页与下一页按钮一致，触发刷新）
  useEffect(() => {
    if (!keyboardEnabled || region !== 'content' || boardCandidate !== null) return
    const scroller = scrollRef.current
    if (!scroller) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return
      const key = event.key.toLowerCase()

      if (key === 'w' || key === 's') {
        event.preventDefault()
        const step = scrollStep(scroller.clientHeight)
        scroller.scrollTop = key === 'w' ? scroller.scrollTop - step : scroller.scrollTop + step
        return
      }

      if (key !== 'a' && key !== 'd') return
      if (event.repeat || query.isFetching) return
      event.preventDefault()
      if (key === 'a') {
        if (page > 1) goPage(page - 1)
        return
      }
      const totalPages = data?.totalPages ?? 1
      if (page < totalPages) goPage(page + 1)
      else void query.refetch()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    keyboardEnabled,
    region,
    boardCandidate,
    page,
    data?.totalPages,
    query.isFetching,
    query.refetch,
    goPage,
  ])

  const contentFocused = keyboardEnabled && region === 'content'

  /** 打开另一个帖子：保持当前列表来源（板块或历史） */
  const openThreadAt = useCallback(
    (targetTid: number, targetPage: number) => {
      if (fromHistory) {
        if (targetPage === 1) {
          void navigate({
            to: '/history/t/$tid',
            params: { tid: String(targetTid) },
            replace: true,
          })
          return
        }
        void navigate({
          to: '/history/t/$tid/$page',
          params: { tid: String(targetTid), page: String(targetPage) },
          replace: true,
        })
        return
      }

      if (targetPage === 1) {
        void navigate({
          to: '/t/$tid',
          params: { tid: String(targetTid) },
          replace: true,
        })
        return
      }
      void navigate({
        to: '/t/$tid/$page',
        params: { tid: String(targetTid), page: String(targetPage) },
        replace: true,
      })
    },
    [fromHistory, navigate],
  )

  /** 跨页/跨帖定位：先问上游 pid 在哪一页，再把目标交给下一次进入消费。 */
  const goToPost = useCallback(
    async (targetTid: number, pid: number) => {
      let located: Awaited<ReturnType<typeof locatePid>> = null
      try {
        located = await locatePid(targetTid, pid)
      } catch {
        // 定位失败：退回第 1 页
      }
      const targetPage = located?.page ?? 1
      const targetPid = located?.pid ?? pid

      if (targetTid === tid && targetPage === page) {
        focusPid(targetPid)
        return
      }

      setThreadFocus(targetTid, targetPage, targetPid)
      if (targetTid === tid) goPage(targetPage)
      else openThreadAt(targetTid, targetPage)
    },
    [focusPid, goPage, openThreadAt, page, tid],
  )

  /** 旧 URL 深链的 #pid 只兼容一次：消费后从地址里清掉。 */
  const clearLegacyHash = useCallback(() => {
    if (!hash) return
    if (fromHistory) {
      if (page === 1) {
        void navigate({
          to: '/history/t/$tid',
          params: { tid: String(tid) },
          replace: true,
          resetScroll: false,
          hashScrollIntoView: false,
        })
        return
      }
      void navigate({
        to: '/history/t/$tid/$page',
        params: { tid: String(tid), page: String(page) },
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      })
      return
    }

    if (page === 1) {
      void navigate({
        to: '/t/$tid',
        params: { tid: String(tid) },
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      })
      return
    }
    void navigate({
      to: '/t/$tid/$page',
      params: { tid: String(tid), page: String(page) },
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    })
  }, [fromHistory, hash, navigate, page, tid])

  // 进入帖子时只定位一次：显式 focus > 旧 hash 深链 > 本地阅读进度。
  useEffect(() => {
    if (!displayedData) return
    const entryKey = `${tid}:${page}`
    if (entryHandledRef.current === entryKey) return

    let cancelled = false
    const markHandled = () => {
      entryHandledRef.current = entryKey
    }
    const clearLegacy = () => {
      if (legacyPid !== null) clearLegacyHash()
    }

    const pendingFocus = peekThreadFocus(tid, page)
    const targetPid = pendingFocus ?? legacyPid

    if (targetPid !== null) {
      if (displayedData.posts.some((post) => post.pid === targetPid)) {
        focusPid(targetPid)
        if (pendingFocus !== null) consumeThreadFocus(tid, page)
        clearLegacy()
        markHandled()
        return
      }

      void locatePid(tid, targetPid)
        .then((located) => {
          if (cancelled) return
          if (located && located.page !== page) {
            setThreadFocus(tid, located.page, located.pid)
            goPage(located.page)
            return
          }
          if (located && located.page === page && focusPid(located.pid)) {
            if (pendingFocus !== null) consumeThreadFocus(tid, page)
            clearLegacy()
            markHandled()
            return
          }
          if (pendingFocus !== null) consumeThreadFocus(tid, page)
          clearLegacy()
          markHandled()
        })
        .catch(() => {
          if (!cancelled) {
            if (pendingFocus !== null) consumeThreadFocus(tid, page)
            clearLegacy()
            markHandled()
          }
        })
      return () => {
        cancelled = true
      }
    }

    void getProgress(tid)
      .then((row) => {
        if (cancelled) return
        const position = row?.position
        if (!position || position.page !== page ||
          !displayedData.posts.some((post) => post.pid === position.pid)) {
          clearLegacy()
          markHandled()
          return
        }
        focusPid(position.pid)
        clearLegacy()
        markHandled()
      })
      .catch(() => {
        if (!cancelled) {
          clearLegacy()
          markHandled()
        }
      })

    return () => {
      cancelled = true
    }
  }, [clearLegacyHash, displayedData, focusPid, goPage, legacyPid, page, tid])

  const displayedPosts = displayedData?.posts
  const openPost = useCallback((targetTid: number, pid: number) => {
    const onThisPage = targetTid === tid && displayedPosts?.some((post) => post.pid === pid)
    if (onThisPage) {
      focusPid(pid)
      return
    }
    void goToPost(targetTid, pid)
  }, [displayedPosts, focusPid, goToPost, tid])

  const openAttachment = useCallback((url: string, name: string) => {
    if (!window.confirm(`下载附件「${name}」？`)) return
    void downloadAttachment(url, name).catch((error) => window.alert(errorMessage(error)))
  }, [])

  const pullState = useEdgePull(scrollRef, {
    edge: 'bottom',
    enabled: narrow && !!data,
    targetRef: rootRef,
    blocked: query.isFetching,
    engageDistance: 6,
    onTrigger: () => {
      if (!data) return
      if (data.page < data.totalPages) {
        goPage(data.page + 1)
        return
      }
      return query.refetch()
    },
  })

  const boardName = boards.data?.find((board) => board.fid === data?.fid)?.name
  useThreadReadState(tid, data, boardName)
  useReadingProgress(scrollRef, displayedData, boardName)

  const pullOffset = pullState.pull
  const pullStyle: CSSProperties = pullOffset > 0
    ? { transform: `translateY(-${pullOffset}px)`, willChange: 'transform' }
    : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-ease)' }

  return (
    <div
      ref={rootRef}
      data-kb-region={contentFocused ? 'content' : undefined}
      className={cn('flex h-full min-h-0 flex-col bg-canvas', contentFocused && 'kb-focus')}
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={
          narrow ? { paddingTop: 'calc(var(--header-h) + env(safe-area-inset-top))' } : undefined
        }
      >
        <div style={pullStyle}>
          {showPending ? <PostSkeleton /> : null}

          {query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : null}

          {displayedData ? (
            <ImageDimensionsContext.Provider value={displayedDimensions}>
              <div className="mx-auto max-w-[900px]">
                <header className="border-b border-line px-4 pb-3 pt-3 lg:px-6">
                  <h1 className="text-title font-semibold leading-[1.45] text-heading">
                    {displayedData.title}
                  </h1>
                  <p className="mt-1 text-meta text-muted">
                    {boardName ? `${boardName} · ` : ''}
                    {displayedData.page} / {displayedData.totalPages} 页 · {displayedData.posts.length} 楼
                  </p>
                </header>
                {displayedData.posts.map((post) => (
                  <PostCard
                    key={post.pid}
                    post={post}
                    tid={tid}
                    highlighted={highlighted === post.pid}
                    isOp={post.floor !== 1 && opUid !== null && post.authorUid === opUid}
                    onOpenPost={openPost}
                    onOpenAttachment={openAttachment}
                  />
                ))}
              </div>
            </ImageDimensionsContext.Provider>
          ) : null}
        </div>
      </div>

      {data ? (
        <div className="z-20 shrink-0">
          <BottomBar>
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onChange={goPage}
              onRefresh={() => void query.refetch()}
              refreshing={query.isFetching}
              pullProgress={pullState.progress}
              className="min-w-0 flex-1"
            />
          </BottomBar>
        </div>
      ) : null}
    </div>
  )
}
