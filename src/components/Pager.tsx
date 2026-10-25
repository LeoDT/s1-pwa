import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PagerProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  className?: string
}

/** 页码条：‹ 3 / 15 ›，点中间可以输入页码（见 docs/design-system.md §5.6） */
export function Pager({ page, totalPages, onChange, className }: PagerProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(page))

  const go = (target: number) => {
    const clamped = Math.min(Math.max(1, target), Math.max(1, totalPages))
    if (clamped !== page) onChange(clamped)
  }

  return (
    <div className={cn('flex items-center justify-center gap-2 text-ui text-text', className)}>
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
        <button
          type="button"
          onClick={() => {
            setDraft(String(page))
            setEditing(true)
          }}
          className="group inline-flex h-11 items-center px-1"
        >
          <span className="inline-flex h-9 items-center rounded-md px-2 tnum transition-colors duration-[var(--motion-press)] group-hover:bg-panel-light group-active:bg-panel-light">
            {page} / {totalPages}
          </span>
        </button>
      )}

      <PagerButton label="下一页" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        <ChevronRight size={20} />
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
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="group inline-flex size-11 items-center justify-center disabled:opacity-40"
    >
      <span className="flex size-9 items-center justify-center rounded-md transition-colors duration-[var(--motion-press)] group-hover:bg-panel-light group-active:bg-panel-light">
        {children}
      </span>
    </button>
  )
}
