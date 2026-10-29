import { idbTransact } from './db'

export interface ImageDimensions {
  width: number
  height: number
}

interface StoredDimensions extends ImageDimensions {
  lastUsed: number
}

const PREFIX = 'imageDimensions:'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RECORDS = 5000
let generation = 0

export function imageDimensionsGeneration(): number {
  return generation
}

function validDimensions(value: ImageDimensions): boolean {
  return Number.isFinite(value.width) && value.width > 0 &&
    Number.isFinite(value.height) && value.height > 0
}

function keyRange(): IDBKeyRange {
  return IDBKeyRange.bound(PREFIX, `${PREFIX}\uffff`)
}

function pruneInTransaction(store: IDBObjectStore, now: number): void {
  const kept: Array<{ key: IDBValidKey; lastUsed: number }> = []
  const request = store.openCursor(keyRange())
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) {
      const excess = kept.length - MAX_RECORDS
      if (excess > 0) {
        kept.sort((a, b) => a.lastUsed - b.lastUsed)
        for (const entry of kept.slice(0, excess)) store.delete(entry.key)
      }
      return
    }
    const value = cursor.value as StoredDimensions
    if (!value || !Number.isFinite(value.lastUsed) || now - value.lastUsed > TTL_MS) {
      cursor.delete()
    } else {
      kept.push({ key: cursor.primaryKey, lastUsed: value.lastUsed })
    }
    cursor.continue()
  }
}

export async function loadImageDimensions(urls: readonly string[]): Promise<ReadonlyMap<string, ImageDimensions>> {
  const requested = [...new Set(urls)]
  const result = new Map<string, ImageDimensions>()
  if (requested.length === 0) return result

  const now = Date.now()
  await idbTransact(['meta'], 'readwrite', (tx) => {
    const store = tx.objectStore('meta')
    for (const url of requested) {
      const request = store.get(`${PREFIX}${url}`)
      request.onsuccess = () => {
        const value = request.result as StoredDimensions | undefined
        if (!value) return
        if (!Number.isFinite(value.lastUsed) || now - value.lastUsed > TTL_MS || !validDimensions(value)) {
          store.delete(`${PREFIX}${url}`)
          return
        }
        result.set(url, { width: value.width, height: value.height })
        store.put({ ...value, lastUsed: now }, `${PREFIX}${url}`)
      }
    }
  })
  return result
}

export async function saveImageDimensions(
  src: string,
  dimensions: ImageDimensions,
  expectedGeneration = generation,
): Promise<void> {
  if (expectedGeneration !== generation || !validDimensions(dimensions)) return
  const now = Date.now()
  await idbTransact(['meta'], 'readwrite', (tx) => {
    const store = tx.objectStore('meta')
    const key = `${PREFIX}${src}`
    const request = store.get(key)
    request.onsuccess = () => {
      if (expectedGeneration !== generation) return
      store.put({ width: dimensions.width, height: dimensions.height, lastUsed: now } satisfies StoredDimensions, key)
      if (!request.result) pruneInTransaction(store, now)
    }
  })
}

export async function pruneImageDimensions(): Promise<void> {
  const now = Date.now()
  await idbTransact(['meta'], 'readwrite', (tx) => pruneInTransaction(tx.objectStore('meta'), now))
}

export async function clearImageDimensions(): Promise<void> {
  generation += 1
  await idbTransact(['meta'], 'readwrite', (tx) => {
    const request = tx.objectStore('meta').openCursor(keyRange())
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
  })
}
