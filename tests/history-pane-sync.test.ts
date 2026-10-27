import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uid: 7 as number | undefined, request: vi.fn(), refresh: vi.fn(), wide: false,
  rows: [] as Array<{ tid: number; fid: number; forumName: string; title: string; metadataVersion: null; openedAt: number; read: null; position: null }>,
  onProgress: undefined as (() => void) | undefined,
}))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: mocks.uid == null ? null : { uid: mocks.uid }, isSuccess: true }) }))
vi.mock('@/lib/progressEvents', () => ({ requestHistorySync: mocks.request, subscribeProgress: () => () => {} }))
vi.mock('@/lib/useMediaQuery', () => ({ useMediaQuery: () => mocks.wide }))
vi.mock('@/features/browse/queries', () => ({ useBoards: () => ({ data: [] }) }))
vi.mock('@/lib/useListRefresh', () => ({ useListRefresh: () => ({ refresh: mocks.refresh, refreshing: false, error: null }) }))
vi.mock('@/lib/usePullToRefresh', () => ({ PULL_THRESHOLD: 64, usePullToRefresh: () => ({ pull: 0, refreshing: false }) }))
vi.mock('@/lib/useDeferredLoading', () => ({ useDeferredLoading: (value: boolean) => value }))
vi.mock('@/app/chrome', () => ({ useSetSettingsOpen: () => vi.fn() }))
vi.mock('@/features/browse/BoardTabs', () => ({ BoardTabs: () => null }))
vi.mock('@/features/browse/ListRow', () => ({ ListRow: ({ title }: { title: string }) => createElement('div', { 'data-testid': 'history-row' }, title) }))
vi.mock('@/components/states', () => ({ EmptyState: () => null, ErrorState: () => null, ListSkeleton: () => null }))
vi.mock('@/lib/progress', () => ({
  clearProgress: vi.fn(), clearServerHistory: vi.fn(), fetchHistory: vi.fn(), mergeProgress: vi.fn(),
  deleteServerProgress: vi.fn(), loadProgress: vi.fn(async () => mocks.rows), removeProgress: vi.fn(),
  subscribeProgress: (listener: () => void) => { mocks.onProgress = listener; return () => { mocks.onProgress = undefined } },
}))
vi.mock('@/lib/navigation', () => ({ markFromList: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
import { HistoryPane } from '@/features/history/HistoryPane'

describe('HistoryPane automatic history sync', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  let client: QueryClient | undefined
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined; host?.remove(); host = undefined; client?.clear(); client = undefined
    mocks.request.mockClear(); mocks.refresh.mockClear(); mocks.uid = 7; mocks.rows = []; mocks.onProgress = undefined
  })
  function render(visible: boolean) {
    host = document.createElement('div'); document.body.append(host)
    client = new QueryClient(); root = createRoot(host)
    act(() => root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(HistoryPane, { visible }) })))
  }

  it('requests a pull only while visible and on each valid UID, without invoking manual refresh or scrolling', () => {
    render(false)
    expect(mocks.request).not.toHaveBeenCalled()
    act(() => root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(HistoryPane, { visible: true }) })))
    expect(mocks.request).toHaveBeenCalledWith({ accountId: 7, pull: true, ifStale: true })
    act(() => root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(HistoryPane, { visible: true }) })))
    expect(mocks.request).toHaveBeenCalledTimes(1)
    const scroll = host!.querySelector<HTMLElement>('.overflow-y-auto')!
    scroll.scrollTop = 135
    act(() => { mocks.uid = 8; root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(HistoryPane, { visible: true }) })) })
    expect(mocks.request).toHaveBeenLastCalledWith({ accountId: 8, pull: true, ifStale: true })
    expect(scroll.scrollTop).toBe(135)
    act(() => root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(HistoryPane, { visible: false }) })))
    expect(mocks.request).toHaveBeenCalledTimes(2)
    act(() => root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(HistoryPane, { visible: true }) })))
    expect(mocks.request).toHaveBeenCalledTimes(3)
    expect(mocks.request).toHaveBeenLastCalledWith({ accountId: 8, pull: true, ifStale: true })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('does not request sync for a guest session', () => {
    mocks.uid = undefined
    render(true)
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('refreshes displayed local history from the progress subscription without scrolling to top', async () => {
    mocks.rows = [{ tid: 1, fid: 2, forumName: 'board', title: 'Before', metadataVersion: null, openedAt: 1, read: null, position: null }]
    render(true)
    await act(async () => { await vi.waitFor(() => expect(host!.textContent).toContain('Before')) })
    const scroll = host!.querySelector<HTMLElement>('.overflow-y-auto')!
    scroll.scrollTop = 135
    mocks.rows = [{ tid: 2, fid: 2, forumName: 'board', title: 'After merge', metadataVersion: null, openedAt: 2, read: null, position: null }]
    await act(async () => { mocks.onProgress?.(); await vi.waitFor(() => expect(host!.textContent).toContain('After merge')) })
    expect(host!.textContent).not.toContain('Before')
    expect(scroll.scrollTop).toBe(135)
  })
})
