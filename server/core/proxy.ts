import type { CoreDeps } from './env'
import { fail, json } from './http'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const UPSTREAM_TIMEOUT_MS = 15_000
const MAX_POST_BYTES = 16 * 1024

export function isUpstreamHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'stage1st.com' || host.endsWith('.stage1st.com')
}

export function readTarget(url: URL): URL | null {
  const raw = url.searchParams.get('u')
  if (!raw) return null
  try {
    const target = new URL(raw)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
    return target
  } catch {
    return null
  }
}

/**
 * HTML 透传：不跟随上游重定向（3xx → JSON），不改写 body，
 * 只把 Set-Cookie 以 JS 可读的方式回给客户端。见 docs/architecture.md §4。
 */
export async function handleProxy(request: Request, url: URL, _deps: CoreDeps): Promise<Response> {
  const target = readTarget(url)
  if (!target) return fail(400, 'bad_request', '缺少或非法的 u 参数')
  if (!isUpstreamHost(target.hostname)) return fail(403, 'forbidden_host', '不允许代理该地址')

  let body: string | undefined
  if (request.method === 'POST') {
    body = await request.text()
    if (body.length > MAX_POST_BYTES) return fail(413, 'too_large', '请求体过大')
  }

  const headers = new Headers({
    'user-agent': MOBILE_UA,
    'accept-language': 'zh-CN,zh;q=0.9',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-encoding': 'gzip, br',
  })

  // 只转发 S1 凭证给白名单上游，绝不透传浏览器自带的 Cookie 头
  const cookies = request.headers.get('x-s1-cookie')
  if (cookies) headers.set('cookie', cookies)
  if (request.method === 'POST') {
    headers.set('content-type', request.headers.get('content-type') ?? 'application/x-www-form-urlencoded')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    })
  } catch {
    return fail(
      504,
      controller.signal.aborted ? 'upstream_timeout' : 'upstream_error',
      'S1 响应超时或不可达',
    )
  } finally {
    clearTimeout(timer)
  }

  const responseHeaders = new Headers({
    'cache-control': 'no-store',
    'x-upstream-url': target.toString(),
    'x-upstream-status': String(upstream.status),
  })

  // 上游 5xx（Discuz 的 system_error / 限流页）不直接透传 HTML，转成可读的诊断错误
  if (upstream.status >= 500) {
    const body = await upstream.text()
    const detail = summarizeErrorBody(body)
    const tainted = body.includes('request_tainting') || body.includes('非法字符')
    const code = tainted ? 'upstream_blocked' : 'upstream_error'

    // 只记录上游路径与查询串（不含 cookie/密码），便于定位 Discuz 的 _xss_check 误伤
    console.log(
      JSON.stringify({
        event: 'upstream_5xx',
        status: upstream.status,
        method: request.method,
        upstream: target.pathname + target.search,
        contentLength: body.length,
        tainted,
        detail,
      }),
    )

    responseHeaders.set('x-s1-error', code)
    return json(
      {
        ok: false,
        code,
        message: tainted
          ? `S1 拒绝了这次请求（Discuz 安全校验：请求含非法字符）`
          : `S1 返回 ${upstream.status}${detail ? `：${detail}` : ''}`,
      },
      { status: 502, headers: responseHeaders },
    )
  }

  const setCookies = serializeSetCookies(upstream.headers)
  if (setCookies) responseHeaders.set('x-s1-set-cookie', setCookies)

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location')
    await upstream.body?.cancel().catch(() => undefined)
    if (!location) return fail(502, 'upstream_error', '上游重定向缺少 Location')

    let absolute: string
    try {
      absolute = new URL(location, upstream.url || target.toString()).toString()
    } catch {
      return fail(502, 'upstream_error', '上游重定向地址无法解析')
    }
    return json(
      { ok: true, redirect: { status: upstream.status, url: absolute } },
      { headers: responseHeaders },
    )
  }

  responseHeaders.set('content-type', upstream.headers.get('content-type') ?? 'text/html; charset=utf-8')
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

interface SerializableCookie {
  name: string
  value: string
  expires?: number
}

/** 把上游错误页压成一行人话，便于在日志/提示里定位 */
function summarizeErrorBody(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 160)
}

function serializeSetCookies(headers: Headers): string | null {
  const raw =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : ([] as string[]).concat(headers.get('set-cookie') ?? [])

  const cookies = raw.map(parseSetCookie).filter((cookie): cookie is SerializableCookie => cookie !== null)
  if (cookies.length === 0) return null

  return base64UrlEncode(JSON.stringify(cookies))
}

function parseSetCookie(header: string): SerializableCookie | null {
  const [pair, ...attributes] = header.split(';')
  const separator = pair?.indexOf('=') ?? -1
  if (!pair || separator <= 0) return null

  const name = pair.slice(0, separator).trim()
  const value = pair.slice(separator + 1).trim()
  if (!name) return null

  let expires: number | undefined
  for (const attribute of attributes) {
    const [key, rawValue] = attribute.split('=')
    const attributeName = key?.trim().toLowerCase()
    if (attributeName === 'max-age' && rawValue) {
      const seconds = Number.parseInt(rawValue.trim(), 10)
      if (Number.isFinite(seconds)) expires = Date.now() + seconds * 1000
    } else if (attributeName === 'expires' && rawValue && expires === undefined) {
      const parsed = Date.parse(rawValue.trim())
      if (Number.isFinite(parsed)) expires = parsed
    }
  }

  return expires === undefined ? { name, value } : { name, value, expires }
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
