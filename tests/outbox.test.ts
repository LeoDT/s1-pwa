import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressRow } from '@shared/types'
import { STORE_NAMES, idbClear, idbGet, idbSet } from '@/lib/db'
import { flushProgress, pendingProgress, queueProgress } from '@/lib/outbox'
import { putServerProgress } from '@/lib/historyApi'
import { observation, position, progressRow } from './progress-fixtures'

vi.mock('@/lib/historyApi', () => ({ putServerProgress: vi.fn() }))
const put = vi.mocked(putServerProgress)

beforeEach(async () => {
  put.mockReset()
  put.mockResolvedValue(undefined)
  await Promise.all(STORE_NAMES.map((store) => idbClear(store)))
  await idbSet('kv', 'session', { uid: 7 })
})

describe('progress outbox', () => {
  it('persists merged progress locally and in outbox, merging event groups independently', async () => {
    await queueProgress(progressRow({ read: observation(10, 'read', 0) }))
    await queueProgress(progressRow({ position: position(20, 'position', 9) }))
    expect(await idbGet('progress', 50)).toMatchObject({ read: observation(10, 'read', 0), position: position(20, 'position', 9) })
    expect(await idbGet('outbox', 50)).toEqual({ accountId: 7, row: await idbGet('progress', 50) })
  })

  it('uses explicit account id as a same-transaction session guard only when supplied', async () => {
    await idbSet('kv', 'session', { uid: 7 })
    await expect(queueProgress(progressRow(), 8)).resolves.toBeUndefined()
    expect(await idbGet('progress', 50)).toBeUndefined()
    expect(await pendingProgress()).toEqual([])
    await expect(queueProgress(progressRow(), 7)).resolves.toMatchObject({ tid: 50 })
    expect(await idbGet('progress', 50)).toMatchObject({ tid: 50 })
    await expect(queueProgress(progressRow({ tid: 51 }), 8)).resolves.toBeUndefined()
    expect(await idbGet('progress', 51)).toBeUndefined()
    await expect(queueProgress(progressRow({ tid: 51 }))).resolves.toMatchObject({ tid: 51 })
  })

  it('orders sends by aggregate progress timestamp and passes keepalive to historyApi', async () => {
    await queueProgress(progressRow({ tid: 1, openedAt: 30 }))
    await queueProgress(progressRow({ tid: 2, read: observation(10, 'read', 0) }))
    expect(await flushProgress({ keepalive: true })).toBe(2)
    expect(put.mock.calls.map(([row]) => row.tid)).toEqual([2, 1])
    expect(put).toHaveBeenCalledWith(expect.anything(), true, 7)
    expect(await pendingProgress()).toEqual([])
  })

  it('requires a current account even when no expected uid was passed', async () => {
    await idbClear('kv')
    await expect(queueProgress(progressRow())).resolves.toBeUndefined()
    expect(await idbGet('progress', 50)).toBeUndefined()
    expect(await idbGet('outbox', 50)).toBeUndefined()
  })

  it('does not send an old owner item after an account switch and leaves it queued', async () => {
    const queued = progressRow({ metadataVersion: { at: 1, id: 'metadata' } })
    await queueProgress(queued)
    await idbSet('kv', 'session', { uid: 8 })
    expect(await flushProgress()).toBe(0)
    expect(put).not.toHaveBeenCalled()
    expect(await pendingProgress()).toEqual([queued])
    expect(await idbGet('outbox', 50)).toEqual({ accountId: 7, row: queued })
  })

  it('returns zero and keeps pending items when the server PUT throws', async () => {
    await queueProgress(progressRow({ tid: 1 }))
    await queueProgress(progressRow({ tid: 2 }))
    put.mockRejectedValueOnce(new Error('offline'))
    expect(await flushProgress()).toBe(0)
    expect((await pendingProgress()).map((row) => row.tid).sort()).toEqual([1, 2])
  })

  it('does not mutate source event timestamps while retrying failed PUTs', async () => {
    const record = progressRow({ read: observation(77, 'fixed-read', 4), position: position(85, 'fixed-position', 9) })
    await queueProgress(record)
    put.mockRejectedValueOnce(new Error('offline'))
    expect(await flushProgress()).toBe(0)
    expect(await flushProgress()).toBe(1)
    expect(put.mock.calls[0]![0]).toEqual(put.mock.calls[1]![0])
    expect(put.mock.calls[1]![0]).toMatchObject({ read: record.read, position: record.position })
  })

  it('does not start a send when its active sync guard is already invalid', async () => {
    await queueProgress(progressRow())
    expect(await flushProgress({ shouldContinue: () => false })).toBe(0)
    expect(put).not.toHaveBeenCalled()
    expect(await pendingProgress()).toHaveLength(1)
  })

  it('does not acknowledge an item after its active sync guard is invalidated', async () => {
    const queued = progressRow({ metadataVersion: { at: 1, id: 'metadata' } })
    await queueProgress(queued)
    let current = true
    put.mockImplementationOnce(async () => { current = false })
    expect(await flushProgress({ shouldContinue: () => current })).toBe(0)
    expect(await pendingProgress()).toEqual([queued])
    expect(put).toHaveBeenCalledWith(queued, false, 7)
  })

  it('preserves a concurrent change even when aggregate max timestamp is unchanged', async () => {
    const initial = progressRow({ read: observation(90, 'read-a', 0), position: position(100, 'position-a', 1) })
    await queueProgress(initial)
    put.mockImplementationOnce(async (sent) => {
      await queueProgress(progressRow({ position: position(100, 'position-z', 2) }), 7)
      expect(sent.tid).toBe(50)
    })
    expect(await flushProgress()).toBe(1)
    expect(await pendingProgress()).toMatchObject([{ position: position(100, 'position-z', 2) }])
    expect(await idbGet('outbox', 50)).toEqual({
      accountId: 7,
      row: expect.objectContaining({ position: position(100, 'position-z', 2) }),
    })
  })
})
