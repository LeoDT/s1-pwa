import { useEffect, useState } from 'react'

/** Delay transient loading indicators so quick requests do not flicker. */
export function useDeferredLoading(active: boolean, delay = 200): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }

    setVisible(false)
    const timer = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [active, delay])

  return active && visible
}
