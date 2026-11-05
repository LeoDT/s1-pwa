import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEdgePull } from '@/lib/useEdgePull'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({ onTrigger }: { onTrigger: () => Promise<void> }) {
  const ref = useRef<HTMLDivElement>(null)
  const state = useEdgePull(ref, {
    edge: 'bottom',
    onTrigger,
    targetRef: ref,
    engageDistance: 6,
  })
  return createElement('div', {
    ref,
    'data-progress': state.progress,
    'data-pull': state.pull,
  })
}

describe('useEdgePull bottom edge', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  function setup(onTrigger = vi.fn(async () => {})) {
    act(() => root.render(createElement(Harness, { onTrigger })))
    const element = host.firstElementChild as HTMLDivElement
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: 500 })
    element.scrollTop = 500
    const touch = (type: string, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', {
        configurable: true,
        value: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: 0, clientY: y }],
      })
      Object.defineProperty(event, 'changedTouches', {
        configurable: true,
        value: [{ clientX: 0, clientY: y }],
      })
      element.dispatchEvent(event)
    }
    return { element, touch, onTrigger }
  }

  it('turns an upward pull at the bottom into a trigger after the threshold', async () => {
    const { element, touch, onTrigger } = setup()
    act(() => touch('touchstart', 500))
    act(() => touch('touchmove', 300))
    expect(Number(element.getAttribute('data-progress'))).toBe(1)
    act(() => touch('touchend', 300))
    await act(async () => { await Promise.resolve() })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('does nothing below the threshold, away from the bottom, or on cancel', async () => {
    const { element, touch, onTrigger } = setup()
    act(() => touch('touchstart', 500))
    act(() => touch('touchmove', 490))
    act(() => touch('touchend', 490))
    expect(onTrigger).not.toHaveBeenCalled()

    element.scrollTop = 0
    act(() => touch('touchstart', 500))
    act(() => touch('touchmove', 300))
    act(() => touch('touchend', 300))
    expect(onTrigger).not.toHaveBeenCalled()

    element.scrollTop = 500
    act(() => touch('touchstart', 500))
    act(() => touch('touchmove', 300))
    act(() => touch('touchcancel', 300))
    expect(onTrigger).not.toHaveBeenCalled()
  })
})
