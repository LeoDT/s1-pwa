import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThreadPage } from '@shared/types'

const mocks = vi.hoisted(() => ({
  load: vi.fn(async (): Promise<number | null> => null),
  save: vi.fn(async () => {}),
  fetch: vi.fn(),
}))

vi.mock('@/lib/threadOp', () => ({
  loadThreadOpUid: mocks.load,
  saveThreadOpUid: mocks.save,
}))
vi.mock('@/features/browse/queries', () => ({
  fetchThreadPage: mocks.fetch,
}))

import { useThreadOpUid } from '@/features/browse/useThreadOpUid'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function page(overrides: Partial<ThreadPage> = {}): ThreadPage {
  return {
    tid: 9, fid: 6, title: 'topic', replies: 1, opUid: null,
    page: 2, totalPages: 3, posts: [], ...overrides,
  }
}

function Probe({ tid, pageNumber, data }: { tid: number; pageNumber: number; data: ThreadPage }) {
  const opUid = useThreadOpUid(tid, pageNumber, data)
  return createElement('output', null, String(opUid))
}

describe('useThreadOpUid', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    mocks.load.mockReset().mockResolvedValue(null)
    mocks.save.mockReset().mockResolvedValue(undefined)
    mocks.fetch.mockReset()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('caches the op uid parsed from page 1', async () => {
    await act(async () => {
      root.render(createElement(Probe, { tid: 9, pageNumber: 1, data: page({ page: 1, opUid: 152709 }) }))
    })
    expect(host.textContent).toBe('152709')
    expect(mocks.save).toHaveBeenCalledWith(9, 152709)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('uses the local op uid cache on later pages without fetching page 1', async () => {
    mocks.load.mockResolvedValue(152709)
    await act(async () => {
      root.render(createElement(Probe, { tid: 9, pageNumber: 2, data: page() }))
      await Promise.resolve()
    })
    expect(host.textContent).toBe('152709')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('fetches page 1 once when a later page has no cached op uid', async () => {
    mocks.fetch.mockResolvedValue(page({ page: 1, opUid: 4242 }))
    await act(async () => {
      root.render(createElement(Probe, { tid: 9, pageNumber: 2, data: page() }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.textContent).toBe('4242')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.save).toHaveBeenCalledWith(9, 4242)
  })
})
