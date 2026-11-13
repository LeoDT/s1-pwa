import { useState } from 'react'
import { ChevronDown, ChevronUp, Star } from 'lucide-react'
import type { PostRatings as PostRatingsData } from '@shared/types'
import { formatRatingScore } from '@/lib/ratings'
import { cn } from '@/lib/utils'
import { RatingRow } from './RatingRow'
import { RatingsDialog } from './RatingsDialog'

interface PostRatingsProps {
  tid: number
  pid: number
  ratings: PostRatingsData
}

/** 楼层评分：默认只显示合计，展开显示帖子页内联的前 20 条。 */
export function PostRatings({ tid, pid, ratings }: PostRatingsProps) {
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const hasEntries = ratings.entries.length > 0
  const hasMore = ratings.count > ratings.entries.length
  const tone = ratings.score > 0 ? 'text-flag-strong' : ratings.score < 0 ? 'text-danger' : 'text-text'

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (hasEntries ? setExpanded((value) => !value) : setDialogOpen(true))}
        aria-expanded={hasEntries ? expanded : undefined}
        aria-label={`评分 ${formatRatingScore(ratings.score)}，${ratings.count} 人参与`}
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-panel-light px-2.5 text-meta text-text transition-colors duration-[var(--motion-press)] hover:bg-panel active:bg-panel"
      >
        <Star size={12} className="shrink-0 text-flag" />
        <span>
          评分 <span className={cn('font-medium tabular-nums', tone)}>{formatRatingScore(ratings.score)}</span>
        </span>
        <span className="text-muted">· {ratings.count} 人</span>
        {hasEntries ? (
          expanded ? <ChevronUp size={13} className="shrink-0 text-muted" /> : <ChevronDown size={13} className="shrink-0 text-muted" />
        ) : null}
      </button>

      {expanded && hasEntries ? (
        <div className="mt-1.5 border-l-2 border-line/70 pl-3">
          <ul className="space-y-1">
            {ratings.entries.map((entry, index) => (
              <RatingRow key={`${entry.uid ?? entry.name}-${index}`} entry={entry} />
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="mt-1 text-meta text-link hover:text-link-hover hover:underline"
            >
              查看全部 {ratings.count} 条评分
            </button>
          ) : null}
        </div>
      ) : null}

      {dialogOpen ? (
        <RatingsDialog tid={tid} pid={pid} summary={ratings} onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  )
}
