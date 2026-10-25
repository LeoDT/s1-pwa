// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { deriveUserKey, parseDiscuzUid } from '../server/core/identity'

describe('身份解析', () => {
  it('从探针 HTML 中取 discuz_uid', () => {
    expect(parseDiscuzUid("<script>var discuz_uid = '12345';</script>")).toBe(12345)
    expect(parseDiscuzUid('discuz_uid = "7"')).toBe(7)
    expect(parseDiscuzUid("discuz_uid = '0'")).toBe(0)
    expect(parseDiscuzUid('<html></html>')).toBe(0)
  })

  it('userKey = base64url(HMAC-SHA256(uid, secret))，与 Node 实现一致', async () => {
    const secret = 'test-secret'
    const expected = createHmac('sha256', secret)
      .update('12345')
      .digest('base64url')

    expect(await deriveUserKey(12345, secret)).toBe(expected)
    expect(await deriveUserKey(54321, secret)).not.toBe(expected)
  })
})
