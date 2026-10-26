import { useLayoutEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { BottomBar } from '@/components/BottomBar'
import { ToolbarButton } from '@/components/ToolbarButton'
import type { BoardEntry } from '@/lib/boards'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { cn } from '@/lib/utils'

/**
 * 板块条的横向滚动位置在组件重挂载（切板块会换 key）之间保留，
 * 否则点右上角的板块时整条会跳回最左边。
 */
let rememberedScrollLeft = 0

interface BoardTabsProps {
  boards: BoardEntry[]
  activeFid?: number
  onSelect: (fid: number) => void
  /** 大屏专用：没有下拉手势，用按钮刷新（列表 = 回第 1 页） */
  onRefresh?: () => void | Promise<unknown>
  refreshing?: boolean
}

/**
 * 常用板块条：贴在看板底部的固定条（大屏限在左栏宽度内）。
 * 管理入口在设置里，这里只做切换。见 docs/navigation.md §4。
 */
export function BoardTabs({
  boards,
  activeFid,
  onSelect,
  onRefresh,
  refreshing = false,
}: BoardTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const showRefreshing = useDeferredLoading(refreshing)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollLeft = rememberedScrollLeft
  }, [])

  return (
    <nav
      aria-label="常用板块"
      className="absolute inset-x-0 bottom-0 z-20"
    >
      <BottomBar>
        <div
          ref={scrollRef}
          onScroll={(event) => {
            rememberedScrollLeft = event.currentTarget.scrollLeft
          }}
          onWheel={(event) => {
            // 桌面没有横滑手势：滚轮在板块条上直接横向滚动（不改页面滚动）
            const element = event.currentTarget
            if (element.scrollWidth <= element.clientWidth) return
            element.scrollLeft += event.deltaY
          }}
          className="board-tabs-scroll flex min-w-0 flex-1 snap-x snap-proximity items-stretch overflow-x-auto"
        >
          {boards.map((board) => {
            const active = board.fid === activeFid
            return (
              <button
                key={board.fid}
                type="button"
                onClick={() => onSelect(board.fid)}
                className={cn(
                  'relative flex-[1_0_auto] snap-start whitespace-nowrap px-3 text-meta',
                  active ? 'font-medium text-accent-strong' : 'text-text',
                )}
              >
                {board.name}
                {active ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent-strong" />
                ) : null}
              </button>
            )
          })}
        </div>

        {onRefresh ? (
          <ToolbarButton
            type="button"
            aria-label="刷新"
            title="刷新"
            disabled={refreshing}
            onClick={() => void onRefresh()}
            className="hidden border-l border-line px-3 text-text lg:inline-flex"
          >
            <RefreshCw size={16} className={cn(showRefreshing && 'animate-spin')} />
          </ToolbarButton>
        ) : null}
      </BottomBar>
    </nav>
  )
}
