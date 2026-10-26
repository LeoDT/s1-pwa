import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const navigate = vi.fn()
const onOpenPost = vi.fn()
const loadImage = vi.fn()
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/lib/usePrefs', () => ({ usePrefs: () => ({ dataSaver: true }) }))
vi.mock('@/lib/imageStore', () => ({ loadImage: (...args: unknown[]) => loadImage(...args) }))

import { Content } from '@/components/Content'

describe('Content image interactions', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
    })
    navigate.mockReset()
    onOpenPost.mockReset()
    loadImage.mockReset().mockRejectedValue(new Error('failed'))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  const render = async (html: string) => {
    await act(async () => {
      root.render(createElement(Content, { html, base: 'https://stage1st.com/2b/', onOpenPost }))
    })
  }

  it('image-only thread anchors do not wrap retry/original-image controls', async () => {
    await render('<a href="forum.php?mod=viewthread&amp;tid=2292508&amp;mobile=2"><img data-src="https://img.test/a.jpg"></a>')
    const placeholder = host.querySelector('[role="button"]')!
    expect(placeholder.closest('a, button')).toBeNull()
    await act(async () => placeholder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await act(async () => Promise.resolve())

    const retry = host.querySelector('button')!
    const original = host.querySelector('a[href="https://img.test/a.jpg"]')!
    expect(retry.closest('a')).toBeNull()
    expect(original.closest('button')).toBeNull()
    expect(host.querySelector('a[href*="tid=2292508"]')).toBeNull()
    const originalClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => original.dispatchEvent(originalClick))
    expect(originalClick.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()

    await act(async () => retry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('mixed wrappers keep text linked while moving the image out of the link', async () => {
    await render('<a href="forum.php?mod=viewthread&amp;tid=42&amp;mobile=2"><font color="red"><span>linked text <img data-src="https://img.test/b.jpg"> continued</span></font></a>')
    const image = host.querySelector('[role="button"]')!
    expect(image.closest('a, button')).toBeNull()
    const linkedText = Array.from(host.querySelectorAll('a[href*="tid=42"]')).map((link) => link.textContent).join('')
    expect(linkedText).toContain('linked text')
    expect(linkedText).toContain('continued')
  })

  it('internal post buttons preserve text-link action and image controls remain separate', async () => {
    await render('<a href="forum.php?mod=redirect&amp;goto=findpost&amp;pid=9&amp;ptid=42">Post <img data-src="https://img.test/c.jpg"></a>')
    const image = host.querySelector('[role="button"]')!
    expect(image.closest('a, button')).toBeNull()
    const link = host.querySelector('button')!
    expect(link.textContent).toBe('Post ')
    await act(async () => link.click())
    expect(onOpenPost).toHaveBeenCalledWith(42, 9)
  })

  it('keeps ordinary internal links routed and smilies inline', async () => {
    await render('<a href="forum.php?mod=viewthread&amp;tid=77&amp;mobile=2">Thread</a><a href="forum.php?mod=viewthread&amp;tid=78&amp;mobile=2"><img smilieid="1" data-src="https://img.test/smile.gif"></a>')
    const link = host.querySelector('a[href*="tid=77"]')!
    await act(async () => link.click())
    expect(navigate).toHaveBeenCalledWith({ to: '/t/$tid', params: { tid: '77' } })
    expect(host.querySelector('.inline-block.align-middle')?.closest('a')?.getAttribute('href')).toContain('tid=78')
  })
})
