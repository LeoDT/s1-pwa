import { describe, expect, it, vi } from 'vitest'

const proxy = vi.hoisted(() => ({ proxyJson: vi.fn() }))
vi.mock('@/lib/proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy')>()
  return { ...actual, proxyJson: proxy.proxyJson }
})

import { fetchAuthorStats, parseAuthorStats } from '@/lib/authorStats'
import { ParseError } from '@/lib/parser/errors'

const payload = {
  Version: '1',
  Variables: {
    space: {
      uid: '152709',
      username: 'pgain2004',
      posts: '16604',
      threads: '324',
      extcredits1: '1348',
      secmobile: 'not-forwarded-to-ui',
    },
    extcredits: { '1': { title: '战斗力', unit: '鹅' } },
  },
}

describe('作者资料', () => {
  it('只投影发帖数、主题数和战斗力', () => {
    expect(parseAuthorStats(payload, 152709)).toEqual({
      uid: 152709,
      name: 'pgain2004',
      posts: 16604,
      threads: 324,
      e: 1348,
    })
  })

  it('无效或隐藏资料抛出可展示的解析错误', () => {
    expect(() => parseAuthorStats({ Variables: {} }, 1)).toThrow(ParseError)
    expect(parseAuthorStats({ Variables: { space: { username: 'x' } } }, 1)).toEqual({
      uid: 1,
      name: 'x',
      posts: null,
      threads: null,
      e: null,
    })
  })

  it('按 mobile API 约定请求 profile', async () => {
    proxy.proxyJson.mockResolvedValueOnce(payload)
    await fetchAuthorStats(152709)
    expect(proxy.proxyJson).toHaveBeenCalledWith(
      'https://stage1st.com/2b/api/mobile/index.php?module=profile&uid=152709&version=1',
    )
  })
})
