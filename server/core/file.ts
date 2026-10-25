import type { CoreDeps } from './env'
import { fetchUpstreamAsset } from './fetchUpstream'
import { fail } from './http'
import { readTarget } from './proxy'

const MAX_BYTES = 50 * 1024 * 1024

/**
 * 附件下载：不限 Content-Type，但限制大小并透出 Content-Disposition。
 * 见 docs/data-model.md §4.5。
 */
export async function handleFile(request: Request, _deps: CoreDeps, url: URL): Promise<Response> {
  const target = readTarget(url)
  if (!target) return fail(400, 'bad_request', '缺少或非法的 u 参数')

  const result = await fetchUpstreamAsset({
    target,
    cookie: request.headers.get('x-s1-cookie'),
    accept: '*/*',
    maxBytes: MAX_BYTES,
    label: '附件',
  })
  if (!result.ok) return result.response

  const { asset } = result
  const headers = new Headers({
    'content-type': asset.contentType || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-upstream-url': asset.url.toString(),
  })
  if (asset.contentDisposition) headers.set('content-disposition', asset.contentDisposition)

  return new Response(asset.bytes, { status: 200, headers })
}
