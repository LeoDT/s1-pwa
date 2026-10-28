import { fail } from './http'
import { isPublicHost } from './net'
import { isUpstreamHost } from './proxy'
import { MOBILE_UA } from './upstream'

const DEFAULT_MAX_HOPS = 4

export interface UpstreamAsset {
  /** 最终落地地址（跟随重定向后） */
  url: URL
  bytes: ArrayBuffer
  contentType: string
  contentDisposition?: string
}

export type UpstreamResult =
  | { ok: true; asset: UpstreamAsset }
  | { ok: false; response: Response }

interface FetchUpstreamOptions {
  target: URL
  /** 仅白名单上游域会收到 cookie */
  cookie: string | null
  accept: string
  maxBytes: number
  /** 错误文案用，如「图片」「附件」 */
  label: string
  maxHops?: number
  /** 返回非 null 表示内容类型不合法，直接作为错误响应 */
  validateContentType?: (contentType: string) => Response | null
  fetch?: typeof fetch
}

/**
 * 图片/附件共用：手动跟重定向、逐跳做 SSRF 校验、限制大小。
 * cookie 只在目标属于 stage1st.com 时转发（docs/architecture.md §2）。
 */
export async function fetchUpstreamAsset(
  options: FetchUpstreamOptions,
): Promise<UpstreamResult> {
  const { target, maxBytes, label } = options
  const maxHops = options.maxHops ?? DEFAULT_MAX_HOPS

  if (!isPublicHost(target.hostname)) {
    return { ok: false, response: fail(400, 'blocked_address', '不允许该地址') }
  }

  let current = target
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const headers = new Headers({
      'user-agent': MOBILE_UA,
      referer: 'https://stage1st.com/2b/',
      accept: options.accept,
    })
    if (options.cookie && isUpstreamHost(current.hostname)) headers.set('cookie', options.cookie)

    let upstream: Response
    try {
      upstream = await (options.fetch ?? fetch)(current.toString(), { headers, redirect: 'manual' })
    } catch {
      return { ok: false, response: fail(502, 'upstream_error', `${label}源不可达`) }
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      await upstream.body?.cancel().catch(() => undefined)
      if (!location) {
        return { ok: false, response: fail(502, 'upstream_error', `${label}重定向缺少 Location`) }
      }
      const next = new URL(location, current)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        return { ok: false, response: fail(400, 'blocked_address', '不允许该地址') }
      }
      if (!isPublicHost(next.hostname)) {
        return { ok: false, response: fail(400, 'blocked_address', '不允许该地址') }
      }
      current = next
      continue
    }

    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined)
      return {
        ok: false,
        response: fail(502, 'upstream_error', `${label}源返回 ${upstream.status}`),
      }
    }

    const contentType = upstream.headers.get('content-type') ?? ''
    const invalid = options.validateContentType?.(contentType)
    if (invalid) {
      await upstream.body?.cancel().catch(() => undefined)
      return { ok: false, response: invalid }
    }

    const declared = Number.parseInt(upstream.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(declared) && declared > maxBytes) {
      await upstream.body?.cancel().catch(() => undefined)
      return { ok: false, response: fail(413, 'too_large', `${label}过大`) }
    }

    const bytes = await upstream.arrayBuffer()
    if (bytes.byteLength > maxBytes) {
      return { ok: false, response: fail(413, 'too_large', `${label}过大`) }
    }

    const contentDisposition = upstream.headers.get('content-disposition') ?? undefined
    return {
      ok: true,
      asset: {
        url: current,
        bytes,
        contentType,
        ...(contentDisposition ? { contentDisposition } : {}),
      },
    }
  }

  return { ok: false, response: fail(502, 'too_many_redirects', `${label}重定向次数过多`) }
}
