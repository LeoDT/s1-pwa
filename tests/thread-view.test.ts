import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const proxy = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/proxy', () => ({
  proxyFetch: proxy.fetch,
  upstreamUrl: (endpoint: string, params: Record<string, unknown>) => {
    const url = new URL(`https://stage1st.com/2b/${endpoint}`)
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value))
    return url.toString()
  },
}))
vi.mock('@/features/browse/ForumPane', () => ({
  ForumPane: ({ fid, activeTid }: { fid: number; activeTid?: number }) => createElement('div', { 'data-testid': 'forum', 'data-fid': fid, 'data-tid': activeTid }),
}))
vi.mock('@/features/history/HistoryPane', () => ({ HistoryPane: ({ activeTid }: { activeTid?: number }) => createElement('div', { 'data-testid': 'history', 'data-tid': activeTid }) }))
vi.mock('@/features/browse/ThreadPane', () => ({
  ThreadPane: ({ tid, page, forumId, query }: { tid: number; page: number; forumId: number | null; query: { data?: { fid: number } } }) => createElement('div', { 'data-testid': 'thread', 'data-tid': tid, 'data-page': page, 'data-forum-id': forumId, 'data-data-fid': query.data?.fid }),
}))
vi.mock('@/features/browse/BrowseLayout', () => ({
  BrowseLayout: ({ sidebar, main }: { sidebar: ReactNode; main: ReactNode }) => createElement('div', null, createElement('aside', null, sidebar), createElement('main', null, main)),
}))

import { ThreadView } from '@/features/browse/ThreadView'
import { parsePage } from '@/lib/parser/dom'
import { parseThreadPage } from '@/lib/parser/thread'

const fixture = readFileSync(path.resolve(import.meta.dirname, 'fixtures/viewthread-1826103-p1.html'), 'utf8')
const response = (html = fixture) => ({ html, url: 'https://stage1st.com/2b/forum.php?mod=viewthread&tid=1826103&mobile=2' })
const parsedData = (fid = 51) => ({ ...parseThreadPage(parsePage(fixture, response().url)), fid, observation: { at: 1, id: 'fixture' } })

describe('ThreadView query ownership and sidebar selection', () => {
  let host: HTMLDivElement
  let root: Root
  let client: QueryClient

  const render = (tid: number, page: number, fromHistory = false) => act(() => root.render(createElement(QueryClientProvider, { client }, createElement(ThreadView, { tid, page, fromHistory }))))
  const forum = () => host.querySelector('[data-testid="forum"]')
  const waitForForum = async (fid: number) => act(async () => {
    await vi.waitFor(() => expect(forum()?.getAttribute('data-fid')).toBe(String(fid)))
  })

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    proxy.fetch.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    client.clear()
    host.remove()
    vi.useRealTimers()
  })

  it('direct entry waits for content, then selects the returned non-default forum and only fetches once', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void
    proxy.fetch.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    render(1826103, 1)
    expect(forum()).toBeNull()
    expect(host.textContent).not.toContain('游戏论坛')
    expect(proxy.fetch).toHaveBeenCalledTimes(1)
    await act(async () => resolve(response()))
    await waitForForum(51)
    expect(forum()?.getAttribute('data-tid')).toBe('1826103')
    expect(host.querySelector('[data-testid="thread"]')?.getAttribute('data-forum-id')).toBe('51')
    expect(proxy.fetch).toHaveBeenCalledTimes(1)
  })

  it('delays the pending sidebar skeleton without mounting a default forum', () => {
    vi.useFakeTimers()
    proxy.fetch.mockReturnValueOnce(new Promise(() => {}))
    render(1826103, 1)
    expect(host.querySelector('aside .animate-pulse')).toBeNull()
    act(() => vi.advanceTimersByTime(199))
    expect(host.querySelector('aside .animate-pulse')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(host.querySelector('aside .animate-pulse')).not.toBeNull()
    expect(forum()).toBeNull()
    expect(proxy.fetch).toHaveBeenCalledTimes(1)
  })

  it('uses cached content immediately and page changes query separately without changing boards', async () => {
    proxy.fetch.mockResolvedValue(response())
    client.setQueryData(['thread', 1826103, 1], parsedData())
    render(1826103, 1)
    expect(forum()?.getAttribute('data-fid')).toBe('51')
    const cached = client.getQueryData(['thread', 1826103, 1])
    client.setQueryData(['thread', 1826103, 2], { ...(cached as object), page: 2, fid: 51 })
    render(1826103, 2)
    expect(host.querySelector('[data-testid="thread"]')?.getAttribute('data-page')).toBe('2')
    expect(host.querySelector('[data-testid="thread"]')?.getAttribute('data-forum-id')).toBe('51')
    expect(proxy.fetch).not.toHaveBeenCalled()
    expect(client.getQueryData(['thread', 1826103, 2])).toBeDefined()
  })

  it('renders seeded query data without waiting for a network request', () => {
    client.setQueryData(['thread', 1826103, 2], { fid: 6, tid: 1826103, page: 2, totalPages: 3, title: 'cached', posts: [], replies: 0, observation: { at: 1, id: 'cached' } })
    render(1826103, 2)
    expect(forum()?.getAttribute('data-fid')).toBe('6')
    expect(host.querySelector('[data-testid="thread"]')?.getAttribute('data-page')).toBe('2')
    expect(proxy.fetch).not.toHaveBeenCalled()
  })

  it('updates sidebar when the active thread resolves to another forum', async () => {
    proxy.fetch.mockResolvedValue(response())
    render(1826103, 1)
    await waitForForum(51)
    const changed = { ...(client.getQueryData(['thread', 1826103, 1]) as object), fid: 6 }
    client.setQueryData(['thread', 77, 1], { ...changed, tid: 77 })
    render(77, 1)
    expect(forum()?.getAttribute('data-fid')).toBe('6')
    expect(host.querySelector('[data-testid="thread"]')?.getAttribute('data-forum-id')).toBe('6')
  })

  it('keeps query errors visible with retry and does not guess a board', async () => {
    proxy.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response())
    render(1826103, 1)
    await act(async () => vi.waitFor(() => expect(host.textContent).toContain('offline')))
    expect(forum()).toBeNull()
    const retry = host.querySelector('button')
    expect(retry).not.toBeNull()
    await act(async () => { retry?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await waitForForum(51)
    expect(proxy.fetch).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state for resolved invalid forum ids and uses history only when requested', async () => {
    proxy.fetch.mockResolvedValue(response(fixture.replace('fid=51', 'fid=0')))
    client.setQueryData(['thread', 1826103, 1], parsedData(0))
    render(1826103, 1)
    expect(forum()).toBeNull()
    expect(host.textContent).toContain('无法确定帖子所属板块')

    render(1826103, 1, true)
    expect(host.querySelector('[data-testid="history"]')?.getAttribute('data-tid')).toBe('1826103')
    expect(forum()).toBeNull()
  })
})
