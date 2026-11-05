import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Post } from '@shared/types'
import { PostCard } from '@/features/browse/PostCard'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const post: Post = {
  pid: 42, floor: 2, authorName: 'alice', authorUid: 7, postedAt: '2020-1-1',
  blocks: [], images: [], attachments: [],
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
})
