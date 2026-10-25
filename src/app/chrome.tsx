import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface ChromeState {
  title: string | null
  setTitle: (title: string | null) => void
  headerHidden: boolean
  setHeaderHidden: (hidden: boolean) => void
}

const ChromeContext = createContext<ChromeState>({
  title: null,
  setTitle: () => undefined,
  headerHidden: false,
  setHeaderHidden: () => undefined,
})

/** 顶栏状态（标题 + 收起）共享给 Shell 与各个页面 */
export function ChromeProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const [headerHidden, setHeaderHidden] = useState(false)
  const value = useMemo(
    () => ({ title, setTitle, headerHidden, setHeaderHidden }),
    [title, headerHidden],
  )
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function usePageTitle(): string | null {
  return useContext(ChromeContext).title
}

export function useSetPageTitle(title: string | null | undefined): void {
  const { setTitle } = useContext(ChromeContext)

  useEffect(() => {
    setTitle(title ?? null)
    return () => setTitle(null)
  }, [title, setTitle])
}

export function useHeaderHidden(): boolean {
  return useContext(ChromeContext).headerHidden
}

export function useSetHeaderHidden(): (hidden: boolean) => void {
  return useContext(ChromeContext).setHeaderHidden
}
