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
  metadata_at: number | null
  metadata_id: string | null
  opened_at: number
  read_at: number | null
  read_id: string | null
  read_replies: number | null
  position_at: number | null
  position_id: string | null
  position_pid: number | null
  position_floor: number | null
  position_page: number | null
  position_total_pages: number | null
}

interface ProgressIndexDbRow {
  tid: number
  opened_at: number
  read_at: number | null
  read_id: string | null
  read_replies: number | null
}

// Each snapshot group is independently compared and updated in one conflict statement.
const UPSERT_SQL = `
INSERT INTO progress (user_key, tid, fid, forum_name, title, metadata_at, metadata_id, opened_at,
  read_at, read_id, read_replies, position_at, position_id, position_pid,
  position_floor, position_page, position_total_pages)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
ON CONFLICT(user_key, tid) DO UPDATE SET
  fid = CASE WHEN excluded.metadata_at IS NOT NULL AND
    (progress.metadata_at IS NULL OR excluded.metadata_at > progress.metadata_at OR
     (excluded.metadata_at = progress.metadata_at AND excluded.metadata_id > progress.metadata_id)) THEN excluded.fid ELSE progress.fid END,
  forum_name = CASE WHEN excluded.metadata_at IS NOT NULL AND
    (progress.metadata_at IS NULL OR excluded.metadata_at > progress.metadata_at OR
     (excluded.metadata_at = progress.metadata_at AND excluded.metadata_id > progress.metadata_id)) THEN excluded.forum_name ELSE progress.forum_name END,
  title = CASE WHEN excluded.metadata_at IS NOT NULL AND
    (progress.metadata_at IS NULL OR excluded.metadata_at > progress.metadata_at OR
     (excluded.metadata_at = progress.metadata_at AND excluded.metadata_id > progress.metadata_id)) THEN excluded.title ELSE progress.title END,
  metadata_at = CASE WHEN excluded.metadata_at IS NOT NULL AND
    (progress.metadata_at IS NULL OR excluded.metadata_at > progress.metadata_at OR
     (excluded.metadata_at = progress.metadata_at AND excluded.metadata_id > progress.metadata_id)) THEN excluded.metadata_at ELSE progress.metadata_at END,
  metadata_id = CASE WHEN excluded.metadata_at IS NOT NULL AND
    (progress.metadata_at IS NULL OR excluded.metadata_at > progress.metadata_at OR
     (excluded.metadata_at = progress.metadata_at AND excluded.metadata_id > progress.metadata_id)) THEN excluded.metadata_id ELSE progress.metadata_id END,
  opened_at = MAX(progress.opened_at, excluded.opened_at),
  read_at = CASE WHEN excluded.read_at IS NOT NULL AND
    (progress.read_at IS NULL OR excluded.read_at > progress.read_at OR
     (excluded.read_at = progress.read_at AND excluded.read_id > progress.read_id)) THEN excluded.read_at ELSE progress.read_at END,
  read_id = CASE WHEN excluded.read_at IS NOT NULL AND
    (progress.read_at IS NULL OR excluded.read_at > progress.read_at OR
     (excluded.read_at = progress.read_at AND excluded.read_id > progress.read_id)) THEN excluded.read_id ELSE progress.read_id END,
  read_replies = CASE WHEN excluded.read_at IS NOT NULL AND
    (progress.read_at IS NULL OR excluded.read_at > progress.read_at OR
     (excluded.read_at = progress.read_at AND excluded.read_id > progress.read_id)) THEN excluded.read_replies ELSE progress.read_replies END,
  position_at = CASE WHEN excluded.position_at IS NOT NULL AND
    (progress.position_at IS NULL OR excluded.position_at > progress.position_at OR
     (excluded.position_at = progress.position_at AND excluded.position_id > progress.position_id)) THEN excluded.position_at ELSE progress.position_at END,
  position_id = CASE WHEN excluded.position_at IS NOT NULL AND
    (progress.position_at IS NULL OR excluded.position_at > progress.position_at OR
     (excluded.position_at = progress.position_at AND excluded.position_id > progress.position_id)) THEN excluded.position_id ELSE progress.position_id END,
  position_pid = CASE WHEN excluded.position_at IS NOT NULL AND
    (progress.position_at IS NULL OR excluded.position_at > progress.position_at OR
     (excluded.position_at = progress.position_at AND excluded.position_id > progress.position_id)) THEN excluded.position_pid ELSE progress.position_pid END,
  position_floor = CASE WHEN excluded.position_at IS NOT NULL AND
    (progress.position_at IS NULL OR excluded.position_at > progress.position_at OR
     (excluded.position_at = progress.position_at AND excluded.position_id > progress.position_id)) THEN excluded.position_floor ELSE progress.position_floor END,
  position_page = CASE WHEN excluded.position_at IS NOT NULL AND
    (progress.position_at IS NULL OR excluded.position_at > progress.position_at OR
     (excluded.position_at = progress.position_at AND excluded.position_id > progress.position_id)) THEN excluded.position_page ELSE progress.position_page END,
  position_total_pages = CASE WHEN excluded.position_at IS NOT NULL AND
    (progress.position_at IS NULL OR excluded.position_at > progress.position_at OR
     (excluded.position_at = progress.position_at AND excluded.position_id > progress.position_id)) THEN excluded.position_total_pages ELSE progress.position_total_pages END`

const LIST_SQL = `SELECT * FROM progress WHERE user_key = ?1
ORDER BY MAX(opened_at, COALESCE(read_at, 0), COALESCE(position_at, 0)) DESC LIMIT ?2 OFFSET ?3`
const INDEX_SQL = `SELECT tid, opened_at, read_at, read_id, read_replies FROM progress
WHERE user_key = ?1 ORDER BY MAX(opened_at, COALESCE(read_at, 0), COALESCE(position_at, 0)) DESC LIMIT ?2`

export class D1ProgressStore implements ProgressStore {
  constructor(private readonly db: D1Database) {}

  async upsert(userKey: string, row: ProgressRow): Promise<void> {
    await this.db.prepare(UPSERT_SQL).bind(
      userKey, row.tid, row.metadataVersion ? row.fid : 0,
      row.metadataVersion ? row.forumName : '', row.metadataVersion ? row.title : '',
      row.metadataVersion?.at ?? null, row.metadataVersion?.id ?? null, row.openedAt,
      row.read?.at ?? null, row.read?.id ?? null, row.read?.replies ?? null,
      row.position?.at ?? null, row.position?.id ?? null, row.position?.pid ?? null,
      row.position?.floor ?? null, row.position?.page ?? null, row.position?.totalPages ?? null,
    ).run()
  }

  async list(userKey: string, limit: number, offset: number): Promise<ProgressRow[]> {
    const { results } = await this.db.prepare(LIST_SQL).bind(userKey, limit, offset).all<ProgressDbRow>()
    return results.map(toProgressRow)
  }

  async index(userKey: string, limit: number): Promise<ProgressIndexRow[]> {
    const { results } = await this.db.prepare(INDEX_SQL).bind(userKey, limit).all<ProgressIndexDbRow>()
    return results.map((row) => ({ tid: row.tid, openedAt: row.opened_at,
      read: row.read_at === null ? null : { at: row.read_at, id: row.read_id!, replies: row.read_replies! } }))
  }

  async remove(userKey: string, tid: number): Promise<void> {
    await this.db.prepare('DELETE FROM progress WHERE user_key = ?1 AND tid = ?2').bind(userKey, tid).run()
  }

  async clear(userKey: string): Promise<void> {
    await this.db.prepare('DELETE FROM progress WHERE user_key = ?1').bind(userKey).run()
  }
}

export function missingTableHint(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  const table = /no such table: (\w+)/i.exec(message)?.[1]
  if (!table) return null
  return `数据库缺少 ${table} 表：先应用迁移（本地 pnpm db:local，线上 pnpm exec wrangler d1 migrations apply s1-progress --remote）`
}

function toProgressRow(row: ProgressDbRow): ProgressRow {
  return {
    tid: row.tid, fid: row.fid, forumName: row.forum_name, title: row.title,
    metadataVersion: row.metadata_at === null ? null : { at: row.metadata_at, id: row.metadata_id! },
    openedAt: row.opened_at,
    read: row.read_at === null ? null : { at: row.read_at, id: row.read_id!, replies: row.read_replies! },
    position: row.position_at === null ? null : { at: row.position_at, id: row.position_id!, pid: row.position_pid!,
      floor: row.position_floor, page: row.position_page!, totalPages: row.position_total_pages! },
  }
}
