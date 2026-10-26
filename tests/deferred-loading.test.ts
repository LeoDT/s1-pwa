import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeferredLoading } from '@/lib/useDeferredLoading'

function Harness({ active }: { active: boolean }) {
  const visible = useDeferredLoading(active, 200)
  return createElement('span', null, visible ? 'loading' : 'hidden')
}

describe('useDeferredLoading', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    if (root) act(() => root?.unmount())
    root = undefined
    container?.remove()
    container = undefined
    vi.useRealTimers()
  })

  it('does not show quick requests and shows sustained loading after the delay', () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    root = createRoot(container)
    act(() => root?.render(createElement(Harness, { active: true })))
    expect(container.textContent).toBe('hidden')
    act(() => vi.advanceTimersByTime(199))
    expect(container.textContent).toBe('hidden')
    act(() => vi.advanceTimersByTime(1))
    expect(container.textContent).toBe('loading')
  })

  it('hides immediately on inactive render and restarts the delay on reactivation', () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    root = createRoot(container)
    function ChangingHarness() {
      const [active, setActive] = useState(true)
      const visible = useDeferredLoading(active, 200)
      return createElement('button', { onClick: () => setActive((current) => !current) }, visible ? 'loading' : 'hidden')
    }
    act(() => root?.render(createElement(ChangingHarness)))
    act(() => vi.advanceTimersByTime(100))
    act(() => container?.querySelector('button')?.click())
    expect(container.textContent).toBe('hidden')
    act(() => container?.querySelector('button')?.click())
    act(() => vi.advanceTimersByTime(199))
    expect(container.textContent).toBe('hidden')
    act(() => vi.advanceTimersByTime(1))
    expect(container.textContent).toBe('loading')
  })

  it('clears the timer on unmount', () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    root = createRoot(container)
    act(() => root?.render(createElement(Harness, { active: true })))
    expect(vi.getTimerCount()).toBe(1)
    act(() => root?.unmount())
    root = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
})
