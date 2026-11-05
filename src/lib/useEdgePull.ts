import { useEffect, useRef, useState, type RefObject } from 'react'

export const EDGE_PULL_THRESHOLD = 56
const EDGE_PULL_MAX = 80
const EDGE_PULL_DAMPING = 0.45

type PullEdge = 'top' | 'bottom'

export interface EdgePullState {
  pull: number
  progress: number
  refreshing: boolean
  active: boolean
}

interface EdgePullOptions {
  edge: PullEdge
  onTrigger: () => Promise<unknown> | unknown
  enabled?: boolean
  /** 手势监听目标；刷新/翻页按钮在滚动容器外时传外层容器 */
  targetRef?: RefObject<HTMLElement | null>
  /** 其他来源的请求进行中：阻止新手势，但不重置当前手势状态 */
  blocked?: boolean
  threshold?: number
  maxPull?: number
  damping?: number
  engageDistance?: number
}

function atTop(element: HTMLElement): boolean {
  return element.scrollTop <= 0
}

function atBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 1
}

/** 下拉/上拉边缘手势；只监听触摸事件。 */
export function useEdgePull(
  scrollRef: RefObject<HTMLElement | null>,
  {
    edge,
    onTrigger,
    enabled = true,
    targetRef,
    blocked = false,
    threshold = EDGE_PULL_THRESHOLD,
    maxPull = EDGE_PULL_MAX,
    damping = EDGE_PULL_DAMPING,
    engageDistance = 0,
  }: EdgePullOptions,
): EdgePullState {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)
  const busyRef = useRef(false)
  const blockedRef = useRef(blocked)
  const triggerRef = useRef(onTrigger)
  blockedRef.current = blocked
  triggerRef.current = onTrigger

  useEffect(() => {
    const scroll = scrollRef.current
    const target = targetRef?.current ?? scroll
    if (!scroll || !target || !enabled) return

    let startX = 0
    let startY = 0
    let tracking = false

    const updatePull = (value: number) => {
      pullRef.current = value
      setPull(value)
    }

    const atEdge = () => (edge === 'top' ? atTop(scroll) : atBottom(scroll))

    const onTouchStart = (event: TouchEvent) => {
      if (busyRef.current || blockedRef.current || !atEdge()) return
      if (event.touches.length !== 1) return
      startX = event.touches[0]?.clientX ?? 0
      startY = event.touches[0]?.clientY ?? 0
      tracking = true
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return
      const x = event.touches[0]?.clientX ?? 0
      const y = event.touches[0]?.clientY ?? 0
      const raw = edge === 'top' ? y - startY : startY - y
      const horizontal = Math.abs(x - startX)

      if (!atEdge()) {
        updatePull(0)
        tracking = false
        return
      }
      // 反向移动交还给原生滚动；已在边缘时不会发生滚动，所以直接结束跟踪。
      if (raw <= 0) {
        updatePull(0)
        tracking = false
        return
      }
      if (raw < engageDistance || horizontal > raw * 1.25) {
        updatePull(0)
        return
      }
      if (event.cancelable) event.preventDefault()
      updatePull(Math.min(maxPull, (raw - engageDistance) * damping))
    }

    const finish = (trigger: boolean) => {
      if (!tracking) return
      tracking = false

      if (!trigger || pullRef.current < threshold) {
        updatePull(0)
        return
      }

      busyRef.current = true
      setRefreshing(true)
      updatePull(threshold)

      void Promise.resolve(triggerRef.current())
        .catch(() => undefined)
        .finally(() => {
          busyRef.current = false
          setRefreshing(false)
          updatePull(0)
        })
    }

    const onTouchEnd = () => finish(true)
    const onTouchCancel = () => finish(false)

    target.addEventListener('touchstart', onTouchStart, { passive: true })
    target.addEventListener('touchmove', onTouchMove, { passive: false })
    target.addEventListener('touchend', onTouchEnd)
    target.addEventListener('touchcancel', onTouchCancel)

    return () => {
      target.removeEventListener('touchstart', onTouchStart)
      target.removeEventListener('touchmove', onTouchMove)
      target.removeEventListener('touchend', onTouchEnd)
      target.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [damping, edge, enabled, engageDistance, maxPull, scrollRef, targetRef, threshold])

  return {
    pull,
    progress: Math.min(1, pull / threshold),
    refreshing,
    active: pull > 0 || refreshing,
  }
}
