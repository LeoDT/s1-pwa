import type { ThreadSummary } from '@shared/types'
import { cn } from '@/lib/utils'

interface ThreadRowProps {
  thread: ThreadSummary
  onOpen: () => void
  /** 大屏左栏：当前正在阅读的帖子 */
  active?: boolean
  /** M3：有阅读历史时为 true，显示绿色标记 */
  read?: boolean
  /** M3：自上次打开以来新增回复数 */
  newReplies?: number
}

/** 列表项：左侧回复数徽章 + 标题两行截断（见 docs/design-system.md §5.2） */
export function ThreadRow({ thread, onOpen, active = false, read = false, newReplies = 0 }: ThreadRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-2.5 text-left active:bg-panel-light',
        active && 'bg-panel-light shadow-[inset_3px_0_0_var(--color-accent-strong)]',
        !active && read && 'shadow-[inset_3px_0_0_var(--color-accent-strong)]',
      )}
    >
      <span
        aria-label={`${thread.replies} 条回复${newReplies > 0 ? `，${newReplies} 条新增` : ''}`}
        className={cn(
          'mt-0.5 flex min-w-10 shrink-0 flex-col items-center rounded-sm border bg-panel-light px-1.5 py-1',
          read ? 'border-accent-strong' : 'border-line',
        )}
      >
        <span className={cn('text-[13px] font-medium tnum', read ? 'text-accent-strong' : 'text-text')}>
          {thread.replies}
        </span>
        {newReplies > 0 ? (
          <span className="text-[11px] font-medium tnum text-flag-strong">+{newReplies}</span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'line-clamp-2 block text-[15px] font-medium leading-[1.45]',
            active ? 'text-heading' : 'text-text',
          )}
        >
          {thread.title}
        </span>
      </span>
    </button>
  )
}
