/**
 * 代理客户端：把 /api/proxy 的「3xx → JSON」语义还原成一串可跟随的跳转，
 * 并在每一跳合并 Set-Cookie。见 docs/architecture.md §3.2 / §4.3。
 */
import { ApiError, getAppToken } from './api'
import { cookieHeader, mergeJar, type StoredCookie } from './cookieJar'

export const UPSTREAM_ORIGIN = 'https://stage1st.com'
export const UPSTREAM_ROOT = `${UPSTREAM_ORIGIN}/2b/`

const MAX_HOPS = 5

export interface ProxyResult {
  /** 最终落地的上游地址（含查询串，不含 hash） */
  url: string
  status: number
  html: string
}

export interface ProxyPostInit {
  method: 'POST'
  body: string
}

export function upstreamUrl(
  path: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(path, UPSTREAM_ROOT)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

interface ProxyEnvelope {
  ok?: boolean
  redirect?: { status: number; url: string }
  code?: string
  message?: string
}

export async function proxyFetch(
  targetUrl: string,
  init?: ProxyPostInit,
): Promise<ProxyResult> {
  const token = await getAppToken()

  let current = targetUrl
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    const headers = new Headers()
    if (token) headers.set('x-app-token', token)

    const jar = await cookieHeader()
    if (jar) headers.set('x-s1-cookie', jar)

    if (init) headers.set('content-type', 'application/x-www-form-urlencoded')

    const response = await fetch(
      `/api/proxy?u=${encodeURIComponent(current)}`,
      {
        method: init ? 'POST' : 'GET',
        headers,
        body: init?.body,
      },
    )

    const setCookieHeader = response.headers.get('x-s1-set-cookie')
    if (setCookieHeader) await mergeJar(decodeSetCookies(setCookieHeader))

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as ProxyEnvelope
      if (!response.ok || payload.ok === false) {
        throw new ApiError(
          payload.code ?? `http_${response.status}`,
          payload.message ?? '代理请求失败',
          response.status,
        )
      }
      if (!payload.redirect) {
        throw new ApiError('bad_response', '代理返回了无法识别的内容', response.status)
      }
      current = payload.redirect.url
      continue
    }

    if (!response.ok) {
      throw new ApiError(`http_${response.status}`, `上游返回 ${response.status}`, response.status)
    }

    return {
      url: response.headers.get('x-upstream-url') ?? current,
      status: Number(response.headers.get('x-upstream-status') ?? response.status),
      html: await response.text(),
    }
  }

  throw new ApiError('too_many_redirects', '重定向次数过多', 502)
}

function decodeSetCookies(encoded: string): StoredCookie[] {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as StoredCookie[]
  } catch {
    return []
  }
}
