import { idbGet, idbSet } from './db'

const PREFIX = 'threadOpUid:'
const memory = new Map<number, number>()

function validUid(uid: number): boolean {
  return Number.isSafeInteger(uid) && uid > 0
}

export async function loadThreadOpUid(tid: number): Promise<number | null> {
  const inMemory = memory.get(tid)
  if (inMemory !== undefined) return inMemory
  const uid = await idbGet<number>('meta', `${PREFIX}${tid}`)
  if (typeof uid !== 'number' || !validUid(uid)) return null
  memory.set(tid, uid)
  return uid
}

export async function saveThreadOpUid(tid: number, uid: number | null | undefined): Promise<void> {
  if (uid == null || !validUid(uid)) return
  memory.set(tid, uid)
  await idbSet('meta', `${PREFIX}${tid}`, uid)
}
