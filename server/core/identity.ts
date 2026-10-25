/**
 * 身份解析：cookie → 上游探针 → uid → userKey。
 * cookie 只在内存/请求期间过境，不落盘、不写日志（docs/architecture.md §2.1）。
 */
import type { CoreDeps } from './env'
import { base64UrlEncode, HTML_ACCEPT, MOBILE_UA } from './upstream'

const PROBE_URL = 'https://stage1st.com/2b/forum.php?mobile=2'
const PROBE_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_LIMIT = 100

export interface Identity {
  uid: number
  /** HMAC-SHA256(uid, HISTORY_SECRET)，D1 分区键 */
  userKey: string
}

export class IdentityError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'IdentityError'
    this.status = status
    this.code = code
  }
}

interface ProbeCacheEntry {
  uid: number
  expiresAt: number
}

/** isolate 内缓存，只省冷启动的探针，不作为身份的唯一来源 */
const probeCache = new Map<string, ProbeCacheEntry>()

export async function requireIdentity(request: Request, deps: CoreDeps): Promise<Identity> {
  const secret = deps.env.HISTORY_SECRET
  if (!secret) {
    throw new IdentityError(500, 'internal_error', '服务端未配置 HISTORY_SECRET')
  }

  const cookie = request.headers.get('x-s1-cookie')
  if (!cookie) throw authRequired()

  const cacheKey = await sha256Hex(cookie)
  const uid = await resolveUid(cacheKey, cookie)
  if (uid === 0) throw authRequired()

  return { uid, userKey: await deriveUserKey(uid, secret) }
}

/** HMAC-SHA256(uid, secret) → base64url；uid 不可从结果反推 */
export async function deriveUserKey(uid: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(uid)))
  return base64UrlEncode(new Uint8Array(signature))
}

/** 探针页里的 `discuz_uid = '123'`；取不到按未登录处理 */
export function parseDiscuzUid(html: string): number {
  const match = /\bdiscuz_uid\s*=\s*['"]?(\d+)/.exec(html)
  return match ? Number.parseInt(match[1] ?? '0', 10) : 0
}

function authRequired(): IdentityError {
  return new IdentityError(401, 'auth_required', '登录已过期，请重新登录')
}

async function resolveUid(cacheKey: string, cookie: string): Promise<number> {
  const now = Date.now()
  const cached = probeCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    // 命中后移到队尾，Map 的插入顺序即 LRU 顺序
    probeCache.delete(cacheKey)
    probeCache.set(cacheKey, cached)
    return cached.uid
  }
  probeCache.delete(cacheKey)

  const uid = await probeUid(cookie)
  probeCache.set(cacheKey, { uid, expiresAt: now + CACHE_TTL_MS })
  while (probeCache.size > CACHE_LIMIT) {
    const oldest = probeCache.keys().next()
    if (oldest.done) break
    probeCache.delete(oldest.value)
  }
  return uid
}

async function probeUid(cookie: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    const response = await fetch(PROBE_URL, {
      headers: { cookie, 'user-agent': MOBILE_UA, accept: HTML_ACCEPT },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new IdentityError(502, 'upstream_error', 'S1 登录态检查失败')
    }
    return parseDiscuzUid(await response.text())
  } catch (error) {
    if (error instanceof IdentityError) throw error
    throw new IdentityError(502, 'upstream_error', 'S1 登录态检查失败')
  } finally {
    clearTimeout(timer)
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
