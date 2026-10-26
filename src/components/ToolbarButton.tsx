import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Full-size toolbar hit target with a smaller, inset hover/press surface. */
export function ToolbarButton({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'group inline-flex min-h-[max(2.75rem,44px)] min-w-[max(2.75rem,44px)] shrink-0 items-center justify-center disabled:opacity-40',
        className,
      )}
    >
      <span className="flex min-h-9 min-w-9 items-center justify-center rounded-md transition-colors duration-[var(--motion-press)] group-hover:bg-panel-light group-active:bg-panel-light">
        {children}
      </span>
    </button>
  )
}
