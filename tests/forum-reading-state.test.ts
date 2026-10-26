import 'fake-indexeddb/auto'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORE_NAMES, idbClear, idbSet } from '@/lib/db'
import { getProgress, recordReadingPosition, recordThreadOpened, recordThreadReplies } from '@/lib/progress'
import type { ObservedForumPage } from '@/features/browse/queries'

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), refresh: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: { uid: 7 }, isSuccess: true }) }))
vi.mock('@/lib/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/features/browse/queries', async (original) => ({
  ...await original<typeof import('@/features/browse/queries')>(),
  fetchForumPage: mocks.refresh,
}))
import { ForumPane } from '@/features/browse/ForumPane'

const page = (replies: number | null, at: number): ObservedForumPage => ({
  fid: 6, name: 'board', page: 1, totalPages: 1,
  threads: [{ tid: 50, title: 'topic', replies }],
  observation: { at, id: `request-${at}` },
})
const metadata = { tid: 50, fid: 6, forumName: 'board', title: 'topic' }

class Observer {
  observe() {}
  disconnect() {}
}

describe('forum reading-state interaction', () => {
  let root: Root | undefined
  let host: HTMLDivElement
  let client: QueryClient
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  beforeEach(async () => {
    await Promise.all(STORE_NAMES.map((name) => idbClear(name)))
    await idbSet('kv', 'session', { uid: 7 })
    mocks.navigate.mockClear()
    mocks.refresh.mockReset()
    vi.stubGlobal('IntersectionObserver', Observer)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['boards'], [])
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined
    client.clear()
    host.remove()
    vi.unstubAllGlobals()
  })

  async function mount(snapshot: ObservedForumPage) {
    client.setQueryData(['forum', 6], { pages: [snapshot], pageParams: [1] })
    await act(async () => root!.render(createElement(QueryClientProvider, {
      client, children: createElement(ForumPane, { fid: 6 }),
    })))
  }
  async function waitForLabel(label: string) {
    await act(async () => vi.waitFor(() => {
      expect(host.querySelector('.divide-y [aria-label]')?.getAttribute('aria-label')).toBe(label)
    }))
  }

  it('clears on entry offline and only shows later replies after an explicit list refresh', async () => {
    await recordThreadOpened(metadata, { at: 10, id: 'previous', replies: 100 }, 7)
    await mount(page(110, 20))
    await waitForLabel('110 条回复，10 条新增')

    await act(async () => host.querySelector<HTMLButtonElement>('.divide-y button')!.click())
    await waitForLabel('110 条回复')
    expect((await getProgress(50))?.position).toBeNull()
    expect((await getProgress(50))?.read?.replies).toBe(110)
    expect(mocks.navigate).toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()

    await act(async () => {
      await recordThreadReplies(metadata, { at: 15, id: 'old-content-cache', replies: 100 }, 7)
      await recordThreadReplies(metadata, { at: 30, id: 'content-refresh', replies: 115 }, 7)
      await recordReadingPosition(metadata, { at: 40, id: 'scroll', pid: 99, floor: 2, page: 1, totalPages: 20 }, 7)
    })
    await waitForLabel('110 条回复')
    expect((await getProgress(50))?.read?.replies).toBe(115)
    expect(client.getQueryData(['forum', 6])).toMatchObject({ pages: [{ threads: [{ replies: 110 }] }] })
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()

    mocks.refresh.mockResolvedValueOnce(page(118, 50))
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="刷新"]')!.click())
    await waitForLabel('118 条回复，3 条新增')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('marks entry read with unknown count and keeps that baseline through a failed refresh', async () => {
    await mount(page(null, 20))
    await act(async () => host.querySelector<HTMLButtonElement>('.divide-y button')!.click())
    await act(async () => vi.waitFor(async () => {
      expect((await getProgress(50))?.openedAt).toBeGreaterThan(0)
      expect(host.querySelector('.divide-y > div')?.className).toContain('shadow-')
    }))
    expect((await getProgress(50))?.read).toBeNull()
    expect((await getProgress(50))?.title).toBe('topic')
    mocks.refresh.mockRejectedValueOnce(new Error('offline'))
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="刷新"]')!.click())
    await act(async () => vi.waitFor(() => expect(host.textContent).toContain('刷新失败')))
    expect((await getProgress(50))?.read).toBeNull()
    expect(client.getQueryData(['forum', 6])).toMatchObject({ pages: [{ threads: [{ replies: null }] }] })
  })
})
