import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), historyBack: vi.fn(), useThreadPage: vi.fn(), swipe: vi.fn(),
  consumeFromList: vi.fn(), narrow: true,
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { back: mocks.historyBack } }),
  useRouterState: () => '',
}))
vi.mock('@/features/browse/queries', () => ({ useBoards: () => ({ data: [] }), useThreadPage: mocks.useThreadPage }))
vi.mock('@/lib/navigation', () => ({ consumeFromList: mocks.consumeFromList }))
vi.mock('@/lib/useSwipeBack', () => ({ useSwipeBack: mocks.swipe }))
vi.mock('@/features/browse/useReadingProgress', () => ({ useReadingProgress: vi.fn() }))
vi.mock('@/features/browse/useThreadReadState', () => ({ useThreadReadState: vi.fn() }))
vi.mock('@/lib/useCollapsingHeader', () => ({ useCollapsingHeader: vi.fn() }))
vi.mock('@/lib/useDeferredLoading', () => ({ useDeferredLoading: () => false }))
vi.mock('@/lib/useMediaQuery', () => ({ useMediaQuery: () => mocks.narrow }))
vi.mock('@/lib/usePrefs', () => ({ usePrefs: () => ({ edgeSwipe: true }) }))
vi.mock('@/components/BottomBar', () => ({ BottomBar: ({ children }: { children: React.ReactNode }) => createElement('div', null, children) }))
vi.mock('@/components/Pager', () => ({ Pager: () => null }))
vi.mock('@/components/ToolbarButton', () => ({ ToolbarButton: () => null }))
vi.mock('@/components/states', () => ({ ErrorState: () => null, PostSkeleton: () => null }))
vi.mock('@/features/browse/PostCard', () => ({ PostCard: () => null }))
vi.mock('@/lib/attachments', () => ({ downloadAttachment: vi.fn() }))
vi.mock('@/lib/locate', () => ({ locatePid: vi.fn() }))

import { ThreadPane } from '@/features/browse/ThreadPane'
import type { ThreadPageQuery } from '@/features/browse/queries'

describe('ThreadPane back navigation', () => {
  let host: HTMLDivElement
  let root: Root
  let back: (() => void) | undefined
  const render = (forumId: number | null, fromHistory = false) => act(() => root.render(createElement(ThreadPane, {
    tid: 123, page: 1, forumId, fromHistory, query: { data: undefined, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() } as unknown as ThreadPageQuery,
  })))

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    back = undefined
    mocks.narrow = true
    mocks.navigate.mockReset()
    mocks.historyBack.mockReset()
    mocks.swipe.mockImplementation((callback: () => void) => { back = callback })
    mocks.consumeFromList.mockReset().mockReturnValue(false)
    mocks.useThreadPage.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('returns to the resolved non-default forum and never guesses the default for unknown forum', () => {
    render(51)
    act(() => back?.())
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/f/$fid', params: { fid: '51' }, replace: true })

    mocks.navigate.mockClear()
    render(null)
    act(() => back?.())
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.historyBack).not.toHaveBeenCalled()
  })

  it('history details navigate back to history and consume existing list stack with browser back', () => {
    render(6, true)
    act(() => back?.())
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/history', replace: true })

    mocks.navigate.mockClear()
    mocks.consumeFromList.mockReturnValue(true)
    render(51)
    act(() => back?.())
    expect(mocks.historyBack).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('returns to the source list on desktop without popping unrelated browser history', () => {
    mocks.narrow = false
    mocks.consumeFromList.mockReturnValue(true)
    render(6)
    act(() => back?.())
    expect(mocks.historyBack).not.toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/f/$fid', params: { fid: '6' }, replace: true })
  })

  it('uses only the supplied query and does not fetch thread data itself', () => {
    render(51)
    expect(mocks.useThreadPage).not.toHaveBeenCalled()
    expect(mocks.swipe).toHaveBeenCalledWith(expect.any(Function), true)
  })
})
