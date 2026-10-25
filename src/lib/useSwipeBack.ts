import { useEffect, useRef } from 'react'

const MIN_DISTANCE = 70
const MAX_VERTICAL = 50

/**
 * 详情页横向滑动返回。页面内没有横向内容，所以左右方向都接受
 * （"左划/右划"都能回列表），避免用户猜方向。见 docs/navigation.md §5。
 */
export function useSwipeBack(onBack: () => void, enabled = true): void {
  // 用 ref 持有回调，保证手势进行中不会因父组件重渲染而重装监听
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    if (!enabled) return

    let startX = 0
    let startY = 0
    let tracking = false
    let horizontal = false

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      tracking = true
      horizontal = false
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return
      const touch = event.touches[0]
      if (!touch) return

      const dx = touch.clientX - startX
      const dy = touch.clientY - startY

      if (!horizontal && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        horizontal = true
      }
      if (horizontal && event.cancelable) event.preventDefault()
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (!tracking) return
      const touch = event.changedTouches[0]
      tracking = false

      if (!horizontal || !touch) {
        horizontal = false
        return
      }

      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      horizontal = false

      if (Math.abs(dx) > MIN_DISTANCE && Math.abs(dy) < MAX_VERTICAL) onBackRef.current()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [enabled])
}
