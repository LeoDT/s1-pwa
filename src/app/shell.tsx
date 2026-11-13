import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { History, Keyboard, Settings } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { SHORTCUT_GROUPS } from '@/features/browse/keyboard'
import { useHeaderHidden, useSetHeaderHidden, useSettingsOpen, useSetSettingsOpen } from './chrome'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'

/** 顶栏中间永远显示站点名；板块名/帖子标题都放在内容里 */
const WORDMARK = 'Stage1st'

export function Shell({ children }: { children: ReactNode }) {
  const settingsOpen = useSettingsOpen()
  const setSettingsOpen = useSetSettingsOpen()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const headerHidden = useHeaderHidden()
  const setHeaderHidden = useSetHeaderHidden()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [helpOpen, setHelpOpen] = useState(false)

  const inHistory = pathname === '/history' || pathname.startsWith('/history/')
  const isBrowse = pathname.startsWith('/f/') || pathname.startsWith('/t/') || inHistory
  const isThread = pathname.startsWith('/t/') || pathname.startsWith('/history/t/')
  // 只有「小屏 + 详情页」用浮层收起；列表页与大屏一律常驻顶栏
  const overlayHeader = isBrowse && isThread && !wide
  // 顶栏内容与内容框同宽：浏览页与内容框对齐，其它页面 800
  const frameWidth = isBrowse ? 'max-w-[var(--frame-w)]' : 'max-w-[800px]'

  useEffect(() => {
    setHeaderHidden(false)
  }, [pathname, setHeaderHidden])

  const headerContent = (
    <div className={cn('mx-auto flex w-full items-center gap-1 px-1', frameWidth)}>
      {/* 左右两侧等宽，保证站点名始终居中 */}
      <div className="flex flex-1 items-center" />
      <span className="shrink-0 truncate text-center text-body font-semibold text-heading">
        {WORDMARK}
      </span>
      <div className="flex flex-1 items-center justify-end">
        {wide ? (
          <button
            type="button"
            aria-label="键盘操作"
            title="键盘操作"
            onClick={() => setHelpOpen(true)}
            className="inline-flex size-11 items-center justify-center rounded-md text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
          >
            <Keyboard size={20} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="浏览历史"
          title="浏览历史"
          aria-current={inHistory ? 'page' : undefined}
          onClick={() => void navigate({ to: '/history', replace: isBrowse })}
          className={cn(
            'inline-flex size-11 items-center justify-center rounded-md transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light',
            inHistory ? 'text-accent-strong' : 'text-text',
          )}
        >
          <History size={20} />
        </button>
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

  const keyboardDialog = helpOpen ? (
    <Dialog title="键盘操作" onClose={() => setHelpOpen(false)}>
      <p className="text-meta text-muted">仅宽屏（≥1024px）启用；输入框聚焦或弹层打开时不响应。</p>
      <div className="mt-3 space-y-4">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-ui font-medium text-heading">{group.title}</h3>
            <dl className="mt-1 divide-y divide-line">
              {group.items.map((item) => (
                <div key={item.keys} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-ui text-text">{item.label}</dt>
                  <dd>
                    <kbd className="rounded-sm border border-line bg-panel-light px-2 py-0.5 text-meta text-heading">
                      {item.keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  ) : null

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
        {keyboardDialog}
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
        {keyboardDialog}
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
      {keyboardDialog}
    </div>
  )
}
