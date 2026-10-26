import { describe, expect, it } from 'vitest'
import { isLongLivedImage, isS1Image } from '@/lib/imageStore'

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
