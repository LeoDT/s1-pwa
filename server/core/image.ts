import type { CoreDeps } from './env'
import { fail } from './http'
import { isUpstreamHost, readTarget } from './proxy'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const MAX_BYTES = 12 * 1024 * 1024
const MAX_HOPS = 4

/**
 * 图片代理：解决外链防盗链与混合内容，顺带把 S1 的登录态带过去（仅上游域）。
 * 见 docs/architecture.md §3.5 / §4.4。
 */
export async function handleImage(request: Request, url: URL, _deps: CoreDeps): Promise<Response> {
  const target = readTarget(url)
  if (!target) return fail(400, 'bad_request', '缺少或非法的 u 参数')
  if (!isPublicHost(target.hostname)) return fail(400, 'blocked_address', '不允许该地址')

  const cookie = isUpstreamHost(target.hostname) ? request.headers.get('x-s1-cookie') : null

  let current = target
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    const headers = new Headers({
      'user-agent': MOBILE_UA,
      referer: 'https://stage1st.com/2b/',
      accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
    })
    if (cookie) headers.set('cookie', cookie)

    let upstream: Response
    try {
      upstream = await fetch(current.toString(), { headers, redirect: 'manual' })
    } catch {
      return fail(502, 'upstream_error', '图片源不可达')
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      await upstream.body?.cancel().catch(() => undefined)
      if (!location) return fail(502, 'upstream_error', '图片重定向缺少 Location')
      const next = new URL(location, current)
      if (!isPublicHost(next.hostname)) return fail(400, 'blocked_address', '不允许该地址')
      current = next
      continue
    }

    if (!upstream.ok) return fail(502, 'upstream_error', `图片源返回 ${upstream.status}`)

    const contentType = upstream.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/')) {
      await upstream.body?.cancel().catch(() => undefined)
      return fail(415, 'not_image', '该地址不是图片')
    }

    const declared = Number.parseInt(upstream.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      await upstream.body?.cancel().catch(() => undefined)
      return fail(413, 'too_large', '图片过大')
    }

    const buffer = await upstream.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) return fail(413, 'too_large', '图片过大')

    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-upstream-url': current.toString(),
      },
    })
  }

  return fail(502, 'too_many_redirects', '图片重定向次数过多')
}

/** 只放行公网 http(s)；拒绝回环/私网/链路本地/元数据地址 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return false
  if (host.startsWith('[') || host.includes(':')) return false // IPv6 字面量一律拒绝

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return true // 普通域名

  const [a, b] = [Number(match[1]), Number(match[2])]
  if (a === 0 || a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a >= 224) return false
  return true
}
