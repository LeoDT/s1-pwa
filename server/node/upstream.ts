import { isUpstreamHost } from '../core/proxy'

const MAX_RESPONSE_BYTES = 50 * 1024 * 1024

export function createS1Fetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init = {}) => {
    const target = new URL(input instanceof Request ? input.url : input)
    if (!['http:', 'https:'].includes(target.protocol) || !isUpstreamHost(target.hostname) ||
      target.username || target.password || (target.port && target.port !== '80' && target.port !== '443')) {
      throw new Error('blocked upstream')
    }
    const signal = AbortSignal.any([
      AbortSignal.timeout(15_000), ...(init.signal ? [init.signal] : []),
    ])
    const response = await fetcher(input, { ...init, redirect: 'manual', signal })
    const headers = new Headers(response.headers)
    // 原生 fetch 已解压响应，不能再把上游的编码与压缩长度透传给浏览器。
    headers.delete('content-encoding')
    headers.delete('content-length')
    headers.delete('transfer-encoding')
    if (!response.body || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel()
      return new Response(null, { status: response.status, headers })
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_RESPONSE_BYTES) throw new Error('response too large')
        chunks.push(value)
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    } finally {
      reader.releaseLock()
    }
    return new Response(new Blob(chunks), { status: response.status, headers })
  }
}
