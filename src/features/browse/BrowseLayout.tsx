import type { ReactNode } from 'react'
import { MessageSquareDashed } from 'lucide-react'
import { useMediaQuery } from '@/lib/useMediaQuery'

const WIDE_QUERY = '(min-width: 1024px)'

interface BrowseLayoutProps {
  sidebar: ReactNode
  main: ReactNode
  /** 小屏时显示哪一栏 */
  narrow: 'sidebar' | 'main'
}

/**
 * 浏览页双栏容器：≥1024px 左 360px 列表 + 右内容（内容自身限制 800px）。
 * 小屏只渲染当前需要的那一栏，避免无谓请求。见 docs/design-system.md §4.3。
 */
export function BrowseLayout({ sidebar, main, narrow }: BrowseLayoutProps) {
  const wide = useMediaQuery(WIDE_QUERY)

  if (!wide) return <div className="h-full">{narrow === 'sidebar' ? sidebar : main}</div>

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '360px 1fr' }}>
      <div className="relative min-h-0 overflow-hidden border-r border-line">{sidebar}</div>
      <div className="relative min-h-0 overflow-hidden">{main}</div>
    </div>
  )
}

export function EmptySelection() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
      <MessageSquareDashed size={28} />
      <p className="text-[15px]">从左侧选择帖子</p>
    </div>
  )
}
