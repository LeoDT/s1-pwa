import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idbClear, idbGet, idbSet } from '@/lib/db'
import { clearImageCache, isLongLivedImage, isS1Image } from '@/lib/imageStore'
import { loadImageDimensions, saveImageDimensions } from '@/lib/imageDimensions'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('图片代理域名边界', () => {
  it('仅允许 stage1st.com 及其子域名进入代理/blob/cache 通道', () => {
    expect(isS1Image('https://stage1st.com/a.png')).toBe(true)
    expect(isS1Image('https://static.stage1st.com/a.png')).toBe(true)
    expect(isS1Image('http://img.stage1st.com/a.png')).toBe(true)
    expect(isS1Image('https://stage1st.com.evil/a.png')).toBe(false)
    expect(isS1Image('https://evilstage1st.com/a.png')).toBe(false)
    expect(isS1Image('https://example.com/a.png')).toBe(false)
    expect(isS1Image('data:image/png;base64,abc')).toBe(false)
  })
})

describe('图片缓存清理', () => {
  it('actual clearImageCache removes image bytes metadata and dimensions, preserving unrelated meta', async () => {
    await idbClear('imgMeta')
    await idbClear('meta')
    await idbSet('imgMeta', 'cached-image', { key: 'cached-image', size: 123, lastUsed: 1 })
    await saveImageDimensions('https://example.com/image.png', { width: 640, height: 480 })
    await idbSet('meta', 'unrelated-setting', { keep: true })

    const deleteCache = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { delete: deleteCache })
    await clearImageCache()

    expect(deleteCache).toHaveBeenCalledOnce()
    expect(await idbGet('imgMeta', 'cached-image')).toBeUndefined()
    expect(await loadImageDimensions(['https://example.com/image.png'])).toEqual(new Map())
    expect(await idbGet('meta', 'unrelated-setting')).toEqual({ keep: true })
  })
})

describe('图片缓存过期策略', () => {
  it('站内表情不参与 7 天过期', () => {
    expect(
      isLongLivedImage('https://static.stage1st.com/image/smiley/face2017/163.png'),
    ).toBe(true)
    expect(
      isLongLivedImage('https://static.stage1st.com/image/smiley/device2017/033.png'),
    ).toBe(true)
  })

  it('正文图片、外站同路径图片、站内其它静态图仍按 7 天过期', () => {
    expect(isLongLivedImage('https://s2.ax1x.com/2019/04/26/EnVyPH.jpg')).toBe(false)
    expect(isLongLivedImage('https://example.com/image/smiley/x.png')).toBe(false)
    expect(isLongLivedImage('https://static.stage1st.com/image/other/x.png')).toBe(false)
    expect(isLongLivedImage('not a url')).toBe(false)
  })
})
