import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  token: vi.fn(), tokenListeners: [] as (() => void)[],
}))
vi.mock('@/lib/appToken', () => ({
  getAppToken: mocks.token,
  subscribeAppToken: (fn: () => void) => { mocks.tokenListeners.push(fn); return () => {} },
}))
vi.mock('@/lib/cookieJar', () => ({ cookieHeader: async () => 'sid=test' }))

let api: typeof import('@/lib/contentProxy')
let fetchMock: ReturnType<typeof vi.fn>
const health = () => Response.json({ ok: true, service: 's1-pwa-proxy', protocol: 1 })
const configure = (address = 'https://home.example') => api.saveHomeProxySettings({ address, cloudflareOnly: false })

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  mocks.token.mockReset().mockResolvedValue('app-token')
  mocks.tokenListeners.length = 0
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  api = await import('@/lib/contentProxy')
})

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('家庭代理选路', () => {
  it('未配置时不探测；只发送原有同源内容请求', async () => {
    fetchMock.mockResolvedValue(new Response('cf'))
    const route = await api.captureContentRoute()
    expect(route.origin).toBe('')
    await api.routedContentFetch('/api/img', '?u=image', {}, route)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/img?u=image', {})
  })

  it('保存规范化地址，提供稳定快照并拒绝不安全地址', () => {
    configure(' https://HOME.example/ ')
    expect(api.getHomeProxySettings().address).toBe('https://home.example')
    expect(api.getHomeProxySettings()).toBe(api.getHomeProxySettings())
    for (const address of ['http://home.example', 'https://u:p@home.example', 'https://home.example/path', 'https://home.example/?x=1', 'https://home.example/#x']) {
      expect(() => configure(address)).toThrow()
    }
  })

  it('并发内容请求共享一个只携带访问令牌的健康探针', async () => {
    configure()
    fetchMock.mockResolvedValue(health())
    const routes = await Promise.all([api.captureContentRoute(), api.captureContentRoute(), api.captureContentRoute()])
    expect(routes.every((r) => r.origin === 'https://home.example')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://home.example/api/health')
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    expect(new Headers(init.headers).get('x-app-token')).toBe('app-token')
    expect(new Headers(init.headers).has('x-s1-cookie')).toBe(false)
  })

  it('错误协议与401都视为不可用，并在冷却期内不重复探测', async () => {
    configure()
    fetchMock.mockResolvedValue(Response.json({ ok: true }))
    expect((await api.captureContentRoute()).origin).toBe('')
    expect((await api.captureContentRoute()).origin).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(api.getContentProxyStatus().error).toMatch(/协议/)
    fetchMock.mockResolvedValue(new Response('', { status: 401 }))
    await api.probeHomeProxy()
    expect(api.getContentProxyStatus().error).toContain('401')
  })

  it('探针超时覆盖响应体读取，冷却后可重新尝试', async () => {
    vi.useFakeTimers()
    configure()
    fetchMock.mockResolvedValue({ ok: true, json: () => new Promise(() => {}) })
    const pending = api.captureContentRoute()
    await vi.advanceTimersByTimeAsync(1001)
    expect((await pending).origin).toBe('')
    expect(api.getContentProxyStatus().available).toBe(false)
    await vi.advanceTimersByTimeAsync(30_001)
    fetchMock.mockResolvedValue(health())
    expect((await api.captureContentRoute()).origin).toBe('https://home.example')
  })

  it('设置更改后旧探针结果不能覆盖新状态', async () => {
    configure()
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r }))
    const pending = api.probeHomeProxy()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    api.saveHomeProxySettings({ address: '', cloudflareOnly: true })
    resolve(health())
    await pending
    expect(api.getContentProxyStatus()).toMatchObject({ route: 'cloudflare', available: null })
    expect((await api.captureContentRoute()).origin).toBe('')
  })

  it('内容GET失败只回退一次，后续请求不再撞家庭节点', async () => {
    configure()
    fetchMock.mockResolvedValueOnce(health()).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(new Response('cf'))
    const route = await api.captureContentRoute()
    const response = await api.routedContentFetch('/api/proxy', '?u=page', { headers: { 'x-s1-cookie': 'sid=test' } }, route)
    expect(await response.text()).toBe('cf')
    expect(route.origin).toBe('')
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ credentials: 'omit', redirect: 'error' })
    expect(fetchMock.mock.calls[2]![0]).toBe('/api/proxy?u=page')
    expect((await api.captureContentRoute()).origin).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('响应体中断也可以安全回退，而不是返回已损坏内容', async () => {
    configure()
    const broken = new Response(new ReadableStream({ start(controller) { controller.error(new Error('broken body')) } }))
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValueOnce(broken).mockResolvedValueOnce(new Response('cf'))
    const response = await api.routedContentFetch('/api/img', '?u=image', {}, await api.captureContentRoute())
    expect(await response.text()).toBe('cf')
  })

  it.each([502, 503, 504])('家庭HTTP %i 时GET可回退', async (status) => {
    configure()
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValueOnce(new Response('', { status })).mockResolvedValueOnce(new Response('cf'))
    expect(await (await api.routedContentFetch('/api/file', '?u=file', {}, await api.captureContentRoute())).text()).toBe('cf')
  })

  it.each([401, 403])('家庭HTTP %i 不做节点回退', async (status) => {
    configure()
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValueOnce(new Response('', { status }))
    expect((await api.routedContentFetch('/api/proxy', '?u=page', {}, await api.captureContentRoute())).status).toBe(status)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('登录POST以及已固定的GET链都不能自动回退', async () => {
    configure()
    fetchMock.mockResolvedValueOnce(health()).mockRejectedValue(new Error('offline'))
    const route = await api.captureContentRoute()
    await expect(api.routedContentFetch('/api/proxy', '?u=login', { method: 'POST', body: 'secret' }, route)).rejects.toThrow('offline')
    route.allowFallback = false
    await expect(api.routedContentFetch('/api/proxy', '?u=next', {}, route)).rejects.toThrow('offline')
    expect(fetchMock.mock.calls.slice(1).every(([url]) => String(url).startsWith('https://home.example/'))).toBe(true)
  })

  it('已捕获的节点地址不随设置改变，避免登录表单与提交跨节点', async () => {
    configure()
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValue(new Response('old-home'))
    const route = await api.captureContentRoute()
    configure('https://other.example')
    await api.routedContentFetch('/api/proxy', '?u=login', { method: 'POST' }, route)
    expect(fetchMock.mock.calls[1]![0]).toBe('https://home.example/api/proxy?u=login')
  })

  it('令牌变更后重置探测，手动仅Cloudflare不探测', async () => {
    configure()
    fetchMock.mockImplementation(async () => health())
    await api.captureContentRoute()
    mocks.tokenListeners.forEach((fn) => fn())
    await api.captureContentRoute()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    api.saveHomeProxySettings({ address: 'https://home.example', cloudflareOnly: true })
    await api.probeHomeProxy()
    expect((await api.captureContentRoute()).origin).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('联网/回前台重新探测，清理生命周期监听后不再探测', async () => {
    configure()
    fetchMock.mockImplementation(async () => health())
    const stop = api.startContentProxyLifecycle()
    await api.probeHomeProxy()
    window.dispatchEvent(new Event('online'))
    await api.probeHomeProxy()
    window.dispatchEvent(new Event('focus'))
    await api.probeHomeProxy()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    stop()
    window.dispatchEvent(new Event('focus'))
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('家庭节点可用时历史与配置API仍固定同源', async () => {
    configure()
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValueOnce(Response.json({ schemaVersion: 2, items: [] })).mockResolvedValueOnce(Response.json({ version: 'test' }))
    await api.captureContentRoute()
    const { fetchHistory } = await import('@/lib/historyApi')
    const { apiFetch } = await import('@/lib/api')
    await fetchHistory()
    await apiFetch('/api/config')
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/history?limit=50&offset=0')
    expect(fetchMock.mock.calls[2]![0]).toBe('/api/config')
  })
})
