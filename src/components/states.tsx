import type { ReactNode } from 'react'
import { AlertCircle, Inbox } from 'lucide-react'

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-3 px-4 py-3">
          <div className="size-10 shrink-0 animate-pulse rounded-sm bg-panel-light" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-panel-light" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-panel-light" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PostSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-3 w-1/3 animate-pulse rounded bg-panel-light" />
          <div className="h-4 w-full animate-pulse rounded bg-panel-light" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-panel-light" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-panel-light" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Inbox size={22} className="text-muted" />
      <p className="text-body text-muted">{text}</p>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <AlertCircle size={22} className="text-danger" />
      <p className="text-body text-danger">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-line px-3 py-1.5 text-ui text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
        >
          重试
        </button>
      ) : null}
    </div>
  )
}
