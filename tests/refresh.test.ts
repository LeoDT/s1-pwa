import { act, createElement, useCallback, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useListRefresh } from '@/lib/useListRefresh'
import type { ForumPage } from '@shared/types'

const page = (number: number) => ({ page: number, totalPages: 3, threads: [] }) as ForumPage

describe('useListRefresh（列表刷新实现）', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  let client: QueryClient | undefined
  const setup = (child: ReactNode) => {
    container = document.createElement('div')
    client ??= new QueryClient({ defaultOptions: { queries: { retry: false } } })
    root = createRoot(container)
    act(() => root?.render(createElement(QueryClientProvider, { client }, child)))
  }
  afterEach(() => {
    if (root) act(() => root?.unmount())
    client?.clear()
    root = undefined
    client = undefined
    container?.remove()
    container = undefined
  })

  it('保留旧页直到成功，再仅提交新第一页；mount/focus 不会主动调用刷新', async () => {
    let trigger!: () => Promise<void>
    const request = vi.fn(async () => page(1))
    function Harness() {
      const commit = useCallback((fresh: ForumPage) => {
        client?.setQueryData(['forum', 6], { pages: [fresh], pageParams: [1] })
      }, [])
      const { refresh } = useListRefresh(['forum', 6], '6:1', request, commit)
      trigger = refresh
      return null
    }
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['forum', 6], { pages: [page(1), page(2)], pageParams: [1, 2] })
    setup(createElement(Harness))
    expect(request).not.toHaveBeenCalled()
    const pending = Promise.withResolvers<ForumPage>()
    request.mockReturnValue(pending.promise)
    let task!: Promise<void>
    act(() => { task = trigger() })
    expect(client.getQueryData(['forum', 6])).toEqual({ pages: [page(1), page(2)], pageParams: [1, 2] })
    await act(async () => { pending.resolve(page(1)); await task })
    expect(client.getQueryData(['forum', 6])).toEqual({ pages: [page(1)], pageParams: [1] })
  })

  it('失败保留缓存；重复刷新及并发追加入口在刷新期间被拒绝', async () => {
    let trigger!: () => Promise<void>
    let busy!: () => boolean
    const pending = Promise.withResolvers<ForumPage>()
    const request = vi.fn(() => pending.promise)
    function Harness() {
      const commit = useCallback((fresh: ForumPage) => client?.setQueryData(['forum', 6], { pages: [fresh], pageParams: [1] }), [])
      const refresh = useListRefresh(['forum', 6], '6:1', request, commit)
      trigger = refresh.refresh
      busy = refresh.isBusy
      return null
    }
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const old = { pages: [page(1), page(2)], pageParams: [1, 2] }
    client.setQueryData(['forum', 6], old)
    setup(createElement(Harness))
    let first!: Promise<void>
    act(() => { first = trigger() })
    expect(busy()).toBe(true)
    // This is the same synchronous busy guard used by the observer and load-more buttons.
    if (!busy()) throw new Error('append must be blocked during refresh')
    await act(async () => { await trigger(); pending.reject(new Error('offline')); await first })
    expect(request).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['forum', 6])).toBe(old)
  })

  it('切换 identity 后，旧请求的响应不能提交', async () => {
    let trigger!: () => Promise<void>
    let setIdentity!: (value: string) => void
    const pending = Promise.withResolvers<ForumPage>()
    const request = vi.fn(() => pending.promise)
    function Harness() {
      const [identity, update] = useState('uid:1')
      setIdentity = update
      const commit = useCallback((fresh: ForumPage) => client?.setQueryData(['forum', 6], { pages: [fresh], pageParams: [1] }), [])
      const result = useListRefresh(['forum', 6], identity, request, commit)
      trigger = result.refresh
      return null
    }
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const old = { pages: [page(1), page(2)], pageParams: [1, 2] }
    client.setQueryData(['forum', 6], old)
    setup(createElement(Harness))
    let first!: Promise<void>
    act(() => { first = trigger() })
    act(() => setIdentity('uid:2'))
    await act(async () => { pending.resolve(page(1)); await first })
    expect(client.getQueryData(['forum', 6])).toBe(old)
  })

  it('真实卸载后，已发出的请求响应不能提交', async () => {
    let trigger!: () => Promise<void>
    const pending = Promise.withResolvers<ForumPage>()
    const request = vi.fn(() => pending.promise)
    const commit = vi.fn()
    function Harness() {
      const result = useListRefresh(['forum', 6], 'uid:1', request, commit)
      trigger = result.refresh
      return null
    }
    setup(createElement(Harness))
    let task!: Promise<void>
    act(() => { task = trigger() })
    await act(async () => { await Promise.resolve() })
    expect(request).toHaveBeenCalledTimes(1)
    act(() => root?.unmount())
    root = undefined
    await act(async () => { pending.resolve(page(1)); await task })
    expect(commit).not.toHaveBeenCalled()
  })

  it('在 cancelQueries 等待期间卸载，不再启动列表请求', async () => {
    let trigger!: () => Promise<void>
    const cancelGate = Promise.withResolvers<void>()
    const request = vi.fn(async () => page(1))
    function Harness() {
      const result = useListRefresh(['forum', 6], 'uid:1', request, vi.fn())
      trigger = result.refresh
      return null
    }
    setup(createElement(Harness))
    vi.spyOn(client!, 'cancelQueries').mockReturnValue(cancelGate.promise)
    let task!: Promise<void>
    act(() => { task = trigger() })
    act(() => root?.unmount())
    root = undefined
    await act(async () => { cancelGate.resolve(); await task })
    expect(request).not.toHaveBeenCalled()
  })
})
