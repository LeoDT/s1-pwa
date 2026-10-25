// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUpstreamAsset } from '../server/core/fetchUpstream'
import { handleFile } from '../server/core/file'
import { handleImage } from '../server/core/image'
import { isPublicHost } from '../server/core/net'
import type { CoreDeps } from '../server/core/env'

const deps = { env: {}, store: {} } as CoreDeps

interface Call {
  url: string
  headers: Headers
}

function stubFetch(handler: (url: string, headers: Headers) => Response) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({ url, headers })
      return handler(url, headers)
    }),
  )
  return calls
}

function asset(url: string) {
  return fetchUpstreamAsset({
    target: new URL(url),
    cookie: 'B7Y9=abc',
    accept: '*/*',
    maxBytes: 1024,
    label: '附件',
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isPublicHost', () => {
  it('拒绝回环/私网/链路本地/IPv6', () => {
    for (const host of [
      'localhost',
      'foo.localhost',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '[::1]',
      'x.internal',
    ]) {
      expect(isPublicHost(host), host).toBe(false)
    }
  })

  it('放行普通公网域名与公网 IP', () => {
    expect(isPublicHost('stage1st.com')).toBe(true)
    expect(isPublicHost('i.imgur.com')).toBe(true)
    expect(isPublicHost('8.8.8.8')).toBe(true)
  })
})

describe('fetchUpstreamAsset', () => {
  it('私网地址直接拒绝，不发起请求', async () => {
    const calls = stubFetch(() => new Response(''))
    const result = await asset('http://127.0.0.1/secret')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('cookie 只发给白名单上游域', async () => {
    const upstream = stubFetch(() => new Response('ok', { headers: { 'content-type': 'text/plain' } }))
    await asset('https://stage1st.com/2b/a.php')
    expect(upstream[0]?.headers.get('cookie')).toBe('B7Y9=abc')

    const external = stubFetch(() => new Response('ok', { headers: { 'content-type': 'text/plain' } }))
    await asset('https://example.com/a.png')
    expect(external[0]?.headers.get('cookie')).toBeNull()
  })

  it('跟随重定向并返回最终地址', async () => {
    stubFetch((url) =>
      url.endsWith('/start')
        ? new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/final' } })
        : new Response('data', { headers: { 'content-type': 'image/png' } }),
    )
    const result = await asset('https://example.com/start')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.asset.url.toString()).toBe('https://cdn.example.com/final')
    expect(result.asset.contentType).toBe('image/png')
  })

  it('重定向到私网/非 http(s) 被拦截', async () => {
    stubFetch(() => new Response(null, { status: 302, headers: { location: 'http://192.168.0.1/x' } }))
    const privateHop = await asset('https://example.com/start')
    expect(privateHop.ok).toBe(false)
    if (!privateHop.ok) expect(privateHop.response.status).toBe(400)

    stubFetch(() => new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } }))
    const badProtocol = await asset('https://example.com/start')
    expect(badProtocol.ok).toBe(false)
    if (!badProtocol.ok) expect(badProtocol.response.status).toBe(400)
  })

  it('声明的 content-length 超限直接拒绝', async () => {
    stubFetch(
      () =>
        new Response(new Uint8Array(4), {
          headers: { 'content-type': 'application/octet-stream', 'content-length': '2048' },
        }),
    )
    const result = await asset('https://example.com/big')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(413)
  })

  it('实际体积超限也拒绝（无 content-length）', async () => {
    stubFetch(
      () => new Response(new Uint8Array(2048), { headers: { 'content-type': 'application/octet-stream' } }),
    )
    const result = await asset('https://example.com/big')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(413)
  })

  it('可校验 Content-Type，并透出 Content-Disposition', async () => {
    stubFetch(
      () =>
        new Response('zip', {
          headers: {
            'content-type': 'application/zip',
            'content-disposition': 'attachment; filename="a.zip"',
          },
        }),
    )
    const result = await fetchUpstreamAsset({
      target: new URL('https://stage1st.com/2b/attachment.php?aid=1'),
      cookie: null,
      accept: '*/*',
      maxBytes: 1024,
      label: '附件',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.asset.contentDisposition).toBe('attachment; filename="a.zip"')
  })
})

describe('/api/file 与 /api/img', () => {
  it('附件响应带 no-store 与 Content-Disposition', async () => {
    stubFetch(
      () =>
        new Response(new Uint8Array([9, 9]), {
          headers: {
            'content-type': 'application/zip',
            'content-disposition': 'attachment; filename="a.zip"',
          },
        }),
    )
    const target = 'https://stage1st.com/2b/attachment.php?aid=1'
    const request = new Request(`http://local/api/file?u=${encodeURIComponent(target)}`, {
      headers: { 'x-s1-cookie': 'B7Y9=abc' },
    })
    const response = await handleFile(request, deps, new URL(request.url))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="a.zip"')
    expect(response.headers.get('x-upstream-url')).toBe(target)
  })

  it('图片接口拒绝非图片响应', async () => {
    stubFetch(() => new Response('html', { headers: { 'content-type': 'text/html' } }))
    const target = 'https://example.com/page'
    const request = new Request(`http://local/api/img?u=${encodeURIComponent(target)}`)
    const response = await handleImage(request, deps, new URL(request.url))

    expect(response.status).toBe(415)
    expect(((await response.json()) as { code: string }).code).toBe('not_image')
  })

  it('缺少 u 参数返回 400', async () => {
    const request = new Request('http://local/api/file')
    const response = await handleFile(request, deps, new URL(request.url))
    expect(response.status).toBe(400)
  })
})
