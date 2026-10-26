// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressIndexRow, ProgressRow } from '../shared/types'
import type { ProgressStore } from '../server/core/store'
import { handleApi } from '../server/core/index'

const SECRET = 'test-secret'
const COOKIE = 'B7Y9_2f85_auth=abc'
const idA = '00000000-0000-4000-8000-000000000001'
const idB = '00000000-0000-4000-8000-000000000002'
class MemoryStore implements ProgressStore {
  readonly rows = new Map<string, ProgressRow>()
  lastListArgs: { limit: number; offset: number } | null = null
  lastIndexLimit: number | null = null
  async upsert(userKey: string, incoming: ProgressRow): Promise<void> {
    const key = `${userKey}:${incoming.tid}`, old = this.rows.get(key)
    const newer = <T extends { at: number; id: string }>(a: T | null, b: T | null): T | null =>
      !a ? b : !b ? a : a.at !== b.at ? (a.at > b.at ? a : b) : (a.id >= b.id ? a : b)
    this.rows.set(key, { ...incoming, openedAt: Math.max(incoming.openedAt, old?.openedAt ?? 0),
      read: newer(incoming.read, old?.read ?? null), position: newer(incoming.position, old?.position ?? null) })
  }
  async list(user: string, limit: number, offset: number): Promise<ProgressRow[]> {
    this.lastListArgs = { limit, offset }
    return [...this.rows].filter(([key]) => key.startsWith(`${user}:`)).map(([, row]) => row).slice(offset, offset + limit)
  }
  async index(user: string, limit: number): Promise<ProgressIndexRow[]> {
    this.lastIndexLimit = limit
    return (await this.list(user, limit, 0)).map(({ tid, openedAt, read }) => ({ tid, openedAt, read }))
  }
  async remove(user: string, tid: number): Promise<void> { this.rows.delete(`${user}:${tid}`) }
  async clear(user: string): Promise<void> { for (const key of this.rows.keys()) if (key.startsWith(`${user}:`)) this.rows.delete(key) }
}
function boot() {
  const store = new MemoryStore()
  const api = (path: string, init: RequestInit & { cookie?: string | null } = {}) => {
    const { cookie = COOKIE, ...rest } = init, headers = new Headers(rest.headers)
    if (cookie !== null) headers.set('x-s1-cookie', cookie)
    if (!headers.has('x-reading-schema')) headers.set('x-reading-schema', '2')
    return handleApi(new Request(`http://local.test${path}`, { ...rest, headers }), { env: { HISTORY_SECRET: SECRET }, store })
  }
  return { store, api }
}
function jsonInit(body: unknown): RequestInit { return { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } }
const validBody = { fid: 51, forumName: 'ＰＣ数码', title: '测试帖', metadataVersion: { at: 100, id: idA }, openedAt: 0,
  read: { at: 1792893264123, id: idA, replies: 580 }, position: { at: 1792893264123, id: idA, pid: 43400000, floor: 12, page: 1, totalPages: 15 } }
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response("<script>var discuz_uid = '77';</script>", { status: 200 }))))
afterEach(() => vi.unstubAllGlobals())

describe('history API', () => {
  it('requires schema 2 on every history endpoint', async () => {
    const { api } = boot()
    for (const [path, method] of [['/api/history', 'GET'], ['/api/history/index', 'GET'], ['/api/history/42', 'DELETE']]) {
      const response = await api(path, { method, headers: { 'x-reading-schema': '1' } })
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe('reading_schema_mismatch')
    }
  })
  it('PUT → GET → index → DELETE carries v2 rows and schemaVersion', async () => {
    const { api, store } = boot()
    const put = await api('/api/history/42', jsonInit(validBody))
    expect(put.status).toBe(200); expect(await put.json()).toMatchObject({ ok: true, schemaVersion: 2 })
    const list = await api('/api/history?limit=10&offset=0'), body = await list.json()
    expect(body).toMatchObject({ schemaVersion: 2, items: [{ tid: 42, read: validBody.read, position: validBody.position }] })
    expect(store.lastListArgs).toEqual({ limit: 10, offset: 0 })
    const index = await api('/api/history/index?limit=9999')
    expect(await index.json()).toMatchObject({ schemaVersion: 2, items: [{ tid: 42, openedAt: 0, read: validBody.read }] })
    expect(store.lastIndexLimit).toBe(2000)
    expect((await api('/api/history/42', { method: 'DELETE' })).status).toBe(200)
    expect(store.rows.size).toBe(0)
  })
  it('rejects legacy flat payload and validates nested counts/version ids', async () => {
    const { api, store } = boot()
    for (const body of [{ ...validBody, metadataVersion: undefined },
      { ...validBody, read: undefined, position: undefined, updatedAt: 4, replies: 4 },
      { ...validBody, read: { ...validBody.read, replies: -1 } },
      { ...validBody, position: { ...validBody.position, id: 'bad' } },
      { ...validBody, read: { ...validBody.read, at: 0 } }]) {
      expect((await api('/api/history/42', jsonInit(body))).status).toBe(400)
    }
    expect(store.rows.size).toBe(0)
  })
  it('retains authentication and route behavior', async () => {
    const { api } = boot()
    expect((await api('/api/history', { cookie: null })).status).toBe(401)
    expect((await api('/api/history/abc', jsonInit(validBody))).status).toBe(400)
    expect((await api('/api/history', { method: 'POST' })).status).toBe(405)
    expect((await api('/api/nope')).status).toBe(404)
  })
})
