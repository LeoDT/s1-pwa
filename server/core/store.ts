/**
 * 存储 seam：core 只依赖这个接口，Cloudflare D1 / Node SQLite 各自实现。
 * 字段见 docs/data-model.md §2–§3。
 */
import type { ProgressIndexRow, ProgressRow } from '../../shared/types'

export type { ProgressIndexRow, ProgressRow }

export interface ProgressStore {
  upsert(userKey: string, row: ProgressRow): Promise<void>
  list(userKey: string, limit: number, offset: number): Promise<ProgressRow[]>
  index(userKey: string, limit: number): Promise<ProgressIndexRow[]>
  remove(userKey: string, tid: number): Promise<void>
  clear(userKey: string): Promise<void>
}
