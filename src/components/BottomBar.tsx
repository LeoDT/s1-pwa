import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared footer surface: content row stays separate from the device safe area. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'min-h-[calc(var(--bar-h)+env(safe-area-inset-bottom))] border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <div className="flex min-h-[var(--bar-h)] items-stretch">{children}</div>
    </div>
  )
}
