import { useEffect, useState, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { useHeaderHidden, usePageTitle, useSetHeaderHidden } from './chrome'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

const FALLBACK_TITLES: Record<string, string> = {
  '/': 'S1 Reader',
  '/login': '登录 S1',
  '/boards': '板块管理',
  '/debug': '诊断',
}

export function Shell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pageTitle = usePageTitle()
  const headerHidden = useHeaderHidden()
  const setHeaderHidden = useSetHeaderHidden()
  const wide = useMediaQuery('(min-width: 1024px)')

  const isBrowse = pathname.startsWith('/f/') || pathname.startsWith('/t/')
  const isThread = pathname.startsWith('/t/')
  // 只有「小屏 + 详情页」用浮层收起；列表页与大屏一律常驻顶栏
  const overlayHeader = isBrowse && isThread && !wide
  const title = pageTitle ?? FALLBACK_TITLES[pathname] ?? 'S1 Reader'

  useEffect(() => {
    setHeaderHidden(false)
  }, [pathname, setHeaderHidden])

  const headerContent = (
    <>
      {/* 左侧预留给「浏览历史」入口，后续里程碑接入 */}
      <div className="w-11" />
      <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-heading">
        {title}
      </h1>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="设置"
          title="设置"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex size-11 items-center justify-center rounded-md text-text active:bg-panel-light"
        >
          <Settings size={20} />
        </button>
      </div>
    </>
  )

  const settingsSheet = (
    <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  )

  if (!isBrowse) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <header
          className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-1 pt-[env(safe-area-inset-top)]"
          style={{ minHeight: 'var(--header-h)' }}
        >
          {headerContent}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[800px] px-4 py-4">{children}</div>
        </main>
        {settingsSheet}
      </div>
    )
  }

  if (!overlayHeader) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <header
          className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-1 pt-[env(safe-area-inset-top)]"
          style={{ minHeight: 'var(--header-h)' }}
        >
          {headerContent}
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        {settingsSheet}
      </div>
    )
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-canvas">
      <header
        className={cn(
          'absolute inset-x-0 top-0 z-30 flex items-center gap-1 border-b border-line bg-panel/92 px-1 backdrop-blur-sm',
          'transition-transform duration-200 will-change-transform',
          headerHidden && '-translate-y-full',
        )}
        style={{ minHeight: 'var(--header-h)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {headerContent}
      </header>
      <main className="h-full">{children}</main>
      {settingsSheet}
    </div>
  )
}
