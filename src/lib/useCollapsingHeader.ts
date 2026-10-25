import { useEffect, type RefObject } from 'react'
import { useSetHeaderHidden } from '@/app/chrome'

/**
 * 顶栏随滚动收起/展开：向下滚动隐藏，向上滚动或回到顶部显示。
 * 见 docs/navigation.md §3。
 */
export function useCollapsingHeader(ref: RefObject<HTMLElement | null>, enabled = true): void {
  const setHeaderHidden = useSetHeaderHidden()

  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    let last = element.scrollTop
    const onScroll = () => {
      const current = element.scrollTop
      if (current <= 8) setHeaderHidden(false)
      else if (current > last + 6) setHeaderHidden(true)
      else if (current < last - 6) setHeaderHidden(false)
      last = current
    }

    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [ref, enabled, setHeaderHidden])
}
