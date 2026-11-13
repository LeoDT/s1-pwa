import type { RatingEntry } from '@shared/types'
import { formatRatingScore } from '@/lib/ratings'
import { cn } from '@/lib/utils'

export function RatingRow({ entry, detailed = false }: { entry: RatingEntry; detailed?: boolean }) {
  return (
    <li className="flex items-baseline gap-2 text-meta">
      <span
        className={cn(
          'w-9 shrink-0 text-right font-medium tabular-nums',
          entry.score > 0 ? 'text-flag-strong' : entry.score < 0 ? 'text-danger' : 'text-text',
        )}
      >
        {formatRatingScore(entry.score)}
      </span>
      <span className="min-w-0 truncate text-text">{entry.name || '匿名'}</span>
      {entry.time ? <span className="shrink-0 tabular-nums text-muted">{entry.time}</span> : null}
      {entry.reason ? (
        <span
          className={cn('min-w-0 truncate text-muted', detailed && 'whitespace-normal break-words')}
          title={entry.reason}
        >
          {entry.reason}
        </span>
      ) : null}
    </li>
  )
}
