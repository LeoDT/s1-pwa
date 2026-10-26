import { BrowseLayout } from './BrowseLayout'
import { ForumPane } from './ForumPane'
import { ThreadPane } from './ThreadPane'
import { HistoryPane } from '@/features/history/HistoryPane'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states'
import { errorMessage } from '@/lib/errors'
import { useDeferredLoading } from '@/lib/useDeferredLoading'
import { useThreadPage } from './queries'

interface ThreadViewProps {
  tid: number
  page: number
  fromHistory?: boolean
}

export function ThreadView({ tid, page, fromHistory = false }: ThreadViewProps) {
  const query = useThreadPage(tid, page)
  const showPending = useDeferredLoading(query.isPending)
  const fid = query.data?.fid
  const forumId = fid !== undefined && Number.isSafeInteger(fid) && fid > 0 ? fid : null

  let sidebar
  if (fromHistory) {
    sidebar = <HistoryPane activeTid={tid} />
  } else if (forumId !== null) {
    sidebar = <ForumPane key={forumId} fid={forumId} activeTid={tid} />
  } else if (query.isError) {
    sidebar = <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  } else if (query.isPending) {
    sidebar = showPending ? <ListSkeleton /> : null
  } else {
    sidebar = <EmptyState text="无法确定帖子所属板块" />
  }

  return (
    <BrowseLayout
      narrow="main"
      sidebar={sidebar}
      main={<ThreadPane tid={tid} page={page} query={query} forumId={forumId} fromHistory={fromHistory} />}
    />
  )
}
