import type { ThreadSummary } from '@shared/types'
import { cn } from '@/lib/utils'
import { ListRow } from './ListRow'

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

/** 板块列表项：左侧回复数徽章 + 标题两行截断（见 docs/design-system.md §5.2） */
export function ThreadRow({
  thread,
  onOpen,
  active = false,
  read = false,
  newReplies = 0,
}: ThreadRowProps) {
  return (
    <ListRow
      active={active}
      read={read}
      badgeAccent={read || active}
      badgeLabel={thread.replies === null ? '回复数未知' : `${thread.replies} 条回复${newReplies > 0 ? `，${newReplies} 条新增` : ''}`}
      title={thread.title}
      onOpen={onOpen}
      badge={
        <>
          <span
            className={cn(
              'text-meta font-medium tnum',
              read || active ? 'text-accent-strong' : 'text-text',
            )}
          >
            {thread.replies ?? '—'}
          </span>
          {newReplies > 0 ? (
            <span className="text-meta font-medium tnum text-flag-strong">+{newReplies}</span>
          ) : null}
        </>
      }
    />
  )
}
