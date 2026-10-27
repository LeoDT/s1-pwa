import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ uid: 7 as number | undefined, flush: vi.fn(), mirror: vi.fn() }))
vi.mock('@/features/auth/useSession', () => ({ useSession: () => ({ data: { uid: mocks.uid } }) }))
vi.mock('@/lib/outbox', () => ({ flushProgress: mocks.flush }))
vi.mock('@/lib/progress', () => ({ syncHistoryMirror: mocks.mirror }))
import { HistorySync } from '@/features/progress/HistorySync'
import { requestHistorySync } from '@/lib/progressEvents'

describe('foreground history synchronization', () => {
  let root: Root | undefined
  let visibility: DocumentVisibilityState

  beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
  beforeEach(() => {
    vi.useFakeTimers()
    visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    mocks.uid = 7
    mocks.flush.mockReset().mockResolvedValue(0)
    mocks.mirror.mockReset().mockResolvedValue([])
    root = createRoot(document.createElement('div'))
  })
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  async function render() {
    await act(async () => root!.render(createElement(HistorySync)))
  }
  async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  }
  async function setVisibility(value: DocumentVisibilityState) {
    visibility = value
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  }

  it('uploads before pulling and combines requests received during that upload', async () => {
    const upload = Promise.withResolvers<number>()
    mocks.flush.mockReturnValueOnce(upload.promise)
    await render()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      requestHistorySync({ accountId: 7, pull: true, ifStale: true })
    })
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    expect(mocks.mirror).not.toHaveBeenCalled()
    await act(async () => { upload.resolve(0) })
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    expect(mocks.flush).toHaveBeenCalledTimes(2)
  })

  it('uploads globally every five seconds and pulls every thirty seconds', async () => {
    await render()
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    await advance(5000)
    expect(mocks.flush).toHaveBeenCalledTimes(2)
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    await advance(25_000)
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
  })

  it('stops background polling and combines resume visibility and focus events', async () => {
    await render()
    await setVisibility('hidden')
    await advance(60_000)
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    await setVisibility('visible')
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(mocks.flush).toHaveBeenCalledTimes(2)
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
    await advance(5000)
    expect(mocks.flush).toHaveBeenCalledTimes(3)
  })

  it('also synchronizes when a visible desktop window regains focus', async () => {
    await render()
    await advance(1000)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
  })

  it('skips a fresh history entry request but pulls after ten seconds', async () => {
    await render()
    await advance(9000)
    await act(async () => { requestHistorySync({ accountId: 7, pull: true, ifStale: true }) })
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    await advance(1000)
    await act(async () => { requestHistorySync({ accountId: 7, pull: true, ifStale: true }) })
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
  })

  it('does not consider a failed pull fresh and still pulls after an upload error', async () => {
    mocks.flush.mockRejectedValueOnce(new Error('upload failed'))
    mocks.mirror.mockRejectedValueOnce(new Error('offline'))
    await render()
    await act(async () => { requestHistorySync({ accountId: 7, pull: true, ifStale: true }) })
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
    await act(async () => { requestHistorySync({ accountId: 7, pull: true, ifStale: true }) })
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
  })

  it('does not overlap pulls and drains a later keepalive upload after the current pull', async () => {
    const pull = Promise.withResolvers<never[]>()
    mocks.mirror.mockReturnValueOnce(pull.promise)
    await render()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      requestHistorySync({ accountId: 7, pull: true })
    })
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    await setVisibility('hidden')
    await act(async () => { requestHistorySync({ accountId: 7, keepalive: true }) })
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    await act(async () => { pull.resolve([]) })
    expect(mocks.flush).toHaveBeenCalledTimes(2)
    expect(mocks.flush).toHaveBeenLastCalledWith(expect.objectContaining({ keepalive: true }))
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
  })

  it('queues a new pull when the app resumes during an older in-flight pull', async () => {
    const oldPull = Promise.withResolvers<never[]>()
    mocks.mirror.mockReturnValueOnce(oldPull.promise)
    await render()
    await setVisibility('hidden')
    await setVisibility('visible')
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    await act(async () => { oldPull.resolve([]) })
    expect(mocks.mirror).toHaveBeenCalledTimes(2)
    expect(mocks.flush).toHaveBeenCalledTimes(2)
  })

  it('only permits explicit keepalive uploads while hidden', async () => {
    await render()
    await setVisibility('hidden')
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
      requestHistorySync({ accountId: 7, pull: true })
    })
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    await act(async () => { requestHistorySync({ accountId: 7, keepalive: true }) })
    expect(mocks.flush).toHaveBeenCalledTimes(2)
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
  })

  it('rejects old-account requests and invalidates the previous account worker', async () => {
    const upload = Promise.withResolvers<number>()
    mocks.flush.mockReturnValueOnce(upload.promise)
    await render()
    const oldGuard = mocks.flush.mock.calls[0]![0].shouldContinue
    mocks.uid = 8
    await render()
    expect(oldGuard()).toBe(false)
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    await act(async () => {
      requestHistorySync({ accountId: 7, keepalive: true })
      upload.resolve(0)
    })
    expect(mocks.flush).toHaveBeenCalledTimes(2)
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
  })

  it('removes timers and request listeners on unmount and does nothing for guests', async () => {
    mocks.uid = undefined
    await render()
    await advance(30_000)
    expect(mocks.flush).not.toHaveBeenCalled()
    mocks.uid = 7
    await render()
    await act(async () => root!.unmount())
    root = undefined
    await advance(30_000)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('focus'))
      requestHistorySync({ accountId: 7, keepalive: true })
    })
    expect(mocks.flush).toHaveBeenCalledTimes(1)
  })
})
