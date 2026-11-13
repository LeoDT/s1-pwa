import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Post } from '@shared/types'
import { PostCard } from '@/features/browse/PostCard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const post: Post = {
  pid: 42, floor: 2, authorName: 'alice', authorUid: 7, postedAt: '2020-1-1',
  blocks: [], images: [], attachments: [], ratings: null,
}

describe('PostCard op badge', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('only shows the op label for op replies', () => {
    act(() => root.render(createElement(PostCard, {
      post, tid: 9, highlighted: false, isOp: true,
      onOpenPost: () => {}, onOpenAttachment: () => {},
    })))
    expect(host.textContent).toContain('楼主')

    act(() => root.render(createElement(PostCard, {
      post, tid: 9, highlighted: false, isOp: false,
      onOpenPost: () => {}, onOpenAttachment: () => {},
    })))
    expect(host.textContent).not.toContain('楼主')
  })

  it('shows a rating summary and expands inline entries', () => {
    const rated: Post = {
      ...post,
      ratings: {
        count: 2,
        score: 1,
        entries: [
          { uid: 7, name: 'bob', score: 1, reason: '好评加鹅' },
          { uid: 8, name: 'carol', score: -1, reason: '扣鹅' },
        ],
      },
    }
    act(() => root.render(createElement(PostCard, {
      post: rated, tid: 9, highlighted: false, isOp: false,
      onOpenPost: () => {}, onOpenAttachment: () => {},
    })))

    const summary = host.querySelector<HTMLButtonElement>('button[aria-label*="评分"]')
    expect(summary?.textContent).toContain('评分 +1')
    expect(summary?.textContent).toContain('2 人')
    expect(host.textContent).not.toContain('bob')

    act(() => summary?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.textContent).toContain('bob')
    expect(host.textContent).toContain('好评加鹅')
    expect(host.textContent).toContain('carol')
    expect(host.textContent).toContain('扣鹅')
  })
})
