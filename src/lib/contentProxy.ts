import { HOME_PROXY_PROTOCOL, HOME_PROXY_SERVICE } from '@shared/homeProxy'
import { getAppToken, subscribeAppToken } from './appToken'

export interface HomeProxySettings {
  address: string
  cloudflareOnly: boolean
}

export interface ContentProxyStatus {
  route: 'cloudflare' | 'home' | 'probing'
  available: boolean | null
  error: string | null
}

export interface ContentRouteContext {
  origin: string
  allowFallback: boolean
}

type ContentPath = '/api/proxy' | '/api/img' | '/api/file'
const STORAGE_KEY = 's1r:homeProxySettings'
const COOLDOWN_MS = 30_000
const settingsListeners = new Set<() => void>()
const statusListeners = new Set<() => void>()
let settings = readSettings()
let status: ContentProxyStatus = { route: 'cloudflare', available: null, error: null }
let retryAt = 0
let revision = 0
let probe: { controller: AbortController; promise: Promise<ContentProxyStatus> } | null = null

export function getHomeProxySettings(): HomeProxySettings {
  return settings
}

export function subscribeHomeProxySettings(listener: () => void): () => void {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}

export function normalizeHomeProxyAddress(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  let url: URL
  try { url = new URL(value) } catch { throw new Error('请输入完整的 HTTPS 地址') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('家庭代理地址必须是 HTTPS 地址，不能包含路径、参数或账号密码')
  }
  return url.origin
}

export function saveHomeProxySettings(value: HomeProxySettings): void {
  const next = { address: normalizeHomeProxyAddress(value.address), cloudflareOnly: Boolean(value.cloudflareOnly) }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  settings = next
  resetRoute()
  for (const listener of settingsListeners) listener()
}

export function getContentProxyStatus(): ContentProxyStatus {
  return status
}

export function subscribeContentProxyStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

function publish(next: ContentProxyStatus): void {
  if (next.route === status.route && next.available === status.available && next.error === status.error) return
  status = next
  for (const listener of statusListeners) listener()
}

function resetRoute(): void {
  revision += 1
  probe?.controller.abort()
  probe = null
  retryAt = 0
  publish({ route: 'cloudflare', available: null, error: null })
}

subscribeAppToken(resetRoute)

export async function probeHomeProxy(): Promise<ContentProxyStatus> {
  if (!settings.address || settings.cloudflareOnly) return status
  if (probe) return probe.promise
  const currentRevision = revision
  const address = settings.address
  const controller = new AbortController()
  publish({ route: 'probing', available: null, error: null })
  const promise = (async () => {
    try {
      await withDeadline(controller, 1000, async () => {
        const token = await getAppToken()
        if (controller.signal.aborted) throw new Error('探测超时')
        const response = await fetch(`${address}/api/health`, {
          headers: token ? { 'x-app-token': token } : {},
          credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) throw new Error(`健康检查 HTTP ${response.status}`)
        const body = await response.json() as Record<string, unknown>
        if (body?.ok !== true || body.service !== HOME_PROXY_SERVICE || body.protocol !== HOME_PROXY_PROTOCOL) {
          throw new Error('家庭代理协议不匹配')
        }
      })
      if (revision === currentRevision) publish({ route: 'home', available: true, error: null })
    } catch (error) {
      if (revision === currentRevision) {
        retryAt = Date.now() + COOLDOWN_MS
        publish({ route: 'cloudflare', available: false, error: error instanceof Error ? error.message : '家庭代理不可用' })
      }
    } finally {
      if (revision === currentRevision) probe = null
    }
    return status
  })()
  probe = { controller, promise }
  return promise
}

export async function captureContentRoute(): Promise<ContentRouteContext> {
  if (!settings.address || settings.cloudflareOnly) return { origin: '', allowFallback: true }
  if (status.available !== true && Date.now() >= retryAt) await probeHomeProxy()
  return { origin: status.available === true ? settings.address : '', allowFallback: true }
}

function markHomeUnavailable(origin: string): void {
  if (origin !== settings.address || settings.cloudflareOnly) return
  revision += 1
  probe?.controller.abort()
  probe = null
  retryAt = Date.now() + COOLDOWN_MS
  publish({ route: 'cloudflare', available: false, error: '家庭代理请求失败，已回退 Cloudflare' })
}

export async function routedContentFetch(
  path: ContentPath, query: string, init: RequestInit, route: ContentRouteContext,
): Promise<Response> {
  const endpoint = `${path}${query}`
  if (!route.origin) return fetch(endpoint, init)
  const origin = route.origin
  const method = init.method?.toUpperCase() ?? 'GET'
  let response: Response
  try {
    response = await withDeadline(new AbortController(), path === '/api/file' ? 30_000 : 8000, async (signal) => {
      const fetched = await fetch(`${origin}${endpoint}`, {
        ...init, credentials: 'omit', redirect: 'error', signal,
      })
      const body = fetched.body ? await fetched.arrayBuffer() : null
      return new Response(body, { status: fetched.status, statusText: fetched.statusText, headers: fetched.headers })
    })
  } catch (error) {
    markHomeUnavailable(origin)
    if (method !== 'GET' || !route.allowFallback) throw error
    route.origin = ''
    return fetch(endpoint, init)
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    markHomeUnavailable(origin)
    if (method === 'GET' && route.allowFallback) {
      route.origin = ''
      return fetch(endpoint, init)
    }
  }
  return response
}

export function startContentProxyLifecycle(): () => void {
  const refresh = () => {
    if (document.visibilityState === 'hidden' || probe) return
    resetRoute()
    void probeHomeProxy()
  }
  window.addEventListener('online', refresh)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', refresh)
  void probeHomeProxy()
  return () => {
    window.removeEventListener('online', refresh)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  }
}

async function withDeadline<T>(controller: AbortController, ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('家庭代理请求超时')) }, ms)
  })
  try { return await Promise.race([run(controller.signal), timeout]) }
  finally { clearTimeout(timer) }
}

function readSettings(): HomeProxySettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<HomeProxySettings> | null
    if (typeof value?.address === 'string') {
      return { address: normalizeHomeProxyAddress(value.address), cloudflareOnly: Boolean(value.cloudflareOnly) }
    }
  } catch { /* 无效或不可用的存储按未配置处理。 */ }
  return { address: '', cloudflareOnly: false }
}
