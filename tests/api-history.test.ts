// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressIndexRow, ProgressRow } from '../shared/types'
import type { ProgressStore } from '../server/core/store'
import { handleApi } from '../server/core/index'

const SECRET = 'test-secret'
const COOKIE = 'B7Y9_2f85_auth=abc'

/** 复刻 D1 的 LWW 语义，供 API 层测试使用 */
class MemoryStore implements ProgressStore {
  readonly rows = new Map<string, ProgressRow>()
  lastListArgs: { limit: number; offset: number } | null = null
  lastIndexLimit: number | null = null

  async upsert(userKey: string, row: ProgressRow): Promise<void> {
    const key = `${userKey}:${row.tid}`
    const current = this.rows.get(key)
    if (current && row.updatedAt < current.updatedAt) return
    this.rows.set(key, {
      ...row,
      lastPid: row.lastPid ?? current?.lastPid ?? null,
      lastFloor: row.lastFloor ?? current?.lastFloor ?? null,
      lastPage: row.lastPage ?? current?.lastPage ?? null,
      totalPages: row.totalPages ?? current?.totalPages ?? null,
      replies: row.replies ?? current?.replies ?? null,
    })
  }

  async list(userKey: string, limit: number, offset: number): Promise<ProgressRow[]> {
    this.lastListArgs = { limit, offset }
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${userKey}:`))
      .map(([, row]) => row)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(offset, offset + limit)
  }

  async index(userKey: string, limit: number): Promise<ProgressIndexRow[]> {
    this.lastIndexLimit = limit
    return (await this.list(userKey, limit, 0)).map((row) => ({
      tid: row.tid,
      replies: row.replies,
      lastFloor: row.lastFloor,
      lastPage: row.lastPage,
      updatedAt: row.updatedAt,
    }))
  }

  async remove(userKey: string, tid: number): Promise<void> {
    this.rows.delete(`${userKey}:${tid}`)
  }

  async clear(userKey: string): Promise<void> {
    for (const key of [...this.rows.keys()]) {
      if (key.startsWith(`${userKey}:`)) this.rows.delete(key)
    }
  }
}

function boot() {
  const store = new MemoryStore()
  const api = (path: string, init: RequestInit & { cookie?: string | null } = {}) => {
    const { cookie = COOKIE, ...rest } = init
    const headers = new Headers(rest.headers)
    if (cookie !== null) headers.set('x-s1-cookie', cookie)
    return handleApi(new Request(`http://local.test${path}`, { ...rest, headers }), {
      env: { HISTORY_SECRET: SECRET },
      store,
    })
  }
  return { store, api }
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }
}

const validBody = {
  fid: 51,
  forumName: 'ＰＣ数码',
  title: '测试帖',
  lastPid: 43400000,
  lastFloor: 12,
  lastPage: 1,
  totalPages: 15,
  replies: 580,
  updatedAt: 1792893264123,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response("<script>var discuz_uid = '77';</script>", { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('history API', () => {
  it('没有 S1 cookie 时返回 401 auth_required', async () => {
    const { api } = boot()
    const response = await api('/api/history', { cookie: null })
    expect(response.status).toBe(401)
    expect(((await response.json()) as { code: string }).code).toBe('auth_required')
  })

  it('探针 uid=0 时返回 401 auth_required', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('游客页面', { status: 200 })))
    const { api } = boot()
    const response = await api('/api/history', { cookie: 'guest-cookie' })
    expect(response.status).toBe(401)
  })

  it('PUT → GET → index → DELETE 全链路', async () => {
    const { api, store } = boot()

    const put = await api('/api/history/42', jsonInit(validBody))
    expect(put.status).toBe(200)

    const list = await api('/api/history?limit=10&offset=0')
    const listBody = (await list.json()) as { items: ProgressRow[] }
    expect(listBody.items).toHaveLength(1)
    expect(listBody.items[0]).toMatchObject({
      tid: 42,
      fid: 51,
      forumName: 'ＰＣ数码',
      lastFloor: 12,
      replies: 580,
    })
    expect(store.lastListArgs).toEqual({ limit: 10, offset: 0 })

    const index = await api('/api/history/index?limit=9999')
    const indexBody = (await index.json()) as { items: ProgressIndexRow[] }
    expect(indexBody.items[0]).toMatchObject({ tid: 42, lastPage: 1, replies: 580 })
    expect(store.lastIndexLimit).toBe(2000)

    const removed = await api('/api/history/42', { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect(store.rows.size).toBe(0)
  })

  it('replies missing/null are unknown, zero is valid, and unknown updates preserve known count', async () => {
    const { api, store } = boot()
    await api('/api/history/42', jsonInit({ ...validBody, replies: 0 }))
    expect([...store.rows.values()].find((row) => row.tid === 42)?.replies).toBe(0)
    await api('/api/history/42', jsonInit({ ...validBody, replies: null, updatedAt: validBody.updatedAt + 1 }))
    expect([...store.rows.values()].find((row) => row.tid === 42)?.replies).toBe(0)
    await api('/api/history/43', jsonInit({ ...validBody, replies: undefined }))
    expect([...store.rows.values()].find((row) => row.tid === 43)?.replies).toBeNull()
    const index = await api('/api/history/index')
    expect(((await index.json()) as { items: ProgressIndexRow[] }).items.find((item) => item.tid === 43)?.replies).toBeNull()
  })

  it('PUT 的 updatedAt 缺失时返回 400', async () => {
    const { api } = boot()
    const response = await api('/api/history/42', jsonInit({ ...validBody, updatedAt: undefined }))
    expect(response.status).toBe(400)
  })

  it('tid 非数字时返回 400', async () => {
    const { api } = boot()
    const response = await api('/api/history/abc', jsonInit(validBody))
    expect(response.status).toBe(400)
  })

  it('DELETE /api/history 清空全部', async () => {
    const { api, store } = boot()
    await api('/api/history/1', jsonInit(validBody))
    await api('/api/history/2', jsonInit(validBody))
    expect(store.rows.size).toBe(2)

    const cleared = await api('/api/history', { method: 'DELETE' })
    expect(cleared.status).toBe(200)
    expect(store.rows.size).toBe(0)
  })

  it('limit/offset 非法时回落到默认值', async () => {
    const { api, store } = boot()
    await api('/api/history?limit=abc&offset=-5')
    expect(store.lastListArgs).toEqual({ limit: 50, offset: 0 })
  })

  it('方法不对返回 405，未知路径返回 404', async () => {
    const { api } = boot()
    expect((await api('/api/history', { method: 'POST' })).status).toBe(405)
    expect((await api('/api/history/42')).status).toBe(405)
    expect((await api('/api/nope')).status).toBe(404)
  })
})

describe('history API 路由', () => {
  it('/api/history/index 不会被 :tid 抢占', async () => {
    const { api } = boot()
    const response = await api('/api/history/index')
    expect(response.status).toBe(200)
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true)
  })
})
