import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface ChromeState {
  headerHidden: boolean
  setHeaderHidden: (hidden: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}

const ChromeContext = createContext<ChromeState>({
  headerHidden: false,
  setHeaderHidden: () => undefined,
  settingsOpen: false,
  setSettingsOpen: () => undefined,
})

/**
 * 顶栏收起状态共享给 Shell 与各个页面（标题固定为 Stage1st，不再由页面设置）；
 * 设置抽屉的开关也放在这里，历史页等页面才能就地拉起登录入口。
 */
export function ChromeProvider({ children }: { children: ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const value = useMemo(
    () => ({ headerHidden, setHeaderHidden, settingsOpen, setSettingsOpen }),
    [headerHidden, settingsOpen],
  )
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useHeaderHidden(): boolean {
  return useContext(ChromeContext).headerHidden
}

export function useSetHeaderHidden(): (hidden: boolean) => void {
  return useContext(ChromeContext).setHeaderHidden
}

export function useSettingsOpen(): boolean {
  return useContext(ChromeContext).settingsOpen
}

export function useSetSettingsOpen(): (open: boolean) => void {
  return useContext(ChromeContext).setSettingsOpen
}
