import { createServer, type IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import type { ProxyDeps } from '../core/env'
import { fail } from '../core/http'
import { handleHomeProxy, type ProxyConfig } from './app'
import { createS1Fetch } from './upstream'

const MAX_REQUEST_BYTES = 16 * 1024

export function createProxyServer(config: ProxyConfig, deps: ProxyDeps = { fetch: createS1Fetch() }) {
  let active = 0
  return createServer({ maxHeaderSize: 32 * 1024, requestTimeout: 20_000, headersTimeout: 10_000 }, async (incoming, outgoing) => {
    const started = Date.now()
    let path = ''
    active += 1
    try {
      const url = new URL(incoming.url ?? '/', 'http://localhost')
      path = url.pathname
      if (active > 16) {
        outgoing.writeHead(503, { 'content-type': 'application/json', 'connection': 'close' })
        outgoing.end('{"ok":false,"code":"busy","message":"家庭代理繁忙"}')
        return
      }
      const body = await readBody(incoming)
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      }
      const request = new Request(url, {
        method: incoming.method,
        headers,
        body: incoming.method === 'POST' ? new Uint8Array(body) : undefined,
      })
      const response = await handleHomeProxy(request, config, deps)
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      if (response.body) await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), outgoing)
      else outgoing.end()
    } catch (error) {
      if (!outgoing.headersSent && !outgoing.destroyed) {
        const response = error instanceof RangeError
          ? fail(413, 'too_large', '请求体过大')
          : fail(400, 'bad_request', '请求无效')
        outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), connection: 'close' })
        outgoing.end(await response.text())
      } else outgoing.destroy()
    } finally {
      active -= 1
      console.log(JSON.stringify({ path, method: incoming.method, status: outgoing.statusCode, ms: Date.now() - started }))
    }
  })
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  if (Number(request.headers['content-length'] ?? 0) > MAX_REQUEST_BYTES) throw new RangeError('body too large')
  const chunks: Buffer[] = []
  let size = 0
  // 不用 async iterator：超限时要先返回 413，再关闭连接，而不是提前销毁 socket。
  return await new Promise((resolve, reject) => {
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_REQUEST_BYTES) { request.pause(); reject(new RangeError('body too large')); return }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
    request.on('aborted', () => reject(new Error('request aborted')))
  })
}
