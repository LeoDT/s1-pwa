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

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  action: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = action(tx.objectStore(store))

    let result: T | undefined
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (error !== undefined) reject(error)
      else resolve(result as T)
    }

    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => finish(request.error ?? new Error('本地数据库操作失败'))
    // 写事务必须等 commit 完成，否则紧接着的导航可能丢掉刚写入的数据
    tx.oncomplete = () => finish()
    tx.onerror = () => finish(tx.error ?? new Error('本地数据库事务失败'))
    tx.onabort = () => finish(tx.error ?? new Error('本地数据库事务中断'))
  })
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
}

export async function idbSet<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  await run(store, 'readwrite', (s) => s.put(value as unknown, key))
}

export async function idbDel(store: StoreName, key: IDBValidKey): Promise<void> {
  await run(store, 'readwrite', (s) => s.delete(key))
}

export function idbAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export function idbKeys(store: StoreName): Promise<IDBValidKey[]> {
  return run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys())
}

export function idbClear(store: StoreName): Promise<void> {
  return run<undefined>(store, 'readwrite', (s) => s.clear())
}
