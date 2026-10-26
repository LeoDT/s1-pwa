import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const env = vi.hoisted(() => ({ wide: true, proxy: vi.fn() }))
vi.mock('@/app/shell', () => ({ Shell: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/gate', () => ({ Gate: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/chrome', () => ({ ChromeProvider: ({ children }: { children: React.ReactNode }) => children, useSetSettingsOpen: () => () => {} }))
vi.mock('@/features/progress/HistorySync', () => ({ HistorySync: () => null }))
vi.mock('@/lib/proxy', () => ({
  proxyFetch: env.proxy,
  UPSTREAM_ROOT: 'https://stage1st.com/2b/',
  upstreamUrl: (endpoint: string, params: Record<string, unknown>) => {
    const url = new URL(`https://stage1st.com/2b/${endpoint}`)
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value))
    return url.toString()
  },
}))
vi.mock('@/lib/boards', () => ({ loadBoards: async () => [{ fid: 6, name: 'Board 6' }, { fid: 51, name: 'Board 51' }] }))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: { uid: 7 }, isSuccess: true }) }))
vi.mock('@/lib/progress', () => ({
  createProgressVersion: () => ({ at: Date.now(), id: 'test' }),
  loadProgressIndex: async () => [], subscribeProgress: () => () => {},
  getNewReplies: () => 0, getProgress: async () => undefined,
  recordThreadOpened: async () => undefined,
  loadProgress: async () => [{ tid: 1826103, fid: 51, forumName: 'Board 51', title: 'History entry fixture', openedAt: 1, position: { page: 1, pid: 1, floor: 1 } }],
  fetchHistory: async () => [], mergeProgress: async () => {}, deleteServerProgress: async () => {}, clearServerHistory: async () => {}, removeProgress: async () => {}, clearProgress: async () => {},
}))
vi.mock('@/lib/useMediaQuery', () => ({ useMediaQuery: (query: string) => query.includes('min-width') ? env.wide : !env.wide }))
vi.mock('@/lib/navigation', () => ({ markFromList: () => {}, rememberListState: () => {}, getListState: () => undefined, consumeFromList: () => false }))
vi.mock('@/lib/useDeferredLoading', () => ({ useDeferredLoading: () => true }))
vi.mock('@/lib/usePrefs', () => ({ usePrefs: () => ({ edgeSwipe: false }) }))
vi.mock('@/lib/useSwipeBack', () => ({ useSwipeBack: () => {} }))
vi.mock('@/lib/useCollapsingHeader', () => ({ useCollapsingHeader: () => {} }))
vi.mock('@/features/browse/useReadingProgress', () => ({ useReadingProgress: () => ({}) }))
vi.mock('@/features/browse/useThreadReadState', () => ({ useThreadReadState: () => ({}) }))
vi.mock('@/lib/attachments', () => ({ downloadAttachment: vi.fn() }))
vi.mock('@/lib/locate', () => ({ locatePid: async () => null }))

import { router as appRouter } from '@/app/router'

const forumHtml = readFileSync(path.resolve(import.meta.dirname, 'fixtures/forumdisplay-fid6-p1.html'), 'utf8')
const threadHtml = readFileSync(path.resolve(import.meta.dirname, 'fixtures/viewthread-1826103-p1.html'), 'utf8')

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  disconnected = false
  target: Element | null = null
  root: Element | Document | null
  rootMargin: string
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.callback = callback; this.root = options?.root ?? null; this.rootMargin = options?.rootMargin ?? ''; FakeIntersectionObserver.instances.push(this) }
  observe(target: Element) { this.target = target }
  disconnect() { this.disconnected = true }
  unobserve() {}
  takeRecords() { return [] }
  thresholds = []
}

describe('browse navigation integration', () => {
  let host: HTMLDivElement
  let root: Root
  let client: QueryClient
  let router: ReturnType<typeof createRouter>
  const mount = async (url: string) => {
    router = createRouter({ routeTree: appRouter.options.routeTree, history: createMemoryHistory({ initialEntries: [url] }), defaultPreload: 'intent' })
    await router.load()
    act(() => root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router }))))
  }
  const navigate = async (url: string) => act(async () => { await router.navigate({ to: url as never }) })
  const wait = async (predicate: () => void) => act(async () => { await vi.waitFor(predicate) })
  const forumRequests = () => env.proxy.mock.calls.filter(([url]) => String(url).includes('mod=forumdisplay'))

  beforeEach(() => {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    env.proxy.mockReset().mockImplementation(async (url: string) => ({ html: String(url).includes('viewthread') ? threadHtml : forumHtml, url }))
    env.wide = true
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })
  beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
  afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('opens a real forum row and retains its DOM and scroll position while thread requests are delayed', async () => {
    let resolveThread!: (response: { html: string; url: string }) => void
    env.proxy.mockImplementation((url: string) => String(url).includes('mod=viewthread')
      ? new Promise((resolve) => { resolveThread = resolve })
      : Promise.resolve({ html: forumHtml, url }))
    await mount('/f/6')
    await wait(() => expect(host.querySelector('.divide-y button')).not.toBeNull())
    expect(forumRequests()).toHaveLength(1)
    const firstTitleButton = host.querySelector('.divide-y button') as HTMLButtonElement
    const firstRow = firstTitleButton.closest('.divide-y > *')
    const firstTitle = firstTitleButton.textContent?.trim()
    expect(firstRow).not.toBeNull()
    expect(firstTitle).toBeTruthy()
    const scrollPane = host.querySelector('.overflow-y-auto') as HTMLDivElement
    scrollPane.scrollTop = 347
    act(() => firstTitleButton.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await wait(() => expect(env.proxy.mock.calls.some(([url]) => String(url).includes('mod=viewthread'))).toBe(true))
    const threadRequest = String(env.proxy.mock.calls.find(([url]) => String(url).includes('mod=viewthread'))?.[0])
    const tid = new URL(threadRequest).searchParams.get('tid')!
    await wait(() => expect(router.state.location.pathname).toBe(`/t/${tid}`))
    expect(Array.from(host.querySelectorAll('.divide-y button')).some((button) => button.textContent?.trim() === firstTitle && button.closest('.divide-y > *') === firstRow)).toBe(true)
    expect((host.querySelector('.overflow-y-auto') as HTMLDivElement).scrollTop).toBe(347)
    expect(forumRequests()).toHaveLength(1)
    await act(async () => resolveThread({ html: threadHtml, url: `https://stage1st.com/2b/forum.php?mod=viewthread&tid=${tid}` }))
    env.proxy.mockImplementation(async (url: string) => ({ html: String(url).includes('viewthread') ? threadHtml : forumHtml, url }))
    await wait(() => expect(host.querySelector('h1')?.textContent).toContain('S1 NUX'))

    // Preseed the next page to make this a synchronous cache-backed page transition.
    const detail = client.getQueryData(['thread', Number(tid), 1]) as Record<string, unknown>
    client.setQueryData(['thread', Number(tid), 2], { ...detail, page: 2 })
    const detailScroller = host.querySelector('h1')?.closest('.mx-auto')?.parentElement as HTMLDivElement
    expect(detailScroller).toBeTruthy()
    detailScroller.scrollTop = 625
    const listNode = firstRow
    await navigate(`/t/${tid}/2`)
    await wait(() => expect(host.querySelector('h1')?.textContent).toContain('S1 NUX'))
    const pageTwoScroller = host.querySelector('h1')?.closest('.mx-auto')?.parentElement as HTMLDivElement
    expect(pageTwoScroller).not.toBe(detailScroller)
    expect(pageTwoScroller.scrollTop).toBe(0)
    expect(host.querySelector('.divide-y button')?.closest('.divide-y > *')).toBe(listNode)
    expect((host.querySelector('.overflow-y-auto') as HTMLDivElement).scrollTop).toBe(347)

    const secondTitle = 'Distinct cross-post result'
    env.proxy.mockImplementation(async (url: string) => ({ html: String(url).includes('tid=77') ? threadHtml.replaceAll('【论坛美化】S1 NUX【26/6/13 新增默认头像图片修改选项】', secondTitle) : forumHtml, url }))
    await navigate('/t/77')
    await wait(() => expect(host.querySelector('h1')?.textContent).toContain(secondTitle))
    const crossPostScroller = host.querySelector('h1')?.closest('.mx-auto')?.parentElement as HTMLDivElement
    expect(crossPostScroller).not.toBe(pageTwoScroller)
    expect(crossPostScroller.scrollTop).toBe(0)
    expect(Array.from(host.querySelectorAll('.divide-y button')).some((button) => button.textContent?.trim() === firstTitle && button.closest('.divide-y > *') === firstRow)).toBe(true)
    expect((host.querySelector('.overflow-y-auto') as HTMLDivElement).scrollTop).toBe(347)
    expect(forumRequests()).toHaveLength(1)
    await navigate('/f/51')
    await wait(() => expect(forumRequests()).toHaveLength(2))
    expect(String(forumRequests()[1][0])).toContain('fid=51')
    expect(host.querySelector('[class*=divide-y] > *')).not.toBe(firstRow)
  })

  it('disconnects the forum pagination observer on a narrow-screen detail and ignores queued callbacks', async () => {
    env.wide = false
    await mount('/f/6')
    await wait(() => expect(FakeIntersectionObserver.instances.some((observer) => observer.rootMargin === '600px 0px')).toBe(true))
    expect(forumRequests()).toHaveLength(1)
    const paginationObserver = FakeIntersectionObserver.instances.find((observer) => observer.rootMargin === '600px 0px')
    expect(paginationObserver).toBeDefined()
    expect(paginationObserver?.target?.parentElement?.textContent).toContain('加载中')
    expect(paginationObserver?.root).toBe(host.querySelector('.overflow-y-auto'))
    await navigate('/t/1826103')
    await wait(() => expect(paginationObserver?.disconnected).toBe(true))
    const target = paginationObserver!.target!
    act(() => paginationObserver!.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], paginationObserver as unknown as IntersectionObserver))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(forumRequests()).toHaveLength(1)
  })

  it('deep links fetch only the thread and its actual forum, not the default board', async () => {
    await mount('/t/1826103')
    await wait(() => expect(env.proxy.mock.calls.some(([url]) => String(url).includes('mod=viewthread'))).toBe(true))
    await wait(() => expect(forumRequests()).toHaveLength(1))
    const requested = forumRequests().map(([url]) => String(url))
    expect(requested).toHaveLength(1)
    expect(requested[0]).toContain('fid=51')
    expect(requested[0]).not.toContain('fid=6')
  })

  it('rebuilds the source from the thread forum after a full application reload', async () => {
    await mount('/f/6')
    await wait(() => expect(host.querySelector('.divide-y button')).not.toBeNull())
    await navigate('/t/1826103')
    await wait(() => expect(host.querySelector('h1')).not.toBeNull())
    expect(forumRequests()).toHaveLength(1)
    expect(String(forumRequests()[0][0])).toContain('fid=6')

    act(() => root.unmount())
    client.clear()
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    root = createRoot(host)
    env.proxy.mockClear()
    await mount('/t/1826103')
    await wait(() => expect(forumRequests()).toHaveLength(1))
    expect(String(forumRequests()[0][0])).toContain('fid=51')
  })

  it('keeps the source list during detail refresh and failed cross-post requests', async () => {
    await mount('/f/6')
    await wait(() => expect(host.querySelector('.divide-y button')).not.toBeNull())
    const list = host.querySelector('.divide-y')
    await navigate('/t/1826103')
    await wait(() => expect(host.querySelector('h1')).not.toBeNull())
    const threadRequests = () => env.proxy.mock.calls.filter(([url]) => String(url).includes('mod=viewthread'))
    expect(threadRequests()).toHaveLength(1)
    const refreshButtons = host.querySelectorAll<HTMLButtonElement>('button[aria-label="刷新"]')
    await act(async () => refreshButtons[refreshButtons.length - 1].click())
    await wait(() => expect(threadRequests()).toHaveLength(2))
    expect(forumRequests()).toHaveLength(1)
    expect(host.querySelector('.divide-y')).toBe(list)

    env.proxy.mockRejectedValueOnce(new Error('thread unavailable'))
    await navigate('/t/999')
    await wait(() => expect(host.textContent).toContain('thread unavailable'))
    expect(host.querySelector('.divide-y')).toBe(list)
    expect(forumRequests()).toHaveLength(1)
  })

  it('keeps a real loaded history row mounted when opening its title button', async () => {
    await mount('/history')
    const historyTitle = 'History entry fixture'
    await wait(() => expect(Array.from(host.querySelectorAll('button')).some((button) => button.textContent?.includes(historyTitle))).toBe(true))
    const titleButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes(historyTitle))!
    const historyRow = titleButton.closest('[class*=divide-y] > *')
    expect(historyRow?.textContent).toContain(historyTitle)
    act(() => titleButton.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await wait(() => expect(router.state.location.pathname).toBe('/history/t/1826103'))
    await wait(() => expect(Array.from(host.querySelectorAll('button')).some((button) => button.textContent?.includes(historyTitle))).toBe(true))
    const persistedHistoryButton = Array.from(host.querySelectorAll('.divide-y button')).find((button) => button.textContent?.includes(historyTitle))
    expect(persistedHistoryButton?.closest('.divide-y > *')).toBe(historyRow)
    expect(persistedHistoryButton?.textContent).toContain(historyTitle)
  })
})
