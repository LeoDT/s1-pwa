// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleHomeProxy, readConfig } from '../server/node/app'
import { createProxyServer } from '../server/node/server'
import { createS1Fetch } from '../server/node/upstream'

const config = { accessToken: 'secret', allowedOrigin: 'https://pwa.example', host: '127.0.0.1', port: 8788 }
const origin = config.allowedOrigin
const request = (path: string, init: RequestInit = {}) => new Request(`http://home${path}`, init)
const authed = { origin, 'x-app-token': 'secret', 'x-s1-cookie': 'sid=test' }

afterEach(() => vi.restoreAllMocks())

describe('家庭服务配置与CORS', () => {
  it('没有令牌拒绝启动，其他配置有安全默认值', () => {
    expect(() => readConfig({})).toThrow('ACCESS_TOKEN')
    expect(() => readConfig({ ACCESS_TOKEN: '  ' })).toThrow('ACCESS_TOKEN')
    expect(readConfig({ ACCESS_TOKEN: 'secret' })).toEqual({ ...config, allowedOrigin: 'https://s1-pwa.leodt2.workers.dev' })
    expect(() => readConfig({ ACCESS_TOKEN: 'secret', ALLOWED_ORIGIN: 'https://pwa.example/' })).toThrow()
    expect(() => readConfig({ ACCESS_TOKEN: 'secret', PORT: '0' })).toThrow()
  })

  it('health也需要令牌；成功返回明确的服务协议', async () => {
    expect((await handleHomeProxy(request('/api/health'), config, {})).status).toBe(401)
    const response = await handleHomeProxy(request('/api/health', { headers: authed }), config, {})
    expect(await response.json()).toEqual({ ok: true, service: 's1-pwa-proxy', protocol: 1 })
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-expose-headers')).toContain('X-S1-Set-Cookie')
    expect(response.headers.get('access-control-expose-headers')).toContain('Content-Disposition')
  })

  it('拒绝其他来源且不反射允许头；无Origin的CLI仍鉴权', async () => {
    const denied = await handleHomeProxy(request('/api/health', { headers: { ...authed, origin: 'https://evil.example' } }), config, {})
    expect(denied.status).toBe(403)
    expect(denied.headers.has('access-control-allow-origin')).toBe(false)
    expect((await handleHomeProxy(request('/api/health', { headers: { 'x-app-token': 'secret' } }), config, {})).status).toBe(200)
    const invalid = await handleHomeProxy(request('/api/health', { headers: { origin, 'x-app-token': 'wrong' } }), config, {})
    expect(invalid.status).toBe(401)
    expect(invalid.headers.get('access-control-allow-origin')).toBe(origin)
  })

  it('预检允许需要的请求头与PNA，不需要访问令牌', async () => {
    const response = await handleHomeProxy(request('/api/proxy', { method: 'OPTIONS', headers: {
      origin, 'access-control-request-method': 'POST',
      'access-control-request-headers': 'X-App-Token, X-S1-Cookie, Content-Type',
      'access-control-request-private-network': 'true',
    } }), config, {})
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
    expect(response.headers.get('access-control-allow-private-network')).toBe('true')
  })

  it.each([
    { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    { origin, 'access-control-request-method': 'DELETE' },
    { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
  ])('拒绝未授权的预检 %j', async (headers) => {
    const response = await handleHomeProxy(request('/api/proxy', { method: 'OPTIONS', headers }), config, {})
    expect(response.status).toBe(403)
    expect(response.headers.has('access-control-allow-private-network')).toBe(false)
  })

  it('没有历史、配置或静态UI接口，不需要数据库依赖', async () => {
    for (const path of ['/api/history', '/api/history/index', '/api/config', '/']) {
      expect((await handleHomeProxy(request(path, { headers: authed }), config, {})).status).toBe(404)
    }
    expect((await handleHomeProxy(request('/api/img', { method: 'POST', headers: authed }), config, {})).status).toBe(405)
  })

  it('复用core代理，暴露Cookie并保持上游重定向为JSON而非HTTP跳转', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: {
      location: '/2b/forum.php', 'set-cookie': 'sid=new-cookie; Path=/',
    } }))
    const response = await handleHomeProxy(request('/api/proxy?u=https%3A%2F%2Fstage1st.com%2F2b%2F', { headers: authed }), config, { fetch })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ redirect: { status: 302, url: 'https://stage1st.com/2b/forum.php' } })
    expect(response.headers.has('x-s1-set-cookie')).toBe(true)
    const forwarded = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(forwarded.get('cookie')).toBe('sid=test')
    expect(forwarded.has('x-app-token')).toBe(false)
  })
})

describe('原生fetch上游边界', () => {
  it('限制家庭上游域名、端口及URL凭证', async () => {
    const upstream = vi.fn()
    const fetchS1 = createS1Fetch(upstream)
    for (const url of ['https://evil.example/a', 'https://stage1st.com.evil/a', 'https://u:p@stage1st.com/', 'https://stage1st.com:8788/', 'file:///etc/passwd']) {
      await expect(fetchS1(url)).rejects.toThrow('blocked upstream')
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('使用原生fetch的手动重定向与超时信号，保留多个Set-Cookie', async () => {
    const headers = new Headers({ 'content-encoding': 'gzip', 'content-length': '99' })
    headers.append('set-cookie', 'sid=a; Path=/')
    headers.append('set-cookie', 'auth=b; Path=/')
    const upstream = vi.fn(async () => new Response('decoded page', { headers }))
    const response = await createS1Fetch(upstream)('https://stage1st.com/2b/')
    expect(await response.text()).toBe('decoded page')
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(response.headers.has('content-encoding')).toBe(false)
    expect(response.headers.has('content-length')).toBe(false)
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', signal: expect.any(AbortSignal) })
  })

  it('不自动跟随重定向，core会逐跳检查目标', async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://192.168.1.1/private' } }))
    const response = await createS1Fetch(upstream)('https://stage1st.com/')
    expect(response.status).toBe(302)
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('解压后的响应超过50MB时停止读取', async () => {
    let cancelled = false
    const upstream = vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(50 * 1024 * 1024 + 1)) },
      cancel() { cancelled = true },
    })))
    await expect(createS1Fetch(upstream)('https://stage1st.com/')).rejects.toThrow('response too large')
    expect(cancelled).toBe(true)
  })
})

describe('Node HTTP入口', () => {
  it('真实HTTP桥接代理响应、CORS及入口大小限制', async () => {
    const upstream = vi.fn(async () => new Response('forum page', { headers: { 'content-type': 'text/html' } }))
    const server = createProxyServer(config, { fetch: upstream })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('no port')
      const base = `http://127.0.0.1:${address.port}`
      const response = await fetch(`${base}/api/proxy?u=${encodeURIComponent('https://stage1st.com/2b/')}`, { headers: authed })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('forum page')
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
      const large = await fetch(`${base}/api/proxy`, { method: 'POST', body: 'x'.repeat(16 * 1024 + 1), headers: authed })
      expect(large.status).toBe(413)
      expect(upstream).toHaveBeenCalledTimes(1)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
