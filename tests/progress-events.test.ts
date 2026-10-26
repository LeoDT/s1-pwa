import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressRow } from '@shared/types'
import { STORE_NAMES, idbClear, idbGet, idbSet } from '@/lib/db'
import { clearProgress, loadProgressIndex, recordReadingPosition, recordThreadOpened, recordThreadReplies, syncHistoryMirror } from '@/lib/progress'
import { subscribeProgress } from '@/lib/progressEvents'
import { observation, position, progressRow } from './progress-fixtures'

const remote = vi.hoisted(() => ({ fetch: vi.fn(), index: vi.fn() }))
vi.mock('@/lib/historyApi', () => ({ fetchHistory: remote.fetch, fetchHistoryIndex: remote.index }))

beforeEach(async () => {
  remote.fetch.mockReset().mockResolvedValue([])
  remote.index.mockReset().mockResolvedValue([])
  await Promise.all(STORE_NAMES.map((store) => idbClear(store)))
  await idbSet('kv', 'session', { uid: 7 })
})

describe('progress event API', () => {
  it('records open, reply and position event groups without overwriting each other', async () => {
    await recordThreadOpened({ tid: 50, fid: 6, forumName: 'board', title: 'thread' }, observation(10, 'read-a', 0))
    await recordThreadReplies({ tid: 50, fid: 6, forumName: 'board', title: 'thread' }, observation(20, 'read-b', 3))
    await recordReadingPosition({ tid: 50, fid: 6, forumName: 'board', title: 'thread' }, position(15, 'pos', 18))
    expect(await idbGet<ProgressRow>('progress', 50)).toMatchObject({
      fid: 6, forumName: 'board', title: 'thread', metadataVersion: { at: 20, id: 'read-b' }, openedAt: expect.any(Number),
      read: observation(20, 'read-b', 3), position: position(15, 'pos', 18),
    })
  })

  it('keeps metadata/read baseline stable through position events and retry-worthy rereads', async () => {
    await recordThreadReplies({ tid: 52, fid: 6, forumName: 'Z board', title: 'Z title' }, observation(20, 'list', 120))
    await recordThreadReplies({ tid: 52, fid: 6, forumName: 'A board', title: 'A title' }, observation(10, 'cache', 100))
    await recordThreadReplies({ tid: 52, fid: 6, forumName: 'A board', title: 'A title' }, observation(30, 'content', 125))
    await recordReadingPosition({ tid: 52, fid: 0, forumName: '', title: '' }, position(40, 'position', 500))
    expect(await idbGet<ProgressRow>('progress', 52)).toMatchObject({
      forumName: 'A board', title: 'A title', metadataVersion: { at: 30, id: 'content' },
      read: observation(30, 'content', 125), position: position(40, 'position', 500),
    })
  })

  it('notifies subscribers only after local committed changes', async () => {
    const calls: Array<Promise<ProgressRow | undefined>> = []
    const listener = vi.fn(() => { calls.push(Promise.resolve(idbGet<ProgressRow>('progress', 51))) })
    const unsubscribe = subscribeProgress(listener)
    await recordReadingPosition({ tid: 51 }, position(1, 'p', 10))
    await calls[0]
    expect(listener).toHaveBeenCalledTimes(1)
    expect(await idbGet('progress', 51)).toMatchObject({ position: position(1, 'p', 10) })
    unsubscribe()
    await recordThreadReplies({ tid: 51 }, observation(2, 'r', 1))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('loadProgressIndex remains local-only', async () => {
    await idbSet('progress', 50, progressRow({ read: observation(4, 'local', 0) }))
    expect(await loadProgressIndex()).toEqual([{ tid: 50, openedAt: 0, read: observation(4, 'local', 0) }])
    expect(remote.fetch).not.toHaveBeenCalled()
    expect(remote.index).not.toHaveBeenCalled()
  })

  it('clearProgress removes its pending outbox item atomically with the mirror', async () => {
    await recordReadingPosition({ tid: 53 }, position(1, 'p', 3))
    expect(await idbGet('outbox', 53)).toBeTruthy()
    await clearProgress()
    expect(await idbGet('progress', 53)).toBeUndefined()
    expect(await idbGet('outbox', 53)).toBeUndefined()
  })

  it('clear invalidates an in-flight history response before it can repopulate local state', async () => {
    let resolveFetch!: (rows: ProgressRow[]) => void
    remote.fetch.mockReturnValueOnce(new Promise<ProgressRow[]>((resolve) => { resolveFetch = resolve }))
    const inFlight = syncHistoryMirror()
    await clearProgress()
    resolveFetch([progressRow({ read: observation(10, 'stale', 5) })])
    await expect(inFlight).resolves.toEqual([])
    expect(await idbGet('progress', 50)).toBeUndefined()
  })
})
