import type { ProgressIndexRow, ProgressRow, Session } from '@shared/types'
import { READING_SCHEMA_VERSION } from '@shared/progress'
import { apiFetch, ApiError, type JsonInit } from './api'
import { cookieHeader } from './cookieJar'
import { idbGet } from './db'
import { progressGeneration } from './progressEvents'

export async function fetchHistory(limit = 50, offset = 0): Promise<ProgressRow[]> {
  const body = await historyFetch<{ items: ProgressRow[] }>(`/api/history?limit=${limit}&offset=${offset}`)
  return body.items
}

export async function fetchHistoryIndex(limit = 1000): Promise<ProgressIndexRow[]> {
  const body = await historyFetch<{ items: ProgressIndexRow[] }>(`/api/history/index?limit=${limit}`)
  return body.items
}

export async function putServerProgress(row: ProgressRow, keepalive = false, accountId?: number): Promise<void> {
  await historyFetch(`/api/history/${row.tid}`, { method: 'PUT', json: row, keepalive }, accountId)
}

export async function deleteServerProgress(tid: number): Promise<void> {
  await historyFetch(`/api/history/${tid}`, { method: 'DELETE' })
}

export async function clearServerHistory(): Promise<void> {
  await historyFetch('/api/history', { method: 'DELETE' })
}

async function historyFetch<T>(path: string, init: JsonInit = {}, accountId?: number): Promise<T> {
  const generation = progressGeneration()
  const cookies = await cookieHeader()
  if (accountId !== undefined) {
    const session = await idbGet<Session>('kv', 'session')
    if (session?.uid !== accountId || generation !== progressGeneration()) {
      throw new ApiError('reading_account_changed', '账号已切换，取消旧阅读记录上传', 409)
    }
  }
  const headers = new Headers(init.headers)
  headers.set('x-reading-schema', String(READING_SCHEMA_VERSION))
  if (cookies) headers.set('x-s1-cookie', cookies)
  const body = await apiFetch<T & { schemaVersion: number }>(path, { ...init, headers })
  if (body?.schemaVersion !== READING_SCHEMA_VERSION) {
    throw new ApiError('reading_schema_mismatch', '阅读记录版本不匹配，请更新服务端并刷新应用', 409)
  }
  return body
}
