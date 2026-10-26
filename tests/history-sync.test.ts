import 'fake-indexeddb/auto'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORE_NAMES, idbClear, idbGet } from '@/lib/db'
import { progressRow } from './progress-fixtures'

const mocks = vi.hoisted(() => ({ uid: 1, fetch: vi.fn(), index: vi.fn(), put: vi.fn() }))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: { uid: mocks.uid } }) }))
vi.mock('@/lib/historyApi', () => ({ fetchHistory: mocks.fetch, fetchHistoryIndex: mocks.index, putServerProgress: mocks.put }))
import { HistorySync } from '@/features/progress/HistorySync'

describe('history synchronization identity', () => {
  let root: Root | undefined
  let host: HTMLDivElement
  let client: QueryClient
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  beforeEach(async () => {
    await Promise.all(STORE_NAMES.map((name) => idbClear(name)))
    mocks.uid = 1
    mocks.fetch.mockReset()
    mocks.index.mockReset().mockResolvedValue([])
    client = new QueryClient()
    host = document.createElement('div')
    root = createRoot(host)
  })
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined
    client.clear()
  })
  async function render() {
    await act(async () => root!.render(createElement(QueryClientProvider, {
      client, children: createElement(HistorySync),
    })))
  }

  it('restarts for a new UID and rejects the old account response', async () => {
    const old = Promise.withResolvers<ReturnType<typeof progressRow>[]>()
    mocks.fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce([progressRow({ tid: 2, openedAt: 20 })])
    await render()
    await act(async () => vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1)))
    mocks.uid = 2
    await render()
    await act(async () => vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2)))
    await act(async () => old.resolve([progressRow({ tid: 1, openedAt: 10 })]))
    expect(await idbGet('progress', 1)).toBeUndefined()
    expect(await idbGet('progress', 2)).toMatchObject({ tid: 2 })
  })

  it('ignores a response after the sync component is unmounted', async () => {
    const response = Promise.withResolvers<ReturnType<typeof progressRow>[]>()
    mocks.fetch.mockReturnValueOnce(response.promise)
    await render()
    await act(async () => vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1)))
    await act(async () => root!.unmount())
    root = undefined
    await act(async () => response.resolve([progressRow({ tid: 1, openedAt: 10 })]))
    expect(await idbGet('progress', 1)).toBeUndefined()
  })
})
