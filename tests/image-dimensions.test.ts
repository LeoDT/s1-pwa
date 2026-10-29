import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { idbGet, idbSet } from '@/lib/db'
import {
  clearImageDimensions,
  imageDimensionsGeneration,
  loadImageDimensions,
  pruneImageDimensions,
  saveImageDimensions,
} from '@/lib/imageDimensions'

describe('image dimension metadata', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    await clearImageDimensions()
  })

  it('persists and reloads dimensions keyed by URL without an in-memory cache', async () => {
    await saveImageDimensions('https://example.com/a.png', { width: 640, height: 480 })
    expect(await loadImageDimensions(['https://example.com/a.png'])).toEqual(
      new Map([['https://example.com/a.png', { width: 640, height: 480 }]]),
    )
    expect(await idbGet('meta', 'imageDimensions:https://example.com/a.png')).toMatchObject({
      width: 640, height: 480,
    })
  })

  it('ignores non-positive and non-finite dimensions', async () => {
    for (const value of [
      { width: 0, height: 2 }, { width: -1, height: 2 }, { width: Infinity, height: 2 },
      { width: 1, height: NaN },
    ]) await saveImageDimensions('bad', value)
    expect(await loadImageDimensions(['bad'])).toEqual(new Map())
  })

  it('slides the seven-day expiry when loaded and expires only beyond the boundary', async () => {
    const start = 1_700_000_000_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    await saveImageDimensions('sliding', { width: 1, height: 2 })
    clock.mockReturnValue(start + 6 * 24 * 60 * 60 * 1000)
    await loadImageDimensions(['sliding'])
    clock.mockReturnValue(start + 13 * 24 * 60 * 60 * 1000)
    expect(await loadImageDimensions(['sliding'])).toHaveProperty('size', 1)
    clock.mockReturnValue(start + 20 * 24 * 60 * 60 * 1000 + 1)
    expect(await loadImageDimensions(['sliding'])).toEqual(new Map())
    expect(await idbGet('meta', 'imageDimensions:sliding')).toBeUndefined()
  })

  it('prunes stale records and does not return them', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000_000_000)
    await saveImageDimensions('stale', { width: 3, height: 4 })
    clock.mockReturnValue(10_000_000_001 + 7 * 24 * 60 * 60 * 1000)
    expect(await loadImageDimensions(['stale'])).toEqual(new Map())
    await saveImageDimensions('stale2', { width: 3, height: 4 })
    clock.mockReturnValue(20_000_000_000)
    await pruneImageDimensions()
    expect(await idbGet('meta', 'imageDimensions:stale2')).toBeUndefined()
  })

  it('limits records to 5000 using least-recently-used eviction', async () => {
    const now = 50_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const { idbTransact } = await import('@/lib/db')
    await idbTransact(['meta'], 'readwrite', (tx) => {
      const store = tx.objectStore('meta')
      store.put({ width: 1, height: 1, lastUsed: now }, 'imageDimensions:oldest')
      for (let i = 0; i < 5000; i++) {
        store.put({ width: 1, height: 1, lastUsed: now + i + 1 }, `imageDimensions:url-${i}`)
      }
    })
    vi.spyOn(Date, 'now').mockReturnValue(now + 6000)
    await saveImageDimensions('newest', { width: 1, height: 1 })
    expect(await idbGet('meta', 'imageDimensions:oldest')).toBeUndefined()
    expect(await idbGet('meta', 'imageDimensions:url-0')).toBeUndefined()
    const keys = await loadImageDimensions(['newest'])
    expect(keys.size).toBe(1)
  })

  it('deduplicates requested URLs and clear preserves unrelated metadata', async () => {
    await saveImageDimensions('same', { width: 5, height: 6 })
    await idbSet('meta', 'unrelated', { value: 42 })
    expect(await loadImageDimensions(['same', 'same'])).toEqual(
      new Map([['same', { width: 5, height: 6 }]]),
    )
    await clearImageDimensions()
    expect(await idbGet('meta', 'unrelated')).toEqual({ value: 42 })
    expect(await loadImageDimensions(['same'])).toEqual(new Map())
  })

  it('rejects a delayed save from before clear while allowing current-generation saves', async () => {
    const oldGeneration = imageDimensionsGeneration()
    await clearImageDimensions()
    await Promise.resolve()

    await saveImageDimensions('delayed-old', { width: 2, height: 3 }, oldGeneration)
    expect(await loadImageDimensions(['delayed-old'])).toEqual(new Map())

    await saveImageDimensions('current', { width: 4, height: 5 })
    expect(await loadImageDimensions(['current'])).toEqual(
      new Map([['current', { width: 4, height: 5 }]]),
    )
  })

  it('keeps concurrent saves and reads transaction-safe', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, i) =>
      saveImageDimensions(`parallel-${i}`, { width: i + 1, height: 2 }),
    ))
    const loaded = await loadImageDimensions(Array.from({ length: 30 }, (_, i) => `parallel-${i}`))
    expect(loaded.size).toBe(30)
    const generationBeforeClear = imageDimensionsGeneration()
    const queuedSave = saveImageDimensions('raced', { width: 10, height: 10 }, generationBeforeClear)
    const queuedClear = clearImageDimensions()
    await Promise.all([queuedSave, queuedClear])
    expect(await loadImageDimensions(['raced'])).toEqual(new Map())

    await saveImageDimensions('after-clear', { width: 11, height: 12 })
    expect(await loadImageDimensions(['after-clear'])).toEqual(
      new Map([['after-clear', { width: 11, height: 12 }]]),
    )
  })
})
