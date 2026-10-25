import { useState } from 'react'
import { ChevronDown, ChevronUp, CornerUpRight } from 'lucide-react'
import type { QuoteBlock as QuoteBlockData } from '@shared/types'
import { Content } from './Content'
import { cn } from '@/lib/utils'

const COLLAPSE_THRESHOLD = 420

interface QuoteBlockProps {
  quote: QuoteBlockData
  base: string
  onOpenPost: (tid: number, pid: number) => void
}

/** 引用块：有 pid 才可点（跳到被引用的楼层），见 docs/design-system.md §5.4 */
export function QuoteBlock({ quote, base, onOpenPost }: QuoteBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = quote.html.length > COLLAPSE_THRESHOLD
  const clickable = quote.pid !== undefined && quote.tid !== undefined

  return (
    <div className="mb-2 rounded-sm border-l-[3px] border-line bg-panel-light/70 px-3 py-2">
      <div className="mb-1 flex items-start gap-1 text-meta text-muted">
        {clickable ? (
          <button
            type="button"
            onClick={() => onOpenPost(quote.tid as number, quote.pid as number)}
            className="flex items-center gap-1 hover:text-link-hover hover:underline"
          >
            <CornerUpRight size={13} className="shrink-0" />
            <span className="truncate">{quote.header ?? '引用'}</span>
          </button>
        ) : (
          <span className="truncate">{quote.header ?? '引用'}</span>
        )}
      </div>

      <div
        className={cn(
          'text-body leading-relaxed text-text',
          collapsible && !expanded && 'max-h-32 overflow-hidden',
        )}
      >
        <Content html={quote.html} base={base} onOpenPost={onOpenPost} />
      </div>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex items-center gap-1 text-meta text-link"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? '收起' : '展开'}
        </button>
      ) : null}
    </div>
  )
}
