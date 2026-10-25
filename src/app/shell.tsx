import { useEffect, useState, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { useHeaderHidden, useSetHeaderHidden } from './chrome'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

/** 顶栏中间永远显示站点名；板块名/帖子标题都放在内容里 */
const WORDMARK = 'Stage1st'

export function Shell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const headerHidden = useHeaderHidden()
  const setHeaderHidden = useSetHeaderHidden()
  const wide = useMediaQuery('(min-width: 1024px)')

  const isBrowse = pathname.startsWith('/f/') || pathname.startsWith('/t/')
  const isThread = pathname.startsWith('/t/')
  // 只有「小屏 + 详情页」用浮层收起；列表页与大屏一律常驻顶栏
  const overlayHeader = isBrowse && isThread && !wide
  // 顶栏内容与内容框同宽：浏览页 1160（360 + 800），其它页面 800
  const frameWidth = isBrowse ? 'max-w-[var(--frame-w)]' : 'max-w-[800px]'

  useEffect(() => {
    setHeaderHidden(false)
  }, [pathname, setHeaderHidden])

  const headerContent = (
    <div className={cn('mx-auto flex w-full items-center gap-1 px-1', frameWidth)}>
      {/* 左侧预留给「浏览历史」入口，后续里程碑接入 */}
      <div className="w-11" />
      <span className="min-w-0 flex-1 truncate text-center text-body font-semibold text-heading">
        {WORDMARK}
      </span>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="设置"
          title="设置"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex size-11 items-center justify-center rounded-md text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  )

  const settingsSheet = (
    <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
  )

  if (!isBrowse) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <header
          className="flex shrink-0 items-center border-b border-line bg-panel pt-[env(safe-area-inset-top)]"
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
          className="flex shrink-0 items-center border-b border-line bg-panel pt-[env(safe-area-inset-top)]"
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
          'absolute inset-x-0 top-0 z-30 flex items-center border-b border-line bg-panel/92 backdrop-blur-sm',
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
