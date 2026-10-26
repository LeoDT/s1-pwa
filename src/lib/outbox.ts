/**
 * 进度落地：一次事务写本地镜像（progress）+ 待发送队列（outbox），再逐条 PUT；
 * 失败保留，等联网/下次启动重放。见 docs/data-model.md §5.1 / §6.2。
 */
import type { ProgressRow } from '@shared/types'
import { idbAll, idbClear, idbDel, idbTransact } from './db'
import { PROGRESS_STORE, putServerProgress } from './progress'

const STORE = 'outbox'

/**
 * 本地落盘，不碰网络，离线也必然成功。同一 tid 只保留 updatedAt 最新的一条，
 * 镜像与队列在同一个事务里写，避免出现「镜像已更新但队列没写」的半截状态。
 */
export async function queueProgress(row: ProgressRow): Promise<void> {
  await idbTransact([PROGRESS_STORE, STORE], 'readwrite', (tx) => {
    const outbox = tx.objectStore(STORE)
    const request = outbox.get(row.tid)
    request.onsuccess = () => {
      const pending = request.result as ProgressRow | undefined
      if (pending && pending.updatedAt > row.updatedAt) return
      tx.objectStore(PROGRESS_STORE).put(row, row.tid)
      outbox.put(row, row.tid)
    }
  })
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
 * 按 updatedAt 升序重放；遇到失败立即停下并返回已发送条数，保持顺序
 * （服务端 LWW 依赖时间单调）。keepalive 用于页面隐藏/卸载时的兜底，
 * body 很小，不受 64KB 限制。
 */
export async function flushProgress(options: { keepalive?: boolean } = {}): Promise<number> {
  const rows = (await pendingProgress()).sort((a, b) => a.updatedAt - b.updatedAt)

  let sent = 0
  for (const row of rows) {
    try {
      await putServerProgress(row, options.keepalive ?? false)
    } catch {
      return sent
    }
    await removePendingIfCurrent(row)
    sent += 1
  }
  return sent
}

/** 只删仍是这一版的行：PUT 期间可能有更新的本地写入，不能连带删掉 */
function removePendingIfCurrent(row: ProgressRow): Promise<void> {
  return idbTransact([STORE], 'readwrite', (tx) => {
    const store = tx.objectStore(STORE)
    const request = store.get(row.tid)
    request.onsuccess = () => {
      const current = request.result as ProgressRow | undefined
      if (current?.updatedAt === row.updatedAt) store.delete(row.tid)
    }
  })
}
