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
import { LoginPage } from '@/features/auth/LoginPage'
import { StatusPage } from '@/features/status/StatusPage'
import { BoardsPage } from '@/features/boards/BoardsPage'
import { BrowseLayout, EmptySelection } from '@/features/browse/BrowseLayout'
import { ForumPane } from '@/features/browse/ForumPane'
import { ThreadPane } from '@/features/browse/ThreadPane'
import { getLastFid } from '@/features/browse/lastForum'
import { getListState } from '@/lib/navigation'
import { useBoards } from '@/features/browse/queries'
import { DEFAULT_BOARDS } from '@/lib/boards'
import { ListSkeleton, EmptyState } from '@/components/states'

const rootRoute = createRootRoute({
  component: () => (
    <ChromeProvider>
      <Shell>
        <Gate>
          <Outlet />
        </Gate>
      </Shell>
    </ChromeProvider>
  ),
})

function IndexRoute() {
  const boards = useBoards()
  if (boards.isPending) return <ListSkeleton rows={5} />
  const first = boards.data?.[0]
  if (!first) return <EmptyState text="还没有常用板块，去「板块管理」添加" />
  return <Navigate to="/f/$fid" params={{ fid: String(first.fid) }} replace />
}

function ForumRoute() {
  const params = useParams({ strict: false }) as { fid?: string; page?: string }
  const fid = Number.parseInt(params.fid ?? '', 10)
  const page = Number.parseInt(params.page ?? '1', 10) || 1
  if (!Number.isFinite(fid)) return <EmptyState text="板块参数不正确" />

  return (
    <BrowseLayout
      narrow="sidebar"
      sidebar={<ForumPane fid={fid} page={page} />}
      main={<EmptySelection />}
    />
  )
}

function ThreadRoute() {
  const params = useParams({ strict: false }) as { tid?: string; page?: string }
  const tid = Number.parseInt(params.tid ?? '', 10)
  const page = Number.parseInt(params.page ?? '1', 10) || 1
  if (!Number.isFinite(tid)) return <EmptyState text="帖子参数不正确" />

  const sidebarFid = getLastFid() ?? DEFAULT_BOARDS[0]?.fid ?? 4
  const sidebarPage = getListState(sidebarFid)?.page ?? 1

  return (
    <BrowseLayout
      narrow="main"
      sidebar={<ForumPane fid={sidebarFid} page={sidebarPage} setTitle={false} />}
      main={<ThreadPane tid={tid} page={page} />}
    />
  )
}

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: IndexRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/f/$fid', component: ForumRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/f/$fid/$page', component: ForumRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/t/$tid', component: ThreadRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/t/$tid/$page', component: ThreadRoute }),
  createRoute({ getParentRoute: () => rootRoute, path: '/boards', component: BoardsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/debug', component: StatusPage }),
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
