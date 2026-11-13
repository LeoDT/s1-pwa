import { useQuery } from '@tanstack/react-query'
import { Dialog } from '@/components/Dialog'
import { errorMessage } from '@/lib/errors'
import { fetchAuthorStats, type AuthorStats } from '@/lib/authorStats'
import { useDeferredLoading } from '@/lib/useDeferredLoading'

interface AuthorDialogProps {
  uid: number
  fallbackName: string
  onClose: () => void
}

/** 点击作者名后按需读取公开资料；不持久化原始响应。 */
export function AuthorDialog({ uid, fallbackName, onClose }: AuthorDialogProps) {
  const query = useQuery({
    queryKey: ['author-stats', uid],
    queryFn: () => fetchAuthorStats(uid),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })
  const pending = useDeferredLoading(query.isPending)

  return (
    <Dialog title="作者信息" onClose={onClose}>
      {pending ? <p className="text-ui text-muted">正在读取作者资料…</p> : null}

      {query.isError ? (
        <div className="space-y-3">
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

      {query.data ? <AuthorStatsView stats={query.data} fallbackName={fallbackName} /> : null}
    </Dialog>
  )
}

function AuthorStatsView({ stats, fallbackName }: { stats: AuthorStats; fallbackName: string }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-body font-medium text-text">{stats.name || fallbackName}</p>
        <p className="text-meta text-muted">uid {stats.uid}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="发帖" value={stats.posts} />
        <Stat label="主题" value={stats.threads} />
        <Stat label="战斗力" value={stats.e} unit="鹅" />
      </dl>

      <p className="text-meta leading-relaxed text-muted">
        数据按需读取自 S1 手机版公开资料，不保存原始响应。
      </p>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-light px-3 py-2">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="mt-0.5 text-ui font-medium tabular-nums text-text">
        {value === null ? '—' : value}
        {value !== null && unit ? <span className="ml-1 text-meta font-normal text-muted">{unit}</span> : null}
      </dd>
    </div>
  )
}
