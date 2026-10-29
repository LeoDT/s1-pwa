import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const load = vi.hoisted(() => vi.fn())
vi.mock('@/lib/imageDimensions', () => ({ loadImageDimensions: load }))

import { usePreparedImageDimensions } from '@/lib/useImageDimensions'

type Dimensions = ReadonlyMap<string, { width: number; height: number }>
function deferred() {
  let resolve!: (value: Dimensions) => void
  const promise = new Promise<Dimensions>((res) => { resolve = res })
  return { promise, resolve }
}
function Probe({ urls, onRender }: { urls: string[]; onRender?: () => void }) {
  const dimensions = usePreparedImageDimensions(urls)
  onRender?.()
  return createElement('output', null, dimensions === undefined ? 'pending' : JSON.stringify([...dimensions]))
}


describe('usePreparedImageDimensions', () => {
  let host: HTMLDivElement
  let root: Root
  const render = (urls: string[], onRender?: () => void) => act(() => root.render(createElement(Probe, { urls, onRender })))

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    load.mockReset()
  })
  afterEach(() => { act(() => root.unmount()); host.remove() })

  it('does not publish an earlier source result after the source changes', async () => {
    const first = deferred()
    const second = deferred()
    load.mockImplementation((urls: string[]) => urls[0] === 'first' ? first.promise : second.promise)
    render(['first'])
    expect(host.textContent).toBe('pending')
    render(['second'])

    await act(async () => first.resolve(new Map([['first', { width: 1, height: 2 }]])))
    expect(host.textContent).toBe('pending')
    await act(async () => second.resolve(new Map([['second', { width: 3, height: 4 }]])))
    expect(host.textContent).toContain('second')
    expect(host.textContent).not.toContain('first')
  })

  it('prevents a pending result from updating after unmount', async () => {
    const pending = deferred()
    load.mockReturnValue(pending.promise)
    const onRender = vi.fn()
    render(['unmounted'], onRender)
    const rendersBeforeUnmount = onRender.mock.calls.length
    act(() => root.unmount())
    await act(async () => pending.resolve(new Map([['unmounted', { width: 5, height: 6 }]])))
    expect(onRender).toHaveBeenCalledTimes(rendersBeforeUnmount)
  })

  it('returns an empty map immediately for an empty source list', () => {
    load.mockImplementation(() => { throw new Error('should not load') })
    render([])
    expect(host.textContent).toBe('[]')
    expect(load).not.toHaveBeenCalled()
  })
})
