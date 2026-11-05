import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { loadThreadOpUid, saveThreadOpUid } from '@/lib/threadOp'

describe('thread op uid cache', () => {
  it('persists a valid op uid and ignores invalid values', async () => {
    await saveThreadOpUid(910001, 152709)
    expect(await loadThreadOpUid(910001)).toBe(152709)

    await saveThreadOpUid(910002, 0)
    expect(await loadThreadOpUid(910002)).toBeNull()
    expect(await loadThreadOpUid(910003)).toBeNull()
  })
})
