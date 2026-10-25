import type { ProgressIndexRow, ProgressRow, ProgressStore } from '../core/store'

/**
 * 只声明用到的 D1 子集：不引入 @cloudflare/workers-types 以免与 DOM 全局冲突。
 * 真实 binding 在结构上与之兼容（wrangler 的 D1Database）。
 */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<unknown>
  all<T = unknown>(): Promise<{ results: T[] }>
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface ProgressDbRow {
  tid: number
  fid: number
  forum_name: string
  title: string
  last_pid: number | null
  last_floor: number | null
  last_page: number | null
  total_pages: number | null
  replies: number
  updated_at: number
}

interface ProgressIndexDbRow {
  tid: number
  replies: number
  last_floor: number | null
  last_page: number | null
  updated_at: number
}

/** LWW：仅当 excluded.updated_at 不早于已有行时才覆盖。 */
const UPSERT_SQL = `
INSERT INTO progress (user_key, tid, fid, forum_name, title, last_pid, last_floor,
                      last_page, total_pages, replies, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
ON CONFLICT(user_key, tid) DO UPDATE SET
  fid         = excluded.fid,
  forum_name  = excluded.forum_name,
  title       = excluded.title,
  last_pid    = COALESCE(excluded.last_pid, progress.last_pid),
  last_floor  = COALESCE(excluded.last_floor, progress.last_floor),
  last_page   = COALESCE(excluded.last_page, progress.last_page),
  total_pages = COALESCE(excluded.total_pages, progress.total_pages),
  replies     = excluded.replies,
  updated_at  = excluded.updated_at
WHERE excluded.updated_at >= progress.updated_at`

const LIST_SQL = `
SELECT tid, fid, forum_name, title, last_pid, last_floor, last_page, total_pages, replies, updated_at
FROM progress
WHERE user_key = ?1
ORDER BY updated_at DESC
LIMIT ?2 OFFSET ?3`

const INDEX_SQL = `
SELECT tid, replies, last_floor, last_page, updated_at
FROM progress
WHERE user_key = ?1
ORDER BY updated_at DESC
LIMIT ?2`

export class D1ProgressStore implements ProgressStore {
  constructor(private readonly db: D1Database) {}

  async upsert(userKey: string, row: ProgressRow): Promise<void> {
    await this.db
      .prepare(UPSERT_SQL)
      .bind(
        userKey,
        row.tid,
        row.fid,
        row.forumName,
        row.title,
        row.lastPid,
        row.lastFloor,
        row.lastPage,
        row.totalPages,
        row.replies,
        row.updatedAt,
      )
      .run()
  }

  async list(userKey: string, limit: number, offset: number): Promise<ProgressRow[]> {
    const { results } = await this.db.prepare(LIST_SQL).bind(userKey, limit, offset).all<ProgressDbRow>()
    return results.map(toProgressRow)
  }

  async index(userKey: string, limit: number): Promise<ProgressIndexRow[]> {
    const { results } = await this.db.prepare(INDEX_SQL).bind(userKey, limit).all<ProgressIndexDbRow>()
    return results.map((row) => ({
      tid: row.tid,
      replies: row.replies,
      lastFloor: row.last_floor,
      lastPage: row.last_page,
      updatedAt: row.updated_at,
    }))
  }

  async remove(userKey: string, tid: number): Promise<void> {
    await this.db.prepare('DELETE FROM progress WHERE user_key = ?1 AND tid = ?2').bind(userKey, tid).run()
  }

  async clear(userKey: string): Promise<void> {
    await this.db.prepare('DELETE FROM progress WHERE user_key = ?1').bind(userKey).run()
  }
}

function toProgressRow(row: ProgressDbRow): ProgressRow {
  return {
    tid: row.tid,
    fid: row.fid,
    forumName: row.forum_name,
    title: row.title,
    lastPid: row.last_pid,
    lastFloor: row.last_floor,
    lastPage: row.last_page,
    totalPages: row.total_pages,
    replies: row.replies,
    updatedAt: row.updated_at,
  }
}
