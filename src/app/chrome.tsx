import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface ChromeState {
  headerHidden: boolean
  setHeaderHidden: (hidden: boolean) => void
}

const ChromeContext = createContext<ChromeState>({
  headerHidden: false,
  setHeaderHidden: () => undefined,
})

/** 顶栏收起状态共享给 Shell 与各个页面（标题固定为 Stage1st，不再由页面设置） */
export function ChromeProvider({ children }: { children: ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false)
  const value = useMemo(() => ({ headerHidden, setHeaderHidden }), [headerHidden])
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useHeaderHidden(): boolean {
  return useContext(ChromeContext).headerHidden
}

export function useSetHeaderHidden(): (hidden: boolean) => void {
  return useContext(ChromeContext).setHeaderHidden
}
