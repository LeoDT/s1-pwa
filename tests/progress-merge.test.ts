import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressIndexRow, ProgressRow } from '@shared/types'
import { STORE_NAMES, idbClear, idbGet, idbSet } from '@/lib/db'
import { loadProgressIndex, mergeProgress } from '@/lib/progress'

const base = (overrides: Partial<ProgressRow> = {}): ProgressRow => ({
  tid: 50, fid: 6, forumName: 'board', title: 'thread', lastPid: 10, lastFloor: 1,
  lastPage: 1, totalPages: 2, replies: 40, updatedAt: 100, ...overrides,
})

describe('progress snapshot merges', () => {
  beforeEach(async () => {
    await Promise.all(STORE_NAMES.map((name) => idbClear(name)))
    vi.restoreAllMocks()
  })

  it('newer unknown snapshot updates position/time but retains known replies atomically', async () => {
    await idbSet('progress', 50, base())
    await mergeProgress([base({ replies: null, lastPid: 20, lastFloor: 2, updatedAt: 200 })])
    expect(await idbGet<ProgressRow>('progress', 50)).toMatchObject({ replies: 40, lastPid: 20, updatedAt: 200 })
  })

  it('older known data can backfill count without rolling back newer position/time; concurrent writes keep LWW', async () => {
    await idbSet('progress', 50, base({ replies: null, lastPid: 99, updatedAt: 300 }))
    await Promise.all([
      mergeProgress([base({ replies: 40, lastPid: 15, updatedAt: 100 })]),
      mergeProgress([base({ replies: null, lastPid: 30, updatedAt: 250 })]),
      mergeProgress([base({ replies: 60, lastPid: 60, updatedAt: 400 })]),
    ])
    expect(await idbGet<ProgressRow>('progress', 50)).toMatchObject({ replies: 60, lastPid: 60, updatedAt: 400 })
  })

  it('stops applying fetched rows when the caller guard is invalidated', async () => {
    let checks = 0
    await mergeProgress([base({ tid: 52 })], () => ++checks < 2)
    expect(await idbGet('progress', 52)).toBeUndefined()
  })

  it('a newer server index with null replies retains the local known count', async () => {
    await idbSet('progress', 50, base())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, items: [
      { tid: 50, replies: null, lastFloor: 9, lastPage: 2, updatedAt: 200 } satisfies ProgressIndexRow,
    ] }), { status: 200 })))
    const indexes = await loadProgressIndex(true)
    expect(indexes).toContainEqual({ tid: 50, replies: 40, lastFloor: 9, lastPage: 2, updatedAt: 200 })
  })
})
