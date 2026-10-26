import { act, createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ThreadPage } from '@shared/types'

const mocks = vi.hoisted(() => ({ queue: vi.fn(async (_row: unknown) => {}), get: vi.fn(async (_tid: number) => undefined) }))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: { uid: 7 } }) }))
vi.mock('@/lib/outbox', () => ({ queueProgress: mocks.queue, flushProgress: vi.fn(async () => 0) }))
vi.mock('@/lib/progress', () => ({ getProgress: mocks.get }))
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

describe('useReadingProgress reply baseline and thread isolation', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  let client: QueryClient | undefined
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    client?.clear(); host?.remove(); root = undefined; host = undefined; client = undefined
    vi.unstubAllGlobals(); mocks.queue.mockClear(); mocks.get.mockReset()
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

  it('unknown page -> cached baseline -> reliable page uses newly observed count', async () => {
    mocks.get.mockResolvedValue({ replies: 580 })
    const { setData } = mount(page(11, null, 110))
    await act(async () => Promise.resolve())
    act(() => setData(page(11, 18194, 111)))
    await act(async () => root!.unmount())
    root = undefined
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ tid: 11, replies: 18194 }))
  })

  it('an A→B→A visit ignores the first A fallback even when it resolves last', async () => {
    const pending: Array<(row: { replies: number } | undefined) => void> = []
    mocks.get.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
    const { setData } = mount(page(11, null, 110))
    await act(async () => Promise.resolve())
    act(() => setData(page(22, null, 220)))
    await act(async () => Promise.resolve())
    act(() => setData(page(11, null, 111)))
    await act(async () => Promise.resolve())
    expect(pending).toHaveLength(3)
    await act(async () => { pending[2]?.({ replies: 600 }); await Promise.resolve() })
    await act(async () => { pending[0]?.({ replies: 580 }); await Promise.resolve() })
    await act(async () => root!.unmount())
    root = undefined
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ tid: 11, replies: 600 }))
  })

  it('switching threads on the same page resets the position to the new thread', async () => {
    mocks.get.mockResolvedValue(undefined)
    const { setData } = mount(page(11, 0, 110))
    act(() => setData(page(22, 9, 220)))
    await act(async () => root!.unmount())
    root = undefined
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ tid: 22, lastPid: 220, replies: 9 }))
  })
})
