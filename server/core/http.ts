import type { ApiErrorBody } from '../../shared/types'
import type { CoreEnv } from './env'

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function fail(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { ok: false, code, message }
  return json(body, { status, headers: { 'x-s1-error': code } })
}

/** 固定长度比较，避免逐字节提前返回。 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * 访问令牌校验。未配置 ACCESS_TOKEN 时视为关闭鉴权。
 * 返回 null 表示通过。
 */
export function checkAppToken(request: Request, env: CoreEnv): Response | null {
  const expected = env.ACCESS_TOKEN
  if (!expected) return null

  const provided = request.headers.get('x-app-token')
  if (!provided) return fail(401, 'token_required', '需要访问令牌')
  if (!timingSafeEqual(provided, expected)) {
    return fail(401, 'token_invalid', '访问令牌无效')
  }
  return null
}
