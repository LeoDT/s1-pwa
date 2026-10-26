import type { ProgressIndexRow, ProgressRow, ProgressVersion, ReadingPosition } from '@shared/types'
import { emptyProgress, mergeProgressRows, progressUpdatedAt, sameProgress, toProgressIndex } from '@shared/progress'
import { idbAll, idbGet, idbTransact } from './db'
import { fetchHistory, fetchHistoryIndex } from './historyApi'
import { queueProgress } from './outbox'
import { invalidateProgressOperations, notifyProgress, progressGeneration } from './progressEvents'

export { clearServerHistory, deleteServerProgress, fetchHistory, fetchHistoryIndex, putServerProgress } from './historyApi'
export { subscribeProgress } from './progressEvents'

export const PROGRESS_STORE = 'progress'
let lastEventAt = 0

export function createProgressVersion(): ProgressVersion {
  lastEventAt = Math.max(Date.now(), lastEventAt + 1)
  return { at: lastEventAt, id: crypto.randomUUID() }
}

export function getNewReplies(current: number | null | undefined, baseline: number | null | undefined): number | null {
  return current == null || baseline == null ? null : Math.max(0, current - baseline)
}

export function getProgress(tid: number): Promise<ProgressRow | undefined> {
  return idbGet<ProgressRow>(PROGRESS_STORE, tid)
}

export async function loadProgress(): Promise<ProgressRow[]> {
  return (await idbAll<ProgressRow>(PROGRESS_STORE)).sort((a, b) => progressUpdatedAt(b) - progressUpdatedAt(a))
}

export async function removeProgress(tid: number): Promise<void> {
  invalidateProgressOperations()
  await idbTransact([PROGRESS_STORE, 'outbox'], 'readwrite', (tx) => {
    tx.objectStore(PROGRESS_STORE).delete(tid)
    tx.objectStore('outbox').delete(tid)
  })
  notifyProgress()
}

export async function clearProgress(): Promise<void> {
  invalidateProgressOperations()
  await idbTransact([PROGRESS_STORE, 'outbox'], 'readwrite', (tx) => {
    tx.objectStore(PROGRESS_STORE).clear()
    tx.objectStore('outbox').clear()
  })
  notifyProgress()
}

export interface ThreadMetadata {
  tid: number
  fid?: number
  forumName?: string
  title?: string
}

function progressEvent(metadata: ThreadMetadata, version: ProgressVersion | null = null): ProgressRow {
  return {
    ...emptyProgress(metadata.tid),
    fid: metadata.fid ?? 0,
    forumName: metadata.forumName ?? '',
    title: metadata.title ?? '',
    metadataVersion: version ? { at: version.at, id: version.id } : null,
  }
}

export function recordThreadOpened(metadata: ThreadMetadata, observation?: ProgressVersion & { replies: number | null }, accountId?: number): Promise<ProgressRow | undefined> {
  const read = observation?.replies != null ? { ...observation, replies: observation.replies } : null
  return queueProgress({ ...progressEvent(metadata, observation ?? null), openedAt: createProgressVersion().at, read }, accountId)
}

export function recordThreadReplies(metadata: ThreadMetadata, observation: ProgressVersion & { replies: number | null }, accountId?: number): Promise<ProgressRow | undefined> {
  return queueProgress({ ...progressEvent(metadata, observation), read: observation.replies === null ? null : { ...observation, replies: observation.replies } }, accountId)
}

export function recordReadingPosition(metadata: ThreadMetadata, position: ReadingPosition, accountId?: number): Promise<ProgressRow | undefined> {
  return queueProgress({ ...progressEvent(metadata), position }, accountId)
}

export async function mergeProgress(rows: ProgressRow[], shouldContinue: () => boolean = () => true): Promise<void> {
  const generation = progressGeneration()
  let changed = false
  for (const row of rows) {
    if (generation !== progressGeneration() || !shouldContinue()) break
    await idbTransact([PROGRESS_STORE], 'readwrite', (tx) => {
      const store = tx.objectStore(PROGRESS_STORE)
      const request = store.get(row.tid)
      request.onsuccess = () => {
        if (generation !== progressGeneration() || !shouldContinue()) return
        const current = request.result as ProgressRow | undefined
        const merged = mergeProgressRows(current ?? emptyProgress(row.tid), row)
        if (!current || !sameProgress(current, merged)) {
          changed = true
          store.put(merged, row.tid)
        }
      }
    })
  }
  if (changed && generation === progressGeneration() && shouldContinue()) notifyProgress()
}

export async function loadProgressIndex(): Promise<ProgressIndexRow[]> {
  return (await loadProgress()).map(toProgressIndex)
}

export async function syncHistoryMirror(limit = 100, shouldContinue: () => boolean = () => true): Promise<ProgressRow[]> {
  const generation = progressGeneration()
  const isCurrent = () => generation === progressGeneration() && shouldContinue()
  const rows = await fetchHistory(limit)
  if (!isCurrent()) return []
  await mergeProgress(rows, isCurrent)
  const index = await fetchHistoryIndex()
  if (!isCurrent()) return []
  await mergeProgress(index.map((entry) => ({ ...emptyProgress(entry.tid), ...entry })), isCurrent)
  return (await loadProgress()).slice(0, limit)
}
