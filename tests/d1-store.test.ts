// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { D1ProgressStore, type D1Database, type D1PreparedStatement } from '../server/cf/store'
import type { ProgressRow } from '../shared/types'

/** 用真实的 SQLite 跑 migrations/0001_init.sql，验证 SQL 与字段映射 */
class SqliteStatement implements D1PreparedStatement {
  constructor(
    private readonly statement: StatementSync,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteStatement(this.statement, values)
  }

  async run(): Promise<unknown> {
    this.statement.run(...(this.values as never[]))
    return { success: true }
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: this.statement.all(...(this.values as never[])) as T[] }
  }
}

class SqliteD1 implements D1Database {
  constructor(private readonly db: DatabaseSync) {}

  prepare(sql: string): D1PreparedStatement {
    return new SqliteStatement(this.db.prepare(sql))
  }
}

const MIGRATION = readFileSync(
  path.join(import.meta.dirname, '../migrations/0001_init.sql'),
  'utf8',
)

function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    tid: 42,
    fid: 51,
    forumName: 'ＰＣ数码',
    title: '测试帖',
    lastPid: 43400000,
    lastFloor: 12,
    lastPage: 1,
    totalPages: 15,
    replies: 580,
    updatedAt: 1000,
    ...overrides,
  }
}

let store: D1ProgressStore

beforeEach(() => {
  const db = new DatabaseSync(':memory:')
  db.exec(MIGRATION)
  store = new D1ProgressStore(new SqliteD1(db))
})

describe('D1ProgressStore', () => {
  it('upsert 后 list 返回完整字段', async () => {
    await store.upsert('user-a', row())

    expect(await store.list('user-a', 50, 0)).toEqual([row()])
  })

  it('LWW：旧写入不覆盖新值', async () => {
    await store.upsert('user-a', row({ replies: 600, updatedAt: 2000 }))
    await store.upsert('user-a', row({ replies: 500, updatedAt: 1000 }))

    expect((await store.list('user-a', 50, 0))[0]?.replies).toBe(600)
  })

  it('LWW：新写入的 null 定位字段保留旧值（COALESCE）', async () => {
    await store.upsert('user-a', row({ lastPid: 111, lastFloor: 3, updatedAt: 1000 }))
    await store.upsert(
      'user-a',
      row({ lastPid: null, lastFloor: null, lastPage: null, totalPages: null, updatedAt: 2000 }),
    )

    expect((await store.list('user-a', 50, 0))[0]).toMatchObject({
      lastPid: 111,
      lastFloor: 3,
      lastPage: 1,
      totalPages: 15,
      updatedAt: 2000,
    })
  })

  it('按 updated_at 倒序，并支持 limit/offset', async () => {
    await store.upsert('user-a', row({ tid: 1, updatedAt: 1000 }))
    await store.upsert('user-a', row({ tid: 2, updatedAt: 3000 }))
    await store.upsert('user-a', row({ tid: 3, updatedAt: 2000 }))

    const all = await store.list('user-a', 50, 0)
    expect(all.map((item) => item.tid)).toEqual([2, 3, 1])
    expect((await store.list('user-a', 1, 1)).map((item) => item.tid)).toEqual([3])
  })

  it('index 只返回轻量字段', async () => {
    await store.upsert('user-a', row())

    expect(await store.index('user-a', 100)).toEqual([
      { tid: 42, replies: 580, lastFloor: 12, lastPage: 1, updatedAt: 1000 },
    ])
  })

  it('用户之间互相隔离', async () => {
    await store.upsert('user-a', row({ tid: 1 }))
    await store.upsert('user-b', row({ tid: 2 }))

    expect((await store.list('user-a', 50, 0)).map((item) => item.tid)).toEqual([1])
    expect((await store.list('user-b', 50, 0)).map((item) => item.tid)).toEqual([2])
  })

  it('remove 只删单条，clear 只清当前用户', async () => {
    await store.upsert('user-a', row({ tid: 1 }))
    await store.upsert('user-a', row({ tid: 2 }))
    await store.upsert('user-b', row({ tid: 3 }))

    await store.remove('user-a', 1)
    expect((await store.list('user-a', 50, 0)).map((item) => item.tid)).toEqual([2])

    await store.clear('user-a')
    expect(await store.list('user-a', 50, 0)).toEqual([])
    expect(await store.list('user-b', 50, 0)).toHaveLength(1)
  })
})
