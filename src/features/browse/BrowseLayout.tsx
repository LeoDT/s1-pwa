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
 * 浏览页双栏容器：≥1024px 左 360px 列表 + 右 800px 内容。
 * 整个框居中限宽（360 + 800 = 1160），避免宽屏下列表和正文被拉开。
 * 见 docs/design-system.md §4.3。
 */
export function BrowseLayout({ sidebar, main, narrow }: BrowseLayoutProps) {
  const wide = useMediaQuery(WIDE_QUERY)

  if (!wide) return <div className="h-full">{narrow === 'sidebar' ? sidebar : main}</div>

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-[var(--frame-w)] grid-cols-[360px_minmax(0,1fr)]">
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
