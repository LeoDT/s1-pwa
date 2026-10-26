import type { ProgressRow, Session } from '@shared/types'
import { emptyProgress, mergeProgressRows, progressUpdatedAt, sameProgress } from '@shared/progress'
import { idbAll, idbGet, idbTransact } from './db'
import { putServerProgress } from './historyApi'
import { notifyProgress, progressGeneration } from './progressEvents'

const STORE = 'outbox'
const PROGRESS_STORE = 'progress'

interface PendingProgress {
  accountId: number
  row: ProgressRow
}

export async function queueProgress(row: ProgressRow, accountId?: number): Promise<ProgressRow | undefined> {
  const generation = progressGeneration()
  let result: ProgressRow | undefined
  let changed = false
  await idbTransact([PROGRESS_STORE, STORE, 'kv'], 'readwrite', (tx) => {
    const outbox = tx.objectStore(STORE)
    const progress = tx.objectStore(PROGRESS_STORE)
    const mirrorRequest = progress.get(row.tid)
    const pendingRequest = outbox.get(row.tid)
    const sessionRequest = tx.objectStore('kv').get('session')
    let ready = 0
    const commit = () => {
      if (++ready !== 3 || generation !== progressGeneration()) return
      const session = sessionRequest.result as Session | undefined
      if (!session || (accountId !== undefined && session.uid !== accountId)) return
      const mirror = mirrorRequest.result as ProgressRow | undefined
      const pendingItem = pendingRequest.result as PendingProgress | undefined
      const pending = pendingItem?.accountId === session.uid ? pendingItem.row : undefined
      result = mergeProgressRows(mergeProgressRows(mirror ?? emptyProgress(row.tid), pending ?? emptyProgress(row.tid)), row)
      changed = !mirror || !sameProgress(mirror, result)
      if (changed) progress.put(result, row.tid)
      if (changed || (pending && !sameProgress(pending, result))) {
        outbox.put({ accountId: session.uid, row: result } satisfies PendingProgress, row.tid)
      }
    }
    mirrorRequest.onsuccess = commit
    pendingRequest.onsuccess = commit
    sessionRequest.onsuccess = commit
  })
  if (changed && generation === progressGeneration()) notifyProgress()
  return result
}

export async function pendingProgress(): Promise<ProgressRow[]> {
  return (await idbAll<PendingProgress>(STORE)).map((item) => item.row)
}

export async function flushProgress(options: { keepalive?: boolean; shouldContinue?: () => boolean } = {}): Promise<number> {
  const generation = progressGeneration()
  const isCurrent = () => generation === progressGeneration() && (options.shouldContinue?.() ?? true)
  const items = (await idbAll<PendingProgress>(STORE)).sort((a, b) => progressUpdatedAt(a.row) - progressUpdatedAt(b.row))
  let sent = 0
  for (const item of items) {
    if (!isCurrent()) break
    const session = await idbGet<Session>('kv', 'session')
    if (!isCurrent()) break
    if (session?.uid !== item.accountId) continue
    try {
      await putServerProgress(item.row, options.keepalive ?? false, item.accountId)
    } catch {
      break
    }
    if (!isCurrent()) break
    await removePendingIfCurrent(item)
    sent += 1
  }
  return sent
}

async function removePendingIfCurrent(item: PendingProgress): Promise<void> {
  await idbTransact([STORE], 'readwrite', (tx) => {
    const store = tx.objectStore(STORE)
    const request = store.get(item.row.tid)
    request.onsuccess = () => {
      const current = request.result as PendingProgress | undefined
      if (current?.accountId === item.accountId && sameProgress(current.row, item.row)) store.delete(item.row.tid)
    }
  })
}
