import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeLightbox,
  getLightboxImage,
  openLightbox,
  subscribeLightbox,
} from '@/lib/lightbox'

describe('灯箱单例', () => {
  afterEach(() => {
    closeLightbox()
  })

  it('open 写入目标并通知订阅者', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLightbox(listener)

    openLightbox('https://example.com/a.jpg', '图 A')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getLightboxImage()).toEqual({ url: 'https://example.com/a.jpg', alt: '图 A' })
    unsubscribe()
  })

  it('close 清空目标；重复 close 不再通知', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLightbox(listener)
    openLightbox('https://example.com/a.jpg')
    listener.mockClear()

    closeLightbox()
    closeLightbox()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getLightboxImage()).toBeNull()
    unsubscribe()
  })

  it('退订后不再收到通知', () => {
    const listener = vi.fn()
    subscribeLightbox(listener)()

    openLightbox('https://example.com/a.jpg')

    expect(listener).not.toHaveBeenCalled()
  })
})
