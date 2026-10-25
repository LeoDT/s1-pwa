/**
 * /api/history* 契约见 docs/data-model.md §4.6。
 * 所有端点都要求有效的上游登录态；userKey 由 identity.ts 从 cookie 派生。
 */
import type { ProgressRow } from '../../shared/types'
import type { CoreDeps } from './env'
import { fail, json } from './http'
import { IdentityError, requireIdentity } from './identity'
import type { RouteHandler } from './route'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const DEFAULT_INDEX_LIMIT = 1000
const MAX_INDEX_LIMIT = 2000

const TITLE_MAX = 500
const FORUM_NAME_MAX = 100

type AuthedHandler = (
  identity: { userKey: string },
  request: Request,
  deps: CoreDeps,
  url: URL,
  params: Record<string, string>,
) => Response | Promise<Response>

/** 统一把身份失败映射成 401/502，业务 handler 只管成功路径 */
function authed(handler: AuthedHandler): RouteHandler {
  return async (request, deps, url, params) => {
    let userKey: string
    try {
      userKey = (await requireIdentity(request, deps)).userKey
    } catch (error) {
      if (error instanceof IdentityError) return fail(error.status, error.code, error.message)
      throw error
    }
    return handler({ userKey }, request, deps, url, params)
  }
}

export const listHistory = authed(async ({ userKey }, _request, deps, url) => {
  const limit = clampInt(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER)
  return json({ ok: true, items: await deps.store.list(userKey, limit, offset) })
})

export const historyIndex = authed(async ({ userKey }, _request, deps, url) => {
  const limit = clampInt(url.searchParams.get('limit'), DEFAULT_INDEX_LIMIT, 1, MAX_INDEX_LIMIT)
  return json({ ok: true, items: await deps.store.index(userKey, limit) })
})

export const putHistory = authed(async ({ userKey }, request, deps, _url, params) => {
  const tid = parseTid(params.tid)
  if (tid === null) return fail(400, 'bad_request', '帖子 id 不合法')

  const row = await readProgressRow(request, tid)
  if (row instanceof Response) return row

  await deps.store.upsert(userKey, row)
  return json({ ok: true })
})

export const deleteHistory = authed(async ({ userKey }, _request, deps, _url, params) => {
  const tid = parseTid(params.tid)
  if (tid === null) return fail(400, 'bad_request', '帖子 id 不合法')

  await deps.store.remove(userKey, tid)
  return json({ ok: true })
})

export const clearHistory = authed(async ({ userKey }, _request, deps) => {
  await deps.store.clear(userKey)
  return json({ ok: true })
})

function parseTid(raw: string | undefined): number | null {
  const tid = Number.parseInt(raw ?? '', 10)
  return Number.isSafeInteger(tid) && tid > 0 ? tid : null
}

async function readProgressRow(request: Request, tid: number): Promise<ProgressRow | Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return fail(400, 'bad_request', '请求体必须是 JSON')
  }
  if (!payload || typeof payload !== 'object') return fail(400, 'bad_request', '请求体必须是对象')

  const body = payload as Record<string, unknown>
  const updatedAt = int(body.updatedAt)
  if (updatedAt === null || updatedAt <= 0) return fail(400, 'bad_request', 'updatedAt 缺失或非法')

  return {
    tid,
    fid: int(body.fid) ?? 0,
    forumName: text(body.forumName, FORUM_NAME_MAX),
    title: text(body.title, TITLE_MAX),
    lastPid: nullableInt(body.lastPid),
    lastFloor: nullableInt(body.lastFloor),
    lastPage: nullableInt(body.lastPage),
    totalPages: nullableInt(body.totalPages),
    replies: int(body.replies) ?? 0,
    updatedAt,
  }
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw === '') return fallback
  const value = int(raw)
  if (value === null) return fallback
  return Math.min(Math.max(value, min), max)
}

function int(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value, 10)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : int(value)
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}
