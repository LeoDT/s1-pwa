import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { Shell } from './shell'
import { Gate } from './gate'
import { ChromeProvider } from './chrome'
import { StatusPage } from '@/features/status/StatusPage'
import { BrowseView } from '@/features/browse/BrowseView'
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

export function BrowseRoute() {
  const params = useParams({ strict: false }) as { fid?: string; tid?: string; page?: string }
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const fid = params.fid === undefined ? undefined : Number.parseInt(params.fid, 10)
  const tid = params.tid === undefined ? undefined : Number.parseInt(params.tid, 10)
  const page = Number.parseInt(params.page ?? '1', 10) || 1
  if (fid !== undefined && (!Number.isSafeInteger(fid) || fid <= 0)) return <EmptyState text="板块参数不正确" />
  if (tid !== undefined && (!Number.isSafeInteger(tid) || tid <= 0)) return <EmptyState text="帖子参数不正确" />

  return <BrowseView fid={fid} tid={tid} page={page} fromHistory={pathname.startsWith('/history')} />
}

const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'browse',
  component: BrowseRoute,
})

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: IndexRoute }),
  browseRoute.addChildren([
    createRoute({ getParentRoute: () => browseRoute, path: '/f/$fid' }),
    createRoute({ getParentRoute: () => browseRoute, path: '/t/$tid' }),
    createRoute({ getParentRoute: () => browseRoute, path: '/t/$tid/$page' }),
    createRoute({ getParentRoute: () => browseRoute, path: '/history' }),
    createRoute({ getParentRoute: () => browseRoute, path: '/history/t/$tid' }),
    createRoute({ getParentRoute: () => browseRoute, path: '/history/t/$tid/$page' }),
  ]),
  createRoute({ getParentRoute: () => rootRoute, path: '/debug', component: StatusPage }),
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
