import { useState } from 'react'
import { BrowseLayout, EmptySelection } from './BrowseLayout'
import { ForumPane } from './ForumPane'
import { ThreadPane } from './ThreadPane'
import { HistoryPane } from '@/features/history/HistoryPane'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useThreadPage } from './queries'

type ListSource = { kind: 'forum'; fid: number } | { kind: 'history' } | null

interface BrowseViewProps {
  fid?: number
  tid?: number
  page?: number
  fromHistory?: boolean
}

function sameSource(left: ListSource, right: ListSource): boolean {
  return left?.kind === right?.kind &&
    (left?.kind !== 'forum' || (right?.kind === 'forum' && left.fid === right.fid))
}

export function BrowseView({ fid, tid, page = 1, fromHistory = false }: BrowseViewProps) {
  const query = useThreadPage(tid ?? 0, page, tid !== undefined)
  const showPending = useDeferredLoading(tid !== undefined && query.isPending)
  const wide = useMediaQuery('(min-width: 1024px)')
  const resolvedFid = query.data?.fid
  const forumId = resolvedFid !== undefined && Number.isSafeInteger(resolvedFid) && resolvedFid > 0
    ? resolvedFid : null
  const [source, setSource] = useState<ListSource>(null)
  const nextSource: ListSource = fid !== undefined ? { kind: 'forum', fid }
    : fromHistory ? { kind: 'history' }
      : source ?? (forumId === null ? null : { kind: 'forum', fid: forumId })
  if (!sameSource(source, nextSource)) setSource(nextSource)

  const visible = wide || tid === undefined
  let sidebar
  if (nextSource?.kind === 'history') {
    sidebar = <HistoryPane activeTid={tid} visible={visible} />
  } else if (nextSource?.kind === 'forum') {
    sidebar = <ForumPane key={nextSource.fid} fid={nextSource.fid} activeTid={tid} visible={visible} />
  } else if (query.isError) {
    sidebar = <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  } else if (query.isPending) {
    sidebar = showPending ? <ListSkeleton /> : null
  } else {
    sidebar = <EmptyState text="无法确定帖子所属板块" />
  }

  return (
    <BrowseLayout
      narrow={tid === undefined ? 'sidebar' : 'main'}
      sidebar={sidebar}
      main={tid === undefined ? <EmptySelection /> : (
        <ThreadPane
          key={`${tid}:${page}`}
          tid={tid}
          page={page}
          query={query}
          forumId={nextSource?.kind === 'forum' ? nextSource.fid : forumId}
          fromHistory={nextSource?.kind === 'history'}
        />
      )}
    />
  )
}
