import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ListRowProps {
  /** 左侧等宽徽章的内容 */
  badge: ReactNode
  /** 徽章描边与文字用主题色（已读/激活） */
  badgeAccent?: boolean
  badgeLabel?: string
  title: string
  /** 标题下方的次级信息（板块 · 时间等） */
  meta?: ReactNode
  /** 当前正在阅读的条目 */
  active?: boolean
  /** 有阅读历史：保留左侧主题色竖条 */
  read?: boolean
  onOpen: () => void
  /** 右侧操作（删除等）。必须是独立按钮，不能嵌在 onOpen 按钮里 */
  action?: ReactNode
}

/**
 * 列表行骨架：板块帖子与浏览历史共用同一套间距/徽章/激活态，
 * 见 docs/design-system.md §5.2。
 */
export function ListRow({
  badge,
  badgeAccent = false,
  badgeLabel,
  title,
  meta,
  active = false,
  read = false,
  onOpen,
  action,
}: ListRowProps) {
  return (
    <div
      className={cn(
        'flex w-full items-start transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light',
        active && 'bg-panel-light',
        (active || read) && 'shadow-[inset_3px_0_0_var(--color-accent-strong)]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 py-2 pl-4 pr-4 text-left"
      >
        <span
          aria-label={badgeLabel}
          className={cn(
            'mt-0.5 flex min-w-9 shrink-0 flex-col items-center rounded-sm border bg-panel-light px-1.5 py-0.5',
            badgeAccent ? 'border-accent-strong' : 'border-line',
          )}
        >
          {badge}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'line-clamp-2 block text-ui font-medium leading-[1.45]',
              active ? 'text-accent-strong' : 'text-text',
            )}
          >
            {title}
          </span>
          {meta ? <span className="mt-0.5 block truncate text-meta text-muted">{meta}</span> : null}
        </span>
      </button>

      {action ? <div className="flex shrink-0 items-start py-2 pr-2">{action}</div> : null}
    </div>
  )
}
