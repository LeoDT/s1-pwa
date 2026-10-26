import type { ReactNode } from 'react'
import { MessageSquareDashed } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrowseLayoutProps {
  sidebar: ReactNode
  main: ReactNode
  narrow: 'sidebar' | 'main'
}

export function BrowseLayout({ sidebar, main, narrow }: BrowseLayoutProps) {
  return (
    <div className="mx-auto h-full min-h-0 w-full max-w-[var(--frame-w)] lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className={cn('relative h-full min-h-0 overflow-hidden lg:border-r lg:border-line', narrow === 'main' && 'hidden lg:block')}>
        {sidebar}
      </div>
      <div className={cn('relative h-full min-h-0 overflow-hidden', narrow === 'sidebar' && 'hidden lg:block')}>
        {main}
      </div>
    </div>
  )
}

export function EmptySelection() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
      <MessageSquareDashed size={28} />
      <p className="text-body">从左侧选择帖子</p>
    </div>
  )
}
