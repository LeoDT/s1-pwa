import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useLightboxImage, closeLightbox } from '@/lib/lightbox'
import { cn } from '@/lib/utils'

/**
 * 灯箱：全屏黑底，1x 适应屏幕 / 2x 原始尺寸（可滚动），Esc/点空白/右上 X 关闭。
 *
 * 应用级单例，只在 `main.tsx` 挂一次。它不属于任何内容节点——正文图常被上游
 * `<a href>` 包着，挂在图片组件里会落进那个 `<a>`（`<a>` 不能嵌可交互内容，
 * 且点关闭按钮会激活外链），也让「模态」退化成每张图各一个 dialog。
 */
export function ImageLightbox() {
  const image = useLightboxImage()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [actualSize, setActualSize] = useState(false)
  const open = image !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (open) setActualSize(false)
  }, [open, image])

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={closeLightbox}
      onCancel={(event) => {
        event.preventDefault()
        closeLightbox()
      }}
      aria-label="图片预览"
      aria-modal="true"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/88"
    >
      {image ? (
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-end gap-1 p-2">
            <button
              type="button"
              onClick={() => setActualSize((value) => !value)}
              title={actualSize ? '适应屏幕' : '原始尺寸'}
              className="inline-flex size-11 items-center justify-center rounded-md px-2 text-ui font-medium text-white/85 transition-colors duration-[var(--motion-press)] hover:bg-white/15 active:bg-white/20"
            >
              {actualSize ? '1x' : '2x'}
            </button>
            <button
              type="button"
              aria-label="关闭"
              title="关闭"
              onClick={closeLightbox}
              className="inline-flex size-11 items-center justify-center rounded-md text-white/85 transition-colors duration-[var(--motion-press)] hover:bg-white/15 active:bg-white/20"
            >
              <X size={20} />
            </button>
          </div>

          <div
            onClick={closeLightbox}
            className={cn(
              'min-h-0 flex-1',
              actualSize ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden',
            )}
          >
            <img
              src={image.url}
              alt={image.alt}
              onClick={(event) => event.stopPropagation()}
              className={cn(actualSize ? 'max-w-none' : 'max-h-full max-w-full object-contain')}
            />
          </div>
        </div>
      ) : null}
    </dialog>,
    document.body,
  )
}
