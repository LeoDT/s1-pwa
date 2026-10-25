import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
    <div className={cn('flex items-center justify-center gap-2 text-[14px] text-text', className)}>
      <button
        type="button"
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className="inline-flex size-11 items-center justify-center rounded-md disabled:opacity-40 active:bg-panel-light"
      >
        <ChevronLeft size={20} />
      </button>

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
          className="rounded-md px-2 py-1 tnum active:bg-panel-light"
        >
          {page} / {totalPages}
        </button>
      )}

      <button
        type="button"
        aria-label="下一页"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        className="inline-flex size-11 items-center justify-center rounded-md disabled:opacity-40 active:bg-panel-light"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  )
}
