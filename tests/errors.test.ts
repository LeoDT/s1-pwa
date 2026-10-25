import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { ParseError } from '@/lib/parser/errors'

describe('错误文案映射', () => {
  it('服务端错误码有统一中文文案', () => {
    expect(errorMessage(new ApiError('bad_request', 'x', 400))).toBe('请求参数不正确')
    expect(errorMessage(new ApiError('blocked_address', 'x', 400))).toBe('代理不允许该地址')
    expect(errorMessage(new ApiError('not_image', 'x', 415))).toBe('该地址不是图片')
    expect(errorMessage(new ApiError('too_large', 'x', 413))).toBe('内容过大')
    expect(errorMessage(new ApiError('too_many_redirects', 'x', 502))).toBe('重定向次数过多')
    expect(errorMessage(new ApiError('bad_response', 'x', 502))).toBe('代理返回了无法识别的内容')
    expect(errorMessage(new ApiError('method_not_allowed', 'x', 405))).toBe('请求方法不受支持')
    expect(errorMessage(new ApiError('not_found', 'x', 404))).toBe('接口不存在')
  })

  it('上游错误保留服务端给出的具体原因', () => {
    expect(errorMessage(new ApiError('upstream_error', 'S1 返回 503', 502))).toBe('S1 返回 503')
    expect(errorMessage(new ApiError('http_502', '上游返回 502', 502))).toBe('上游返回 502')
  })

  it('解析错误直接用上游/解析层文案', () => {
    expect(errorMessage(new ParseError('structure_changed', '指定的版块不存在'))).toBe(
      '指定的版块不存在',
    )
  })

  it('网络类错误有可重试文案', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe('网络不可用，请检查连接')
  })
})
