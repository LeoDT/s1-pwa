import { HOME_PROXY_PROTOCOL, HOME_PROXY_SERVICE } from '../../shared/homeProxy'
import type { ProxyDeps } from '../core/env'
import { handleFile } from '../core/file'
import { checkAppToken, fail, json } from '../core/http'
import { handleImage } from '../core/image'
import { handleProxy } from '../core/proxy'

export interface ProxyConfig {
  accessToken: string
  allowedOrigin: string
  host: string
  port: number
}

export function readConfig(env: NodeJS.ProcessEnv): ProxyConfig {
  if (!env.ACCESS_TOKEN?.trim()) throw new Error('ACCESS_TOKEN is required')
  const allowedOrigin = env.ALLOWED_ORIGIN ?? 'https://s1-pwa.leodt2.workers.dev'
  const origin = new URL(allowedOrigin)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== allowedOrigin) {
    throw new Error('ALLOWED_ORIGIN must be an exact origin without a trailing slash')
  }
  const port = Number(env.PORT ?? 8788)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return { accessToken: env.ACCESS_TOKEN, allowedOrigin, host: env.HOST ?? '127.0.0.1', port }
}

const allowedHeaders = ['x-app-token', 'x-s1-cookie', 'content-type']
const exposedHeaders = 'X-S1-Set-Cookie, X-Upstream-Url, X-Upstream-Status, X-S1-Error, Content-Disposition'
const methods: Record<string, string[]> = {
  '/api/health': ['GET'], '/api/proxy': ['GET', 'POST'], '/api/img': ['GET'], '/api/file': ['GET'],
}

export async function handleHomeProxy(request: Request, config: ProxyConfig, deps: ProxyDeps): Promise<Response> {
  const origin = request.headers.get('origin')
  if (origin && origin !== config.allowedOrigin) return fail(403, 'origin_forbidden', '不允许该来源')
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')
  const supported = methods[path]
  const cors = (response: Response): Response => {
    if (origin === config.allowedOrigin) {
      response.headers.set('access-control-allow-origin', origin)
      response.headers.set('access-control-expose-headers', exposedHeaders)
    }
    response.headers.set('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network')
    response.headers.set('x-content-type-options', 'nosniff')
    return response
  }
  if (!supported) return cors(fail(404, 'not_found', '未知接口'))
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('access-control-request-method') ?? ''
    const headers = (request.headers.get('access-control-request-headers') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (origin !== config.allowedOrigin || !supported.includes(method) || headers.some((h) => !allowedHeaders.includes(h))) {
      return cors(fail(403, 'preflight_forbidden', '不允许该跨域请求'))
    }
    const response = new Response(null, { status: 204, headers: {
      'access-control-allow-methods': supported.join(', '),
      'access-control-allow-headers': allowedHeaders.join(', '),
      'access-control-max-age': '600',
    } })
    if (request.headers.get('access-control-request-private-network') === 'true') {
      response.headers.set('access-control-allow-private-network', 'true')
    }
    return cors(response)
  }
  const denied = checkAppToken(request, { ACCESS_TOKEN: config.accessToken })
  if (denied) return cors(denied)
  if (!supported.includes(request.method)) return cors(fail(405, 'method_not_allowed', '不支持的请求方法'))
  try {
    if (path === '/api/health') return cors(json({ ok: true, service: HOME_PROXY_SERVICE, protocol: HOME_PROXY_PROTOCOL }))
    const handler = path === '/api/proxy' ? handleProxy : path === '/api/img' ? handleImage : handleFile
    return cors(await handler(request, deps, url))
  } catch {
    return cors(fail(500, 'internal_error', '家庭代理内部错误'))
  }
}
