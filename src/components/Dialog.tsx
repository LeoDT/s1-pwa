import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}

/** 原生 dialog 浮层：小屏底部抽屉，大屏居中。挂载即打开。 */
export function Dialog({ title, onClose, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closingRef = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return

    closingRef.current = false
    dialog.showModal()
    dialog.focus()

    return () => {
      if (!dialog.open) return
      closingRef.current = true
      dialog.close()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-modal="true"
      onClose={() => {
        if (!closingRef.current) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-black/45 focus:outline-none sm:m-auto sm:max-w-md"
    >
      <div
        className={cn(
          'flex max-h-[80dvh] flex-col overflow-hidden rounded-t-lg bg-canvas sm:rounded-lg',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-panel px-4 py-3">
          <h2 id={titleId} className="text-title font-semibold text-heading">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-ui text-text transition-colors duration-[var(--motion-press)] hover:bg-panel-light active:bg-panel-light"
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
