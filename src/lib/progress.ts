/**
 * 阅读进度的本地镜像（IDB `progress`）与 /api/history* 客户端。
 * 服务端是按 updatedAt 的 LWW，本地镜像用同样的规则合并，离线时仍可着色与续读。
 * 见 docs/data-model.md §5.1 / §6.2。
 */
import type { ProgressIndexRow, ProgressRow } from '@shared/types'
import { apiFetch, type JsonInit } from './api'
import { cookieHeader } from './cookieJar'
import { idbAll, idbClear, idbDel, idbGet, idbSet } from './db'

const STORE = 'progress'
const HISTORY_PAGE_SIZE = 100

export function getProgress(tid: number): Promise<ProgressRow | undefined> {
  return idbGet<ProgressRow>(STORE, tid)
}

export function loadProgress(): Promise<ProgressRow[]> {
  return idbAll<ProgressRow>(STORE)
}

export async function saveProgress(row: ProgressRow): Promise<void> {
  await idbSet(STORE, row.tid, row)
}

export async function removeProgress(tid: number): Promise<void> {
  await idbDel(STORE, tid)
}

export async function clearProgress(): Promise<void> {
  await idbClear(STORE)
}

/** 按 updatedAt 合并，本地较新的记录不被服务端旧数据覆盖 */
export async function mergeProgress(rows: ProgressRow[]): Promise<void> {
  for (const row of rows) {
    const current = await getProgress(row.tid)
    if (!current || row.updatedAt > current.updatedAt) await saveProgress(row)
  }
}

/** 列表徽章只需要轻量索引 */
export function toProgressIndex(rows: ProgressRow[]): ProgressIndexRow[] {
  return rows.map((row) => ({
    tid: row.tid,
    replies: row.replies,
    lastFloor: row.lastFloor,
    lastPage: row.lastPage,
    updatedAt: row.updatedAt,
  }))
}

/**
 * 本地镜像 ∪ 服务端索引（同 tid 取 updatedAt 新者）。
 * includeServer=false（未登录）时只用本地镜像，不发无意义的 401 请求。
 */
export async function loadProgressIndex(includeServer = true): Promise<ProgressIndexRow[]> {
  const merged = new Map<number, ProgressIndexRow>()
  for (const row of toProgressIndex(await loadProgress())) merged.set(row.tid, row)

  if (!includeServer) return [...merged.values()]

  try {
    const server = await fetchHistoryIndex()
    for (const row of server) {
      const current = merged.get(row.tid)
      if (!current || row.updatedAt > current.updatedAt) merged.set(row.tid, row)
    }
  } catch {
    // 本地优先：服务端不可用不影响徽章显示
  }

  return [...merged.values()]
}

export async function fetchHistory(limit = 50, offset = 0): Promise<ProgressRow[]> {
  const body = await historyFetch<{ ok: true; items: ProgressRow[] }>(
    `/api/history?limit=${limit}&offset=${offset}`,
  )
  return body.items
}

/** 拉取最近阅读并写入本地镜像（跨设备续读 / 历史页） */
export async function syncHistoryMirror(limit = HISTORY_PAGE_SIZE): Promise<ProgressRow[]> {
  const rows = await fetchHistory(limit, 0)
  await mergeProgress(rows)
  return rows
}

export async function fetchHistoryIndex(limit = 1000): Promise<ProgressIndexRow[]> {
  const body = await historyFetch<{ ok: true; items: ProgressIndexRow[] }>(
    `/api/history/index?limit=${limit}`,
  )
  return body.items
}

export async function putServerProgress(row: ProgressRow, keepalive = false): Promise<void> {
  await historyFetch(`/api/history/${row.tid}`, { method: 'PUT', json: row, keepalive })
}

export async function deleteServerProgress(tid: number): Promise<void> {
  await historyFetch(`/api/history/${tid}`, { method: 'DELETE' })
}

export async function clearServerHistory(): Promise<void> {
  await historyFetch('/api/history', { method: 'DELETE' })
}

async function historyFetch<T>(path: string, init: JsonInit = {}): Promise<T> {
  const cookies = await cookieHeader()
  const headers = new Headers(init.headers)
  if (cookies) headers.set('x-s1-cookie', cookies)
  return apiFetch<T>(path, { ...init, headers })
}
