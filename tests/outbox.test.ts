// fake-indexeddb 必须先于 ./db 求值，jsdom 本身没有 IndexedDB
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProgressRow } from '@shared/types'
import { STORE_NAMES, idbClear, idbGet } from '@/lib/db'
import { flushProgress, pendingProgress, queueProgress } from '@/lib/outbox'
import { putServerProgress } from '@/lib/progress'

vi.mock('@/lib/progress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/progress')>()
  return { ...actual, putServerProgress: vi.fn() }
})

const put = vi.mocked(putServerProgress)

function row(tid: number, updatedAt: number): ProgressRow {
  return {
    tid,
    fid: 6,
    forumName: '测试板块',
    title: `帖子 ${tid}`,
    lastPid: tid * 10,
    lastFloor: 1,
    lastPage: 1,
    totalPages: 1,
    replies: 0,
    updatedAt,
  }
}

describe('阅读进度落地', () => {
  beforeEach(async () => {
    put.mockReset()
    put.mockResolvedValue(undefined)
    await Promise.all(STORE_NAMES.map((store) => idbClear(store)))
  })

  it('queueProgress 一次写入镜像与 outbox', async () => {
    const value = row(1, 100)
    await queueProgress(value)

    expect(await idbGet<ProgressRow>('progress', 1)).toEqual(value)
    expect(await idbGet<ProgressRow>('outbox', 1)).toEqual(value)
  })

  it('较旧的写入不覆盖较新的', async () => {
    await queueProgress(row(1, 200))
    await queueProgress(row(1, 100))

    expect((await idbGet<ProgressRow>('progress', 1))?.updatedAt).toBe(200)
    expect((await idbGet<ProgressRow>('outbox', 1))?.updatedAt).toBe(200)
  })

  it('未知计数不覆盖镜像中的已知回复数', async () => {
    await queueProgress(row(7, 10))
    await queueProgress(row(7, 20))
    await queueProgress({ ...row(7, 30), replies: null })
    expect((await idbGet<ProgressRow>('progress', 7))?.replies).toBe(0)
    expect((await idbGet<ProgressRow>('outbox', 7))?.replies).toBe(0)
  })

  it('即使 outbox 已清空，旧时间戳写入也不能覆盖较新的镜像', async () => {
    await queueProgress(row(8, 200))
    await queueProgress(row(8, 100))
    expect((await idbGet<ProgressRow>('progress', 8))?.updatedAt).toBe(200)
    expect((await idbGet<ProgressRow>('outbox', 8))?.updatedAt).toBe(200)
  })

  it('flushProgress 按 updatedAt 升序发送并清空 outbox', async () => {
    await queueProgress(row(2, 200))
    await queueProgress(row(1, 100))

    await expect(flushProgress()).resolves.toBe(2)
    expect(put.mock.calls.map(([sent]) => sent.tid)).toEqual([1, 2])
    expect(await pendingProgress()).toEqual([])
    // 镜像保留，供离线着色/续读
    expect(await idbGet<ProgressRow>('progress', 1)).toBeTruthy()
  })

  it('发送失败时立即停下并保留队列', async () => {
    put.mockRejectedValueOnce(new Error('offline'))
    await queueProgress(row(1, 100))
    await queueProgress(row(2, 200))

    await expect(flushProgress()).resolves.toBe(0)
    expect((await pendingProgress()).map((item) => item.tid).sort()).toEqual([1, 2])
  })

  it('PUT 期间产生的更新版本不会被连带删除', async () => {
    await queueProgress(row(1, 100))
    put.mockImplementationOnce(async (sent) => {
      // 模拟发送过程中用户又往下滚了：outbox 出现更新的版本
      await queueProgress({ ...sent, updatedAt: sent.updatedAt + 100 })
    })

    await expect(flushProgress()).resolves.toBe(1)
    expect((await pendingProgress()).map((item) => item.updatedAt)).toEqual([200])
  })
})
