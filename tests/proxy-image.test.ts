import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mocks = vi.hoisted(() => ({
  dataSaver: false,
  loadImage: vi.fn<(src: string) => Promise<string>>(),
  openLightbox: vi.fn(),
  saveDimensions: vi.fn(),
  generation: 0,
}))
vi.mock('@/lib/imageStore', () => ({
  isS1Image: (src: string) => new URL(src).hostname === 'stage1st.com' || new URL(src).hostname.endsWith('.stage1st.com'),
  loadImage: mocks.loadImage,
}))
vi.mock('@/lib/imageDimensions', () => ({
  saveImageDimensions: mocks.saveDimensions,
  imageDimensionsGeneration: () => mocks.generation,
}))
vi.mock('@/lib/usePrefs', () => ({ usePrefs: () => ({ dataSaver: mocks.dataSaver }) }))
vi.mock('@/lib/lightbox', () => ({ openLightbox: mocks.openLightbox }))

import { ProxyImage } from '@/components/ProxyImage'
import { ImageDimensionsContext } from '@/lib/useImageDimensions'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ProxyImage', () => {
  let host: HTMLDivElement
  let root: Root
  let intersect: (visible?: boolean) => void
  const fetchSpy = vi.fn()
  const objectUrlSpy = vi.fn(() => 'blob:test')

  beforeEach(() => {
    mocks.dataSaver = false
    mocks.loadImage.mockReset()
    mocks.openLightbox.mockReset()
    mocks.saveDimensions.mockReset().mockResolvedValue(undefined)
    mocks.generation = 0
    fetchSpy.mockReset()
    objectUrlSpy.mockClear()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) { intersect = (visible = true) => this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
      observe() {}
      disconnect() {}
    })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(objectUrlSpy)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  const render = async (src: string, inline = false, dimensions = new Map<string, { width: number; height: number }>()) => act(async () => {
    root.render(createElement(ImageDimensionsContext.Provider, { value: dimensions },
      createElement(ProxyImage, { src, alt: 'photo', inline })))
  })
  const loaded = async (width: number, height: number) => {
    const image = host.querySelector('img')!
    Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } })
    await act(async () => image.dispatchEvent(new Event('load')))
  }
  const visible = async () => act(async () => intersect())

  it('外站图由原生 img 加载、成功后打开灯箱，不触发 fetch/blob/cache 通道', async () => {
    await render('https://p.sda1.dev/a.jpg')
    await visible()
    const img = host.querySelector('img')!
    const initialImage = img
    expect(img.src).toBe('https://p.sda1.dev/a.jpg')
    expect(mocks.loadImage).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(objectUrlSpy).not.toHaveBeenCalled()
    await act(async () => img.dispatchEvent(new Event('load')))
    expect(host.querySelector('img')).toBe(initialImage)
    await act(async () => host.querySelector('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(mocks.openLightbox).toHaveBeenCalledWith('https://p.sda1.dev/a.jpg', 'photo')
  })

  it('S1 主域及子域使用 loadImage 代理结果，等待代理时只显示骨架', async () => {
    let resolveImage!: (url: string) => void
    mocks.loadImage.mockImplementationOnce(() => new Promise((resolve) => { resolveImage = resolve }))
      .mockResolvedValueOnce('blob:subdomain')
    await render('https://stage1st.com/a.jpg')
    await visible()
    expect(mocks.loadImage).toHaveBeenCalledWith('https://stage1st.com/a.jpg')
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.animate-pulse')).not.toBeNull()
    await act(async () => resolveImage('blob:s1'))
    expect(host.querySelector('img')?.src).toBe('blob:s1')

    await render('https://static.stage1st.com/b.jpg')
    await visible()
    expect(mocks.loadImage).toHaveBeenCalledWith('https://static.stage1st.com/b.jpg')
    expect(host.querySelector('img')?.src).toBe('blob:subdomain')
  })

  it('外站失败显示重试，重试仍使用原生图片', async () => {
    await render('https://images.example/fail.jpg')
    await visible()
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(host.textContent).toContain('图片加载失败')
    await act(async () => host.querySelector('button')!.click())
    expect(host.querySelector('img')?.src).toBe('https://images.example/fail.jpg')
    expect(mocks.loadImage).not.toHaveBeenCalled()
  })

  it('省流量模式先占位，点击后才启动外站原生图片', async () => {
    mocks.dataSaver = true
    await render('https://images.example/saver.jpg')
    expect(host.querySelector('img')).toBeNull()
    await act(async () => host.querySelector('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelector('img')?.src).toBe('https://images.example/saver.jpg')
  })

  it('A→B→A 在 B 未加载时不会复活 A 的旧 ready 状态', async () => {
    mocks.dataSaver = true
    mocks.loadImage.mockResolvedValue('blob:old')
    await render('https://stage1st.com/a.jpg')
    await act(async () => host.querySelector('[role="button"]')!.click())
    expect(host.querySelector('img')?.src).toBe('blob:old')

    await render('https://stage1st.com/b.jpg')
    await render('https://stage1st.com/a.jpg')
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('图片 · 点击加载')
  })

  it('已知尺寸在等待、加载、失败、重试和成功时保持占位，且不额外叠加骨架高度', async () => {
    const src = 'https://images.example/known.jpg'
    await render(src, false, new Map([[src, { width: 600, height: 400 }]]))
    const container = host.firstElementChild as HTMLElement
    const checkReservation = () => {
      expect(container.style.width).toBe('600px')
      expect(container.style.aspectRatio).toBe('600 / 400')
      expect(host.querySelector('.animate-pulse')?.classList.contains('min-h-[120px]')).not.toBe(true)
    }
    checkReservation()
    await visible()
    checkReservation()
    expect(host.querySelector('img')?.getAttribute('width')).toBe('600')
    expect(host.querySelector('img')?.getAttribute('height')).toBe('400')
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')))
    checkReservation()
    expect(host.textContent).toContain('图片加载失败')
    await act(async () => host.querySelector('button')!.click())
    checkReservation()
    await loaded(600, 400)
    checkReservation()
    expect(host.querySelector('.animate-pulse')).toBeNull()
    expect(mocks.saveDimensions).toHaveBeenCalledWith(src, { width: 600, height: 400 }, 0)
  })

  it('已知尺寸的省流量占位保持比例，点击前不加载图片', async () => {
    mocks.dataSaver = true
    const src = 'https://images.example/saver-known.jpg'
    await render(src, false, new Map([[src, { width: 200, height: 100 }]]))
    expect((host.firstElementChild as HTMLElement).style.aspectRatio).toBe('200 / 100')
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('[role="button"]')?.classList.contains('min-h-[64px]')).toBe(false)
    await act(async () => host.querySelector('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await loaded(200, 100)
    expect((host.firstElementChild as HTMLElement).style.width).toBe('200px')
    expect(host.querySelector('img')?.classList.contains('max-w-full')).toBe(true)
  })

  it('站内 blob 也等待原生 load 才记录尺寸并允许打开灯箱，解码失败可重试', async () => {
    const src = 'https://stage1st.com/photo.jpg'
    mocks.loadImage.mockResolvedValue('blob:photo')
    await render(src)
    await visible()
    expect(host.querySelector('[role="button"]')).toBeNull()
    expect(mocks.saveDimensions).not.toHaveBeenCalled()
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(host.textContent).toContain('图片加载失败')
    await act(async () => host.querySelector('button')!.click())
    await loaded(160, 80)
    expect(mocks.saveDimensions).toHaveBeenCalledWith(src, { width: 160, height: 80 }, 0)
    await act(async () => host.querySelector('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(mocks.openLightbox).toHaveBeenCalledWith('blob:photo', 'photo')
  })

  it('外站图片记录尺寸不使用 fetch，缓存写入失败也不影响显示', async () => {
    mocks.saveDimensions.mockRejectedValue(new Error('quota'))
    await render('https://images.example/natural.jpg')
    await visible()
    await loaded(120, 60)
    expect((host.firstElementChild as HTMLElement).style.width).toBe('120px')
    expect(host.querySelector('img')?.classList.contains('max-w-full')).toBe(true)
    expect(host.querySelector('.animate-pulse')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mocks.loadImage).not.toHaveBeenCalled()
  })

  it('清空之前开始加载的图片保留旧 generation，不恢复已清空的记录', async () => {
    await render('https://images.example/pending.jpg')
    await visible()
    mocks.generation += 1
    await loaded(100, 50)
    expect(mocks.saveDimensions).toHaveBeenCalledWith('https://images.example/pending.jpg', { width: 100, height: 50 }, 0)
  })

  it('行内表情保持 24px，不保存正文尺寸也不开启灯箱', async () => {
    await render('https://images.example/smile.gif', true)
    await visible()
    await loaded(100, 100)
    expect(host.querySelector('img')?.getAttribute('width')).toBe('24')
    expect(host.querySelector('img')?.getAttribute('height')).toBe('24')
    expect(host.querySelector('[role="button"]')).toBeNull()
    expect(mocks.saveDimensions).not.toHaveBeenCalled()
  })

  it('src 切换后旧代理 promise 结果不会污染新图片', async () => {
    let resolveOld!: (url: string) => void
    let resolveNew!: (url: string) => void
    mocks.loadImage.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve }))
    await render('https://stage1st.com/old.jpg')
    await visible()
    await render('https://stage1st.com/new.jpg')
    await visible()
    await act(async () => resolveOld('blob:old'))
    expect(host.querySelector('img')).toBeNull()
    await act(async () => resolveNew('blob:new'))
    expect(host.querySelector('img')?.src).toBe('blob:new')
  })
})
