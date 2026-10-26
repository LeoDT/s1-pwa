import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  boards: vi.fn(),
  tree: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.query,
  useQueryClient: () => mocks.queryClient,
}))
vi.mock('@/features/browse/queries', () => ({
  useBoards: mocks.boards,
  useBoardTree: mocks.tree,
  fetchForumPage: vi.fn(),
}))
vi.mock('@/features/auth/TokenForm', () => ({ TokenForm: () => createElement('div', null, 'token form') }))

import { Gate } from '@/app/gate'
import { BoardsPanel } from '@/features/boards/BoardsPanel'

const pending = { isPending: true, isError: false, data: undefined }

describe('deferred loading entrypoints', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('Gate keeps children unmounted and blank until delayed skeleton', () => {
    mocks.query.mockReturnValue(pending)
    act(() => root.render(createElement(Gate, null, createElement('div', null, 'protected children'))))
    expect(host.textContent).toBe('')
    expect(host.textContent).not.toContain('protected children')

    act(() => vi.advanceTimersByTime(199))
    expect(host.textContent).toBe('')
    act(() => vi.advanceTimersByTime(1))
    expect(host.querySelector('.animate-pulse')).not.toBeNull()
    expect(host.textContent).not.toContain('protected children')

    mocks.query.mockReturnValue({ isPending: false, isError: false, data: { authRequired: false } })
    act(() => root.render(createElement(Gate, null, createElement('div', null, 'protected children'))))
    expect(host.textContent).toBe('protected children')
  })

  it('BoardsPanel delays pending skeleton without exposing empty state', () => {
    mocks.queryClient.invalidateQueries.mockResolvedValue(undefined)
    mocks.boards.mockReturnValue(pending)
    mocks.tree.mockReturnValue({ isPending: false, isError: false, data: undefined })
    act(() => root.render(createElement(BoardsPanel, { active: false })))

    expect(host.textContent).not.toContain('还没有板块')
    expect(host.querySelector('.animate-pulse')).toBeNull()
    act(() => vi.advanceTimersByTime(199))
    expect(host.querySelector('.animate-pulse')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(host.querySelector('.animate-pulse')).not.toBeNull()
  })
})
