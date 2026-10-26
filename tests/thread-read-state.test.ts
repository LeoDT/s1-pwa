import { act, createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ObservedThreadPage } from '@/features/browse/queries'

const mocks = vi.hoisted(() => ({
  session: { uid: 7 },
  opened: vi.fn(async (_metadata: unknown, _observation: unknown, _uid: number) => ({ tid: 12 })),
  replies: vi.fn(async (_metadata: unknown, _observation: unknown, _uid: number) => ({ tid: 12 })),
}))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: mocks.session }) }))
vi.mock('@/lib/progress', () => ({ recordThreadOpened: mocks.opened, recordThreadReplies: mocks.replies }))
import { useThreadReadState } from '@/features/browse/useThreadReadState'

function page(replies: number | null, at = 10, id = 'cache'): ObservedThreadPage {
  return {
    tid: 12, fid: 4, title: 'topic', replies, opUid: null, page: 1, totalPages: 1,
    posts: [], observation: { at, id },
  }
}

describe('useThreadReadState', () => {
  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  let root: Root | undefined
  let host: HTMLDivElement | undefined
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    host?.remove(); root = undefined; host = undefined
    mocks.opened.mockClear(); mocks.replies.mockClear(); mocks.session.uid = 7
  })

  function mount(initial?: ObservedThreadPage) {
    host = document.createElement('div'); document.body.append(host)
    root = createRoot(host)
    let setData!: (data: ObservedThreadPage | undefined) => void
    function Harness() {
      const [data, update] = useState(initial)
      setData = update
      useThreadReadState(12, data, 'board')
      return null
    }
    act(() => root!.render(createElement(Harness)))
    return { setData }
  }

  it('records entry before any thread content or floor is available', () => {
    mount()
    expect(mocks.opened).toHaveBeenCalledWith({ tid: 12 }, undefined, 7)
    expect(mocks.replies).not.toHaveBeenCalled()
  })

  it('records metadata from cached and refreshed observations even when the count is unknown', () => {
    const { setData } = mount(page(8, 123, 'cached-id'))
    expect(mocks.replies).toHaveBeenCalledWith(
      { tid: 12, fid: 4, forumName: 'board', title: 'topic' },
      { at: 123, id: 'cached-id', replies: 8 },
      7,
    )
    act(() => setData(page(null, 200, 'unknown-refresh')))
    expect(mocks.replies).toHaveBeenLastCalledWith(
      { tid: 12, fid: 4, forumName: 'board', title: 'topic' },
      { at: 200, id: 'unknown-refresh', replies: null },
      7,
    )
    expect(mocks.replies.mock.calls.at(-1)?.[1]).not.toHaveProperty('floor')
    act(() => setData(page(10, 300, 'reliable-refresh')))
    expect(mocks.replies).toHaveBeenLastCalledWith(
      { tid: 12, fid: 4, forumName: 'board', title: 'topic' },
      { at: 300, id: 'reliable-refresh', replies: 10 },
      7,
    )
  })

  it('does not replay the same cached observation on rerender', () => {
    const { setData } = mount(page(8))
    act(() => setData(page(8)))
    expect(mocks.replies).toHaveBeenCalledTimes(1)
    expect(mocks.replies).toHaveBeenLastCalledWith(
      { tid: 12, fid: 4, forumName: 'board', title: 'topic' },
      { at: 10, id: 'cache', replies: 8 },
      7,
    )
    expect(mocks.replies.mock.calls[0]?.[1]).not.toHaveProperty('floor')
  })

  it('replays an old observation under the new account and ignores stale completion', async () => {
    let resolveOld!: (row: { tid: number } | undefined) => void
    mocks.replies.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const { setData } = mount(page(8))
    expect(mocks.replies).toHaveBeenCalledWith(expect.anything(), expect.anything(), 7)

    mocks.session.uid = 9
    act(() => setData(page(8)))
    expect(mocks.replies).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 9)
    await act(async () => { resolveOld({ tid: 12 }); await Promise.resolve() })
    act(() => setData(page(8)))
    expect(mocks.replies).toHaveBeenCalledTimes(2)
  })
})
