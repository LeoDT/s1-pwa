/**
 * 进度写队列：先写本地镜像，再逐条 PUT；失败保留，等联网/下次启动重放。
 * 同一 tid 只保留 updatedAt 最新的一条（docs/data-model.md §5.1 / §6.2）。
 */
import type { ProgressRow } from '@shared/types'
import { idbAll, idbClear, idbDel, idbGet, idbSet } from './db'
import { putServerProgress, saveProgress } from './progress'

const STORE = 'outbox'

export async function queueProgress(row: ProgressRow): Promise<void> {
  const pending = await idbGet<ProgressRow>(STORE, row.tid)
  if (pending && pending.updatedAt > row.updatedAt) return

  await saveProgress(row)
  await idbSet(STORE, row.tid, row)
}

export function pendingProgress(): Promise<ProgressRow[]> {
  return idbAll<ProgressRow>(STORE)
}

export async function removePendingProgress(tid: number): Promise<void> {
  await idbDel(STORE, tid)
}

export async function clearPendingProgress(): Promise<void> {
  await idbClear(STORE)
}

/**
 * 按 updatedAt 升序重放；遇到失败立即停下，保持顺序（服务端 LWW 依赖时间单调）。
 * keepalive 用于页面隐藏/卸载时的兜底，body 很小，不受 64KB 限制。
 */
export async function flushProgress(options: { keepalive?: boolean } = {}): Promise<void> {
  const rows = (await pendingProgress()).sort((a, b) => a.updatedAt - b.updatedAt)

  for (const row of rows) {
    try {
      await putServerProgress(row, options.keepalive ?? false)
    } catch {
      return
    }
    await idbDel(STORE, row.tid)
  }
}
