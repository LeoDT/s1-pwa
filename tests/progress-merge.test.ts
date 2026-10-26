import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeProgressRows, sameProgress } from '@shared/progress'
import type { ProgressRow } from '@shared/types'
import { STORE_NAMES, idbClear, idbGet, idbSet } from '@/lib/db'
import { loadProgressIndex, mergeProgress } from '@/lib/progress'
import { observation, position, progressRow } from './progress-fixtures'

const meta = { tid: 50, fid: 6, forumName: 'board', title: 'thread' }

beforeEach(async () => { await Promise.all(STORE_NAMES.map((store) => idbClear(store))) })

describe('independent progress merge', () => {
  it('merges read and position independently despite concurrent and reordered updates', async () => {
    const start = progressRow({ read: observation(10, 'a', 12), position: position(10, 'a', 20) })
    const readUpdate = progressRow({ read: observation(30, 'c', 18) })
    const positionUpdate = progressRow({ position: position(20, 'b', 40) })
    const final = await Promise.all([
      Promise.resolve(mergeProgressRows(mergeProgressRows(start, readUpdate), positionUpdate)),
      Promise.resolve(mergeProgressRows(mergeProgressRows(positionUpdate, start), readUpdate)),
      Promise.resolve(mergeProgressRows(mergeProgressRows(readUpdate, positionUpdate), start)),
    ])
    expect(final[0]).toEqual(final[1])
    expect(final[1]).toEqual(final[2])
    expect(final[0]).toMatchObject({ read: observation(30, 'c', 18), position: position(20, 'b', 40) })
  })

  it('keeps unknown separate from zero and chooses versions by timestamp then id', () => {
    const unknown = progressRow({ read: null })
    const zero = progressRow({ read: observation(5, 'zero', 0) })
    expect(mergeProgressRows(unknown, zero).read).toEqual(observation(5, 'zero', 0))
    expect(mergeProgressRows(zero, progressRow({ read: observation(6, 'unknown', 7) })).read?.replies).toBe(7)
    const tiedA = progressRow({ position: position(10, 'a', 1) })
    const tiedZ = progressRow({ position: position(10, 'z', 2) })
    expect(mergeProgressRows(tiedA, tiedZ).position).toEqual(position(10, 'z', 2))
    expect(mergeProgressRows(tiedZ, tiedA).position).toEqual(position(10, 'z', 2))
  })

  it('allows reliable reply counts to decrease when their observation version is newer', () => {
    const older = progressRow({ read: observation(10, 'a', 80) })
    const newer = progressRow({ read: observation(11, 'b', 6) })
    expect(mergeProgressRows(older, newer).read).toEqual(observation(11, 'b', 6))
    expect(mergeProgressRows(newer, older).read).toEqual(observation(11, 'b', 6))
  })

  it('orders metadata by metadataVersion, accepts newer Z-to-A refreshes, and ignores position-only metadata', () => {
    const newerMetadata = progressRow({
      fid: 9, forumName: 'A board', title: 'A title', metadataVersion: { at: 20, id: 'new' },
    })
    const olderMetadata = progressRow({
      fid: 9, forumName: 'Z board', title: 'Z title', metadataVersion: { at: 10, id: 'old' },
    })
    const positionOnly = progressRow({
      fid: 0, forumName: '', title: '', metadataVersion: null, position: position(30, 'position', 99),
    })
    const expected = mergeProgressRows(newerMetadata, olderMetadata)
    expect(expected).toMatchObject({ fid: 9, forumName: 'A board', title: 'A title', metadataVersion: { at: 20, id: 'new' } })
    expect(mergeProgressRows(olderMetadata, newerMetadata)).toEqual(expected)
    expect(mergeProgressRows(expected, positionOnly)).toMatchObject({ fid: 9, forumName: 'A board', title: 'A title', metadataVersion: { at: 20, id: 'new' } })
  })

  it('retains newer list baseline across an older cached thread and position-only event', () => {
    const listRead = progressRow({
      fid: 6, forumName: 'board', title: 'Z title', metadataVersion: { at: 20, id: 'list' },
      read: observation(20, 'list-read', 120),
    })
    const cachedThread = progressRow({
      fid: 6, forumName: 'board', title: 'A title', metadataVersion: { at: 10, id: 'cached' },
      read: observation(10, 'cached-read', 100),
    })
    const contentRefresh = progressRow({
      fid: 6, forumName: 'board', title: 'A title', metadataVersion: { at: 30, id: 'content' },
      read: observation(30, 'content-read', 125),
    })
    const positionOnly = progressRow({ position: position(40, 'scroll', 500) })
    const initial = mergeProgressRows(listRead, cachedThread)
    expect(initial.read).toEqual(observation(20, 'list-read', 120))
    const refreshed = mergeProgressRows(initial, contentRefresh)
    const final = mergeProgressRows(refreshed, positionOnly)
    expect(final).toMatchObject({
      title: 'A title', metadataVersion: { at: 30, id: 'content' },
      read: observation(30, 'content-read', 125), position: position(40, 'scroll', 500),
    })
  })

  it('merges independent groups through IndexedDB writes and index reads only local state', async () => {
    await idbSet('progress', meta.tid, progressRow({ read: observation(10, 'a', 0), position: position(10, 'a', 3) }))
    await Promise.all([
      mergeProgress([progressRow({ read: observation(20, 'b', 0) })]),
      mergeProgress([progressRow({ position: position(15, 'c', 8) })]),
    ])
    const stored = await idbGet<ProgressRow>('progress', meta.tid)
    expect(stored).toMatchObject({ read: observation(20, 'b', 0), position: position(15, 'c', 8) })

    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await loadProgressIndex()).toEqual([{ tid: 50, openedAt: 0, read: observation(20, 'b', 0) }])
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('retains the source observation version when cache is reread', async () => {
    const source = progressRow({ read: observation(25, 'source-event', 0) })
    await mergeProgress([source])
    const once = await idbGet<ProgressRow>('progress', 50)
    await mergeProgress([progressRow({ read: observation(20, 'older-event', 99) })])
    const twice = await idbGet<ProgressRow>('progress', 50)
    expect(twice?.read).toEqual(once?.read)
    expect(sameProgress(twice!, once!)).toBe(true)
  })
})
