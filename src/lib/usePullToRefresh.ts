import { useEffect, useRef, useState, type RefObject } from 'react'

const THRESHOLD = 56
const MAX_PULL = 80
const DAMPING = 0.45

interface PullState {
  pull: number
  refreshing: boolean
}

/** 列表页下拉刷新（仅触摸设备生效） */
export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled = true,
): PullState {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)
  const busyRef = useRef(false)
  // 用 ref 持有回调：避免父组件每次渲染生成新函数导致 effect 重装、手势状态被重置
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    let startY = 0
    let tracking = false

    const updatePull = (value: number) => {
      pullRef.current = value
      setPull(value)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (busyRef.current || element.scrollTop > 0) return
      startY = event.touches[0]?.clientY ?? 0
      tracking = true
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return
      const y = event.touches[0]?.clientY ?? 0
      const delta = y - startY

      if (element.scrollTop > 0 || delta <= 0) {
        updatePull(0)
        return
      }
      if (event.cancelable) event.preventDefault()
      updatePull(Math.min(MAX_PULL, delta * DAMPING))
    }

    const onTouchEnd = () => {
      if (!tracking) return
      tracking = false

      if (pullRef.current < THRESHOLD) {
        updatePull(0)
        return
      }

      busyRef.current = true
      setRefreshing(true)
      updatePull(THRESHOLD)

      void refreshRef.current()
        .catch(() => undefined)
        .finally(() => {
          busyRef.current = false
          setRefreshing(false)
          updatePull(0)
        })
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    element.addEventListener('touchcancel', onTouchEnd)

    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [ref, enabled])

  return { pull, refreshing }
}

export const PULL_THRESHOLD = THRESHOLD
