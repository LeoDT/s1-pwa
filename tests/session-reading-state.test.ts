import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STORE_NAMES, idbClear, idbGet, idbSet } from '@/lib/db'
import { saveSession, clearSession } from '@/lib/session'
import { queueProgress, pendingProgress } from '@/lib/outbox'
import { setAppToken } from '@/lib/api'
import { mergeJar } from '@/lib/cookieJar'
import { progressRow } from './progress-fixtures'

beforeEach(async () => {
  await Promise.all(STORE_NAMES.map((store) => idbClear(store)))
  localStorage.clear()
})

afterEach(() => localStorage.clear())

describe('session ownership of reading state', () => {
  it('clears only reading stores on uid change and preserves unrelated account/app data', async () => {
    await saveSession({ uid: 7 })
    await queueProgress(progressRow())
    await setAppToken('app-token')
    await mergeJar([{ name: 'sid', value: 'cookie' }])
    await idbSet('boards', 'favorites', [{ fid: 3 }])
    await idbSet('imgMeta', 'image', { key: 'image', size: 4, lastUsed: 1 })
    localStorage.setItem('s1r:prefs', '{"fontSize":18}')

    await saveSession({ uid: 8 })

    expect(await idbGet('progress', 50)).toBeUndefined()
    expect(await idbGet('outbox', 50)).toBeUndefined()
    expect(await idbGet('kv', 'readingOwner')).toBe(8)
    expect(await idbGet('kv', 'appToken')).toBe('app-token')
    expect(await idbGet('jar', 'main')).toEqual({ cookies: [{ name: 'sid', value: 'cookie' }] })
    expect(await idbGet('boards', 'favorites')).toEqual([{ fid: 3 }])
    expect(await idbGet('imgMeta', 'image')).toEqual({ key: 'image', size: 4, lastUsed: 1 })
    expect(localStorage.getItem('s1r:prefs')).toBe('{"fontSize":18}')
  })

  it('preserves records for same-uid saves but clears them after expiration followed by another uid', async () => {
    await saveSession({ uid: 7 })
    await queueProgress(progressRow())
    await saveSession({ uid: 7, username: 'alice' })
    expect(await idbGet('progress', 50)).toBeTruthy()
    expect((await pendingProgress()).length).toBe(1)

    await clearSession()
    expect(await idbGet('kv', 'readingOwner')).toBe(7)
    expect(await idbGet('progress', 50)).toBeTruthy()
    await saveSession({ uid: 8 })
    expect(await idbGet('progress', 50)).toBeUndefined()
    expect(await idbGet('outbox', 50)).toBeUndefined()
    expect(await idbGet('kv', 'readingOwner')).toBe(8)
  })
})
