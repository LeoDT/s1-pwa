import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mergeJar: vi.fn(), cookieHeader: vi.fn() }))
vi.mock('@/lib/cookieJar', () => ({ ...mocks, clearJar: vi.fn() }))
vi.mock('@/lib/appToken', () => ({ getAppToken: async () => 'app-token', subscribeAppToken: () => () => {} }))

let routes: typeof import('@/lib/contentProxy')
let proxy: typeof import('@/lib/proxy')
let fetchMock: ReturnType<typeof vi.fn>
const health = () => Response.json({ ok: true, service: 's1-pwa-proxy', protocol: 1 })
const redirect = (status = 302) => Response.json({ redirect: { status, url: 'https://stage1st.com/2b/next' } })
const cookie = btoa(JSON.stringify([{ name: 'sid', value: 'new' }]))

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  mocks.mergeJar.mockReset().mockResolvedValue(undefined)
  mocks.cookieHeader.mockReset().mockResolvedValue('sid=old')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  routes = await import('@/lib/contentProxy')
  routes.saveHomeProxySettings({ address: 'https://home.example', cloudflareOnly: false })
  proxy = await import('@/lib/proxy')
})
afterEach(() => vi.unstubAllGlobals())

describe('内容代理跳转与登录节点固定', () => {
  it('首跳回退后仍合并Cloudflare返回的Cookie', async () => {
    fetchMock.mockResolvedValueOnce(health()).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('page', {
      headers: { 'x-s1-set-cookie': cookie },
    }))
    expect((await proxy.proxyFetch('https://stage1st.com/2b/')).html).toBe('page')
    expect(mocks.mergeJar).toHaveBeenCalledWith([{ name: 'sid', value: 'new' }])
    expect(fetchMock.mock.calls[2]![0]).toMatch(/^\/api\/proxy\?/)
  })

  it('成功的首跳之后不跨节点回退', async () => {
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValueOnce(redirect()).mockRejectedValueOnce(new Error('offline'))
    await expect(proxy.proxyFetch('https://stage1st.com/2b/')).rejects.toThrow('offline')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('https://home.example/'))).toBe(true)
  })

  it('表单获取、POST提交和跳转固定在原地址，即使设置已变更；302后使用GET', async () => {
    const fixture = readFileSync(path.join(import.meta.dirname, 'fixtures/login.html'), 'utf8')
    fetchMock.mockResolvedValueOnce(health()).mockResolvedValueOnce(new Response(fixture))
    const { fetchLoginPage, submitLogin } = await import('@/lib/session')
    const page = await fetchLoginPage()
    routes.saveHomeProxySettings({ address: 'https://other.example', cloudflareOnly: true })
    const postResponse = redirect()
    postResponse.headers.set('x-s1-set-cookie', cookie)
    fetchMock.mockResolvedValueOnce(postResponse).mockResolvedValueOnce(new Response("<script>discuz_uid = '7';</script>"))
    const session = await submitLogin(page.form, { username: 'test', password: 'not-a-real-secret' }, page.route)
    expect(session.uid).toBe(7)
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit' })
    expect(fetchMock.mock.calls[3]![1]).toMatchObject({ method: 'GET', body: undefined })
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith('https://home.example/'))).toBe(true)
    expect(mocks.mergeJar).toHaveBeenCalledWith([{ name: 'sid', value: 'new' }])
  })

  it('POST失败不重发，307/308也不自动重放密码', async () => {
    fetchMock.mockResolvedValueOnce(health()).mockRejectedValueOnce(new Error('offline'))
    await expect(proxy.proxyFetch('https://stage1st.com/2b/login', { method: 'POST', body: 'secret' })).rejects.toThrow('offline')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const status of [307, 308]) {
      fetchMock.mockResolvedValueOnce(redirect(status))
      await expect(proxy.proxyFetch('https://stage1st.com/2b/login', { method: 'POST', body: 'secret' }, {
        origin: 'https://home.example', allowFallback: false,
      })).rejects.toMatchObject({ code: 'unsafe_post_redirect' })
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
