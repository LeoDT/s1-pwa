import { act, createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ThreadPage } from '@shared/types'

const mocks = vi.hoisted(() => ({
  record: vi.fn(async (_metadata: unknown, _position: unknown): Promise<unknown> => ({
    tid: 11, fid: 6, forumName: 'board', title: 't11', metadataVersion: null, openedAt: 100, read: null,
    position: { pid: 110, floor: 1, page: 1, totalPages: 1, at: 100, id: 'version' },
  })),
  version: vi.fn(() => ({ at: 100, id: 'version' })),
  requestSync: vi.fn(),
  uid: 7 as number | undefined,
}))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: { uid: mocks.uid } }) }))
vi.mock('@/lib/progressEvents', () => ({ requestHistorySync: mocks.requestSync }))
vi.mock('@/lib/progress', () => ({ recordReadingPosition: mocks.record, createProgressVersion: mocks.version }))
import { useReadingProgress } from '@/features/browse/useReadingProgress'

function page(tid: number, replies: number | null, pid: number): ThreadPage {
  return { tid, fid: 6, title: `t${tid}`, replies, opUid: null, page: 1, totalPages: 1,
    posts: [{ pid, floor: 1, authorName: '', authorUid: null, postedAt: '', blocks: [], images: [], attachments: [] }] }
}

class Observer {
  static instances: Observer[] = []
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) { this.callback = callback; Observer.instances.push(this) }
  observe() {}
  disconnect() {}
  fire(target: Element) { this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
}

describe('useReadingProgress position observations', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  let client: QueryClient | undefined
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    client?.clear(); host?.remove(); root = undefined; host = undefined; client = undefined
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
    mocks.record.mockReset().mockImplementation(async () => ({
      tid: 11, fid: 6, forumName: 'board', title: 't11', metadataVersion: null, openedAt: 100, read: null,
      position: { pid: 110, floor: 1, page: 1, totalPages: 1, at: 100, id: 'version' },
    }))
    mocks.version.mockClear(); mocks.requestSync.mockClear(); mocks.uid = 7
  })
  function mount(initial: ThreadPage) {
    vi.stubGlobal('IntersectionObserver', Observer)
    host = document.createElement('div'); document.body.append(host)
    client = new QueryClient()
    root = createRoot(host)
    const scroll = document.createElement('div')
    let setData!: (value: ThreadPage) => void
    function Harness() {
      const [data, update] = useState(initial)
      setData = update
      useEffect(() => { if (!host) return; host.append(scroll) }, [])
      useReadingProgress({ current: scroll }, data, 'board')
      return createElement('article', { id: `pid${data.posts[0]!.pid}` })
    }
    act(() => root!.render(createElement(QueryClientProvider, { client: client!, children: createElement(Harness) })))
    return { setData, scroll }
  }

  it('records position observations without coupling reply counts into the position write', async () => {
    const { setData } = mount(page(11, 18194, 110))
    act(() => setData(page(11, 18194, 111)))
    act(() => {
      const article = document.createElement('article'); article.id = 'pid111'
      Observer.instances.at(-1)?.fire(article)
    })
    await act(async () => root!.unmount())
    root = undefined
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ tid: 11, fid: 6, title: 't11' }),
      expect.objectContaining({ pid: 111, floor: 1, page: 1, totalPages: 1, at: 100, id: 'version' }),
      7,
    )
    expect(mocks.record).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ replies: 18194 }))
  })

  it('requests sync only after persistence completes on background and unmount', async () => {
    mount(page(11, 0, 110))
    act(() => {
      const article = document.createElement('article'); article.id = 'pid110'
      Observer.instances.at(-1)?.fire(article)
    })
    let finish!: () => void
    mocks.record.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    visibility.mockRestore()
    expect(mocks.requestSync).not.toHaveBeenCalled()
    await act(async () => { finish(); await Promise.resolve() })
    expect(mocks.requestSync).toHaveBeenCalledWith({ accountId: 7, keepalive: true })
    mocks.requestSync.mockClear()
    await act(async () => root!.unmount())
    root = undefined
    expect(mocks.requestSync).toHaveBeenCalledWith({ accountId: 7, keepalive: true })
  })

  it('does not request sync if the account changes while persistence is pending', async () => {
    const { setData } = mount(page(11, 0, 110))
    act(() => {
      const article = document.createElement('article'); article.id = 'pid110'
      Observer.instances.at(-1)?.fire(article)
    })
    let finish!: () => void
    mocks.record.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    mocks.uid = 8
    act(() => setData(page(11, 0, 110)))
    await act(async () => { finish(); await Promise.resolve() })
    expect(mocks.requestSync).not.toHaveBeenCalled()
  })

  it('persists locally every second without uploading remotely', async () => {
    vi.useFakeTimers()
    mount(page(11, 0, 110))
    act(() => {
      const article = document.createElement('article'); article.id = 'pid110'
      Observer.instances.at(-1)?.fire(article)
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mocks.record).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mocks.record).toHaveBeenCalledTimes(1)
    expect(mocks.version).toHaveBeenCalledTimes(1)
    expect(mocks.requestSync).not.toHaveBeenCalled()
  })

  it('switching threads on the same page resets the position to the new thread', async () => {
    const { setData } = mount(page(11, 0, 110))
    act(() => setData(page(22, 9, 220)))
    await act(async () => root!.unmount())
    root = undefined
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ tid: 22 }),
      expect.objectContaining({ pid: 220, page: 1 }),
      7,
    )
  })
})
