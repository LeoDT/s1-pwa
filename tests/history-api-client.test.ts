import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { idbClear, idbSet } from '@/lib/db'
import { progressRow } from './progress-fixtures'

const mocks = vi.hoisted(() => ({ cookieHeader: vi.fn(), apiFetch: vi.fn() }))
vi.mock('@/lib/cookieJar', () => ({ cookieHeader: mocks.cookieHeader }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiFetch: mocks.apiFetch }
})

import { putServerProgress } from '@/lib/historyApi'

beforeEach(async () => {
  await idbClear('kv')
  mocks.cookieHeader.mockReset().mockResolvedValue('sid=cookie')
  mocks.apiFetch.mockReset().mockResolvedValue({ schemaVersion: 2 })
})

describe('history API account guard', () => {
  it('rechecks the expected uid after reading cookies and before issuing fetch', async () => {
    await idbSet('kv', 'session', { uid: 7 })
    mocks.cookieHeader.mockImplementationOnce(async () => {
      await idbSet('kv', 'session', { uid: 8 })
      return 'sid=cookie'
    })
    await expect(putServerProgress(progressRow(), false, 7)).rejects.toMatchObject({
      code: 'reading_account_changed', status: 409,
    })
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })

  it('sends with the cookie and schema headers when the expected uid remains current', async () => {
    await idbSet('kv', 'session', { uid: 7 })
    await putServerProgress(progressRow(), true, 7)
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/history/50', expect.objectContaining({
      method: 'PUT', keepalive: true,
    }))
    const headers = mocks.apiFetch.mock.calls[0]![1].headers as Headers
    expect(headers.get('x-reading-schema')).toBe('2')
    expect(headers.get('x-s1-cookie')).toBe('sid=cookie')
  })
})
