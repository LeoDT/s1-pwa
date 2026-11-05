import { act, createElement, StrictMode, useContext } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ hash: 'pid42', load: vi.fn(), navigate: vi.fn(), progress: vi.fn(), focus: null as number | null }))
vi.mock('@/lib/imageDimensions', () => ({ loadImageDimensions: mocks.load }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
  useRouterState: () => mocks.hash,
}))
vi.mock('@/features/browse/queries', () => ({ useBoards: () => ({ data: [] }) }))
vi.mock('@/lib/navigation', () => ({
  consumeFromList: () => false,
  peekThreadFocus: () => mocks.focus,
  consumeThreadFocus: () => { const pid = mocks.focus; mocks.focus = null; return pid },
  setThreadFocus: vi.fn(),
  clearThreadFocus: vi.fn(),
}))
vi.mock('@/lib/useSwipeBack', () => ({ useSwipeBack: () => {} }))
vi.mock('@/features/browse/useReadingProgress', () => ({ useReadingProgress: vi.fn() }))
vi.mock('@/features/browse/useThreadReadState', () => ({ useThreadReadState: vi.fn() }))
vi.mock('@/lib/useCollapsingHeader', () => ({ useCollapsingHeader: vi.fn() }))
vi.mock('@/lib/useDeferredLoading', () => ({ useDeferredLoading: () => false }))
vi.mock('@/lib/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/lib/usePrefs', () => ({ usePrefs: () => ({ edgeSwipe: false }) }))
vi.mock('@/components/BottomBar', () => ({ BottomBar: ({ children }: { children: React.ReactNode }) => createElement('div', null, children) }))
vi.mock('@/components/Pager', () => ({ Pager: () => null }))
vi.mock('@/components/ToolbarButton', () => ({ ToolbarButton: () => null }))
vi.mock('@/components/states', () => ({ ErrorState: () => null, PostSkeleton: () => null }))
vi.mock('@/lib/attachments', () => ({ downloadAttachment: vi.fn() }))
vi.mock('@/lib/locate', () => ({ locatePid: vi.fn() }))
vi.mock('@/lib/progress', () => ({ getProgress: mocks.progress }))
vi.mock('@/features/browse/PostCard', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const { ImageDimensionsContext } = await vi.importActual<typeof import('@/lib/useImageDimensions')>('@/lib/useImageDimensions')
  return {
    PostCard: ({ post }: { post: { pid: number } }) => {
      const dimensions = React.useContext(ImageDimensionsContext)
      return createElement('div', { id: `pid${post.pid}`, 'data-post': post.pid, 'data-dimensions': JSON.stringify([...dimensions]) })
    },
  }
})

import { ThreadPane } from '@/features/browse/ThreadPane'
import type { ThreadPageQuery } from '@/features/browse/queries'

type Deferred = { promise: Promise<ReadonlyMap<string, { width: number; height: number }>>; resolve: (value: ReadonlyMap<string, { width: number; height: number }>) => void; reject: (error: Error) => void }
function deferred(): Deferred {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<ReadonlyMap<string, { width: number; height: number }>>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function query(page: number, pid: number, images: string[]): ThreadPageQuery {
  return { data: { tid: 9, fid: 6, title: `Page ${page}`, page, totalPages: 2, posts: [{ pid, images }] }, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() } as unknown as ThreadPageQuery
}

describe('ThreadPane image-dimension preparation', () => {
  let host: HTMLDivElement
  let root: Root
  let scrollIntoView: ReturnType<typeof vi.fn>
  const render = (data: ThreadPageQuery, page: number) => act(() => root.render(createElement(ThreadPane, { tid: 9, page, forumId: 6, query: data })))

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    mocks.hash = 'pid42'
    mocks.focus = null
    mocks.load.mockReset()
    mocks.progress.mockReset().mockResolvedValue(undefined)
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

  it('gates cached query data and target scrolling until cached dimensions have loaded', async () => {
    const load = deferred()
    mocks.load.mockReturnValue(load.promise)
    render(query(1, 42, ['https://img.test/cached.jpg']), 1)
    expect(host.querySelector('[data-post="42"]')).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(mocks.load).toHaveBeenCalledWith(['https://img.test/cached.jpg'])

    await act(async () => load.resolve(new Map([['https://img.test/cached.jpg', { width: 640, height: 480 }]])))
    expect(host.querySelector('[data-post="42"]')?.getAttribute('data-dimensions')).toContain('640')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('consumes an explicit focus once under StrictMode', async () => {
    mocks.hash = ''
    mocks.focus = 42
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(ThreadPane, {
        tid: 9, page: 1, forumId: 6, query: query(1, 42, []),
      })))
    })
    await act(async () => { await Promise.resolve() })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(mocks.focus).toBeNull()
    expect(mocks.progress).not.toHaveBeenCalled()
  })

  it('falls back to rendering and hash scrolling when dimension loading fails', async () => {
    mocks.load.mockRejectedValue(new Error('storage unavailable'))
    render(query(1, 42, ['https://img.test/failure.jpg']), 1)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(host.querySelector('[data-post="42"]')).not.toBeNull()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('ignores a pending old page result after switching pages', async () => {
    const pageOne = deferred()
    const pageTwo = deferred()
    mocks.load.mockImplementation((urls: string[]) => urls[0].includes('one') ? pageOne.promise : pageTwo.promise)
    render(query(1, 42, ['https://img.test/one.jpg']), 1)
    render(query(2, 42, ['https://img.test/two.jpg']), 2)

    await act(async () => pageOne.resolve(new Map([['https://img.test/one.jpg', { width: 1, height: 1 }]])))
    expect(host.querySelector('[data-post="42"]')).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
    await act(async () => pageTwo.resolve(new Map([['https://img.test/two.jpg', { width: 2, height: 3 }]])))
    expect(host.querySelector('[data-post="42"]')?.getAttribute('data-dimensions')).toContain('two.jpg')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('resumes local progress once and does not scroll again when the same page is refreshed', async () => {
    mocks.hash = ''
    mocks.progress.mockResolvedValue({ position: { pid: 42, floor: 1, page: 1, totalPages: 2 } })
    render(query(1, 42, []), 1)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    render(query(1, 42, []), 1)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous page rendered while a refresh waits for new image dimensions', async () => {
    mocks.hash = ''
    const next = deferred()
    mocks.load.mockImplementation((urls: string[]) =>
      urls.includes('https://img.test/new.jpg')
        ? next.promise
        : Promise.resolve(new Map([['https://img.test/old.jpg', { width: 640, height: 480 }]])))
    render(query(1, 42, ['https://img.test/old.jpg']), 1)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(host.querySelector('[data-post="42"]')?.getAttribute('data-dimensions')).toContain('old.jpg')

    render(query(1, 42, ['https://img.test/old.jpg', 'https://img.test/new.jpg']), 1)
    expect(host.querySelector('[data-post="42"]')?.getAttribute('data-dimensions')).toContain('old.jpg')

    await act(async () => next.resolve(new Map([
      ['https://img.test/old.jpg', { width: 640, height: 480 }],
      ['https://img.test/new.jpg', { width: 320, height: 200 }],
    ])))
    expect(host.querySelector('[data-post="42"]')?.getAttribute('data-dimensions')).toContain('new.jpg')
  })

  it('does not await dimensions when there are no image sources', () => {
    mocks.load.mockImplementation(() => { throw new Error('should not load') })
    render(query(1, 42, []), 1)
    expect(host.querySelector('[data-post="42"]')).not.toBeNull()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
