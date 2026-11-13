import { useQuery } from '@tanstack/react-query'
import type { PostRatings as PostRatingsData } from '@shared/types'
import { Dialog } from '@/components/Dialog'
import { errorMessage } from '@/lib/errors'
import { fetchPostRatings, formatRatingScore } from '@/lib/ratings'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { RatingRow } from './RatingRow'

interface RatingsDialogProps {
  tid: number
  pid: number
  summary: PostRatingsData
  onClose: () => void
}

export function RatingsDialog({ tid, pid, summary, onClose }: RatingsDialogProps) {
  const query = useQuery({
    queryKey: ['post-ratings', tid, pid],
    queryFn: () => fetchPostRatings(tid, pid),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  })
  const pending = useDeferredLoading(query.isPending)
  const entries = query.data ?? summary.entries

  return (
    <Dialog
      title={`评分 ${formatRatingScore(summary.score)} · ${summary.count} 人`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {pending && !query.data ? <p className="text-ui text-muted">正在读取全部评分…</p> : null}

        {query.isError ? (
          <div className="space-y-2">
            <p className="text-ui text-danger">{errorMessage(query.error)}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-md border border-line px-3 py-1.5 text-ui text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
            >
              重试
            </button>
          </div>
        ) : null}

        {entries.length > 0 ? (
          <ul className="space-y-1.5">
            {entries.map((entry, index) => (
              <RatingRow key={`${entry.uid ?? entry.name}-${index}`} entry={entry} detailed />
            ))}
          </ul>
        ) : !pending && !query.isError ? (
          <p className="text-ui text-muted">暂无评分</p>
        ) : null}
      </div>
    </Dialog>
  )
}
