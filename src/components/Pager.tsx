import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from 'lucide-react'
import { ToolbarButton } from '@/components/ToolbarButton'
import { cn } from '@/lib/utils'

interface PagerProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** 最后一页时「下一页」位置改为刷新 */
  onRefresh?: () => void
  refreshing?: boolean
  /** 0..1，上拉进度；用于旋转下一页/刷新图标 */
  pullProgress?: number
  className?: string
}

/** 页码条：‹ 3 / 15 ›，点中间可以输入页码（见 docs/design-system.md §5.6） */
export function Pager({ page, totalPages, onChange, onRefresh, refreshing = false, pullProgress = 0, className }: PagerProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(page))

  const go = (target: number) => {
    const clamped = Math.min(Math.max(1, target), Math.max(1, totalPages))
    if (clamped !== page) onChange(clamped)
  }

  const hasNext = page < totalPages
  const progress = Math.min(1, Math.max(0, pullProgress))
  const pulling = progress > 0
  const nextLabel = hasNext ? '下一页' : '刷新'
  const nextAction = () => {
    if (hasNext) go(page + 1)
    else onRefresh?.()
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-0 gap-y-0 text-ui text-text sm:gap-x-1', className)}>
      <PagerButton label="第一页" disabled={page <= 1} onClick={() => go(1)}>
        <ChevronsLeft size={18} />
      </PagerButton>

      <PagerButton label="上一页" disabled={page <= 1} onClick={() => go(page - 1)}>
        <ChevronLeft size={20} />
      </PagerButton>

      {editing ? (
        <input
          autoFocus
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setEditing(false)
              const parsed = Number.parseInt(draft, 10)
              if (Number.isFinite(parsed)) go(parsed)
            }
            if (event.key === 'Escape') setEditing(false)
          }}
          className="w-16 rounded-md border border-line bg-canvas px-2 py-1 text-center tnum"
        />
      ) : (
        <ToolbarButton
          type="button"
          onClick={() => {
            setDraft(String(page))
            setEditing(true)
          }}
          className="px-1"
        >
          <span className="whitespace-nowrap px-2 tnum">{page} / {totalPages}</span>
        </ToolbarButton>
      )}

      <PagerButton
        label={nextLabel}
        disabled={refreshing || (!hasNext && !onRefresh)}
        onClick={nextAction}
      >
        {hasNext ? (
          <span
            className={cn(
              'inline-flex items-center justify-center',
              pulling ? 'text-accent-strong' : 'transition-transform duration-150',
            )}
            style={{ transform: `rotate(${progress * 90}deg)` }}
          >
            <ChevronRight size={20} />
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center justify-center',
              pulling ? 'text-accent-strong' : 'transition-transform duration-150',
            )}
            style={refreshing ? undefined : {
              transform: `rotate(${progress * 180}deg) scale(${1 + progress * 0.1})`,
            }}
          >
            <RefreshCw size={18} className={cn(refreshing && 'animate-spin')} />
          </span>
        )}
      </PagerButton>

      <PagerButton
        label="最后一页"
        disabled={page >= totalPages}
        onClick={() => go(totalPages)}
      >
        <ChevronsRight size={18} />
      </PagerButton>
    </div>
  )
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <ToolbarButton
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  )
}
