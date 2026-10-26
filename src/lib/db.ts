/**
 * IndexedDB 封装。库名与 store 名称见 docs/data-model.md §5.1。
 * 所有 store 使用显式 key（非自增），因此升级时只需补建缺失的 store。
 */
const DB_NAME = 's1read'
const DB_VERSION = 1

export const STORE_NAMES = [
  'kv',
  'jar',
  'progress',
  'outbox',
  'boards',
  'imgMeta',
  'meta',
] as const

export type StoreName = (typeof STORE_NAMES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
    request.onblocked = () => reject(new Error('本地数据库被其他标签页占用，请关闭后重试'))
  })

  return dbPromise
}

/**
 * 在给定 store 上开一个事务，commit 完成后交出 action 的返回值（通常是 IDBRequest，
 * 此时 result 已就绪）。写事务必须等 commit，否则紧接着的导航可能丢掉刚写入的数据。
 */
export async function idbTransact<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => T,
): Promise<T> {
  const db = await openDb()

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    let result!: T
    let settled = false

    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (error !== undefined) reject(error)
      else resolve(result)
    }

    tx.oncomplete = () => finish()
    tx.onerror = () => finish(tx.error ?? new Error('本地数据库事务失败'))
    tx.onabort = () => finish(tx.error ?? new Error('本地数据库事务中断'))

    try {
      result = action(tx)
    } catch (error) {
      tx.abort()
      finish(error)
    }
  })
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return idbTransact([store], 'readonly', (tx) => tx.objectStore(store).get(key)).then(
    (request) => request.result as T | undefined,
  )
}

export async function idbSet<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  await idbTransact([store], 'readwrite', (tx) => tx.objectStore(store).put(value as unknown, key))
}

export async function idbDel(store: StoreName, key: IDBValidKey): Promise<void> {
  await idbTransact([store], 'readwrite', (tx) => tx.objectStore(store).delete(key))
}

export function idbAll<T>(store: StoreName): Promise<T[]> {
  return idbTransact([store], 'readonly', (tx) => tx.objectStore(store).getAll()).then(
    (request) => request.result as T[],
  )
}

export function idbKeys(store: StoreName): Promise<IDBValidKey[]> {
  return idbTransact([store], 'readonly', (tx) => tx.objectStore(store).getAllKeys()).then(
    (request) => request.result,
  )
}

export async function idbClear(store: StoreName): Promise<void> {
  await idbTransact([store], 'readwrite', (tx) => tx.objectStore(store).clear())
}
