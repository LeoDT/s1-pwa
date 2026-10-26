import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'

const DB_NAME = 's1read'

function openSeedDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      for (const name of ['kv', 'jar', 'progress', 'outbox', 'boards', 'imgMeta', 'meta']) {
        request.result.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function seed(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['kv', 'jar', 'progress', 'outbox', 'boards', 'imgMeta', 'meta'], 'readwrite')
    tx.objectStore('kv').put({ uid: 77, username: 'alice' }, 'session')
    tx.objectStore('jar').put('cookie-data', 'cookies')
    tx.objectStore('progress').put({ old: 'legacy-progress' }, 1)
    tx.objectStore('outbox').put({ old: 'legacy-outbox' }, 1)
    tx.objectStore('boards').put([{ fid: 1 }], 'boards')
    tx.objectStore('imgMeta').put({ width: 12 }, 'image')
    tx.objectStore('meta').put('meta-data', 'key')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function bumpVersionAndClose(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => reject(request.error)
  })
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('database deletion blocked'))
  })
}

describe('IndexedDB v2 progress upgrade', () => {
  afterEach(async () => {
    vi.resetModules()
    await bumpVersionAndClose()
    await deleteDatabase()
  })

  it('clears only legacy progress/outbox while preserving unrelated stores and values', async () => {
    const seeded = await openSeedDatabase()
    await seed(seeded)
    seeded.close()

    vi.resetModules()
    const db = await import('@/lib/db')
    expect(await db.idbGet('progress', 1)).toBeUndefined()
    expect(await db.idbGet('outbox', 1)).toBeUndefined()
    expect(await db.idbGet('kv', 'session')).toEqual({ uid: 77, username: 'alice' })
    expect(await db.idbGet('jar', 'cookies')).toBe('cookie-data')
    expect(await db.idbGet('boards', 'boards')).toEqual([{ fid: 1 }])
    expect(await db.idbGet('imgMeta', 'image')).toEqual({ width: 12 })
    expect(await db.idbGet('meta', 'key')).toBe('meta-data')
  })
})
