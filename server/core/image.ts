import type { CoreDeps } from './env'
import { fetchUpstreamAsset } from './fetchUpstream'
import { fail } from './http'
import { readTarget } from './proxy'

const MAX_BYTES = 12 * 1024 * 1024

/**
 * 图片代理：解决外链防盗链与混合内容，顺带把 S1 的登录态带过去（仅上游域）。
 * 见 docs/architecture.md §3.5 / §4.4。
 */
export async function handleImage(request: Request, _deps: CoreDeps, url: URL): Promise<Response> {
  const target = readTarget(url)
  if (!target) return fail(400, 'bad_request', '缺少或非法的 u 参数')

  const result = await fetchUpstreamAsset({
    target,
    cookie: request.headers.get('x-s1-cookie'),
    accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
    maxBytes: MAX_BYTES,
    label: '图片',
    validateContentType: (contentType) =>
      contentType.toLowerCase().startsWith('image/')
        ? null
        : fail(415, 'not_image', '该地址不是图片'),
  })
  if (!result.ok) return result.response

  const { asset } = result
  return new Response(asset.bytes, {
    status: 200,
    headers: {
      'content-type': asset.contentType,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-upstream-url': asset.url.toString(),
    },
  })
}
