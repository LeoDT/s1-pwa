import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useParams,
} from '@tanstack/react-router'
import { Shell } from './shell'
import { Gate } from './gate'
import { ChromeProvider } from './chrome'
import { StatusPage } from '@/features/status/StatusPage'
import { BrowseLayout, EmptySelection } from '@/features/browse/BrowseLayout'
import { ForumPane } from '@/features/browse/ForumPane'
import { ThreadView } from '@/features/browse/ThreadView'
import { HistoryPane } from '@/features/history/HistoryPane'
import { HistorySync } from '@/features/progress/HistorySync'
import { useBoards } from '@/features/browse/queries'
import { ListSkeleton, EmptyState } from '@/components/states'
import { useDeferredLoading } from '@/lib/useDeferredLoading'

const rootRoute = createRootRoute({
  component: () => (
    <ChromeProvider>
      <Shell>
        <Gate>
          <HistorySync />
          <Outlet />
        </Gate>
      </Shell>
    </ChromeProvider>
  ),
})

function IndexRoute() {
  const boards = useBoards()
  const showPending = useDeferredLoading(boards.isPending)
  if (boards.isPending) return showPending ? <ListSkeleton rows={5} /> : null
  const first = boards.data?.[0]
  if (!first) return <EmptyState text="还没有常用板块，去「设置 → 常用板块」添加" />
  return <Navigate to="/f/$fid" params={{ fid: String(first.fid) }} replace />
}

function ForumRoute() {
  const params = useParams({ strict: false }) as { fid?: string }
  const fid = Number.parseInt(params.fid ?? '', 10)
  if (!Number.isFinite(fid)) return <EmptyState text="板块参数不正确" />

  return (
    <BrowseLayout
      narrow="sidebar"
      sidebar={<ForumPane key={fid} fid={fid} />}
      main={<EmptySelection />}
    />
  )
}

function ThreadRoute({ fromHistory = false }: { fromHistory?: boolean }) {
  const params = useParams({ strict: false }) as { tid?: string; page?: string }
  const tid = Number.parseInt(params.tid ?? '', 10)
  const page = Number.parseInt(params.page ?? '1', 10) || 1
  if (!Number.isFinite(tid)) return <EmptyState text="帖子参数不正确" />

  return <ThreadView tid={tid} page={page} fromHistory={fromHistory} />
}

function HistoryRoute() {
  return (
    <BrowseLayout narrow="sidebar" sidebar={<HistoryPane />} main={<EmptySelection />} />
  )
}

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: IndexRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/f/$fid', component: ForumRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/t/$tid', component: ThreadRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/t/$tid/$page', component: ThreadRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/history', component: HistoryRoute }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/history/t/$tid',
    component: () => <ThreadRoute fromHistory />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/history/t/$tid/$page',
    component: () => <ThreadRoute fromHistory />,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/debug', component: StatusPage }),
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
