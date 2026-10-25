import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageLightboxProps {
  url: string
  alt?: string
  open: boolean
  onClose: () => void
}

/** 灯箱：全屏黑底，1x 适应屏幕 / 2x 原始尺寸（可滚动），Esc/点空白关闭 */
export function ImageLightbox({ url, alt = '', open, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [actualSize, setActualSize] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (open) setActualSize(false)
  }, [open, url])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/88"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-end gap-1 p-2">
          <button
            type="button"
            onClick={() => setActualSize((value) => !value)}
            title={actualSize ? '适应屏幕' : '原始尺寸'}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-ui font-medium text-white/85 transition-colors duration-[var(--motion-press)] hover:bg-white/15 active:bg-white/20"
          >
            {actualSize ? '1x' : '2x'}
          </button>
          <button
            type="button"
            aria-label="关闭"
            title="关闭"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-md text-white/85 transition-colors duration-[var(--motion-press)] hover:bg-white/15 active:bg-white/20"
          >
            <X size={20} />
          </button>
        </div>

        <div
          onClick={onClose}
          className={cn(
            'min-h-0 flex-1',
            actualSize ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden',
          )}
        >
          <img
            src={url}
            alt={alt}
            onClick={(event) => event.stopPropagation()}
            className={cn(actualSize ? 'max-w-none' : 'max-h-full max-w-full object-contain')}
          />
        </div>
      </div>
    </dialog>
  )
}
