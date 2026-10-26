// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { D1ProgressStore, missingTableHint, type D1Database, type D1PreparedStatement } from '../server/cf/store'
import type { ProgressRow } from '../shared/types'
import { mergeProgressRows } from '../shared/progress'
class SqliteStatement implements D1PreparedStatement {
  constructor(private readonly statement: StatementSync, private readonly values: unknown[] = []) {}
  bind(...values: unknown[]): D1PreparedStatement { return new SqliteStatement(this.statement, values) }
  async run(): Promise<unknown> { this.statement.run(...(this.values as never[])); return { success: true } }
  async all<T = unknown>(): Promise<{ results: T[] }> { return { results: this.statement.all(...(this.values as never[])) as T[] } }
}
class SqliteD1 implements D1Database {
  constructor(private readonly db: DatabaseSync) {}
  prepare(sql: string): D1PreparedStatement { return new SqliteStatement(this.db.prepare(sql)) }
}
const migration = (name: string) => readFileSync(path.join(import.meta.dirname, `../migrations/${name}`), 'utf8')
const v1 = '00000000-0000-4000-8000-000000000001', v2 = '00000000-0000-4000-8000-000000000002'
const metadata1 = { at: 100, id: v1 }, metadata2 = { at: 101, id: v2 }
function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return { tid: 42, fid: 51, forumName: 'ＰＣ数码', title: '测试帖', metadataVersion: metadata1, openedAt: 10,
    read: { at: 100, id: v1, replies: 580 },
    position: { at: 100, id: v1, pid: 43400000, floor: 12, page: 1, totalPages: 15 }, ...overrides }
}
let store: D1ProgressStore
let db: DatabaseSync
beforeEach(() => { db = new DatabaseSync(':memory:'); db.exec(migration('0001_init.sql')); db.exec(migration('0002_nullable_replies.sql')); db.exec(migration('0003_reading_state.sql')); store = new D1ProgressStore(new SqliteD1(db)) })
describe('D1ProgressStore v2', () => {
  it('round-trips complete row and projects index', async () => {
    await store.upsert('user-a', row())
    expect(await store.list('user-a', 50, 0)).toEqual([row()])
    expect(await store.index('user-a', 50)).toEqual([{ tid: 42, openedAt: 10, read: row().read }])
  })
  it('merges independent snapshots atomically and compares ties by id, not reply count', async () => {
    await store.upsert('u', row({ read: { at: 100, id: v1, replies: 600 } }))
    await store.upsert('u', row({ read: { at: 100, id: v2, replies: 0 }, position: null }))
    await store.upsert('u', row({ read: { at: 99, id: v2, replies: 999 }, position: null }))
    const result = (await store.list('u', 10, 0))[0]!
    expect(result.read).toEqual({ at: 100, id: v2, replies: 0 })
    expect(result.position).toEqual(row().position)
  })
  it('metadata updates by its own timestamp/id, including reverse title order and equal-time ties', async () => {
    const older = row({ title: 'Z title', metadataVersion: metadata1 })
    const newer = row({ title: 'A title', metadataVersion: metadata2, read: null, position: null })
    await store.upsert('a', older); await store.upsert('a', newer)
    const forward = (await store.list('a', 10, 0))[0]!
    expect(forward.title).toBe('A title')
    expect(forward.metadataVersion).toEqual(metadata2)

    await store.upsert('b', newer); await store.upsert('b', older)
    expect((await store.list('b', 10, 0))[0]).toEqual(mergeProgressRows(older, newer))
    const tieWinner = row({ title: 'tie winner', metadataVersion: { at: 101, id: '00000000-0000-4000-8000-000000000003' }, read: null, position: null })
    await store.upsert('a', tieWinner)
    await store.upsert('a', newer)
    expect((await store.list('a', 10, 0))[0]).toMatchObject({ title: 'tie winner', metadataVersion: tieWinner.metadataVersion })
    await store.upsert('a', row({ title: 'position only', metadataVersion: null, position: { at: 999, id: v2, pid: 99, floor: null, page: 1, totalPages: 1 } }))
    expect((await store.list('a', 10, 0))[0]?.title).toBe('tie winner')
    await store.upsert('c', row({ metadataVersion: null, title: 'ignored', forumName: 'ignored', fid: 8, read: null }))
    expect((await store.list('c', 10, 0))[0]).toMatchObject({ fid: 0, forumName: '', title: '', metadataVersion: null })
  })
  it('null unknown cannot clear known zero and position does not determine read order', async () => {
    await store.upsert('u', row({ read: { at: 10, id: v1, replies: 0 } }))
    await store.upsert('u', row({ read: null, position: { at: 999, id: v2, pid: 1, floor: null, page: 1, totalPages: 1 } }))
    expect((await store.list('u', 10, 0))[0]).toMatchObject({ read: { at: 10, id: v1, replies: 0 } })
  })
  it('orders and isolates users; remove and clear are scoped', async () => {
    await store.upsert('a', row({ tid: 1, openedAt: 1, read: null, position: null }))
    await store.upsert('a', row({ tid: 2, openedAt: 3, read: null, position: null }))
    await store.upsert('b', row({ tid: 3 }))
    expect((await store.list('a', 50, 0)).map(x => x.tid)).toEqual([2, 1])
    await store.remove('a', 1); await store.clear('a')
    expect(await store.list('a', 50, 0)).toEqual([]); expect(await store.list('b', 50, 0)).toHaveLength(1)
  })
})
describe('reading schema migration', () => {
  it('discards only legacy reading rows while preserving independent tables', () => {
    const migration1 = migration('0001_init.sql'), migration2 = migration('0002_nullable_replies.sql')
    const fresh = new DatabaseSync(':memory:'); fresh.exec(migration1); fresh.exec(migration2)
    fresh.exec('CREATE TABLE credentials (id TEXT PRIMARY KEY); INSERT INTO credentials VALUES (\'keep\')')
    fresh.exec("INSERT INTO progress (user_key, tid, replies, updated_at) VALUES ('u', 1, 0, 10)")
    fresh.exec(migration('0003_reading_state.sql'))
    expect(fresh.prepare('SELECT * FROM progress').all()).toEqual([])
    expect(fresh.prepare('SELECT * FROM credentials').all()).toEqual([{ id: 'keep' }])
  })
})
describe('missingTableHint', () => {
  it('provides migration hint for absent table only', () => {
    expect(missingTableHint(new Error('no such table: progress'))).toContain('pnpm db:local')
    expect(missingTableHint(new Error('no such column: x'))).toBeNull()
  })
})
