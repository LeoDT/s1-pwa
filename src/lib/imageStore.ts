/**
 * 图片通道：fetch → blob URL + Cache API 持久缓存（LRU 上限 500MB）。
 * 见 docs/architecture.md §3.5、docs/data-model.md §5.3。
 *
 * 为什么不用 <img src="/api/img?...">：需要带访问令牌与 S1 cookie，且要能统计/清理缓存。
 */
import { idbAll, idbDel, idbGet, idbSet } from './db'
import { getAppToken } from './api'
import { cookieHeader } from './cookieJar'

const CACHE_NAME = 's1-img-v1'
const MAX_TOTAL_BYTES = 500 * 1024 * 1024
/** 图片缓存保留 7 天：冷门图不长期占空间 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CONCURRENT = 6
const MAX_OBJECT_URLS = 60

interface CacheMeta {
  key: string
  size: number
  lastUsed: number
}

const inflight = new Map<string, Promise<string>>()
const objectUrls = new Map<string, string>()

let active = 0
const queue: Array<() => void> = []

function withSlot<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1
          queue.shift()?.()
        })
    }
    if (active < MAX_CONCURRENT) run()
    else queue.push(run)
  })
}

export function imageCacheKey(absoluteUrl: string): string {
  return `/api/img?u=${encodeURIComponent(absoluteUrl)}`
}

/** 返回可直接给 <img src> 的 blob URL（同一 src 复用） */
export async function loadImage(absoluteUrl: string): Promise<string> {
  const key = imageCacheKey(absoluteUrl)

  const cached = objectUrls.get(key)
  if (cached) {
    void touchMeta(key)
    return cached
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const task = withSlot(async () => {
    const cache = await caches.open(CACHE_NAME)
    let response = await cache.match(key)

    if (!response) {
      const token = await getAppToken()
      const cookie = await cookieHeader()
      const headers = new Headers()
      if (token) headers.set('x-app-token', token)
      if (cookie) headers.set('x-s1-cookie', cookie)

      const fetched = await fetch(key, { headers })
      if (!fetched.ok) throw new Error(`图片加载失败（${fetched.status}）`)

      const blob = await fetched.blob()
      response = new Response(blob, {
        headers: { 'content-type': blob.type, 'content-length': String(blob.size) },
      })
      await cache.put(key, response.clone())
      await idbSet<CacheMeta>('imgMeta', key, {
        key,
        size: blob.size,
        lastUsed: Date.now(),
      })
      void pruneImageCache()
    } else {
      void touchMeta(key)
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    objectUrls.set(key, objectUrl)
    trimObjectUrls()
    return objectUrl
  })

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

async function touchMeta(key: string): Promise<void> {
  const found = await idbGet<CacheMeta>('imgMeta', key)
  if (found) await idbSet('imgMeta', key, { ...found, lastUsed: Date.now() })
}

function trimObjectUrls(): void {
  while (objectUrls.size > MAX_OBJECT_URLS) {
    const oldest = objectUrls.keys().next().value
    if (oldest === undefined) return
    const url = objectUrls.get(oldest)
    if (url) URL.revokeObjectURL(url)
    objectUrls.delete(oldest)
  }
}

/** 7 天过期 + 500MB LRU；启动时与每次新图入库后调用 */
export async function pruneImageCache(): Promise<void> {
  const entries = await idbAll<CacheMeta>('imgMeta')
  if (entries.length === 0) return

  const cache = await caches.open(CACHE_NAME)
  const now = Date.now()
  const kept: CacheMeta[] = []

  for (const entry of entries) {
    if (now - entry.lastUsed > MAX_AGE_MS) {
      await cache.delete(entry.key)
      await idbDel('imgMeta', entry.key)
    } else {
      kept.push(entry)
    }
  }

  let total = kept.reduce((sum, entry) => sum + entry.size, 0)
  if (total <= MAX_TOTAL_BYTES) return

  kept.sort((a, b) => a.lastUsed - b.lastUsed)
  for (const entry of kept) {
    if (total <= MAX_TOTAL_BYTES) break
    await cache.delete(entry.key)
    await idbDel('imgMeta', entry.key)
    total -= entry.size
  }
}

export async function imageCacheStats(): Promise<{ bytes: number; count: number }> {
  const entries = await idbAll<CacheMeta>('imgMeta')
  return {
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    count: entries.length,
  }
}

export async function clearImageCache(): Promise<void> {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
  await caches.delete(CACHE_NAME)
  const entries = await idbAll<CacheMeta>('imgMeta')
  await Promise.all(entries.map((entry) => idbDel('imgMeta', entry.key)))
}
