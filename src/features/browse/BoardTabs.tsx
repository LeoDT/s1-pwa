import type { BoardEntry } from '@/lib/boards'
import { cn } from '@/lib/utils'

interface BoardTabsProps {
  boards: BoardEntry[]
  activeFid?: number
  onSelect: (fid: number) => void
}

/**
 * 常用板块条：贴在看板底部的固定条（大屏限在左栏宽度内）。
 * 管理入口在设置里，这里只做切换。见 docs/navigation.md §4。
 */
export function BoardTabs({ boards, activeFid, onSelect }: BoardTabsProps) {
  return (
    <nav
      aria-label="常用板块"
      className="absolute inset-x-0 bottom-0 z-20 flex h-[calc(var(--bar-h)+env(safe-area-inset-bottom))] items-stretch border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex min-w-0 flex-1 snap-x snap-proximity items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {boards.map((board) => {
          const active = board.fid === activeFid
          return (
            <button
              key={board.fid}
              type="button"
              onClick={() => onSelect(board.fid)}
              className={cn(
                'relative shrink-0 snap-start whitespace-nowrap px-3.5 text-ui',
                active ? 'font-medium text-heading' : 'text-text',
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
    </nav>
  )
}
