import { useContext, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, ImageOff } from 'lucide-react'
import { openLightbox } from '@/lib/lightbox'
import { isS1Image, loadImage } from '@/lib/imageStore'
import { imageDimensionsGeneration, saveImageDimensions, type ImageDimensions } from '@/lib/imageDimensions'
import { ImageDimensionsContext } from '@/lib/useImageDimensions'
import { usePrefs } from '@/lib/usePrefs'
import { cn } from '@/lib/utils'

type Status = 'idle' | 'loading' | 'ready' | 'error'
type State = { src: string; status: Status; url?: string; dimensions?: ImageDimensions; generation?: number }

interface ProxyImageProps {
  src: string
  alt?: string
  className?: string
  /** 表情等行内小图 */
  inline?: boolean
}

export function ProxyImage({ src, alt = '', className, inline = false }: ProxyImageProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const cachedDimensions = useContext(ImageDimensionsContext)
  const { dataSaver } = usePrefs()
  const [state, setState] = useState<State>({ src, status: 'idle' })
  // 在 render 阶段同步重置，避免 A→B→A 时复活 A 的旧状态。
  if (state.src !== src) setState({ src, status: 'idle' })
  const current: State = state.src === src ? state : { src, status: 'idle' }
  const dimensions = current.dimensions ?? cachedDimensions.get(src)
  const reserved = !inline && dimensions !== undefined
  const trusted = isS1Image(src)

  useEffect(() => {
    const element = containerRef.current
    if (!element || current.status !== 'idle') return
    if (dataSaver && !inline) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState({ src, status: 'loading', generation: imageDimensionsGeneration() })
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [src, current.status, dataSaver, inline])

  useEffect(() => {
    if (!trusted || current.status !== 'loading' || current.url) return
    let alive = true
    loadImage(src).then(
      (url) => { if (alive) setState((previous) => ({ ...previous, url })) },
      () => { if (alive) setState({ src, status: 'error' }) },
    )
    return () => { alive = false }
  }, [src, trusted, current.status, current.url])

  const openViewer = (event: React.SyntheticEvent) => {
    if (current.status !== 'ready') return
    event.preventDefault()
    event.stopPropagation()
    openLightbox(trusted ? current.url! : src, alt)
  }

  const reveal = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setState((previous) => ({
      src, status: 'loading', generation: imageDimensionsGeneration(),
      dimensions: previous.src === src ? previous.dimensions : undefined,
    }))
  }

  const loaded = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    const measured = width > 0 && height > 0 ? { width, height } : undefined
    setState((previous) => previous.src === src
      ? { ...previous, status: 'ready', dimensions: measured }
      : previous)
    if (!inline && measured) void saveImageDimensions(src, measured, current.generation).catch(() => undefined)
  }

  const image = (current.status === 'loading' || current.status === 'ready') &&
    (!trusted || current.url) ? (
      <img
        key={src}
        src={trusted ? current.url : src}
        alt={alt}
        width={inline ? 24 : dimensions?.width}
        height={inline ? 24 : dimensions?.height}
        className={cn(
          inline ? 'inline size-6 align-middle' : 'block h-auto max-w-full rounded-sm',
          reserved && 'absolute inset-0 w-full',
          current.status !== 'ready' && 'absolute opacity-0',
        )}
        onLoad={loaded}
        onError={() => setState((previous) => previous.src === src ? { src, status: 'error', dimensions: previous.dimensions } : previous)}
      />
    ) : null

  if (inline) {
    return (
      <span ref={containerRef} className="relative inline-block size-6 align-middle">
        {image}
      </span>
    )
  }

  return (
    <span
      ref={containerRef}
      className={cn('relative my-2 block max-w-full', current.status === 'ready' && 'cursor-zoom-in', className)}
      style={reserved ? { width: dimensions.width, aspectRatio: `${dimensions.width} / ${dimensions.height}` } : undefined}
      role={current.status === 'ready' ? 'button' : undefined}
      tabIndex={current.status === 'ready' ? 0 : undefined}
      aria-label={current.status === 'ready' ? '查看大图' : undefined}
      onClick={current.status === 'ready' ? openViewer : undefined}
      onKeyDown={current.status === 'ready' ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') openViewer(event)
      } : undefined}
    >
      {image}

      {current.status === 'error' ? (
        <span className={cn(
          'flex w-full items-center justify-center overflow-hidden rounded-sm border border-line bg-panel-light',
          reserved ? 'absolute inset-0' : 'relative min-h-[120px]',
        )}>
          <button type="button" onClick={reveal} className="inline-flex items-center gap-2 text-ui text-muted">
            <ImageOff size={16} />
            图片加载失败 · 点击重试
          </button>
          <a
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            className="absolute right-2 bottom-1.5 text-meta text-link underline decoration-line underline-offset-2 hover:text-link-hover"
          >
            打开原图
          </a>
        </span>
      ) : null}

      {current.status === 'idle' && dataSaver ? (
        <span
          role="button"
          tabIndex={0}
          onClick={reveal}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') reveal(event)
          }}
          className={cn(
            'flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm bg-panel-light text-ui text-muted transition-colors duration-[var(--motion-press)] hover:text-text active:bg-line/40',
            reserved ? 'absolute inset-0' : 'min-h-[64px]',
          )}
        >
          <ImageIcon size={16} />
          图片 · 点击加载
        </span>
      ) : null}

      {current.status === 'loading' || (current.status === 'idle' && !dataSaver) ? (
        <span className={cn(
          'block w-full animate-pulse rounded-sm bg-panel-light',
          reserved ? 'absolute inset-0' : 'min-h-[120px]',
        )} />
      ) : null}
    </span>
  )
}
